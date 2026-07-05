import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BehaviorEvent, BehaviorEventRuntime } from '../src/lib/types';

export interface FileBehaviorStoreOptions {
  path: string;
  maxEvents?: number;
}

export function createFileBehaviorStore({ path, maxEvents = 5000 }: FileBehaviorStoreOptions): BehaviorEventRuntime & {
  count(): number;
} {
  const events = existsSync(path) ? parseBehaviorEvents(readFileSync(path, 'utf8')) : [];

  function persist() {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeBehaviorEvents(events));
  }

  return {
    eventsForUser(userId?: string) {
      if (!userId) {
        return [];
      }
      return events.filter((event) => event.userId === userId).slice(-120);
    },
    record(event: BehaviorEvent) {
      events.push(event);
      if (events.length > maxEvents) {
        events.splice(0, events.length - maxEvents);
      }
      persist();
      return { storedCount: events.length };
    },
    count() {
      return events.length;
    },
  };
}

export function parseBehaviorEvents(raw: string): BehaviorEvent[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isBehaviorEvent) : [];
  } catch {
    return [];
  }
}

export function serializeBehaviorEvents(events: BehaviorEvent[]): string {
  return `${JSON.stringify(events, null, 2)}\n`;
}

function isBehaviorEvent(value: unknown): value is BehaviorEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const event = value as BehaviorEvent;
  return (
    typeof event.userId === 'string' &&
    typeof event.query === 'string' &&
    typeof event.selectedText === 'string' &&
    typeof event.selectedType === 'string' &&
    typeof event.occurredAt === 'string'
  );
}
