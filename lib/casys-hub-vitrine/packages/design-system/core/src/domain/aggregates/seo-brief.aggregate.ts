import type { SeoBriefData, SeoBriefDataV3 } from '../types/seo.types';
import { toV2SeoBriefData, toV3SeoBriefData } from '../types/seo.types';

/**
 * SeoBriefAggregate (v3-native)
 * - Preserve full v3 envelope (no data loss)
 * - Provide factories from v2/v3 and serializers to v2/v3
 */
export class SeoBriefAggregate {
  private constructor(private readonly v3: SeoBriefDataV3) {}

  static fromV3(input: SeoBriefDataV3): SeoBriefAggregate {
    return new SeoBriefAggregate(input);
  }

  static fromV2(input: SeoBriefData): SeoBriefAggregate {
    const v3 = toV3SeoBriefData(input);
    return new SeoBriefAggregate(v3);
  }

  toV3(): SeoBriefDataV3 {
    return this.v3;
  }

  toV2(): SeoBriefData {
    return toV2SeoBriefData(this.v3);
  }
}
