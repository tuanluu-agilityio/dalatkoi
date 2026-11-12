import type { QualityProfile } from '../../config/quality';
import { Flowers } from './Flowers';
import { Grass } from './Grass';
import { Hydrangeas } from './Hydrangeas';
import { Pines } from './Pines';
import { SmallTrees } from './SmallTrees';
import { Undergrowth } from './Undergrowth';

/** Every living thing on land. Each system reads its budget from the quality profile. */
export function Vegetation({ profile }: { profile: QualityProfile }) {
  return (
    <group>
      <Pines profile={profile} />
      <SmallTrees profile={profile} />
      <Undergrowth profile={profile} />
      <Hydrangeas />
      <Flowers profile={profile} />
      <Grass profile={profile} />
    </group>
  );
}
