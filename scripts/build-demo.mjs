// Build the static site data from the bundled demo snapshot.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRadar, dataScript, parseSnapshot } from '../lib/model.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const snapshot = parseSnapshot(readFileSync(join(root, 'examples/demo-snapshot.json'), 'utf8'));
const { radar } = buildRadar(snapshot);
mkdirSync(join(root, 'docs'), { recursive: true });
writeFileSync(join(root, 'docs/data.js'), dataScript(radar));
for (const file of ['app.js', 'app.css']) {
  copyFileSync(join(root, 'dashboard', file), join(root, 'docs', file));
}
console.log(`launchlens: wrote docs/data.js with ${radar.board_size} rows`);
