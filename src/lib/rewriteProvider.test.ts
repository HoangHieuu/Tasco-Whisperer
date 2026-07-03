import { describe, expect, it } from 'vitest';
import { runRewriteProvider } from './rewriteProvider';

describe('async rewrite provider adapter', () => {
  it('validates structured JSON from a hosted provider', async () => {
    const result = await runRewriteProvider({
      query: 'bundau',
      provider: 'hosted-mini',
      endpoint: 'https://provider.test/rewrite',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              rewrites: ['bún đậu'],
              intent: 'Category Search',
              entities: [{ kind: 'category', value: 'bún đậu', confidence: 0.88 }],
              confidence: 0.86,
              evidence: ['Vietnamese food query normalization'],
            }),
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    expect(result.ok).toBe(true);
    expect(result.proposal).toEqual(
      expect.objectContaining({
        rewrites: ['bún đậu'],
        provider: 'hosted-mini',
      }),
    );
  });

  it('rejects invalid or unsafe provider output', async () => {
    const result = await runRewriteProvider({
      query: 'caphe',
      provider: 'local-hermes',
      endpoint: 'http://localhost:11434/api/chat',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify({
                rewrites: ['Vincom cafe Nguyễn Huệ'],
                intent: 'Category Search',
                entities: [{ kind: 'unknown', value: 'Vincom', confidence: 0.9 }],
                confidence: 0.9,
                evidence: ['invented'],
              }),
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('unsupported entity kind');
    expect(result.errors.join(' ')).toContain('unrelated brand or place');
  });
});
