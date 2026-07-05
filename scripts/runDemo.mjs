import { spawn } from 'node:child_process';

const host = process.env.TASCO_DEMO_HOST || '127.0.0.1';
const apiPort = process.env.TASCO_DEMO_API_PORT || '8787';
const uiPort = process.env.TASCO_DEMO_UI_PORT || '5173';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const apiBaseUrl = `http://${host}:${apiPort}`;
const uiUrl = `http://${host}:${uiPort}`;

validatePort(apiPort, 'TASCO_DEMO_API_PORT');
validatePort(uiPort, 'TASCO_DEMO_UI_PORT');

console.log(`Starting Tasco Whisperer demo`);
console.log(`API: ${apiBaseUrl}`);
console.log(`UI:  ${uiUrl}`);
console.log('Press Ctrl+C to stop both processes.');

const api = spawn(npmCommand, ['run', 'api:dev', '--', '--host', host, '--port', apiPort], {
  env: process.env,
  stdio: 'inherit',
});

const ui = spawn(npmCommand, ['run', 'dev', '--', '--host', host, '--port', uiPort], {
  env: {
    ...process.env,
    VITE_TASCO_API_BASE_URL: process.env.VITE_TASCO_API_BASE_URL || apiBaseUrl,
  },
  stdio: 'inherit',
});

const children = [api, ui];
let stopping = false;

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (stopping) {
      return;
    }
    const label = child === api ? 'API' : 'UI';
    console.log(`${label} process exited${signal ? ` with signal ${signal}` : ` with code ${code ?? 0}`}.`);
    stopAll(code ?? 1);
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

function stopAll(code) {
  if (stopping) {
    return;
  }
  stopping = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 300).unref();
}

function validatePort(value, name) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
}
