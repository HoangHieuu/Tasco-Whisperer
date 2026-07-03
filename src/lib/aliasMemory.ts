import { normalizeText } from './normalize';
import type { AgenticRewriteProposal, AliasMemoryRecord, QueryEntity } from './types';

export interface AliasMemoryObservation {
  rawQuery: string;
  rewrite: string;
  intent: AliasMemoryRecord['intent'];
  entities?: QueryEntity[];
  scope?: AliasMemoryRecord['scope'];
  source?: AliasMemoryRecord['source'];
  accepted?: boolean;
  seenAt?: string;
}

export function upsertAliasMemory(
  records: AliasMemoryRecord[],
  observation: AliasMemoryObservation,
): AliasMemoryRecord[] {
  const normalizedRaw = normalizeText(observation.rawQuery);
  const normalizedRewrite = normalizeText(observation.rewrite);
  if (!normalizedRaw || !normalizedRewrite || normalizedRaw === normalizedRewrite) {
    return records;
  }

  const key = aliasKey(observation.rawQuery, observation.rewrite, observation.scope ?? 'user');
  const now = observation.seenAt ?? new Date().toISOString();
  const accepted = observation.accepted !== false;
  const existing = records.find((record) => aliasKey(record.rawQuery, record.rewrite, record.scope) === key);
  const nextRecord: AliasMemoryRecord = existing
    ? {
        ...existing,
        intent: observation.intent,
        entities: normalizeAliasEntities(observation.entities ?? existing.entities),
        acceptedCount: existing.acceptedCount + (accepted ? 1 : 0),
        rejectedCount: existing.rejectedCount + (accepted ? 0 : 1),
        status: statusForCounts(existing.acceptedCount + (accepted ? 1 : 0), existing.rejectedCount + (accepted ? 0 : 1)),
        lastSeenAt: now,
      }
    : {
        rawQuery: observation.rawQuery,
        rewrite: observation.rewrite,
        intent: observation.intent,
        entities: normalizeAliasEntities(observation.entities ?? []),
        scope: observation.scope ?? 'user',
        source: observation.source ?? 'agent',
        acceptedCount: accepted ? 1 : 0,
        rejectedCount: accepted ? 0 : 1,
        status: accepted ? 'candidate' : 'rejected',
        lastSeenAt: now,
      };

  return [...records.filter((record) => aliasKey(record.rawQuery, record.rewrite, record.scope) !== key), nextRecord].sort(
    (a, b) => b.acceptedCount - b.rejectedCount - (a.acceptedCount - a.rejectedCount),
  );
}

export function observationFromProposal(
  rawQuery: string,
  proposal: AgenticRewriteProposal,
  accepted = true,
  seenAt?: string,
): AliasMemoryObservation | undefined {
  const rewrite = proposal.rewrites[0];
  if (!rewrite) {
    return undefined;
  }
  return {
    rawQuery,
    rewrite,
    intent: proposal.intent,
    entities: proposal.entities,
    source: proposal.source,
    scope: proposal.source === 'alias-memory' ? 'user' : 'global-candidate',
    accepted,
    seenAt,
  };
}

export function parseAliasMemory(raw: string): AliasMemoryRecord[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((record) => (isAliasMemoryRecord(record) ? [record] : []));
  } catch {
    return [];
  }
}

export function serializeAliasMemory(records: AliasMemoryRecord[]): string {
  return `${JSON.stringify(records, null, 2)}\n`;
}

function normalizeAliasEntities(entities: QueryEntity[]): QueryEntity[] {
  return entities.slice(0, 8).map((entity) => ({
    ...entity,
    source: 'alias-memory',
    confidence: Math.min(1, Math.max(0, entity.confidence)),
  }));
}

function statusForCounts(acceptedCount: number, rejectedCount: number): AliasMemoryRecord['status'] {
  if (rejectedCount > acceptedCount) {
    return 'rejected';
  }
  if (acceptedCount >= 3 && acceptedCount >= rejectedCount * 2) {
    return 'approved';
  }
  return 'candidate';
}

function aliasKey(rawQuery: string, rewrite: string, scope: AliasMemoryRecord['scope']): string {
  return `${scope}:${normalizeText(rawQuery)}:${normalizeText(rewrite)}`;
}

function isAliasMemoryRecord(value: unknown): value is AliasMemoryRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<AliasMemoryRecord>;
  return (
    typeof record.rawQuery === 'string' &&
    typeof record.rewrite === 'string' &&
    typeof record.intent === 'string' &&
    Array.isArray(record.entities) &&
    ['user', 'session', 'global-candidate'].includes(record.scope ?? '') &&
    ['agent', 'alias-memory', 'manual', 'evaluation'].includes(record.source ?? '') &&
    typeof record.acceptedCount === 'number' &&
    typeof record.rejectedCount === 'number' &&
    ['candidate', 'approved', 'rejected'].includes(record.status ?? '') &&
    typeof record.lastSeenAt === 'string'
  );
}
