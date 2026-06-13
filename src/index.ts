/**
 * Litmus — Entry point.
 *
 * Required env vars:
 * - CROO_SDK_KEY — CROO API key
 * - LITMUS_SERVICE_ID — registered service ID
 * - OPENAI_API_KEY or ANTHROPIC_API_KEY — for LLM grading
 *
 * Optional:
 * - CROO_MOCK=true — offline mock mode
 */

import { makeClient, isMockMode } from '@edycutjong/croo-core';
import { startLitmusProvider } from './provider.js';

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  🧪 Litmus — Output Grading Agent        ║');
  console.log('║  Rubric-anchored quality verdicts         ║');
  console.log(`║  Mode: ${isMockMode() ? '🧪 MOCK' : '🔴 LIVE (Base Mainnet)'}              ║`);
  console.log('╚══════════════════════════════════════════╝');

  const sdkKey = process.env.CROO_SDK_KEY;
  const serviceId = process.env.LITMUS_SERVICE_ID;

  if (!sdkKey && !isMockMode()) {
    console.error('Missing CROO_SDK_KEY. Set it or use CROO_MOCK=true.');
    process.exit(1);
  }

  if (!serviceId) {
    console.error('Missing LITMUS_SERVICE_ID.');
    process.exit(1);
  }

  const client = isMockMode() ? {} : makeClient(sdkKey!);
  const stream = await startLitmusProvider(client, serviceId);

  const shutdown = () => {
    console.log('\n[litmus] Shutting down...');
    if (stream && typeof stream.close === 'function') {
      stream.close();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[litmus] Ready — waiting for orders...');
}

main().catch((err) => {
  console.error('[litmus] Fatal error:', err);
  process.exit(1);
});
