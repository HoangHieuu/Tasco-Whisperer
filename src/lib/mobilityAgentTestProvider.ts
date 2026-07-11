import type { ThreeAgentSystem } from './mobilityReasoningProvider';

/**
 * Deterministic model substitute for unit and API smoke tests only.
 * Production never selects this provider. It exercises the same runtime tools,
 * budgets, evidence validation, replanning, and confirmation boundary without
 * spending an external model call in CI.
 */
export function createScriptedThreeAgentTestProvider(): ThreeAgentSystem {
  const metrics = (toolNames: string[]) => ({ stepCount: Math.max(1, toolNames.length), finishReason: 'tool-calls', toolNames, inputTokens: 0, outputTokens: 0 });
  return {
    model: 'scripted-test-provider',
    async runSupervisor({ groundedDraft, previousFailure, nextVersion }) {
      return {
        decision: {
          ...groundedDraft,
          plan: {
            ...groundedDraft.plan,
            version: nextVersion,
            rationale: previousFailure
              ? `Test planner revised the search strategy from verifier evidence: ${previousFailure}`
              : groundedDraft.plan.rationale,
          },
        },
        metrics: metrics(['submitPlan']),
      };
    },
    async runExecutor({ goal, plan, tools }) {
      const selected: string[] = [];
      await tools.resolveLocations({}); selected.push('resolveLocations');
      await tools.calculateBaselineRoute({}); selected.push('calculateBaselineRoute');
      const search = await tools.searchAlongRoute({
        query: goal.facility === 'ev-charger' ? 'EV charging station' : goal.facility,
        category: goal.facility === 'ev-charger' ? 'ev-charger' : 'other',
        corridorMeters: plan.version > 1 ? 15_000 : 3_000,
        limit: 12,
      }) as Array<{ id: string }>;
      selected.push('searchAlongRoute');
      const candidateIds = search.map((item) => item.id);
      if (candidateIds.length) {
        await tools.compareDetours({ candidateIds }); selected.push('compareDetours');
        if (goal.openNow) { await tools.checkOpeningStatus({ candidateIds }); selected.push('checkOpeningStatus'); }
        if (goal.nearbyAmenity) { await tools.findNearbyPlaces({ candidateIds, category: 'cafe', radiusMeters: 1_000 }); selected.push('findNearbyPlaces'); }
        await tools.readPreferences({}); selected.push('readPreferences');
      }
      selected.push('submitEvidence');
      return { submission: { candidateIds, summary: `${candidateIds.length} grounded candidates submitted by the test model substitute.` }, metrics: metrics(selected) };
    },
    async runVerifier({ candidates, tools }) {
      const inspected: string[] = [];
      for (const candidate of candidates) {
        await tools.inspectCandidate({ candidateId: candidate.id });
        inspected.push('inspectCandidate');
        if (candidate.eligible) {
          return { decision: { kind: 'approve', candidateId: candidate.id, rationale: 'Independent inspection confirms every hard constraint passes.' }, metrics: metrics([...inspected, 'approveCandidate']) };
        }
      }
      return { decision: { kind: 'replan', reason: 'No candidate passed every hard constraint.', guidance: 'Widen the route corridor without relaxing any hard constraint.' }, metrics: metrics([...inspected, 'requestReplan']) };
    },
  };
}
