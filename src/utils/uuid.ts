/**
 * UUID v7 Generator
 *
 * Generates UUIDs with embedded timestamp for better database performance.
 * UUID v7 format: timestamp (48 bits) + version (4 bits) + random (12 bits) + variant (2 bits) + random (62 bits)
 *
 * Benefits over UUID v4:
 * - Chronologically sortable
 * - Better B-tree index performance (sequential inserts)
 * - Implicit timestamp (millisecond precision)
 *
 * @module utils/uuid
 */

/**
 * Generate a UUID v7 (timestamp-based + random).
 *
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * - First 48 bits: Unix timestamp in milliseconds
 * - Version: 7 (4 bits)
 * - Variant: RFC 4122 (2 bits)
 * - Remaining: Random bits
 *
 * @returns UUID v7 string
 */
export function uuidv7(): string {
  // Get current timestamp in milliseconds (48 bits)
  const timestamp = Date.now();

  // Get random bytes for the rest
  const randomBytes = crypto.getRandomValues(new Uint8Array(10));

  // Build the UUID
  // Bytes 0-3: timestamp high bits (32 bits)
  const timestampHigh = Math.floor(timestamp / 0x10000) & 0xffffffff;
  // Bytes 4-5: timestamp low bits (16 bits)
  const timestampLow = timestamp & 0xffff;

  // Byte 6: version (7) + random (4 bits)
  const byte6 = 0x70 | (randomBytes[0] & 0x0f);

  // Byte 7: random
  const byte7 = randomBytes[1];

  // Byte 8: variant (10) + random (6 bits)
  const byte8 = 0x80 | (randomBytes[2] & 0x3f);

  // Bytes 9-15: random
  const byte9 = randomBytes[3];
  const byte10 = randomBytes[4];
  const byte11 = randomBytes[5];
  const byte12 = randomBytes[6];
  const byte13 = randomBytes[7];
  const byte14 = randomBytes[8];
  const byte15 = randomBytes[9];

  // Format as UUID string
  const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");

  return [
    hex(timestampHigh, 8),
    hex(timestampLow, 4),
    hex(byte6, 2) + hex(byte7, 2),
    hex(byte8, 2) + hex(byte9, 2),
    hex(byte10, 2) + hex(byte11, 2) + hex(byte12, 2) + hex(byte13, 2) + hex(byte14, 2) + hex(byte15, 2),
  ].join("-");
}

/**
 * Extract timestamp from UUID v7.
 *
 * @param uuid - UUID v7 string
 * @returns Date object or null if not a valid UUID v7
 */
export function extractTimestamp(uuid: string): Date | null {
  const parts = uuid.split("-");
  if (parts.length !== 5) return null;

  // Check version (should be 7)
  if (parts[2]?.[0] !== "7") return null;

  // Extract timestamp from first 48 bits
  const timestampHigh = parseInt(parts[0], 16);
  const timestampLow = parseInt(parts[1], 16);
  const timestamp = timestampHigh * 0x10000 + timestampLow;

  return new Date(timestamp);
}
