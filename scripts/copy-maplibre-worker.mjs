import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const source = join(process.cwd(), 'node_modules', 'maplibre-gl', 'dist');
const destination = join(process.cwd(), 'public', 'maplibre');
mkdirSync(destination, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(source, file), join(destination, file));
}
