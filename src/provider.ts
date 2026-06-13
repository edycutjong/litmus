/**
 * Litmus — Provider module.
 *
 * Accepts "grade" orders, runs the LLM grading engine,
 * and delivers a structured verdict on-chain.
 */

import { runProvider } from '@edycutjong/croo-core';
import type { Deliverable, Event } from '@edycutjong/croo-core';
import { gradeDeliverable } from './grader.js';
import type { GradeRequest, GradeVerdict } from './grader.js';

/**
 * Start the Litmus provider loop.
 *
 * @param client - An initialized CROO AgentClient
 * @param serviceId - The registered service ID for "Output Grading"
 */
export async function startLitmusProvider(
  client: any,
  serviceId: string,
): Promise<any> {
  return runProvider(client, {
    serviceMatch: (event: Event) => {
      return event.service_id === serviceId;
    },

    work: async (order: any): Promise<Deliverable<GradeVerdict>> => {
      const input = order.requirement as GradeRequest;
      if (!input || (!input.deliverable && !input.fileKey)) {
        throw new Error('Missing required field: deliverable or fileKey');
      }

      let textToGrade = input.deliverable || '';

      // Feature: File Handoff via presigned URLs
      if (!textToGrade && input.fileKey) {
        console.log(`[litmus] Order ${order.id}: Fetching file payload for key ${input.fileKey}...`);
        try {
          const url = await client.getDownloadURL(input.fileKey);
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) {
            throw new Error(`Failed to download file payload: ${res.statusText}`);
          }
          textToGrade = await res.text();
        } catch (fetchErr) {
          console.warn(`[litmus] ⚠️ Failed to fetch fileKey ${input.fileKey}`, fetchErr);
          throw new Error('Could not retrieve file content for grading.');
        }
      }

      console.log(`[litmus] Order ${order.id}: grading deliverable (${textToGrade.length} chars)...`);

      try {
        const verdict = await gradeDeliverable({
          ...input,
          deliverable: textToGrade
        });

        console.log(
          `[litmus] Order ${order.id}: score=${verdict.score}, grade=${verdict.grade}, ` +
          `gaps=${verdict.gaps.length}, confidence=${verdict.confidence}`,
        );

        return {
          type: 'schema',
          data: verdict,
        };
      } catch (err: any) {
        if (err.message === 'SLA_TIMEOUT') {
          console.warn(`[litmus] Order ${order.id} aborted locally due to SLA timeout.`);
          throw err;
        }
        throw err;
      }
    },

    slaGuardMs: 60_000,
  });
}
