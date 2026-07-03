import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseAliasMemory, serializeAliasMemory, upsertAliasMemory } from '../src/lib/aliasMemory';
import type { AliasMemoryRecord, IntentType } from '../src/lib/types';

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith('--')) return [];
    const key = arg.slice(2);
    const next = allArgs[index + 1];
    return [[key, next && !next.startsWith('--') ? next : 'true']];
  }),
);

const path = args.get('path') ?? join(process.cwd(), 'data', 'alias-memory.local.json');
const rawQuery = args.get('rawQuery') ?? args.get('raw');
const rewrite = args.get('rewrite');
const intent = (args.get('intent') ?? 'Category Search') as IntentType;
const accepted = args.get('accepted') !== 'false';

if (!rawQuery || !rewrite) {
  console.log('Usage: npm run alias:memory -- --rawQuery <query> --rewrite <rewrite> [--intent "Category Search"] [--accepted false]');
  process.exit(1);
}

const current = loadAliasMemory(path);
const next = upsertAliasMemory(current, {
  rawQuery,
  rewrite,
  intent,
  scope: 'global-candidate',
  source: 'manual',
  accepted,
});

mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, serializeAliasMemory(next));

const record = next.find((item) => item.rawQuery === rawQuery && item.rewrite === rewrite);
console.log(`alias_memory_path: ${path}`);
console.log(`records: ${next.length}`);
if (record) {
  console.log(`updated: ${record.rawQuery} -> ${record.rewrite} (${record.status}, +${record.acceptedCount}/-${record.rejectedCount})`);
}

function loadAliasMemory(filePath: string): AliasMemoryRecord[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return parseAliasMemory(readFileSync(filePath, 'utf8'));
}
