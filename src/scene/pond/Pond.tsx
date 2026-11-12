import type { QualityProfile } from '../../config/quality';
import { Bridge } from './Bridge';
import { PondPlants } from './PondPlants';
import { Spout } from './Spout';
import { Flagstones, PondRocks } from './Stones';
import { Water } from './Water';

/** Everything that makes up the koi pond except the fish themselves. */
export function Pond({ profile }: { profile: QualityProfile }) {
  return (
    <group>
      <Water profile={profile} />
      <PondRocks profile={profile} />
      <Flagstones profile={profile} />
      <PondPlants />
      <Spout />
      <Bridge profile={profile} />
    </group>
  );
}
