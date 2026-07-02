import { describe, expect, it } from 'vitest';
import {
  findAliasMemoryHits,
  parseAgenticRewriteOutput,
  resolveAgenticCorrection,
  shouldTriggerAgenticCorrection,
} from './agentic';
import { expandQuery } from './normalize';
import type { AliasMemoryRecord, SuggestResponse } from './types';

const ambiguousIntent: SuggestResponse['intent'] = { type: 'Ambiguous', confidence: 0.35 };
const categoryIntent: SuggestResponse['intent'] = { type: 'Category Search', confidence: 0.9 };

describe('agentic rewrite validation', () => {
  it('parses valid structured rewrite output', () => {
    const parsed = parseAgenticRewriteOutput(
      JSON.stringify({
        rewrites: ['cà phê', 'quán cà phê'],
        intent: 'Category Search',
        entities: [{ kind: 'category', value: 'cà phê', confidence: 0.92 }],
        confidence: 0.91,
        evidence: ['compact no-space Vietnamese category'],
      }),
      'caphe',
      'local-rewrite-agent',
      'agent',
    );

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.proposal.rewrites[0]).toBe('cà phê');
      expect(parsed.proposal.entities[0]).toEqual(
        expect.objectContaining({ kind: 'category', value: 'cà phê', source: 'agent' }),
      );
    }
  });

  it('rejects invalid JSON, unsupported entity kinds, and unrelated claims', () => {
    expect(parseAgenticRewriteOutput('not-json', 'caphe', 'local-rewrite-agent', 'agent')).toEqual(
      expect.objectContaining({ ok: false }),
    );

    const invalid = parseAgenticRewriteOutput(
      JSON.stringify({
        rewrites: ['Vincom cafe Nguyễn Huệ'],
        intent: 'Category Search',
        entities: [{ kind: 'unknown', value: 'Vincom', confidence: 0.9 }],
        confidence: 0.9,
        evidence: ['bad claim'],
      }),
      'caphe',
      'local-rewrite-agent',
      'agent',
    );

    expect(invalid).toEqual(expect.objectContaining({ ok: false }));
    if (!invalid.ok) {
      expect(invalid.errors.join(' ')).toContain('unsupported entity kind');
      expect(invalid.errors.join(' ')).toContain('unrelated brand or place');
    }
  });
});

describe('agentic correction trigger rules', () => {
  it('triggers for compact no-result Vietnamese variants', () => {
    const context = {
      understanding: expandQuery('caphe', []),
      entities: [],
      intent: ambiguousIntent,
      candidateCount: 0,
    };

    expect(shouldTriggerAgenticCorrection(context)).toBe(true);
    expect(resolveAgenticCorrection(context)).toEqual(
      expect.objectContaining({
        triggered: true,
        appliedRewrite: 'cà phê',
        source: 'agent',
      }),
    );
  });

  it('triggers for compact prefixes that cross a Vietnamese phrase boundary', () => {
    expect(
      resolveAgenticCorrection({
        understanding: expandQuery('cap', []),
        entities: [],
        intent: { type: 'Nearby Search', confidence: 0.98 },
        candidateCount: 1,
      }),
    ).toEqual(
      expect.objectContaining({
        triggered: true,
        appliedRewrite: 'cà phê',
        source: 'agent',
      }),
    );

    expect(
      resolveAgenticCorrection({
        understanding: expandQuery('kha', []),
        entities: [],
        intent: { type: 'Category Search', confidence: 0.9 },
        candidateCount: 1,
      }),
    ).toEqual(expect.objectContaining({ triggered: false }));
  });

  it('does not trigger for strong deterministic or coordinate-like inputs', () => {
    expect(
      resolveAgenticCorrection({
        understanding: expandQuery('vin', []),
        entities: [{ kind: 'brand', value: 'Vincom', source: 'poi-dataset', confidence: 0.8 }],
        intent: { type: 'Brand Search', confidence: 0.9 },
        candidateCount: 3,
      }),
    ).toEqual(expect.objectContaining({ triggered: false }));

    expect(
      resolveAgenticCorrection({
        understanding: expandQuery('10.77', []),
        entities: [{ kind: 'coordinate', value: '10.77', source: 'query', confidence: 0.95 }],
        intent: { type: 'Coordinate Search', confidence: 0.93 },
        candidateCount: 1,
      }),
    ).toEqual(expect.objectContaining({ triggered: false }));
  });

  it('keeps negative no-evidence variants unrewritten', () => {
    const overSpecific = resolveAgenticCorrection({
      understanding: expandQuery('capherang', []),
      entities: [],
      intent: ambiguousIntent,
      candidateCount: 0,
    });
    expect(overSpecific.triggered).toBe(true);
    expect(overSpecific.appliedRewrite).toBeUndefined();

    const specificPhrase = resolveAgenticCorrection({
      understanding: expandQuery('caphe sua da', []),
      entities: [],
      intent: ambiguousIntent,
      candidateCount: 0,
    });
    expect(specificPhrase.triggered).toBe(true);
    expect(specificPhrase.appliedRewrite).toBeUndefined();
  });

  it('honors disabled provider mode', () => {
    expect(
      resolveAgenticCorrection({
        understanding: expandQuery('caphe', []),
        entities: [],
        intent: ambiguousIntent,
        candidateCount: 0,
        enabled: false,
      }),
    ).toEqual(expect.objectContaining({ provider: 'disabled', triggered: false }));
  });
});

describe('alias memory', () => {
  const alias: AliasMemoryRecord = {
    rawQuery: 'caphe',
    rewrite: 'cà phê',
    intent: 'Category Search',
    entities: [{ kind: 'category', value: 'cà phê', source: 'alias-memory', confidence: 0.92 }],
    scope: 'user',
    source: 'agent',
    acceptedCount: 4,
    rejectedCount: 0,
    status: 'approved',
    lastSeenAt: '2026-07-02T00:00:00.000Z',
  };

  it('matches approved aliases and ignores rejected aliases', () => {
    expect(findAliasMemoryHits('caphe', [alias])).toHaveLength(1);
    expect(findAliasMemoryHits('caphe', [{ ...alias, status: 'rejected' }])).toHaveLength(0);
  });

  it('can apply alias memory before a provider rewrite', () => {
    const result = resolveAgenticCorrection({
      understanding: expandQuery('caphe', []),
      entities: [],
      intent: categoryIntent,
      candidateCount: 0,
      aliasMemory: [alias],
    });

    expect(result).toEqual(
      expect.objectContaining({
        triggered: true,
        appliedRewrite: 'cà phê',
        source: 'alias-memory',
      }),
    );
    expect(result.proposal?.entities[0].source).toBe('alias-memory');
  });
});
