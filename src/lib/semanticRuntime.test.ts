import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildSemanticEmbeddingArtifact,
  createSemanticRuntimeProvider,
  loadSemanticEmbeddingArtifact,
} from './semanticRuntime';
import { semanticDocuments } from './semantic';
import { testDataset } from './testDataset';

describe('semantic runtime provider', () => {
  it('loads a MiniLM artifact and returns model-backed neighbors', async () => {
    const docs = semanticDocuments(testDataset).slice(0, 2);
    const artifact = {
      schemaVersion: 1 as const,
      provider: 'minilm' as const,
      model: 'unit-minilm',
      dimensions: 2,
      generatedAt: '2026-07-04T00:00:00.000Z',
      documents: [
        { id: docs[0].id, kind: docs[0].kind, vector: [1, 0], intent: docs[0].kind === 'autocomplete' ? docs[0].record.suggestionType : undefined },
        { id: docs[1].id, kind: docs[1].kind, vector: [0, 1], intent: docs[1].kind === 'autocomplete' ? docs[1].record.suggestionType : undefined },
      ],
    };
    const dir = mkdtempSync(join(tmpdir(), 'tasco-semantic-'));
    const artifactPath = join(dir, 'semantic.json');
    writeFileSync(artifactPath, JSON.stringify(artifact));
    const provider = createSemanticRuntimeProvider(testDataset, {
      artifactPath,
      embedText: async () => [1, 0],
    });

    const context = await provider.contextForQuery('cafe');

    expect(context).toEqual(expect.objectContaining({ provider: 'minilm', model: 'unit-minilm' }));
    expect(context?.neighbors[0].document.id).toBe(docs[0].id);
    expect(context?.neighbors[0].similarity).toBe(1);
  });

  it('falls back to lexical context when the artifact is missing', async () => {
    const provider = createSemanticRuntimeProvider(testDataset, {
      artifactPath: join(tmpdir(), 'missing-tasco-semantic.json'),
      embedText: async () => {
        throw new Error('should not run without artifact');
      },
    });

    const context = await provider.contextForQuery('cafe wifi');

    expect(context?.provider).toBe('lexical-fallback');
    expect(context?.degraded).toBe(true);
    expect(context?.reason).toContain('artifact missing');
    expect(context?.neighbors.length).toBeGreaterThan(0);
  });

  it('builds a serializable embedding artifact from corpus documents', async () => {
    const artifact = await buildSemanticEmbeddingArtifact(testDataset, {
      model: 'unit-minilm',
      now: '2026-07-04T00:00:00.000Z',
      embedText: async (text) => [text.length, 1],
    });
    const dir = mkdtempSync(join(tmpdir(), 'tasco-semantic-'));
    const artifactPath = join(dir, 'semantic.json');
    writeFileSync(artifactPath, JSON.stringify(artifact));

    expect(artifact.documents.length).toBe(semanticDocuments(testDataset, { includeGeneratedPatterns: true }).length);
    expect(artifact.documents.length).toBeGreaterThan(semanticDocuments(testDataset).length);
    expect(loadSemanticEmbeddingArtifact(artifactPath)?.documents.length).toBe(artifact.documents.length);
  });
});
