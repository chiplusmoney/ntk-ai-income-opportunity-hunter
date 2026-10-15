/**
 * Firebase Emulator Suite harness.
 *
 * Runs the gated Firestore integration test inside `firebase emulators:exec`,
 * so the only thing the test talks to is the emulator: no live project, no
 * credentials, no billing.
 *
 * Usage (from WORKING/):
 *   npm run verify:emulator
 *
 * Requirements: Java (the Firestore emulator is a JVM process) and the Firebase
 * CLI. The first run downloads the emulator jar, which needs network access.
 *
 * The CLI is invoked through its JavaScript entry point rather than through the
 * `firebase` shell shim: on Windows the shell concatenates arguments, which
 * breaks the quoted inner command.
 *
 * What this proves and what it does not:
 *   PROVES  source payload -> adapter -> deterministic verification -> accepted
 *           opportunity -> Firestore document -> read back, plus idempotent
 *           re-crawls, against a real Firestore implementation.
 *   DOES NOT prove a live Firebase project works: rules deployment, indexes,
 *           Authentication and real credentials are still owner gates.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workingDir = join(here, '..');

if (!existsSync(join(workingDir, 'firebase.json'))) {
  console.error('firebase.json not found; cannot start the emulator.');
  process.exit(1);
}

const scope = process.env.LIVE_SCOPE === 'personal' ? 'personal' : 'public';

// Java is needed by the emulator; check early so the failure is obvious.
const java = spawnSync('java', ['-version'], { encoding: 'utf8', shell: true });
if (java.status !== 0) {
  console.error('Java is required by the Firestore emulator and was not runnable.');
  console.error('Install a JDK (the workspace machine has Temurin 21) and re-run.');
  process.exit(2);
}

// Which sources this harness may contact is decided by the registry, not here.
// The emulator suites do not touch the network at all; this line exists so the
// scope is visible in the output and is passed to any child that needs it.
console.log(`Deployment scope for this run: ${scope} (set LIVE_SCOPE=personal to include personal-scope sources).`);

/** Locate the firebase-tools CLI entry point. */
function resolveFirebaseCli() {
  const relative = join('firebase-tools', 'lib', 'bin', 'firebase.js');
  const candidates = [];

  // 1. Whatever `npm root -g` reports.
  const npmGlobalRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: true });
  if (npmGlobalRoot.status === 0 && npmGlobalRoot.stdout.trim()) {
    candidates.push(join(npmGlobalRoot.stdout.trim(), relative));
  }

  // 2. The npm default global prefix on Windows. `APPDATA` is not guaranteed to
  //    be set in a non-interactive shell, so derive it from the home directory
  //    first and only fall back to the environment variable.
  const home = homedir();
  if (home) {
    candidates.push(join(home, 'AppData', 'Roaming', 'npm', 'node_modules', relative));
    candidates.push(join(home, 'AppData', 'Local', 'npm', 'node_modules', relative));
    candidates.push(join(home, '.npm-global', 'lib', 'node_modules', relative));
    candidates.push(join(home, '.local', 'share', 'npm', 'lib', 'node_modules', relative));
  }
  for (const key of ['APPDATA', 'LOCALAPPDATA', 'npm_config_prefix']) {
    const value = process.env[key];
    if (value) candidates.push(join(value, 'node_modules', relative));
  }

  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

const cliPath = resolveFirebaseCli();
if (!cliPath) {
  console.error('Could not locate the firebase-tools CLI. Install it with: npm i -g firebase-tools');
  process.exit(3);
}

const projectId = 'demo-ntk-hunter';
// Firestore for the pipeline integration test, Auth for the security-rules test
// (the rules assertions need real authenticated users, not a mock).
//
// The two suites share one emulator, so they must not run in parallel: the
// rules suite swaps the emulator's loaded rules and clears data when it finishes.
const inner = 'npx vitest run --no-file-parallelism test/emulator.test.ts test/securityRules.test.ts';

console.log(`Starting the Firestore emulator (project ${projectId}) and running the integration test.`);
console.log('No live Firebase project and no credentials are used.');

const result = spawnSync(
  process.execPath,
  [cliPath, 'emulators:exec', '--only', 'firestore,auth', '--project', projectId, inner],
  {
    cwd: workingDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      FIREBASE_EMULATOR_TEST: '1',
      FIREBASE_PROJECT_ID: projectId,
      LIVE_SCOPE: scope,
      // The Admin SDK and the client SDK both need to find the emulators.
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099'
    }
  }
);

if (result.status === 0) {
  console.log('\nFirestore emulator integration PASSED.');
} else {
  console.error(`\nFirestore emulator integration FAILED (exit ${result.status}).`);
  process.exitCode = result.status ?? 1;
}
