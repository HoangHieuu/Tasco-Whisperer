#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const tsxBin = process.platform === 'win32'
  ? resolve(repoRoot, 'node_modules/.bin/tsx.cmd')
  : resolve(repoRoot, 'node_modules/.bin/tsx');

const child = spawn(
  tsxBin,
  [resolve(repoRoot, 'scripts/api.ts'), '--host', process.env.HOST ?? '127.0.0.1', '--port', process.env.PORT ?? '8787'],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`Failed to start mock API server: ${error.message}`);
  process.exit(1);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
