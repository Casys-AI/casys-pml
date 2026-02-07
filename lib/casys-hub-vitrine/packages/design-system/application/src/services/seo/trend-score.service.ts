import type { TrendDataDTO } from '@casys/shared';

export class TrendScoreService {
  compute(trends: TrendDataDTO[]): number {
    if (!Array.isArray(trends) || trends.length === 0) return 0.5;

    const vols = trends
      .map(t => (typeof t.searchVolume === 'number' ? t.searchVolume : undefined))
      .filter((v): v is number => typeof v === 'number');

    if (vols.length > 0) {
      const maxVol = Math.max(...vols, 1);
      const ratios = vols.map(v => Math.max(0, Math.min(1, v / maxVol)));
      return ratios.reduce((s, r) => s + r, 0) / ratios.length;
    }

    // Fallback if no numeric searchVolume
    let scoreSum = 0;
    for (const t of trends) {
      if (t.trend === 'rising') scoreSum += 0.8;
      else if (t.trend === 'stable') scoreSum += 0.5;
      else scoreSum += 0.2;
    }
    return scoreSum / trends.length;
  }
}
