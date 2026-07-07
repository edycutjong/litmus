/**
 * Litmus — Grading engine.
 *
 * LLM-based judge that grades a deliverable against a rubric.
 * Temperature 0 for deterministic scoring. Returns a structured
 * verdict: overall score, per-criterion breakdown, gaps, confidence.
 *
 * Stability target: σ < 4 across repeated runs of the same input.
 */

// ─── Types ─────────────────────────────────────────────────────────

export interface GradeRequest {
  deliverable?: string;
  fileKey?: string;
  rubric?: RubricCriterion[];
  context?: string;
}

export interface RubricCriterion {
  criterion: string;
  weight: number;
  description?: string;
}

export interface GradeVerdict {
  score: number;           // 0–100 overall
  grade: string;           // A/B/C/D/F
  rubric: RubricScore[];   // per-criterion breakdown
  gaps: string[];          // concrete deficiencies
  confidence: 'high' | 'medium' | 'low';
}

export interface RubricScore {
  criterion: string;
  score: number;
  weight: number;
}

// ─── Default Rubric ────────────────────────────────────────────────

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { criterion: 'Factual accuracy', weight: 0.30, description: 'Claims are verifiable and correct' },
  { criterion: 'Source citations', weight: 0.25, description: 'Claims backed by specific, credible sources' },
  { criterion: 'Completeness', weight: 0.20, description: 'Covers all relevant aspects of the topic' },
  { criterion: 'Coherence', weight: 0.15, description: 'Logical structure and clear argumentation' },
  { criterion: 'Actionability', weight: 0.10, description: 'Reader can act on the conclusions' },
];

// ─── Grade Function ────────────────────────────────────────────────

/**
 * Grade a deliverable using an LLM judge at temperature 0.
 *
 * @param request - The deliverable text, optional rubric, optional context
 * @returns A structured verdict with score, grade, breakdown, gaps
 */
export async function gradeDeliverable(request: GradeRequest): Promise<GradeVerdict> {
  const rubric = request.rubric ?? DEFAULT_RUBRIC;
  const contentToGrade = request.deliverable ?? '';

  // Validate rubric weights sum to ~1.0
  const totalWeight = rubric.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error(`Rubric weights must sum to 1.0 (got ${totalWeight})`);
  }

  // Security / Anti-Gaming: Enforce Format/Clarity weight cap
  const formatCrit = rubric.find(c => c.criterion.toLowerCase().includes('format') || c.criterion.toLowerCase().includes('clarity'));
  if (formatCrit && formatCrit.weight > 0.151) {
    throw new Error(`Security Violation: Format/Clarity weight cannot exceed 15% (got ${Math.round(formatCrit.weight * 100)}%)`);
  }

  const prompt = buildGradingPrompt(contentToGrade, rubric, request.context);

  const apiKeyOpenAI = process.env.OPENAI_API_KEY;
  const apiKeyAnthropic = process.env.ANTHROPIC_API_KEY;

  if (!apiKeyOpenAI && !apiKeyAnthropic) {
    console.warn('[litmus/grader] No API keys — using mock mode');
    return parseVerdictResponse(mockGrade(prompt, 62), rubric);
  }

  let v1: GradeVerdict;
  let v2: GradeVerdict | undefined;

  if (apiKeyOpenAI && apiKeyAnthropic) {
    // True Tribunal Mode
    const [res1, res2] = await Promise.all([
      callOpenAI(prompt, apiKeyOpenAI),
      callAnthropic(prompt, apiKeyAnthropic),
    ]);
    v1 = parseVerdictResponse(res1, rubric);
    v2 = parseVerdictResponse(res2, rubric);
  } else if (apiKeyAnthropic) {
    // Single Model Execution (Optimal)
    const res = await callAnthropic(prompt, apiKeyAnthropic);
    v1 = parseVerdictResponse(res, rubric);
  } else {
    // Single Model Execution
    const res = await callOpenAI(prompt, apiKeyOpenAI!);
    v1 = parseVerdictResponse(res, rubric);
  }

  if (v2) {
    const variance = Math.abs(v1.score - v2.score);
    console.log(`[litmus/grader] Tribunal variance: ${variance} (V1: ${v1.score}, V2: ${v2.score})`);
    
    if (variance > 15) {
      console.warn('[litmus/grader] High variance detected. Firing tiebreaker.');
      const tiebreakerPrompt = prompt + '\n\nIMPORTANT: Previous judges disagreed significantly. Be extremely rigorous and penalize any unsubstantiated claims heavily.';
      const res3 = await callAnthropic(tiebreakerPrompt, apiKeyAnthropic!);
      return parseVerdictResponse(res3, rubric);
    }
    
    return {
      ...v1,
      score: Math.round((v1.score + v2.score) / 2),
      gaps: Array.from(new Set([...v1.gaps, ...v2.gaps])).slice(0, 5),
      confidence: 'medium',
    };
  }

  return v1;
}

// ─── Prompt Construction ───────────────────────────────────────────

function buildGradingPrompt(
  deliverable: string,
  rubric: RubricCriterion[],
  context?: string,
): string {
  const rubricText = rubric
    .map((c, i) => `${i + 1}. **${c.criterion}** (weight: ${c.weight}) — ${c.description ?? 'No description'}`)
    .join('\n');

  return `You are a strict, impartial quality judge. Grade the following deliverable on a 0-100 scale using ONLY the rubric below. Be harsh but fair.

## Rubric
${rubricText}

${context ? `## Context\n${context}\n` : ''}
## Deliverable to Grade
${deliverable}

## Instructions
1. Score each criterion 0-100.
2. Calculate the weighted overall score.
3. List 1-5 specific, concrete gaps. Each gap MUST include a citation indicating where the gap applies or what source proves it.
4. Assign a confidence level: "high" (clear signal), "medium" (some ambiguity), "low" (insufficient info).
5. Assign a letter grade: A (90+), B (80-89), C (70-79), D (60-69), F (<60).

## Required JSON Output Format
\`\`\`json
{
  "score": <number>,
  "grade": "<A|B|C|D|F>",
  "rubric": [
    { "criterion": "<name>", "score": <number>, "weight": <number> }
  ],
  "gaps": ["<gap1 (citation)>", "<gap2 (citation)>"],
  "confidence": "<high|medium|low>"
}
\`\`\`

Respond with ONLY the JSON object, no other text.`;
}

// Removed callLlmJudge

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 1000,
    }),
    signal: AbortSignal.timeout(25000), // Architecture: Prevent Event Loop Hangs
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices[0]?.message?.content ?? '';
}

async function callAnthropic(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
    signal: AbortSignal.timeout(25000), // Architecture: Prevent Event Loop Hangs
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as {
    content: Array<{ text: string }>;
  };

  return data.content[0]?.text ?? '';
}

// ─── Response Parsing ──────────────────────────────────────────────

function parseVerdictResponse(response: string, rubric: RubricCriterion[]): GradeVerdict {
  // Extract JSON from the response (handle code fences)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ?? response.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    console.warn('[litmus/grader] Failed to parse LLM response, using fallback');
    return fallbackVerdict(rubric);
  }

  try {
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]) as GradeVerdict;

    // Validate and clamp
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      grade: validateGrade(parsed.grade),
      rubric: parsed.rubric?.map((r) => ({
        criterion: r.criterion,
        score: Math.max(0, Math.min(100, Math.round(r.score))),
        weight: r.weight,
      })) ?? rubric.map((r) => ({ ...r, score: 50 })),
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5) : [],
      confidence: validateConfidence(parsed.confidence),
    };
  } catch (_err) {
    console.warn('[litmus/grader] JSON parse failed, using fallback');
    return fallbackVerdict(rubric);
  }
}

function validateGrade(grade: string): string {
  const valid = ['A', 'B', 'C', 'D', 'F'];
  return valid.includes(grade?.toUpperCase()) ? grade.toUpperCase() : 'C';
}

function validateConfidence(confidence: string): 'high' | 'medium' | 'low' {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(confidence) ? confidence as 'high' | 'medium' | 'low' : 'medium';
}

function fallbackVerdict(rubric: RubricCriterion[]): GradeVerdict {
  return {
    score: 50,
    grade: 'C',
    rubric: rubric.map((r) => ({ criterion: r.criterion, score: 50, weight: r.weight })),
    gaps: ['Unable to parse LLM response — default score assigned'],
    confidence: 'low',
  };
}

// ─── Mock Grading ──────────────────────────────────────────────────

export function mockGrade(_prompt: string, fixedScore = 62): string {
  return JSON.stringify({
    score: fixedScore,
    grade: fixedScore >= 90 ? 'A' : fixedScore >= 80 ? 'B' : fixedScore >= 70 ? 'C' : fixedScore >= 60 ? 'D' : 'F',
    rubric: [
      { criterion: 'Factual accuracy', score: 55, weight: 0.3 },
      { criterion: 'Source citations', score: 40, weight: 0.25 },
      { criterion: 'Completeness', score: 70, weight: 0.2 },
      { criterion: 'Coherence', score: 80, weight: 0.15 },
      { criterion: 'Actionability', score: 65, weight: 0.1 },
    ],
    gaps: ['No primary sources cited', 'Missing risk section'],
    confidence: 'medium',
  });
}
