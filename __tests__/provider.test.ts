import { describe, it, expect, vi } from 'vitest';
import { startLitmusProvider } from '../src/provider.js';
import * as core from '@edycutjong/croo-core';
import * as grader from '../src/grader.js';

vi.mock('@edycutjong/croo-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@edycutjong/croo-core')>();
  return {
    ...actual,
    runProvider: vi.fn(),
  };
});

describe('Litmus Provider', () => {
  it('registers the provider with the correct service ID', async () => {
    const mockClient = { id: 'client-id' };
    await startLitmusProvider(mockClient as any, 'grading-service');
    
    expect(core.runProvider).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        slaGuardMs: 60_000,
        serviceMatch: expect.any(Function),
        work: expect.any(Function),
      })
    );
    
    const config = vi.mocked(core.runProvider).mock.calls[0][1];
    
    // Test serviceMatch
    expect(config.serviceMatch({ service_id: 'grading-service', event: 'negotiation' } as any)).toBe(true);
    expect(config.serviceMatch({ service_id: 'other', event: 'negotiation' } as any)).toBe(false);
  });

  it('throws an error if deliverable is missing from requirement', async () => {
    const mockClient = { id: 'client-id' };
    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work({ id: 'o1', requirement: {} } as any))
      .rejects.toThrow('Missing required field: deliverable');
  });

  it('calls gradeDeliverable and returns schema deliverable', async () => {
    const mockClient = { id: 'client-id' };
    
    vi.spyOn(grader, 'gradeDeliverable').mockResolvedValueOnce({
      score: 95,
      grade: 'A',
      rubric: [],
      gaps: [],
      confidence: 'high'
    });

    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    const result = await config.work({ id: 'o1', requirement: { deliverable: 'My essay' } } as any);
    
    expect(grader.gradeDeliverable).toHaveBeenCalledWith({ deliverable: 'My essay' });
    expect(result).toEqual({
      type: 'schema',
      data: {
        score: 95,
        grade: 'A',
        rubric: [],
        gaps: [],
        confidence: 'high'
      }
    });
  });
});
