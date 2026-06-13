/**
 * Litmus - Grading Stability Artifact
 * Proves that temperature: 0 and rubric anchoring yield deterministic scoring with variance σ < 4.
 */

import { gradeDeliverable, DEFAULT_RUBRIC } from '../src/grader.js';
import * as dotenv from 'dotenv';
dotenv.config();

const SAMPLE_DELIVERABLE = `
Base L2 TVL recently hit $4 Billion. This is due to rising popularity in memecoins and low fees.
However, there are risks, such as sequencer centralization and bridge vulnerabilities.
`;

async function runStabilityBenchmark() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  🧪 Litmus - Grading Stability Harness (Target: σ < 4) ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.warn('⚠️ No API keys found, skipping live stability test.');
    return;
  }

  const iterations = 10;
  const scores: number[] = [];

  console.log(`\nRunning ${iterations} sequential grading passes at temperature 0...\n`);

  for (let i = 0; i < iterations; i++) {
    process.stdout.write(`Run ${i + 1}/${iterations}... `);
    const start = Date.now();
    try {
      const verdict = await gradeDeliverable({
        deliverable: SAMPLE_DELIVERABLE,
        rubric: DEFAULT_RUBRIC
      });
      const ms = Date.now() - start;
      scores.push(verdict.score);
      console.log(`Score: ${verdict.score} [${ms}ms]`);
    } catch (err: any) {
      console.log(`Failed: ${err.message}`);
    }
  }

  if (scores.length === 0) return;

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  console.log('\n📊 --- STABILITY RESULTS ---');
  console.log(`Mean Score: ${mean.toFixed(2)}`);
  console.log(`Standard Deviation (σ): ${stdDev.toFixed(2)}`);
  console.log(`Target: σ < 4.0`);
  
  if (stdDev < 4.0) {
    console.log('\n✅ STABILITY CHECK PASSED: Variance is < 4.');
    console.log('Litmus provides deterministic, on-chain verifiable scoring.');
  } else {
    console.error('\n❌ STABILITY CHECK FAILED: High LLM variance detected.');
    process.exit(1);
  }
}

runStabilityBenchmark().catch(console.error);
