#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Starts the cache's Redis server with this project's redis.conf.
 *
 * Redis is not on PATH on a stock Laragon install and the binary lives under a
 * versioned folder, so this resolves it in order of specificity:
 *   1. REDIS_SERVER_PATH, if you point it somewhere explicitly
 *   2. redis-server on PATH (Linux, macOS, a container, or a PATH install)
 *   3. Laragon's bundled copy, whatever version folder it is in
 *
 * Usage:  npm run redis          (from backend/)
 *         npm run redis -- --cli  to open redis-cli instead
 */

const isWindows = process.platform === 'win32';
const exe = (name) => (isWindows ? `${name}.exe` : name);

/** Laragon keeps Redis under bin/redis/<versioned folder>/. */
const findInLaragon = (binary) => {
  const roots = [
    process.env.LARAGON_ROOT,
    'C:/laragon',
    'D:/laragon',
  ].filter(Boolean);

  for (const root of roots) {
    const redisDir = path.join(root, 'bin', 'redis');
    if (!fs.existsSync(redisDir)) continue;
    for (const entry of fs.readdirSync(redisDir)) {
      const candidate = path.join(redisDir, entry, exe(binary));
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
};

/** Is the binary already callable by name? */
const onPath = (binary) => {
  const probe = spawnSync(exe(binary), ['--version'], { stdio: 'ignore' });
  return !probe.error;
};

const resolve = (binary, envVar) => {
  if (process.env[envVar] && fs.existsSync(process.env[envVar])) return process.env[envVar];
  if (onPath(binary)) return exe(binary);
  return findInLaragon(binary);
};

const wantsCli = process.argv.includes('--cli');
const binary = wantsCli ? 'redis-cli' : 'redis-server';
const envVar = wantsCli ? 'REDIS_CLI_PATH' : 'REDIS_SERVER_PATH';
const resolved = resolve(binary, envVar);

if (!resolved) {
  console.error(`
Could not find ${binary}.

  • Laragon: it ships one under laragon/bin/redis/ — make sure that folder exists
  • Elsewhere: install Redis, or set ${envVar} to the executable's full path

The API works without Redis: it falls back to an in-process cache and keeps
serving from MySQL. Redis is what lets several API instances share one cache.
`.trim());
  process.exit(1);
}

const args = wantsCli
  ? ['-p', process.env.REDIS_PORT || '6379']
  : [path.join(__dirname, '..', 'redis.conf')];

console.log(`[redis] ${resolved} ${args.join(' ')}`);
const child = spawn(resolved, args, { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
