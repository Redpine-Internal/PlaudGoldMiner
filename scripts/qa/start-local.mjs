import { spawn } from 'node:child_process';
import { configureQaEnvironment } from './local-environment.mjs';

await configureQaEnvironment();
console.log('QA: banco local pgm_qa confirmado. Aplicação em http://localhost:3100.');
console.log('Plaud, n8n e Storage de escrita desativados; autenticação e IA preservadas.');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100'], {
  cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, stdio: 'inherit',
});
process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
server.on('exit', (code) => { process.exitCode = code ?? 1; });
