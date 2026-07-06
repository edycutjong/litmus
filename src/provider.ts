/**
 * Litmus — Provider module.
 *
 * Accepts "grade" orders, runs the LLM grading engine,
 * and delivers a structured verdict on-chain.
 */

import { runProvider } from '@edycutjong/croo-core';
import type { Deliverable, Event, Order } from '@edycutjong/croo-core';
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
  return runProvider<GradeVerdict>(client, {
    enableStateRecovery: true,
    payoutAddress: process.env.LITMUS_PAYOUT_ADDRESS,
    serviceMatch: (event: Event) => {
      return event.service_id === serviceId;
    },

    work: async (order: Order): Promise<Deliverable<GradeVerdict>> => {
      // The buyer's input lives on the negotiation as a JSON `requirements`
      // string — the Order itself does not carry it. Fetch and parse it.
      const input = await loadRequest(client, order);

      let textToGrade = input.deliverable || '';

      // Feature: File Handoff via presigned URLs
      if (!textToGrade && input.fileKey) {
        console.log(`[litmus] Order ${order.orderId}: Fetching file payload for key ${input.fileKey}...`);
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

      console.log(`[litmus] Order ${order.orderId}: grading deliverable (${textToGrade.length} chars)...`);

      try {
        const verdict = await gradeDeliverable({
          ...input,
          deliverable: textToGrade
        });

        console.log(
          `[litmus] Order ${order.orderId}: score=${verdict.score}, grade=${verdict.grade}, ` +
          `gaps=${verdict.gaps.length}, confidence=${verdict.confidence}`,
        );

        return {
          type: 'schema',
          data: verdict,
        };
      } catch (err) {
        if (err instanceof Error && err.message === 'SLA_TIMEOUT') {
          console.warn(`[litmus] Order ${order.orderId} aborted locally due to SLA timeout.`);
        }
        throw err;
      }
    },

    slaGuardMs: 60_000,
  });
}

/**
 * Load and validate the buyer's GradeRequest from the order's negotiation.
 * Throws if the payload is missing, malformed, or lacks gradeable content.
 */
async function loadRequest(client: any, order: Order): Promise<GradeRequest> {
  let raw: string;
  try {
    const negotiation = await client.getNegotiation(order.negotiationId);
    raw = negotiation?.requirements ?? '';
  } catch (err) {
    throw new Error(`Failed to load negotiation ${order.negotiationId}: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Missing required field: deliverable or fileKey');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (!(parsed as GradeRequest).deliverable && !(parsed as GradeRequest).fileKey)
  ) {
    throw new Error('Missing required field: deliverable or fileKey');
  }

  return parsed as GradeRequest;
}
