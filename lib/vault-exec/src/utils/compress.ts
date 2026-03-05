/**
 * Gzip compression/decompression using the Web Streams API (zero deps).
 *
 * @module vault-exec/compress
 */

/** Collect all chunks from a ReadableStream into a single Uint8Array */
async function collectStream(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

/** Gzip-compress a Uint8Array */
export async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();
  return collectStream(cs.readable);
}

/** Gzip-decompress a Uint8Array */
export async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(data as unknown as BufferSource);
  writer.close();
  return collectStream(ds.readable);
}
