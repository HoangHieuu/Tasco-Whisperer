import { runRewriteProvider } from '../src/lib/rewriteProvider';
import type { AgenticRewriteProvider } from '../src/lib/types';

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith('--')) return [];
    const key = arg.slice(2);
    const next = allArgs[index + 1];
    return [[key, next && !next.startsWith('--') ? next : 'true']];
  }),
);

const query = args.get('q') ?? args.get('query');
const provider = (args.get('provider') ?? 'hosted-mini') as AgenticRewriteProvider;
const endpoint = args.get('endpoint') ?? process.env.TASCO_REWRITE_AGENT_URL;
const model = args.get('model') ?? process.env.TASCO_REWRITE_AGENT_MODEL;

if (!query || !endpoint || !['hosted-mini', 'local-hermes'].includes(provider)) {
  console.log('Usage: npm run rewrite:agent -- --q <query> --provider hosted-mini --endpoint <url> [--model <model>]');
  console.log('For Ollama-style local models, use --provider local-hermes --endpoint http://localhost:11434/api/chat');
  process.exit(1);
}

const result = await runRewriteProvider({
  query,
  provider: provider as 'hosted-mini' | 'local-hermes',
  endpoint,
  model,
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 2);
