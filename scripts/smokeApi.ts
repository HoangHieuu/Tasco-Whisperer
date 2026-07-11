import { createTascoApiServer } from './apiServer';
import { loadDatasetFromDisk } from './loadDataset';
import type { BehaviorEvent, SuggestResponse } from '../src/lib/types';
import type { TascoAutocompleteResponse, TascoPlacesResponse, TascoPoiResponse, TascoRouteResponse, TascoSearchResponse } from '../src/lib/tascoFacade';
import mobilityDemoData from '../data/agentic-mobility-demo.json';
import { MobilityAgentRuntime } from '../src/lib/mobilityAgent';
import { createScriptedThreeAgentTestProvider } from '../src/lib/mobilityAgentTestProvider';
import type { AgentTaskSnapshot, MobilityDemoData } from '../src/lib/mobilityAgentTypes';

const host = '127.0.0.1';
const dataset = loadDatasetFromDisk();
const behaviorEvents: BehaviorEvent[] = [];
const mobilityAgent = new MobilityAgentRuntime(mobilityDemoData as MobilityDemoData, {
  agentSystem: createScriptedThreeAgentTestProvider(),
});
const server = createTascoApiServer(dataset, undefined, {
  behaviorRuntime: {
    eventsForUser(userId?: string) {
      return userId ? behaviorEvents.filter((event) => event.userId === userId) : [];
    },
    record(event: BehaviorEvent) {
      behaviorEvents.push(event);
      return { storedCount: behaviorEvents.length };
    },
  },
}, mobilityAgent);

const address = await new Promise<{ port: number }>((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, host, () => {
    const info = server.address();
    if (!info || typeof info === 'string') {
      reject(new Error('API server did not expose a TCP port'));
      return;
    }
    resolve({ port: info.port });
  });
});

try {
  const baseUrl = `http://${host}:${address.port}`;
  const response = await fetch(`${baseUrl}/api/suggest?q=cafe%20wifi&limit=3&city=TP.HCM&userId=coffee-loyal`);
  if (!response.ok) {
    throw new Error(`Expected 200 from /api/suggest, got ${response.status}`);
  }
  const body = (await response.json()) as SuggestResponse;
  if (body.intent.type !== 'Attribute Search') {
    throw new Error(`Expected Attribute Search, got ${body.intent.type}`);
  }
  if (body.suggestions.length !== 3) {
    throw new Error(`Expected 3 suggestions, got ${body.suggestions.length}`);
  }

  const invalidResponse = await fetch(`${baseUrl}/api/suggest?q=atm&limit=99`);
  if (invalidResponse.status !== 400) {
    throw new Error(`Expected 400 for invalid limit, got ${invalidResponse.status}`);
  }
  const behaviorResponse = await fetch(`${baseUrl}/api/behavior-events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      userId: 'smoke-learner',
      query: 'cafe',
      selectedText: 'Highlands Coffee Nguyễn Huệ',
      selectedType: 'POI Search',
      brand: 'Highlands Coffee',
      category: 'Quán cà phê',
      city: 'TP.HCM',
      occurredAt: new Date().toISOString(),
    }),
  });
  if (behaviorResponse.status !== 201) {
    throw new Error(`Expected 201 from /api/behavior-events, got ${behaviorResponse.status}`);
  }
  const personalizedResponse = await fetch(`${baseUrl}/api/suggest?q=cafe&city=TP.HCM&userId=smoke-learner&limit=5`);
  if (!personalizedResponse.ok) {
    throw new Error(`Expected 200 from personalized /api/suggest, got ${personalizedResponse.status}`);
  }
  const personalizedBody = (await personalizedResponse.json()) as SuggestResponse;
  const personalizedHighlands = personalizedBody.suggestions.find((suggestion) => suggestion.text === 'Highlands Coffee Nguyễn Huệ');
  if (!personalizedHighlands?.metadata.personalizationReason?.includes('prior result selections')) {
    throw new Error('Expected server-side behavior event to personalize matching suggestions');
  }
  const autocompleteResponse = await fetch(`${baseUrl}/v1/autocomplete?q=caphe&limit=8&sessionId=smoke-1&city=TP.HCM`);
  if (!autocompleteResponse.ok) {
    throw new Error(`Expected 200 from /v1/autocomplete, got ${autocompleteResponse.status}`);
  }
  const autocompleteBody = (await autocompleteResponse.json()) as TascoAutocompleteResponse;
  if (!autocompleteBody.suggestions.length || autocompleteBody.meta.expandedQuery !== 'ca phe') {
    throw new Error('Expected TASCO autocomplete facade to return local caphe fallback suggestions');
  }
  const autocompleteVisibleText = autocompleteBody.suggestions.map((suggestion) => `${suggestion.label} ${suggestion.address ?? ''}`).join(' ');
  if (/Đà Nẵng|Đà Lạt|Hà Nội|Hải Phòng/.test(autocompleteVisibleText)) {
    throw new Error(`Expected TP.HCM autocomplete scope, got out-of-city suggestions: ${autocompleteVisibleText}`);
  }

  const searchResponse = await fetch(`${baseUrl}/v1/search?q=coffee&limit=3`);
  if (!searchResponse.ok) {
    throw new Error(`Expected 200 from /v1/search, got ${searchResponse.status}`);
  }
  const searchBody = (await searchResponse.json()) as TascoSearchResponse;
  if (!searchBody.results.length || !searchBody.results[0].coordinates || !searchBody.results[0].id.startsWith('poi:')) {
    throw new Error('Expected TASCO search facade to return coordinate-backed POI results first');
  }

  const filteredSearchResponse = await fetch(
    `${baseUrl}/v1/search?q=atm&lat=10.7759&lon=106.7031&radiusMeters=2000&category=ATM&bbox=106.6,10.7,106.8,10.9&limit=3`,
  );
  if (!filteredSearchResponse.ok) {
    throw new Error(`Expected 200 from filtered /v1/search, got ${filteredSearchResponse.status}`);
  }
  const filteredSearchBody = (await filteredSearchResponse.json()) as TascoSearchResponse;
  if (!filteredSearchBody.results.length || filteredSearchBody.meta.category !== 'ATM') {
    throw new Error('Expected filtered TASCO search facade to honor category and proximity metadata');
  }

  const healthResponse = await fetch(`${baseUrl}/health`);
  if (!healthResponse.ok) {
    throw new Error(`Expected 200 from /health, got ${healthResponse.status}`);
  }
  const poiResponse = await fetch(`${baseUrl}/v1/poi/poi:POI001?include=reviews,photos,hours,ai_summary`);
  if (!poiResponse.ok) {
    throw new Error(`Expected 200 from /v1/poi/{id}, got ${poiResponse.status}`);
  }
  const poiBody = (await poiResponse.json()) as TascoPoiResponse;
  if (!poiBody.poi.reviews?.length || !poiBody.poi.photos?.length || !poiBody.poi.openingHours) {
    throw new Error('Expected enriched POI response to include reviews, photos, and openingHours');
  }
  if (poiBody.poi.enrichment?.fields.aiSummary?.source !== 'local-derived') {
    throw new Error('Expected POI aiSummary enrichment provenance to be local-derived');
  }
  if (poiBody.poi.enrichment?.fields.reviews?.source !== 'local-mock') {
    throw new Error('Expected POI review enrichment provenance to be local-mock');
  }

  const reverseResponse = await fetch(`${baseUrl}/v1/reverse?point.lat=10.7759&point.lon=106.7031`);
  if (!reverseResponse.ok) {
    throw new Error(`Expected 200 from /v1/reverse, got ${reverseResponse.status}`);
  }
  const reverseBody = (await reverseResponse.json()) as TascoPlacesResponse;

  const nearbyResponse = await fetch(`${baseUrl}/v1/nearby-search?lat=10.7759&lon=106.7031&category=ATM&radiusMeters=2000&limit=3`);
  if (!nearbyResponse.ok) {
    throw new Error(`Expected 200 from /v1/nearby-search, got ${nearbyResponse.status}`);
  }
  const nearbyBody = (await nearbyResponse.json()) as TascoPlacesResponse;

  const geocodingResponse = await fetch(`${baseUrl}/v1/geocoding?address=Nguyen%20Hue&city=TP.HCM&limit=3`);
  if (!geocodingResponse.ok) {
    throw new Error(`Expected 200 from /v1/geocoding, got ${geocodingResponse.status}`);
  }
  const geocodingBody = (await geocodingResponse.json()) as TascoPlacesResponse;

  const routeResponse = await fetch(`${baseUrl}/v1/route`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lat: 10.7759, lon: 106.7031 },
        { lat: 10.772, lon: 106.698 },
      ],
      mode: 'auto',
    }),
  });
  if (!routeResponse.ok) {
    throw new Error(`Expected 200 from /v1/route, got ${routeResponse.status}`);
  }
  const routeBody = (await routeResponse.json()) as TascoRouteResponse;

  const unauthorizedResponse = await fetch(`${baseUrl}/v1/search?q=cafe&mockError=unauthorized`);
  const rateLimitedResponse = await fetch(`${baseUrl}/v1/autocomplete?q=cafe&mockError=rate_limited`);
  const timeoutResponse = await fetch(`${baseUrl}/v1/route?mockError=timeout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lat: 10.7759, lon: 106.7031 },
        { lat: 10.772, lon: 106.698 },
      ],
    }),
  });
  if (unauthorizedResponse.status !== 401 || rateLimitedResponse.status !== 429 || timeoutResponse.status !== 408) {
    throw new Error('Expected documented mock error statuses for unauthorized, rate_limited, and timeout');
  }

  if (!poiBody.poi.label || !reverseBody.results.length || !nearbyBody.results.length || !geocodingBody.results.length || !routeBody.routes.length) {
    throw new Error('Expected all TASCO facade fallback endpoints to return useful local results');
  }

  const agentCreateResponse = await fetch(`${baseUrl}/v1/agent/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'Find an EV charger on my route to Đà Nẵng, near coffee, open now, with less than a 10-minute detour.',
      context: {
        currentLocation: { lat: 10.7769, lon: 106.7009 },
        now: '2026-07-11T20:00:00+07:00',
        locale: 'en',
        sessionId: 'api-smoke-agent',
        vehicle: { type: 'ev', connectorTypes: ['CCS2'] },
      },
      executionMode: 'plan-and-propose',
    }),
  });
  if (agentCreateResponse.status !== 202) throw new Error(`Expected 202 from agent task creation, got ${agentCreateResponse.status}`);
  const agentCreated = await agentCreateResponse.json() as { taskId: string };
  const agentTask = await waitForAgentTask(`${baseUrl}/v1/agent/tasks/${encodeURIComponent(agentCreated.taskId)}`);
  if (agentTask.status !== 'ready_for_confirmation' || agentTask.plan?.version !== 2 || agentTask.verification?.decision !== 'pass' || new Set(agentTask.modelCalls.map((call) => call.agent)).size !== 3) {
    throw new Error(`Expected verified replanned agent task, got ${agentTask.status} plan=${agentTask.plan?.version}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        endpoint: '/api/suggest',
        facadeEndpoints: [
          '/v1/autocomplete',
          '/v1/search',
          '/v1/poi/{id}',
          '/v1/reverse-geocoding',
          '/v1/nearby-search',
          '/v1/geocoding',
          '/v1/route',
          '/health',
          '/v1/agent/tasks',
          '/v1/agent/tasks/{id}/events',
        ],
        status: response.status,
        intent: body.intent.type,
        suggestions: body.suggestions.map((suggestion) => suggestion.text),
        autocompleteLabels: autocompleteBody.suggestions.map((suggestion) => suggestion.label),
        searchLabels: searchBody.results.map((result) => result.label),
        filteredSearchLabels: filteredSearchBody.results.map((result) => result.label),
        poiLabel: poiBody.poi.label,
        poiEnrichment: {
          openingHours: poiBody.poi.openingHours,
          summarySource: poiBody.poi.enrichment?.fields.aiSummary?.source,
          reviewSource: poiBody.poi.enrichment?.fields.reviews?.source,
          attributes: poiBody.poi.enrichment?.attributes.length ?? 0,
          reviews: poiBody.poi.reviews?.length ?? 0,
          photos: poiBody.poi.photos?.length ?? 0,
        },
        reverseLabel: reverseBody.results[0].label,
        nearbyLabel: nearbyBody.results[0].label,
        geocodingLabel: geocodingBody.results[0].label,
        routeDistanceMeters: routeBody.routes[0].summary.distanceMeters,
        mockErrorStatuses: {
          unauthorized: unauthorizedResponse.status,
          rateLimited: rateLimitedResponse.status,
          timeout: timeoutResponse.status,
        },
        behaviorEventStatus: behaviorResponse.status,
        behaviorPersonalization: personalizedHighlands.metadata.personalizationReason,
        invalidLimitStatus: invalidResponse.status,
        mobilityAgent: {
          status: agentTask.status,
          planVersion: agentTask.plan?.version,
          replans: agentTask.budgets.replansUsed,
          toolCalls: agentTask.budgets.toolCallsUsed,
          modelCalls: agentTask.modelCalls.length,
          modelAgents: [...new Set(agentTask.modelCalls.map((call) => call.agent))],
          winner: agentTask.candidates[0]?.primary.label,
          action: agentTask.proposedAction?.status,
        },
      },
      null,
      2,
    ),
  );
} finally {
  server.close();
}

async function waitForAgentTask(url: string): Promise<AgentTaskSnapshot> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const response = await fetch(url);
    const task = await response.json() as AgentTaskSnapshot;
    if (['ready_for_confirmation', 'needs_clarification', 'completed', 'degraded', 'failed'].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Mobility agent smoke task timed out');
}
