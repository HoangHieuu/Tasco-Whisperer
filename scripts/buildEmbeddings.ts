import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildSemanticEmbeddingArtifact, defaultSemanticArtifactPath, DEFAULT_MINILM_MODEL } from '../src/lib/semanticRuntime';
import { loadDatasetFromDisk } from './loadDataset';

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, allArgs) => {
    if (!arg.startsWith('--')) return [];
    const key = arg.slice(2);
    const next = allArgs[index + 1];
    return [[key, next && !next.startsWith('--') ? next : 'true']];
  }),
);

const output = args.get('out') ?? defaultSemanticArtifactPath();
const model = args.get('model') ?? process.env.TASCO_EMBEDDING_MODEL ?? DEFAULT_MINILM_MODEL;
const dataset = loadDatasetFromDisk();

const artifact = await buildSemanticEmbeddingArtifact(dataset, { model });
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`semantic_embedding_artifact: ${output}`);
console.log(`model: ${artifact.model}`);
console.log(`documents: ${artifact.documents.length}`);
console.log(`dimensions: ${artifact.dimensions}`);
