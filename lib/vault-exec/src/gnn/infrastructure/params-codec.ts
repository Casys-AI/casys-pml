import type { GNNParams } from "../domain/types.ts";
import { gzipCompress, gzipDecompress } from "../../utils/compress.ts";

interface SerializedLevelParams {
  W_child: number[][][];
  W_parent: number[][][];
  a_upward: number[][];
  a_downward: number[][];
}

interface SerializedGNNParams {
  levels: Array<[number, SerializedLevelParams]>;
  numHeads: number;
  headDim: number;
  embDim: number;
  veResidualA: Array<[number, number]>;
  veResidualB: Array<[number, number]>;
  shareLevelWeights: boolean;
}

/** Serialize GNNParams to gzipped JSON (Uint8Array). */
export async function serializeGnnParams(
  params: GNNParams,
): Promise<Uint8Array> {
  const serialized: SerializedGNNParams = {
    levels: Array.from(params.levels.entries()),
    numHeads: params.numHeads,
    headDim: params.headDim,
    embDim: params.embDim,
    veResidualA: Array.from(params.veResidualA.entries()),
    veResidualB: Array.from(params.veResidualB.entries()),
    shareLevelWeights: params.shareLevelWeights,
  };

  const encoded = new TextEncoder().encode(JSON.stringify(serialized));
  return gzipCompress(encoded);
}

/** Deserialize gzipped JSON back to GNNParams. */
export async function deserializeGnnParams(
  blob: Uint8Array,
): Promise<GNNParams> {
  const decompressed = await gzipDecompress(blob);
  const json = new TextDecoder().decode(decompressed);
  const serialized: SerializedGNNParams = JSON.parse(json);

  return {
    levels: new Map(serialized.levels),
    numHeads: serialized.numHeads,
    headDim: serialized.headDim,
    embDim: serialized.embDim,
    veResidualA: new Map(serialized.veResidualA),
    veResidualB: new Map(serialized.veResidualB),
    shareLevelWeights: serialized.shareLevelWeights,
  };
}
