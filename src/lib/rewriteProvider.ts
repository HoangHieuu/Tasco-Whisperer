import { parseAgenticRewriteOutput } from './agentic';
import type { AgenticRewriteProposal, AgenticRewriteProvider } from './types';

export interface RewriteProviderRequest {
  query: string;
  provider: Exclude<AgenticRewriteProvider, 'disabled' | 'local-rewrite-agent' | 'offline-reasoner'>;
  endpoint: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface RewriteProviderResult {
  ok: boolean;
  provider: AgenticRewriteProvider;
  proposal?: AgenticRewriteProposal;
  errors: string[];
}

const SYSTEM_PROMPT = [
  'Return JSON only for Vietnamese map autocomplete rewrite.',
  'Shape: {"rewrites":["..."],"intent":"Category Search","entities":[{"kind":"category","value":"...","confidence":0.9}],"confidence":0.9,"evidence":["..."]}',
  'Do not invent brands, places, or facts not implied by the query.',
].join('\n');

export async function runRewriteProvider(request: RewriteProviderRequest): Promise<RewriteProviderResult> {
  const fetcher = request.fetchImpl ?? globalThis.fetch;
  if (!fetcher) {
    return { ok: false, provider: request.provider, errors: ['fetch is not available'] };
  }

  const response = await fetcher(request.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payloadForProvider(request)),
  });

  if (!response.ok) {
    return { ok: false, provider: request.provider, errors: [`provider returned HTTP ${response.status}`] };
  }

  const rawPayload = await response.json();
  const rawOutput = extractRawOutput(rawPayload);
  if (!rawOutput) {
    return { ok: false, provider: request.provider, errors: ['provider response did not contain text output'] };
  }

  const parsed = parseAgenticRewriteOutput(rawOutput, request.query, request.provider, 'agent');
  if (!parsed.ok) {
    return { ok: false, provider: request.provider, errors: parsed.errors };
  }

  return { ok: true, provider: request.provider, proposal: parsed.proposal, errors: [] };
}

function payloadForProvider(request: RewriteProviderRequest): Record<string, unknown> {
  if (request.provider === 'local-hermes') {
    return {
      model: request.model ?? 'hermes3',
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: request.query },
      ],
    };
  }

  return {
    model: request.model ?? 'mini-rewrite',
    input: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: request.query },
    ],
  };
}

function extractRawOutput(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return payload;
  }
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string') {
    return record.output_text;
  }
  if (typeof record.response === 'string') {
    return record.response;
  }
  if (typeof record.content === 'string') {
    return record.content;
  }
  if (typeof record.message === 'object' && record.message !== null) {
    const message = record.message as Record<string, unknown>;
    if (typeof message.content === 'string') {
      return message.content;
    }
  }
  return undefined;
}
