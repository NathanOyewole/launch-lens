// LaunchLens entrypoint (Node 22, standard library only, erasable TypeScript).
// Snapshot in -> ranked board, data.js and dashboard out. No bounty gate, no dossier.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`launchlens: ${message}\n`);
  process.exit(code);
}

function resolveInput(inputArg: string): string {
  const file = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(file)) fail(`no snapshot at ${file}: pass --input <snapshot.json|directory>`);
  return file;
}

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

function main(): void {
  const inputFile = resolveInput(arg('input', 'examples/demo-snapshot.json'));
  const out = arg('output', process.env.LAUNCHLENS_OUTPUT_DIR ?? 'out');
  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`model produced an invalid board: ${issue}`);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));
  const files = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));

  process.stdout.write(
    `launchlens: ${radar.board_size} ranked rows (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `launchlens: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${files.length} files)\n`,
  );
}

main();
