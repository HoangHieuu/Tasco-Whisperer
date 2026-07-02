import { createTascoApiServer } from './apiServer';
import { loadDatasetFromDisk } from './loadDataset';
import type { SuggestResponse } from '../src/lib/types';

const host = '127.0.0.1';
const dataset = loadDatasetFromDisk();
const server = createTascoApiServer(dataset);

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

  console.log(
    JSON.stringify(
      {
        ok: true,
        endpoint: '/api/suggest',
        status: response.status,
        intent: body.intent.type,
        suggestions: body.suggestions.map((suggestion) => suggestion.text),
        invalidLimitStatus: invalidResponse.status,
      },
      null,
      2,
    ),
  );
} finally {
  server.close();
}
