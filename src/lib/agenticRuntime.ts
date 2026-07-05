import { resolveAgenticCorrection, type AgenticCorrectionResult, type AgenticTriggerContext } from './agentic';
import { runRewriteProvider } from './rewriteProvider';
import type { AliasMemoryObservation } from './aliasMemory';
import type { AgenticRewriteProvider } from './types';

export interface AgenticRuntimeOptions {
  provider?: AgenticRewriteProvider;
  endpoint?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  onAcceptedRewrite?: (observation: AliasMemoryObservation) => void | Promise<void>;
}

export async function resolveAgenticCorrectionWithProvider(
  context: AgenticTriggerContext,
  options: AgenticRuntimeOptions = {},
): Promise<AgenticCorrectionResult> {
  const provider = options.provider ?? context.provider;
  const initial = resolveAgenticCorrection({ ...context, provider });
  if (
    !initial.triggered ||
    initial.appliedRewrite ||
    !provider ||
    !['hosted-mini', 'local-hermes'].includes(provider) ||
    !options.endpoint
  ) {
    return initial;
  }

  const providerResult = await runRewriteProvider({
    query: context.understanding.normalized,
    provider: provider as Exclude<AgenticRewriteProvider, 'disabled' | 'local-rewrite-agent' | 'offline-reasoner'>,
    endpoint: options.endpoint,
    model: options.model,
    fetchImpl: options.fetchImpl,
  });

  if (!providerResult.ok || !providerResult.proposal) {
    return {
      ...initial,
      reason: `provider output rejected: ${providerResult.errors.join('; ') || 'no proposal'}`,
    };
  }

  return {
    triggered: true,
    provider,
    reason: `${provider} provider proposed validated rewrite`,
    appliedRewrite: providerResult.proposal.rewrites[0],
    source: 'agent',
    proposal: providerResult.proposal,
    aliasMemoryHits: initial.aliasMemoryHits,
  };
}
