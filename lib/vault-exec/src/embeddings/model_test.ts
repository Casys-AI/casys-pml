import { assertEquals } from "jsr:@std/assert";
import { type Embedder, EmbeddingModel } from "./model.ts";

class MockEmbedder implements Embedder {
  async encode(text: string): Promise<number[]> {
    const seed = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 1024 }, (_, i) => Math.sin(seed + i) * 0.1);
  }
  isLoaded(): boolean {
    return true;
  }
  async load(): Promise<void> {}
  async dispose(): Promise<void> {}
}

Deno.test("EmbeddingModel - encode returns 1024-d vector", async () => {
  const model = new EmbeddingModel(new MockEmbedder());
  const vec = await model.encode("Hello world");
  assertEquals(vec.length, 1024);
});

Deno.test("EmbeddingModel - different texts produce different embeddings", async () => {
  const model = new EmbeddingModel(new MockEmbedder());
  const a = await model.encode("Senior developers");
  const b = await model.encode("Backend infrastructure");
  const same = a.every((v, i) => v === b[i]);
  assertEquals(same, false);
});

Deno.test("EmbeddingModel - encodeNote formats name + body", async () => {
  const model = new EmbeddingModel(new MockEmbedder());
  const vec = await model.encodeNote("My Note", "This is the body.");
  assertEquals(vec.length, 1024);
});
