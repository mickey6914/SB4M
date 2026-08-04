// Prove the configured image provider actually works, with one real call.
//
//   npm run check:scenes --workspace server
//
// Reports which provider is active and why, sends one background request, and
// writes the result to server/scripts/out/. Exits non-zero if it fails, so it
// doubles as a smoke test after changing a key.
//
// This exists because a provider can be configured, authenticated and still
// unable to generate — Google's key authenticates fine and then returns
// "limit: 0" until billing is on. A key is not the same as a working feature.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');

const { configuredProvider, generateBackground, providerStatus } = await import(
  path.join(here, '..', 'src', 'scenes', 'providers.ts')
);

const status = providerStatus();
const provider = configuredProvider();

console.log(`provider : ${provider}`);
console.log(`model    : ${status.models[provider] ?? '(none — built in)'}`);
console.log(
  `keys     : ${Object.entries({ abacus: status.abacus, google: status.google, openai: status.openai })
    .map(([k, v]) => `${k}=${v ? 'set' : '—'}`)
    .join('  ')}`
);
if (!process.env.SCENE_PROVIDER) {
  console.log('           (SCENE_PROVIDER unset — provider chosen from whichever key is present)');
}
console.log();

const started = Date.now();
const result = await generateBackground({
  scene: 'Linen table',
  styleDirection: 'warm summer light, natural textures',
  width: 1024,
  height: 1024,
});
const secs = ((Date.now() - started) / 1000).toFixed(1);

if (!result.ok) {
  console.error(`FAILED after ${secs}s — ${result.provider}`);
  console.error(result.message);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `background-${result.provider}.jpg`);
fs.writeFileSync(file, result.image);

console.log(`OK in ${secs}s`);
console.log(`${result.image.length} bytes from ${result.provider} / ${result.model}`);
console.log(`written to ${path.relative(process.cwd(), file)}`);
