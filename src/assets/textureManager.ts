import * as THREE from 'three';
import { loadOrFallback } from './loadOrFallback';
import { fallbackAlbedo, fallbackArm, fallbackNormal, type PBRName } from './procedural/pbrFallbacks';

export type { PBRName };

export interface PBRSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** ARM-packed: usable as both roughnessMap (G) and aoMap (R). */
  roughnessMap: THREE.Texture;
}

type Channel = 'diff' | 'nor' | 'arm';

/* ── loading progress, observable by the title screen ── */
const progress = { total: 0, done: 0, failed: 0 };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function getTextureProgress(): Readonly<typeof progress> {
  return progress;
}
export function onTextureProgress(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** Resolves once every requested file has either loaded or fallen back. */
export function texturesSettled(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (progress.done >= progress.total) {
        off();
        resolve();
      }
    };
    const off = onTextureProgress(check);
    check();
  });
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

function requestImage(name: PBRName, channel: Channel): Promise<HTMLImageElement | null> {
  const url = `${import.meta.env.BASE_URL}textures/${name}_${channel}.webp`;
  let pending = images.get(url);
  if (!pending) {
    progress.total++;
    notify();
    pending = loadOrFallback<HTMLImageElement | null>(() => loadImage(url), null).then((result) => {
      progress.done++;
      if (!result.fromFile) progress.failed++;
      notify();
      return result.value;
    });
    images.set(url, pending);
  }
  return pending;
}

function makeTexture(name: PBRName, channel: Channel, repeat: [number, number], anisotropy: number): THREE.Texture {
  const fallback = channel === 'diff' ? fallbackAlbedo(name) : channel === 'nor' ? fallbackNormal() : fallbackArm();
  const tex = new THREE.Texture<HTMLCanvasElement | HTMLImageElement>(fallback);
  tex.colorSpace = channel === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  requestImage(name, channel).then((img) => {
    if (!img) return;
    // Release the GPU copy of the fallback first: its size differs from the file's.
    tex.dispose();
    tex.image = img;
    tex.needsUpdate = true;
  });
  return tex;
}

const sets = new Map<string, PBRSet>();

/**
 * PBR texture set for a named surface. Returns immediately with generated
 * textures and upgrades them in place when the real files arrive.
 */
export function getPBR(name: PBRName, repeatX = 1, repeatY = repeatX, anisotropy = 8): PBRSet {
  const key = `${name}:${repeatX}:${repeatY}`;
  let set = sets.get(key);
  if (!set) {
    const repeat: [number, number] = [repeatX, repeatY];
    set = {
      map: makeTexture(name, 'diff', repeat, anisotropy),
      normalMap: makeTexture(name, 'nor', repeat, anisotropy),
      roughnessMap: makeTexture(name, 'arm', repeat, anisotropy),
    };
    sets.set(key, set);
  }
  return set;
}
