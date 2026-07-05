import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lexicalEmbeddingContext,
  searchSerializedEmbeddingIndex,
  semanticDocuments,
  semanticIntentForDocument,
  voteIntentFromNeighbors,
  type EmbeddingContext,
  type SerializedEmbeddingDocument,
} from './semantic';
import type { TascoDataset } from './types';

export const DEFAULT_MINILM_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const SEMANTIC_EMBEDDING_ARTIFACT = 'semantic-embeddings.minilm.json';

export interface SemanticEmbeddingArtifact {
  schemaVersion: 1;
  provider: 'minilm';
  model: string;
  dimensions: number;
  generatedAt: string;
  documents: SerializedEmbeddingDocument[];
}

export interface SemanticRuntimeProvider {
  contextForQuery(query: string): Promise<EmbeddingContext | undefined>;
}

export interface SemanticRuntimeProviderOptions {
  artifactPath?: string;
  model?: string;
  embedText?: (text: string, model: string) => Promise<number[]>;
}

const extractorCache = new Map<string, Promise<unknown>>();
const queryVectorCache = new Map<string, number[]>();

export function defaultSemanticArtifactPath(root = process.cwd()): string {
  return join(root, 'data', SEMANTIC_EMBEDDING_ARTIFACT);
}

export function createSemanticRuntimeProvider(
  dataset: TascoDataset,
  options: SemanticRuntimeProviderOptions = {},
): SemanticRuntimeProvider {
  const artifactPath = options.artifactPath ?? defaultSemanticArtifactPath();
  const artifact = loadSemanticEmbeddingArtifact(artifactPath);
  const model = options.model ?? artifact?.model ?? DEFAULT_MINILM_MODEL;
  const embedText = options.embedText ?? embedTextWithTransformers;

  return {
    async contextForQuery(query: string): Promise<EmbeddingContext | undefined> {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        return undefined;
      }
      if (!artifact) {
        return {
          ...lexicalEmbeddingContext(dataset, normalizedQuery),
          degraded: true,
          reason: `MiniLM artifact missing at ${artifactPath}; lexical fallback used`,
        };
      }
      try {
        const cacheKey = `${model}:${normalizedQuery}`;
        const queryVector = queryVectorCache.get(cacheKey) ?? await embedText(normalizedQuery, model);
        queryVectorCache.set(cacheKey, queryVector);
        const neighbors = searchSerializedEmbeddingIndex(dataset, queryVector, artifact.documents, 10);
        return {
          provider: 'minilm',
          model,
          neighbors,
          intentVote: voteIntentFromNeighbors(neighbors),
        };
      } catch (error) {
        return {
          ...lexicalEmbeddingContext(dataset, normalizedQuery),
          degraded: true,
          reason: `MiniLM query embedding failed: ${error instanceof Error ? error.message : 'unknown error'}; lexical fallback used`,
        };
      }
    },
  };
}

export function loadSemanticEmbeddingArtifact(path: string): SemanticEmbeddingArtifact | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!isSemanticEmbeddingArtifact(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function buildSemanticEmbeddingArtifact(
  dataset: TascoDataset,
  options: {
    model?: string;
    embedText?: (text: string, model: string) => Promise<number[]>;
    now?: string;
  } = {},
): Promise<SemanticEmbeddingArtifact> {
  const model = options.model ?? DEFAULT_MINILM_MODEL;
  const embedText = options.embedText ?? embedTextWithTransformers;
  const documents = semanticDocuments(dataset, { includeGeneratedPatterns: true });
  const serialized: SerializedEmbeddingDocument[] = [];

  for (const document of documents) {
    serialized.push({
      id: document.id,
      kind: document.kind,
      intent: semanticIntentForDocument(document),
      vector: await embedText(document.text, model),
    });
  }

  const dimensions = serialized[0]?.vector.length ?? 0;
  return {
    schemaVersion: 1,
    provider: 'minilm',
    model,
    dimensions,
    generatedAt: options.now ?? new Date().toISOString(),
    documents: serialized,
  };
}

export async function embedTextWithTransformers(text: string, model: string): Promise<number[]> {
  const extractor = await extractorForModel(model);
  const output = await (extractor as (input: string, options: Record<string, unknown>) => Promise<unknown>)(text, {
    pooling: 'mean',
    normalize: true,
  });
  return tensorToVector(output);
}

async function extractorForModel(model: string): Promise<unknown> {
  const existing = extractorCache.get(model);
  if (existing) {
    return existing;
  }
  const next = import('@huggingface/transformers').then(async (transformers) => {
    const env = (transformers as { env?: { allowRemoteModels?: boolean } }).env;
    if (env && process.env.TASCO_EMBEDDINGS_ALLOW_REMOTE === 'false') {
      env.allowRemoteModels = false;
    }
    return transformers.pipeline('feature-extraction', model, { dtype: 'fp32' } as never);
  });
  extractorCache.set(model, next);
  return next;
}

function tensorToVector(value: unknown): number[] {
  const data = (value as { data?: Iterable<number> })?.data;
  if (data && typeof data[Symbol.iterator] === 'function') {
    return Array.from(data, Number);
  }
  if (Array.isArray(value)) {
    return value.flat(Number.POSITIVE_INFINITY).map(Number).filter(Number.isFinite);
  }
  throw new Error('feature-extraction output did not contain numeric tensor data');
}

function isSemanticEmbeddingArtifact(value: unknown): value is SemanticEmbeddingArtifact {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const artifact = value as Partial<SemanticEmbeddingArtifact>;
  return (
    artifact.schemaVersion === 1 &&
    artifact.provider === 'minilm' &&
    typeof artifact.model === 'string' &&
    typeof artifact.dimensions === 'number' &&
    Array.isArray(artifact.documents) &&
    artifact.documents.every(isSerializedEmbeddingDocument)
  );
}

function isSerializedEmbeddingDocument(value: unknown): value is SerializedEmbeddingDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const document = value as Partial<SerializedEmbeddingDocument>;
  return (
    typeof document.id === 'string' &&
    ['autocomplete', 'poi', 'popular-query', 'generated-pattern'].includes(document.kind ?? '') &&
    Array.isArray(document.vector) &&
    document.vector.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}
