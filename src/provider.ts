/**
 * Litmus — Provider module.
 *
 * Accepts "grade" orders, runs the LLM grading engine,
 * and delivers a structured verdict on-chain.
 */

import { runProvider } from 'croo-core';
import type { Order, Deliverable, NegotiationEvent } from 'croo-core';
import { gradeDeliverable } from './grader.js';
import type { GradeRequest, GradeVerdict } from './grader.js';

/**
 * Start the Litmus provider loop.
 *
 * @param client - An initialized CROO AgentClient
 * @param serviceId - The registered service ID for "Output Grading"
 */
export async function startLitmusProvider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  serviceId: string,
) {
  return runProvider<GradeRequest, GradeVerdict>(client, {
    serviceMatch: (event: NegotiationEvent) => {
      return event.service_id === serviceId;
    },

    work: async (order: Order<GradeRequest>): Promise<Deliverable<GradeVerdict>> => {
      const input = order.requirement;
      if (!input?.deliverable) {
        throw new Error('Missing required field: deliverable');
      }

      console.log(`[litmus] Order ${order.id}: grading deliverable (${input.deliverable.length} chars)...`);

      const verdict = await gradeDeliverable(input);

      console.log(
        `[litmus] Order ${order.id}: score=${verdict.score}, grade=${verdict.grade}, ` +
        `gaps=${verdict.gaps.length}, confidence=${verdict.confidence}`,
      );

      return {
        type: 'schema',
        data: verdict,
      };
    },

    slaGuardMs: 60_000,
  });
}
