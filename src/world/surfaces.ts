import { PATH_HALF_WIDTH, distToGravelPath, distToStonePath } from './paths';
import { onBridge } from './pond';
import { onDeck, onSteps } from './terrain';

export type Surface = 'grass' | 'gravel' | 'stone' | 'bridge' | 'veranda';

/** What a visitor standing at (x, z) is walking on. */
export function surfaceAt(x: number, z: number): Surface {
  if (onDeck(x, z) || onSteps(x, z)) return 'veranda';
  if (onBridge(x, z)) return 'bridge';
  if (distToStonePath(x, z) < PATH_HALF_WIDTH) return 'stone';
  if (distToGravelPath(x, z) < PATH_HALF_WIDTH) return 'gravel';
  return 'grass';
}
