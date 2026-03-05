// gnn/domain/params.ts
import type { GNNConfig, GNNParams, LevelParams } from "./types.ts";

/** Xavier/Glorot initialization */
function xavier(rows: number, cols: number): number[][] {
  const scale = Math.sqrt(2 / (rows + cols));
  return Array.from(
    { length: rows },
    () => Array.from({ length: cols }, () => (Math.random() * 2 - 1) * scale),
  );
}

/** Initialize parameters for one level */
function initLevelParams(
  numHeads: number,
  headDim: number,
  embDim: number,
): LevelParams {
  return {
    W_child: Array.from({ length: numHeads }, () => xavier(headDim, embDim)),
    W_parent: Array.from({ length: numHeads }, () => xavier(headDim, embDim)),
    a_upward: Array.from(
      { length: numHeads },
      () =>
        Array.from(
          { length: 2 * headDim },
          () => (Math.random() * 2 - 1) * 0.1,
        ),
    ),
    a_downward: Array.from(
      { length: numHeads },
      () =>
        Array.from(
          { length: 2 * headDim },
          () => (Math.random() * 2 - 1) * 0.1,
        ),
    ),
  };
}

/** Initialize all GNN parameters */
export function initParams(config: GNNConfig, maxLevel: number): GNNParams {
  const levels = new Map<number, LevelParams>();
  const veResidualA = new Map<number, number>();
  const veResidualB = new Map<number, number>();

  if (config.shareLevelWeights) {
    const shared = initLevelParams(
      config.numHeads,
      config.headDim,
      config.embDim,
    );
    for (let l = 0; l < maxLevel; l++) {
      levels.set(l, shared);
      veResidualA.set(l, -1.0);
      veResidualB.set(l, 0.5);
    }
  } else {
    for (let l = 0; l < maxLevel; l++) {
      levels.set(
        l,
        initLevelParams(config.numHeads, config.headDim, config.embDim),
      );
      veResidualA.set(l, -1.0);
      veResidualB.set(l, 0.5);
    }
  }

  return {
    levels,
    numHeads: config.numHeads,
    headDim: config.headDim,
    embDim: config.embDim,
    veResidualA,
    veResidualB,
    shareLevelWeights: config.shareLevelWeights,
  };
}
