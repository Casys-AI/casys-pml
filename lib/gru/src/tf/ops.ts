/**
 * TensorFlow.js Operations for GRU TransitionModel
 *
 * Essential operations for the GRU model.
 *
 * @module gru/tf/ops
 */

import { tf } from "./backend.ts";

// ============================================================================
// Matrix Operations
// ============================================================================

/**
 * Concatenate tensors along axis
 */
export function concat<T extends tf.Tensor>(
  tensors: T[],
  axis = 0,
): T {
  return tf.concat(tensors, axis) as T;
}

// ============================================================================
// Loss Functions
// ============================================================================

/**
 * Binary cross-entropy loss
 *
 * @param pred - Predicted probabilities [0, 1]
 * @param label - True labels (0 or 1)
 */
export function binaryCrossEntropy(
  pred: tf.Tensor,
  label: tf.Tensor,
): tf.Scalar {
  const eps = 1e-7;
  const clipped = tf.clipByValue(pred, eps, 1 - eps);
  const loss = tf.neg(
    tf.add(
      tf.mul(label, tf.log(clipped)),
      tf.mul(tf.sub(1, label), tf.log(tf.sub(1, clipped))),
    ),
  );
  return tf.mean(loss) as tf.Scalar;
}

// ============================================================================
// Array <-> Tensor Conversion
// ============================================================================

/**
 * Convert JS array to tensor
 */
export function toTensor(data: number[]): tf.Tensor1D;
export function toTensor(data: number[][]): tf.Tensor2D;
export function toTensor(data: number[][][]): tf.Tensor3D;
export function toTensor(
  data: number[] | number[][] | number[][][],
): tf.Tensor {
  if (data.length === 0) {
    return tf.tensor([]);
  }
  if (!Array.isArray(data[0])) {
    return tf.tensor1d(data as number[]);
  }
  if (!Array.isArray((data as number[][])[0][0])) {
    return tf.tensor2d(data as number[][]);
  }
  return tf.tensor3d(data as number[][][]);
}

/**
 * Convert tensor to JS array (sync - avoid in production)
 */
export function toArray(tensor: tf.Tensor): number[] | number[][] | number[][][] {
  return tensor.arraySync() as number[] | number[][] | number[][][];
}

/**
 * Convert tensor to JS array (async - preferred)
 */
export async function toArrayAsync(
  tensor: tf.Tensor,
): Promise<number[] | number[][] | number[][][]> {
  return (await tensor.array()) as number[] | number[][] | number[][][];
}
