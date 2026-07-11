import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createTascoApiServer } from './apiServer';
import { createFileBehaviorStore } from './behaviorStore';
import { loadDatasetFromDisk } from './loadDataset';
import { createTascoApiClient } from '../src/lib/tascoApiClient';
import { parseAliasMemory, serializeAliasMemory, upsertAliasMemory, type AliasMemoryObservation } from '../src/lib/aliasMemory';
import { createSemanticRuntimeProvider, defaultSemanticArtifactPath } from '../src/lib/semanticRuntime';
import type { AgenticRewriteProvider } from '../src/lib/types';
import { MobilityAgentRuntime } from '../src/lib/mobilityAgent';
import { createMobilityLiveTools } from '../src/lib/mobilityLiveTools';
import type { MobilityDemoData } from '../src/lib/mobilityAgentTypes';
import { createOpenRouterThreeAgentSystem } from '../src/lib/mobilityReasoningProvider';

for (const path of ['.env.local', '.env']) {
  if (existsSync(path)) loadEnvFile(path);
}

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith('--')) return [];
    const key = arg.slice(2);
    const next = allArgs[index + 1];
    return [[key, next && !next.startsWith('--') ? next : 'true']];
  }),
);

const host = args.get('host') ?? '127.0.0.1';
const port = Number(args.get('port') ?? '8787');
const tascoBaseUrl = args.get('tascoBaseUrl') ?? process.env.TASCO_API_BASE_URL;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('--port must be an integer between 1 and 65535');
}

const dataset = loadDatasetFromDisk();
const aliasMemoryPath = args.get('aliasMemoryPath') ?? process.env.TASCO_ALIAS_MEMORY_PATH ?? 'data/alias-memory.local.json';
const aliasMemory = existsSync(aliasMemoryPath) ? parseAliasMemory(readFileSync(aliasMemoryPath, 'utf8')) : [];
const behaviorLogPath = args.get('behaviorLogPath') ?? process.env.TASCO_BEHAVIOR_LOG_PATH ?? 'data/behavior-events.local.json';
const behaviorRuntime = createFileBehaviorStore({ path: behaviorLogPath });
const mobilityData = JSON.parse(readFileSync('data/agentic-mobility-demo.json', 'utf8')) as MobilityDemoData;
const persistAcceptedRewrite = (observation: AliasMemoryObservation) => {
  const nextRecords = upsertAliasMemory(aliasMemory, observation);
  aliasMemory.splice(0, aliasMemory.length, ...nextRecords);
  mkdirSync(dirname(aliasMemoryPath), { recursive: true });
  writeFileSync(aliasMemoryPath, serializeAliasMemory(aliasMemory));
};
const semanticProvider = createSemanticRuntimeProvider(dataset, {
  artifactPath: args.get('semanticArtifact') ?? process.env.TASCO_SEMANTIC_ARTIFACT ?? defaultSemanticArtifactPath(),
  model: process.env.TASCO_EMBEDDING_MODEL,
});
const rewriteProvider = process.env.TASCO_REWRITE_PROVIDER as AgenticRewriteProvider | undefined;
const agenticRuntime = rewriteProvider
  ? {
      provider: rewriteProvider,
      endpoint: process.env.TASCO_REWRITE_ENDPOINT,
      model: process.env.TASCO_REWRITE_MODEL,
      onAcceptedRewrite: persistAcceptedRewrite,
    }
  : undefined;
const liveClient = createTascoApiClient({
  baseUrl: tascoBaseUrl,
  bearerToken: process.env.TASCO_BEARER_TOKEN,
  apiKey: process.env.TASCO_API_KEY,
  locale: process.env.TASCO_LOCALE,
  timezone: process.env.TASCO_TIMEZONE,
});
const mobilityLiveTools = createMobilityLiveTools({
  peliasBaseUrl: process.env.TASCO_DISABLE_LIVE_MAPS === 'true' ? undefined : process.env.TASCO_PELIAS_BASE_URL?.trim() || 'https://tasco-maps.dnpwater.vn/geocode',
  valhallaBaseUrl: process.env.TASCO_DISABLE_LIVE_MAPS === 'true' ? undefined : process.env.TASCO_VALHALLA_BASE_URL?.trim() || 'https://tasco-maps.dnpwater.vn/route',
});
const mobilityAgentKey = process.env.TASCO_MOBILITY_AGENT_API_KEY?.trim();
const mobilityAgentModel = process.env.TASCO_MOBILITY_AGENT_MODEL?.trim() || 'openai/gpt-4o-mini';
const threeAgentSystem = mobilityAgentKey ? createOpenRouterThreeAgentSystem({
  apiKey: mobilityAgentKey,
  model: mobilityAgentModel,
  baseURL: process.env.TASCO_MOBILITY_AGENT_ENDPOINT?.replace(/\/responses\/?$/, ''),
  timeoutMs: Number(process.env.TASCO_MOBILITY_AGENT_TIMEOUT_MS) || 60_000,
}) : undefined;
const mobilityAgent = new MobilityAgentRuntime(mobilityData, {
  liveTools: mobilityLiveTools,
  agentSystem: threeAgentSystem,
  behaviorEventsForUser: (userId) => behaviorRuntime.eventsForUser(userId),
});
const server = createTascoApiServer(dataset, liveClient, {
  semanticProvider,
  aliasMemory,
  agenticProvider: rewriteProvider,
  agenticRuntime,
  behaviorRuntime,
}, mobilityAgent);

server.listen(port, host, () => {
  console.log(`Tasco Whisperer API listening on http://${host}:${port}`);
  console.log(liveClient ? `TASCO live facade enabled: ${tascoBaseUrl}` : 'TASCO live facade disabled; using local fallback data.');
  console.log(`Alias memory loaded: ${aliasMemory.length} records from ${aliasMemoryPath}`);
  console.log(`Behavior events loaded: ${behaviorRuntime.count()} records from ${behaviorLogPath}`);
  console.log(`Semantic embedding artifact: ${args.get('semanticArtifact') ?? process.env.TASCO_SEMANTIC_ARTIFACT ?? defaultSemanticArtifactPath()}`);
  console.log(rewriteProvider ? `Agentic rewrite provider configured: ${rewriteProvider}` : 'Agentic rewrite provider: local deterministic fallback.');
  console.log(mobilityLiveTools ? 'Mobility map tools: live TASCO Pelias/Valhalla first, labeled local fallback second.' : 'Mobility map tools: labeled local fallback only.');
  console.log(threeAgentSystem ? `Real three-agent model configured through OpenRouter: ${threeAgentSystem.model}` : 'Real three-agent model is NOT configured; agent tasks will fail clearly until .env contains a key.');
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
