/**
 * Quick test: initTensorFlow("ffi") backend
 *
 * Run: deno run --allow-all --unstable-ffi tests/benchmarks/quick-ffi-backend-test.ts
 */
import { initTensorFlow, getBackend, isUsingFFI, getFFI } from "../../lib/shgat-tf/src/tf/index.ts";

// Initialize with FFI backend
console.log("Initializing with FFI backend...");
const backend = await initTensorFlow("ffi");
console.log("Backend:", backend);
console.log("isUsingFFI:", isUsingFFI());
console.log("getBackend:", getBackend());

// Get FFI module
const tff = getFFI();
if (!tff) {
  console.error("FFI module not available!");
  Deno.exit(1);
}

console.log("\n--- Basic Operations ---");

// Test tensor creation
const a = tff.tensor([[1, 2], [3, 4]], [2, 2]);
console.log("Tensor a shape:", a.shape);
console.log("Tensor a data:", a.arraySync());

// Test matmul
const b = tff.tensor([[5, 6], [7, 8]], [2, 2]);
const c = tff.matmul(a, b);
console.log("a @ b =", c.arraySync());

// Test the KEY operation: UnsortedSegmentSum
console.log("\n--- UnsortedSegmentSum (KEY for autograd) ---");
const data = tff.tensor([[1, 2], [3, 4], [5, 6], [7, 8]], [4, 2]);
const segIds = tff.tensorInt32(new Int32Array([0, 1, 0, 1]), [4]);
const result = tff.unsortedSegmentSum(data, segIds, 2);
console.log("UnsortedSegmentSum result:", result.arraySync());
console.log("Expected: [[6, 8], [10, 12]]");

// Cleanup
a.dispose();
b.dispose();
c.dispose();
data.dispose();
segIds.dispose();
result.dispose();

console.log("\nSUCCESS: FFI backend works with initTensorFlow('ffi')!");
