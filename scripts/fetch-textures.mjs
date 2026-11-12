// Downloads the CC0 PBR texture sets listed below from Poly Haven and converts them
// to 1K WebP in public/textures. Safe to re-run; existing files are skipped.
// The app runs without these files (procedural fallbacks), they only add detail.
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/textures');
const HEADERS = { 'User-Agent': 'texture-fetch-script' };

/** local name → Poly Haven asset id */
export const SETS = {
  planks: 'weathered_brown_planks',
  deck: 'wood_floor_deck',
  stonewall: 'stacked_stone_wall',
  bark: 'pine_bark',
  grass: 'leafy_grass',
  forest: 'forest_floor',
  gravel: 'gravel_floor_02',
  rock: 'mossy_rock',
  pebbles: 'ganges_river_pebbles',
};

const MAPS = { diff: ['Diffuse', 86], nor: ['nor_gl', 90], arm: ['arm', 82] };

const exists = (p) => access(p).then(() => true, () => false);

async function fetchJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function run() {
  await mkdir(OUT, { recursive: true });
  let failed = 0;
  for (const [name, id] of Object.entries(SETS)) {
    let files;
    try {
      files = await fetchJson(`https://api.polyhaven.com/files/${id}`);
    } catch (err) {
      console.warn(`! ${id}: ${err.message}`);
      failed++;
      continue;
    }
    for (const [suffix, [key, quality]] of Object.entries(MAPS)) {
      const target = path.join(OUT, `${name}_${suffix}.webp`);
      if (await exists(target)) continue;
      const url = files[key]?.['1k']?.jpg?.url ?? files[key]?.['1k']?.png?.url;
      if (!url) {
        console.warn(`! ${id}: no 1k ${key}`);
        failed++;
        continue;
      }
      try {
        const res = await fetch(url, { headers: HEADERS });
        if (!res.ok) throw new Error(String(res.status));
        const input = Buffer.from(await res.arrayBuffer());
        const output = await sharp(input).resize(1024, 1024).webp({ quality, effort: 5 }).toBuffer();
        await writeFile(target, output);
        console.log(`✓ ${name}_${suffix}.webp  ${(output.length / 1024).toFixed(0)} kB  (${id})`);
      } catch (err) {
        console.warn(`! ${id} ${key}: ${err.message}`);
        failed++;
      }
    }
  }
  if (failed) console.warn(`${failed} file(s) could not be fetched; the app will use procedural fallbacks for them.`);
}

run();
