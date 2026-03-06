#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const ROOT = process.cwd();
const SNAPSHOT_CMD_TIMEOUT_MS = Number.parseInt(
  process.env.OPENCLAW_RAILWAY_OPS_TIMEOUT_MS ?? '90000',
  10,
);
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
    snapshotProbes: [
      ['openclaw status --all'],
      ['openclaw health'],
      ['openclaw config get memory.backend'],
      ['ls -la /data'],
    ],
  },
  web: {
    name: 'openclaw-web',
    snapshotProbes: [['ls -la /app'], ['ls -la /tmp']],
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
      '  snapshot  Save service snapshot (JSON + logs + probes)',
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

function captureRailway(serviceKey, args) {
  const service = SERVICES[serviceKey];
  if (!service) {
    throw new Error(`Unknown service: ${serviceKey}`);
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
            encoding: 'utf8',
            timeout: SNAPSHOT_CMD_TIMEOUT_MS,
          },
        )
      : spawnSync('railway', args, {
          cwd: ROOT,
          encoding: 'utf8',
          timeout: SNAPSHOT_CMD_TIMEOUT_MS,
        });

  const timedOut = Boolean(result.error?.name === 'Error' && /timed out/i.test(result.error?.message || ''));

  return {
    command: `railway ${args.join(' ')}`,
    status: timedOut ? 124 : (result.status ?? 1),
    stdout: result.stdout ?? '',
    stderr: timedOut
      ? `${result.stderr ?? ''}\n[timeout] command exceeded ${SNAPSHOT_CMD_TIMEOUT_MS}ms`
      : (result.stderr ?? ''),
    error: result.error?.message ?? null,
  };
}

function writeSnapshot(serviceKey) {
  const service = SERVICES[serviceKey];
  if (!service) {
    console.error(`Unknown service: ${serviceKey}`);
    usage();
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(ROOT, 'logs', 'railway-snapshots', `${stamp}-${serviceKey}`);
  mkdirSync(dir, { recursive: true });

  const checks = [
    { name: 'status', args: ['service', 'status', '--service', service.name] },
    { name: 'domain', args: ['domain', '--service', service.name] },
    {
      name: 'deploys',
      args: ['deployment', 'list', '--service', service.name],
    },
    {
      name: 'logs',
      args: [
        'logs',
        '--service',
        service.name,
        '--deployment',
        '--latest',
        '--lines',
        '180',
      ],
    },
  ];

  const probeChecks = service.snapshotProbes.map((probe, index) => ({
    name: `ssh-probe-${index + 1}`,
    args: ['ssh', '--service', service.name, ...probe],
  }));

  const allChecks = [...checks, ...probeChecks];
  const outputs = [];

  for (const check of allChecks) {
    const output = captureRailway(serviceKey, check.args);
    outputs.push({ name: check.name, ...output });
    const text = [
      `# ${check.name}`,
      '',
      `command: ${output.command}`,
      `status: ${output.status}`,
      output.error ? `error: ${output.error}` : 'error: none',
      '',
      '## stdout',
      output.stdout,
      '',
      '## stderr',
      output.stderr,
      '',
    ].join('\n');
    writeFileSync(join(dir, `${check.name}.txt`), text, 'utf8');
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    serviceKey,
    serviceName: service.name,
    snapshotDir: dir,
    checks: outputs.map((item) => ({
      name: item.name,
      command: item.command,
      status: item.status,
      error: item.error,
    })),
  };

  writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Snapshot saved: ${dir}`);
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
  case 'snapshot':
    writeSnapshot(serviceKey);
    break;
  default:
    console.error(`Unknown action: ${action}`);
    usage();
    process.exit(1);
}
