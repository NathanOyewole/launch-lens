// Token Radar entrypoint (Node 22, standard library only, erasable TypeScript).
//
// The pipeline, in order:
//   1. resolve --input (a snapshot.json file or a directory holding one) and --output
//      (falls back to MAKEFUN_OUTPUT_DIR, then the grader's /output);
//   2. parse and shape-check the sealed snapshot with lib/model.ts;
//   3. score it into a board and refuse any board the gate would reject;
//   4. write board.json and data.js, then copy dashboard/ and screenshots/ into the output;
//   5. write dossier.json last, since the scorer rebuilds it byte for byte from that output.
//
// Nothing here scores a protocol: the model lives in lib/model.ts, the dossier in the vendored
// library. This file only wires them together and keeps the gate's file shape intact.
//
// Outside the grader's container:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. Both spellings are accepted. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** Print one diagnostics line to stderr and stop with the gate's exit code. */
function fail(message: string, code: number): void {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** Turn --input into the snapshot file path, whether it names the file or its directory. */
function resolveInput(inputArg: string): string {
  const file = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(file)) {
    fail(`no snapshot at ${file}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  return file;
}

/** Copy one directory's regular files into `to`, skipping dot names, and return the names copied. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** The hand-in needs three images; every image name must be one a dossier will accept. */
function checkScreenshots(names: string[]): void {
  if (names.length < 3) {
    fail(`screenshots/ holds ${names.length} image${names.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`, 1);
  }
  for (const name of names) {
    if (!IMAGE_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }
}

/** Summarise one run on stdout, in the shape the kit's own entrypoint used. */
function report(protocolCount: number, watchlistCount: number, boardLength: number, earlySize: number, liveSize: number, out: string, dashboardFiles: number, shots: number): void {
  process.stdout.write(
    `token radar: ${protocolCount} protocols, ${watchlistCount} on the watchlist, ${boardLength} rows scored (${earlySize} early, ${liveSize} live set aside)\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboardFiles} files), ${join(out, 'screenshots')} (${shots} images) and ${join(out, 'dossier.json')}\n`,
  );
}

function main(): void {
  const inputFile = resolveInput(arg('input', '/input'));
  const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`, 1);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  const dashboardFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
  const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
  checkScreenshots(shots);

  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }),
  );

  report(snapshot.protocols.length, snapshot.watchlist.length, board.length, radar.early_size, radar.live_size, out, dashboardFiles.length, shots.length);
}

main();
