#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const ROOT = process.cwd();
function quotePowerShellArg(value) {
  const raw = String(value);
  return `'${raw.replace(/'/g, "''")}'`;
}

function normalizeMsysPathLeak(value) {
  const raw = String(value);
  const match = raw.match(/^[A-Za-z]:[\\/]Program Files[\\/]Git[\\/](.*)$/i);
  if (!match) return raw;
  const tail = match[1].replace(/\\/g, '/');
  return `/${tail}`;
}
const SERVICES = {
  core: {
    name: 'openclaw-core',
  },
  web: {
    name: 'openclaw-web',
  },
};

function usage() {
  console.log(
    [
      'Usage: node tools/railway-ops.mjs <action> <service> [-- <args>]',
      '',
      'Actions:',
      '  link      Link local directory to Railway service',
      '  status    Show linked service status',
      '  domain    Show linked service domain',
      '  deploys   Show deployment history for service',
      '  logs      Show latest deployment logs',
      '  ssh       Run command over Railway SSH (pass command after --)',
      '',
      'Services:',
      '  core | web',
      '',
      'Examples:',
      '  node tools/railway-ops.mjs link web',
      '  node tools/railway-ops.mjs status web',
      '  node tools/railway-ops.mjs ssh web -- ls -la /app',
      '  node tools/railway-ops.mjs ssh core -- openclaw status --all',
    ].join('\n'),
  );
}

function runRailway(serviceKey, args) {
  const service = SERVICES[serviceKey];
  if (!service) {
    console.error(`Unknown service: ${serviceKey}`);
    usage();
    process.exit(1);
  }

  const result =
    process.platform === 'win32'
      ? spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `railway ${args.map(quotePowerShellArg).join(' ')}`,
          ],
          {
            cwd: ROOT,
            stdio: 'inherit',
          },
        )
      : spawnSync('railway', args, {
          cwd: ROOT,
          stdio: 'inherit',
        });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

const [action, serviceKey, ...rest] = process.argv.slice(2);

if (!action || !serviceKey) {
  usage();
  process.exit(1);
}

const splitIndex = rest.indexOf('--');
const passthrough = (splitIndex >= 0 ? rest.slice(splitIndex + 1) : rest).map(
  normalizeMsysPathLeak,
);

switch (action) {
  case 'link':
    runRailway(serviceKey, ['service', 'link', SERVICES[serviceKey]?.name]);
    break;
  case 'status':
    runRailway(serviceKey, [
      'service',
      'status',
      '--service',
      SERVICES[serviceKey]?.name,
    ]);
    break;
  case 'domain':
    runRailway(serviceKey, ['domain', '--service', SERVICES[serviceKey]?.name]);
    break;
  case 'deploys':
    runRailway(serviceKey, [
      'deployment',
      'list',
      '--service',
      SERVICES[serviceKey]?.name,
    ]);
    break;
  case 'logs':
    runRailway(serviceKey, [
      'logs',
      '--service',
      SERVICES[serviceKey]?.name,
      '--deployment',
      '--latest',
      '--lines',
      '120',
    ]);
    break;
  case 'ssh': {
    if (passthrough.length === 0) {
      console.error('Missing SSH command.');
      usage();
      process.exit(1);
    }
    runRailway(serviceKey, [
      'ssh',
      '--service',
      SERVICES[serviceKey]?.name,
      ...passthrough,
    ]);
    break;
  }
  default:
    console.error(`Unknown action: ${action}`);
    usage();
    process.exit(1);
}
