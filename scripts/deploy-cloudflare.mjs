import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const stage = resolve(root, 'supabase/.temp/cloudflare-deploy');
const build = spawnSync('npm', ['run', 'build:vinext'], { stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) process.exit(build.status ?? 1);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
const output = resolve(root, '.cloudflare/output/v0/workers/default');
cpSync(resolve(output, 'bundle'), resolve(stage, 'bundle'), { recursive: true });
cpSync(resolve(output, 'assets'), resolve(stage, 'assets'), { recursive: true });
writeFileSync(resolve(stage, 'wrangler.json'), JSON.stringify({
  name: 'maze-runner', main: 'bundle/index.js', compatibility_date: '2026-10-29',
  compatibility_flags: ['nodejs_compat'],
  assets: { directory: 'assets', binding: 'ASSETS', html_handling: 'none', not_found_handling: 'none', run_worker_first: ['/*', '!/_next/static/*', '!/*/_next/static/*'] },
}, null, 2));
const deploy = spawnSync('npx', ['wrangler', 'deploy', '--config', resolve(stage, 'wrangler.json')], { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(deploy.status ?? 1);
