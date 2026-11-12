import { CABIN, DECK, cabinToWorld } from './layout';
import { BRIDGE, pondPoint } from './pond';

export interface Poi {
  id: string;
  title: string;
  /** One line shown when the visitor is near. */
  hint: string;
  /** Short note revealed on request. */
  note: string;
  x: number;
  z: number;
  radius: number;
}

/** Shoreline angle of the bamboo water spout (north-west bank). */
export const SPOUT_THETA = 4.05;
export const SPOUT = pondPoint(SPOUT_THETA, 0.35);

const bank = pondPoint(1.55, 1.0);
const deck = cabinToWorld(0.6, DECK.z0 + 1.5);
const flowers = cabinToWorld(2.2, DECK.z1 + 2.0);
const spoutStand = pondPoint(SPOUT_THETA, 1.25);

export const POIS: Poi[] = [
  {
    id: 'pond',
    title: 'The koi pond',
    hint: 'Stand still by the water',
    note: 'Koi learn the shape of a person on the bank. Wait a moment and they drift over, hoping for breakfast. The oldest, a white-and-red kohaku, has lived here longer than the bridge.',
    x: bank[0],
    z: bank[1],
    radius: 2.6,
  },
  {
    id: 'bridge',
    title: 'The footbridge',
    hint: 'Listen to the boards',
    note: 'Pine planks on two bent beams, pegged rather than nailed. From the middle of the arch you can watch the fish pass underneath, and hear your own footsteps change.',
    x: BRIDGE.x,
    z: (BRIDGE.z0 + BRIDGE.z1) / 2,
    radius: 2.0,
  },
  {
    id: 'veranda',
    title: 'The veranda',
    hint: 'The best seat in the house',
    note: 'Mornings in Da Lat start cold. The chairs face south-east so the first sun reaches them before it reaches the pond, and the mist lifts off the water while the tea is still hot.',
    x: deck[0],
    z: deck[1],
    radius: 2.4,
  },
  {
    id: 'spout',
    title: 'The bamboo spout',
    hint: 'Water from the hillside',
    note: 'A split bamboo pipe carries spring water down from the slope behind the cabin. It keeps the pond cool and moving, and it is the sound you have been hearing since you arrived.',
    x: spoutStand[0],
    z: spoutStand[1],
    radius: 2.0,
  },
  {
    id: 'hydrangeas',
    title: 'Hydrangeas',
    hint: 'Da Lat’s flower',
    note: 'Cẩm tú cầu. In this acidic highland soil they bloom blue and violet almost all year; a little lime at the roots and the same shrub turns pink.',
    x: flowers[0],
    z: flowers[1],
    radius: 1.9,
  },
  {
    id: 'pines',
    title: 'The pine forest',
    hint: 'Look up',
    note: 'Three-needle pine, Pinus kesiya, the tree that gives the Lang Biang plateau its smell. The trunks stand bare for twenty metres before the crown begins, which is why the light falls in columns.',
    x: -15.2,
    z: 3.4,
    radius: 2.6,
  },
];

export const CABIN_DOOR = cabinToWorld(-1.5, CABIN.depth / 2);
