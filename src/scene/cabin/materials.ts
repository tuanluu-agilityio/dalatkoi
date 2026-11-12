import * as THREE from 'three';
import { interiorTexture } from '../../assets/procedural/cabinTextures';
import { getPBR } from '../../assets/textureManager';

/** Geometry in the cabin is authored with UVs in "texture tiles", so maps use repeat 1. */
let cached: Record<string, THREE.Material> | undefined;

/** Shared by the cabin, the bridge and the garden props. */
export function getCabinMaterials(anisotropy: number): Record<string, THREE.Material> {
  return (cached ??= createCabinMaterials(anisotropy));
}

function createCabinMaterials(anisotropy: number): Record<string, THREE.Material> {
  const planks = getPBR('planks', 1, 1, anisotropy);
  const deck = getPBR('deck', 1, 1, anisotropy);
  const stone = getPBR('stonewall', 1, 1, anisotropy);

  const wood = (color: string, roughness = 0.86) =>
    new THREE.MeshStandardMaterial({
      map: planks.map,
      normalMap: planks.normalMap,
      roughnessMap: planks.roughnessMap,
      color,
      roughness,
      vertexColors: true,
    });

  const interior = interiorTexture();
  return {
    siding: wood('#e2c2a0'),
    trim: wood('#7a5238'),
    dark: wood('#4a3324', 0.9),
    furniture: wood('#d9b48a', 0.7),
    deck: new THREE.MeshStandardMaterial({
      map: deck.map,
      normalMap: deck.normalMap,
      roughnessMap: deck.roughnessMap,
      color: '#8f989c',
      roughness: 0.82,
      vertexColors: true,
    }),
    stone: new THREE.MeshStandardMaterial({
      map: stone.map,
      normalMap: stone.normalMap,
      roughnessMap: stone.roughnessMap,
      aoMap: stone.roughnessMap,
      color: '#c4bcb2',
      roughness: 1,
      vertexColors: true,
      normalScale: new THREE.Vector2(1.5, 1.5),
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#120d09',
      emissive: '#ffb469',
      emissiveMap: interior,
      emissiveIntensity: 1.55,
      roughness: 0.07,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.7,
      vertexColors: true,
    }),
    metal: new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.55, metalness: 0.85, vertexColors: true }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08d4f', roughness: 0.35, metalness: 1, vertexColors: true }),
    terracotta: new THREE.MeshStandardMaterial({ color: '#a8603f', roughness: 0.92, vertexColors: true }),
    soil: new THREE.MeshStandardMaterial({ color: '#2c2118', roughness: 1, vertexColors: true }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.3, vertexColors: true }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.9, 0.85), vertexColors: true, toneMapped: false }),
    fabric: new THREE.MeshStandardMaterial({ color: '#8f9a78', roughness: 1, vertexColors: true }),
  };
}
