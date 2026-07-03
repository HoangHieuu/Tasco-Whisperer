import { describe, expect, it } from 'vitest';
import { observationFromProposal, parseAliasMemory, serializeAliasMemory, upsertAliasMemory } from './aliasMemory';
import type { AgenticRewriteProposal } from './types';

describe('persistent alias memory', () => {
  it('records accepted corrections and promotes repeated aliases', () => {
    let records = upsertAliasMemory([], {
      rawQuery: 'cf',
      rewrite: 'cà phê',
      intent: 'Category Search',
      entities: [{ kind: 'category', value: 'cà phê', source: 'agent', confidence: 0.9 }],
      seenAt: '2026-07-03T00:00:00.000Z',
    });

    records = upsertAliasMemory(records, {
      rawQuery: 'cf',
      rewrite: 'cà phê',
      intent: 'Category Search',
      seenAt: '2026-07-03T00:01:00.000Z',
    });
    records = upsertAliasMemory(records, {
      rawQuery: 'cf',
      rewrite: 'cà phê',
      intent: 'Category Search',
      seenAt: '2026-07-03T00:02:00.000Z',
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(
      expect.objectContaining({
        rawQuery: 'cf',
        rewrite: 'cà phê',
        acceptedCount: 3,
        rejectedCount: 0,
        status: 'approved',
      }),
    );
    expect(records[0].entities[0].source).toBe('alias-memory');
  });

  it('serializes, parses, and rejects invalid records', () => {
    const records = upsertAliasMemory([], {
      rawQuery: 'bun dau',
      rewrite: 'bún đậu',
      intent: 'Category Search',
      scope: 'global-candidate',
      source: 'manual',
      seenAt: '2026-07-03T00:00:00.000Z',
    });

    expect(parseAliasMemory(serializeAliasMemory(records))).toEqual(records);
    expect(parseAliasMemory(JSON.stringify([{ bad: true }]))).toEqual([]);
  });

  it('creates observations from validated agent proposals', () => {
    const proposal: AgenticRewriteProposal = {
      rewrites: ['bún đậu'],
      intent: 'Category Search',
      entities: [{ kind: 'category', value: 'bún đậu', source: 'agent', confidence: 0.88 }],
      confidence: 0.86,
      evidence: ['slang correction accepted by user'],
      provider: 'hosted-mini',
      source: 'agent',
    };

    expect(observationFromProposal('bundau', proposal, true, '2026-07-03T00:00:00.000Z')).toEqual(
      expect.objectContaining({
        rawQuery: 'bundau',
        rewrite: 'bún đậu',
        scope: 'global-candidate',
      }),
    );
  });
});
