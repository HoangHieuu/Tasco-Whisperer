import { createTascoApiServer } from './apiServer';
import { loadDatasetFromDisk } from './loadDataset';

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

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('--port must be an integer between 1 and 65535');
}

const dataset = loadDatasetFromDisk();
const server = createTascoApiServer(dataset);

server.listen(port, host, () => {
  console.log(`Tasco Whisperer API listening on http://${host}:${port}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
