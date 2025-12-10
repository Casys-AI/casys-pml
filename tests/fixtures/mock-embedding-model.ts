/**
 * Mock Embedding Model for Testing
 *
 * Provides a lightweight, deterministic replacement for EmbeddingModel
 * that doesn't require loading the heavy ONNX runtime.
 *
 * Returns consistent embeddings based on text hash for reproducible tests.
 *
 * @module tests/fixtures/mock-embedding-model
 */

/**
 * MockEmbeddingModel - Drop-in replacement for EmbeddingModel in tests
 *
 * Compatible with the real EmbeddingModel interface but:
 * - Loads instantly (no ONNX)
 * - Returns deterministic embeddings (hash-based)
 * - Zero external dependencies
 */
export class MockEmbeddingModel {
  // deno-lint-ignore no-explicit-any
  private model: any = null; // Compatibility with EmbeddingModel
  private loading: Promise<void> | null = null; // Compatibility with EmbeddingModel
  private loaded = false;

  /**
   * Mock load - instant, no network/disk I/O
   */
  async load(): Promise<void> {
    if (this.model) {
      return; // Already loaded
    }

    if (this.loading) {
      return this.loading; // Wait for ongoing load
    }

    this.loading = (async () => {
      // Instant load, no ONNX runtime
      this.model = {}; // Dummy model object
      this.loaded = true;
    })();

    await this.loading;
    this.loading = null;
  }

  /**
   * Generate deterministic 1024-dimensional embedding
   *
   * Uses simple hash of input text to generate consistent values.
   * NOT semantically meaningful, but suitable for testing.
   *
   * @param text Input text (used to generate deterministic hash)
   * @returns 1024-dimensional vector with values in [-1, 1]
   */
  async encode(text: string): Promise<number[]> {
    if (!this.loaded) {
      await this.load();
    }

    // Generate simple hash from text
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    // Use hash as seed for pseudo-random but deterministic values
    const embedding: number[] = [];
    let seed = Math.abs(hash);

    // Generate 1024 dimensions
    for (let i = 0; i < 1024; i++) {
      // Simple pseudo-random generator (deterministic)
      seed = (seed * 9301 + 49297) % 233280;
      const value = (seed / 233280) * 2 - 1; // Normalize to [-1, 1]
      embedding.push(value);
    }

    return embedding;
  }

  /**
   * Check if model is loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Dispose of resources (no-op for mock)
   */
  async dispose(): Promise<void> {
    this.model = null;
    this.loading = null;
    this.loaded = false;
  }
}
