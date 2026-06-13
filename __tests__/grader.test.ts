import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gradeDeliverable, DEFAULT_RUBRIC } from '../src/grader.js';

describe('Litmus Grader', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('uses mock grading when no API key is provided', async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    
    const verdict = await gradeDeliverable({ deliverable: 'Test' });
    expect(verdict.score).toBe(62); // Mock score
    expect(verdict.grade).toBe('D');
    expect(verdict.confidence).toBe('medium');
    expect(verdict.gaps).toContain('Missing risk section');
  });

  it('throws an error if rubric weights do not sum to 1.0', async () => {
    const badRubric = [{ criterion: 'Test', weight: 0.5 }];
    await expect(gradeDeliverable({ deliverable: 'Test', rubric: badRubric }))
      .rejects.toThrow('Rubric weights must sum to 1.0');
  });

  describe('OpenAI Parsing', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test';
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('parses valid JSON response from OpenAI', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '```json\n{"score": 85, "grade": "B", "rubric": [], "gaps": ["Gap1"], "confidence": "high"}\n```'
            }
          }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.score).toBe(85);
      expect(verdict.grade).toBe('B');
      expect(verdict.confidence).toBe('high');
      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', expect.any(Object));
    });

    it('falls back to default verdict if LLM response is unparseable', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'This is not JSON' } }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.score).toBe(50);
      expect(verdict.grade).toBe('C');
      expect(verdict.confidence).toBe('low');
      expect(verdict.gaps[0]).toContain('Unable to parse');
    });

    it('throws if OpenAI API fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      } as Response);

      await expect(gradeDeliverable({ deliverable: 'Test' }))
        .rejects.toThrow('OpenAI API error: 401 Unauthorized');
    });
  });

  describe('Anthropic Parsing', () => {
    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    });

    it('parses valid JSON response from Anthropic', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: '{"score": 95, "grade": "A", "rubric": [], "gaps": [], "confidence": "high"}' }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.score).toBe(95);
      expect(verdict.grade).toBe('A');
      expect(global.fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.any(Object));
    });

    it('throws if Anthropic API fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Error'
      } as Response);

      await expect(gradeDeliverable({ deliverable: 'Test' }))
        .rejects.toThrow('Anthropic API error: 500 Internal Error');
    });
  });

  describe('Grade Validation and Clamping', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test';
    });

    it('clamps scores between 0 and 100 and validates confidence/grade', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"score": 150, "grade": "Z", "rubric": [{"criterion": "Acc", "score": -50, "weight": 1.0}], "gaps": ["Gap1"], "confidence": "absolute"}'
            }
          }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.score).toBe(100);
      expect(verdict.grade).toBe('C');
      expect(verdict.confidence).toBe('medium');
      expect(verdict.rubric[0].score).toBe(0);
    });

    it('slices gaps to a maximum of 5', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"score": 80, "grade": "B", "gaps": ["1", "2", "3", "4", "5", "6"]}'
            }
          }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.gaps.length).toBe(5);
    });

    it('handles missing rubric arrays gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"score": 80, "grade": "B"}'
            }
          }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.rubric.length).toBe(DEFAULT_RUBRIC.length);
      expect(verdict.rubric[0].score).toBe(50); // Fallback to 50
    });

    it('parses lowercase grades into uppercase', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '{"score": 95, "grade": "a", "confidence": "high"}' }
          }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.grade).toBe('A');
    });

    it('falls back to JSON parse error when JSON has braces but is invalid', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: { content: '{ "score": 95, "grade": "A", bad }' } // Invalid JSON inside braces
          }]
        })
      } as Response);

      const verdict = await gradeDeliverable({ deliverable: 'Test output' });
      expect(verdict.score).toBe(50);
      expect(verdict.confidence).toBe('low');
    });

    it('fires tiebreaker when API keys are used and variance > 15', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      let fetchCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        if (fetchCount === 1) {
          // V1 response
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: '{"score": 60, "grade": "D", "confidence": "high"}' } }],
              content: [{ text: '{"score": 60, "grade": "D", "confidence": "high"}' }]
            })
          } as Response;
        } else if (fetchCount === 2) {
          // V2 response (mocked as anthropic fallback in parallel array)
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: '{"score": 90, "grade": "A", "confidence": "high"}' } }],
              content: [{ text: '{"score": 90, "grade": "A", "confidence": "high"}' }]
            })
          } as Response;
        } else {
          // Tiebreaker response
          return {
            ok: true,
            json: async () => ({
              choices: [{ message: { content: '{"score": 75, "grade": "C", "confidence": "high"}' } }],
              content: [{ text: '{"score": 75, "grade": "C", "confidence": "high"}' }]
            })
          } as Response;
        }
      });

      const verdict = await gradeDeliverable({ deliverable: 'Test tiebreaker' });
      // The overall score should be the tiebreaker score since it resolves the high variance
      expect(verdict.score).toBe(75);
      expect(fetchCount).toBe(3);
    });

    it('executes single model mode using Anthropic if OpenAI key is missing', async () => {
      delete process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      let fetchCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => ({
            content: [{ text: '{"score": 90, "grade": "A", "confidence": "high"}' }]
          })
        } as Response;
      });

      const verdict = await gradeDeliverable({ deliverable: 'Test ant' });
      expect(verdict.score).toBe(90);
      expect(fetchCount).toBe(1);
    });
  });

  describe('Custom Rubrics', () => {
    it('uses a custom rubric if provided', async () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const customRubric = [
        { criterion: 'Tone', weight: 0.6 },
        { criterion: 'Length', weight: 0.4 }
      ];

      const verdict = await gradeDeliverable({ deliverable: 'Test', rubric: customRubric });
      expect(verdict.rubric.length).toBe(5); 
      expect(verdict.score).toBe(62);
    });
  });
});
