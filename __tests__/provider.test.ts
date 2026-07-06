import { describe, it, expect, vi, beforeEach } from 'vitest';
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

/** SDK-shaped Order (camelCase, no inline requirement). */
function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'o1',
    negotiationId: 'n1',
    serviceId: 'grading-service',
    price: '1.0',
    slaDeadline: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/** Client whose negotiation carries the given requirement payload. */
function makeClient(requirement: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: 'client-id',
    getNegotiation: vi.fn().mockResolvedValue({
      negotiationId: 'n1',
      requirements: typeof requirement === 'string' ? requirement : JSON.stringify(requirement),
    }),
    ...extra,
  };
}

describe('Litmus Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers the provider with the correct service ID', async () => {
    const mockClient = makeClient({ deliverable: 'x' });
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
    expect(config.serviceMatch({ service_id: 'grading-service' } as any)).toBe(true);
    expect(config.serviceMatch({ service_id: 'other' } as any)).toBe(false);
  });

  it('throws an error if deliverable and fileKey are both missing', async () => {
    const mockClient = makeClient({});
    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work(makeOrder() as any))
      .rejects.toThrow('Missing required field: deliverable');
  });

  it('throws if the negotiation requirements are not valid JSON', async () => {
    const mockClient = makeClient('not-json');
    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work(makeOrder() as any))
      .rejects.toThrow('Missing required field: deliverable');
  });

  it('throws if the negotiation cannot be loaded', async () => {
    const mockClient = { id: 'c', getNegotiation: vi.fn().mockRejectedValue(new Error('boom')) };
    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work(makeOrder() as any)).rejects.toThrow('Failed to load negotiation');
  });

  it('calls gradeDeliverable and returns schema deliverable', async () => {
    const mockClient = makeClient({ deliverable: 'My essay' });

    vi.spyOn(grader, 'gradeDeliverable').mockResolvedValueOnce({
      score: 95,
      grade: 'A',
      rubric: [],
      gaps: [],
      confidence: 'high'
    });

    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    const result = await config.work(makeOrder() as any);

    expect(grader.gradeDeliverable).toHaveBeenCalledWith({ deliverable: 'My essay' });
    expect(result).toEqual({
      type: 'schema',
      data: { score: 95, grade: 'A', rubric: [], gaps: [], confidence: 'high' }
    });
  });

  it('fetches file payload if deliverable is not provided but fileKey is', async () => {
    const mockClient = makeClient(
      { fileKey: 'mock-key' },
      { getDownloadURL: vi.fn().mockResolvedValue('http://mock-url.com/file.txt') },
    );

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => 'Downloaded content'
    } as Response);

    vi.spyOn(grader, 'gradeDeliverable').mockResolvedValueOnce({
      score: 90, grade: 'A', rubric: [], gaps: [], confidence: 'high'
    });

    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await config.work(makeOrder({ orderId: 'o2' }) as any);

    expect(mockClient.getDownloadURL).toHaveBeenCalledWith('mock-key');
    expect(global.fetch).toHaveBeenCalledWith('http://mock-url.com/file.txt', expect.any(Object));
    expect(grader.gradeDeliverable).toHaveBeenCalledWith(expect.objectContaining({ deliverable: 'Downloaded content' }));
  });

  it('throws an error if fetching file payload fails', async () => {
    const mockClient = makeClient(
      { fileKey: 'mock-key' },
      { getDownloadURL: vi.fn().mockResolvedValue('http://mock-url.com/file.txt') },
    );

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found'
    } as Response);

    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work(makeOrder({ orderId: 'o3' }) as any))
      .rejects.toThrow('Could not retrieve file content for grading.');
  });

  it('handles SLA_TIMEOUT errors specially', async () => {
    const mockClient = makeClient({ deliverable: 'text' });

    vi.spyOn(grader, 'gradeDeliverable').mockRejectedValueOnce(new Error('SLA_TIMEOUT'));

    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work(makeOrder({ orderId: 'o4' }) as any))
      .rejects.toThrow('SLA_TIMEOUT');
  });

  it('throws non-SLA errors transparently', async () => {
    const mockClient = makeClient({ deliverable: 'text' });

    vi.spyOn(grader, 'gradeDeliverable').mockRejectedValueOnce(new Error('INTERNAL_ERROR'));

    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work(makeOrder({ orderId: 'o5' }) as any))
      .rejects.toThrow('INTERNAL_ERROR');
  });

  it('handles empty requirements field gracefully', async () => {
    const mockClient = {
      id: 'c',
      getNegotiation: vi.fn().mockResolvedValue({
        negotiationId: 'n1',
        requirements: null,
      })
    };
    await startLitmusProvider(mockClient as any, 'grading-service');
    const config = vi.mocked(core.runProvider).mock.calls[0][1];

    await expect(config.work(makeOrder() as any)).rejects.toThrow('Missing required field: deliverable or fileKey');
  });
});
