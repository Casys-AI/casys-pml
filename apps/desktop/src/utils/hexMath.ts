/**
 * Hexagonal coordinate math utilities
 * Uses axial coordinate system (q, r) for hexagonal grids
 * Flat-top orientation
 */

const SQRT3 = Math.sqrt(3);

/** Axial hex coordinates */
export interface AxialCoord {
  q: number;
  r: number;
}

/** World/pixel coordinates */
export interface WorldCoord {
  x: number;
  y: number;
}

/**
 * Convert axial hex coordinates to world (pixel) coordinates
 * @param q - Axial Q coordinate
 * @param r - Axial R coordinate
 * @param size - Hex radius (distance from center to corner)
 */
export function hexToWorld(q: number, r: number, size: number): WorldCoord {
  const x = size * (3 / 2) * q;
  const y = size * ((SQRT3 / 2) * q + SQRT3 * r);
  return { x, y };
}

/**
 * Convert world (pixel) coordinates to fractional axial coordinates
 * @param x - World X coordinate
 * @param y - World Y coordinate
 * @param size - Hex radius
 */
export function worldToHexFractional(x: number, y: number, size: number): AxialCoord {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / size;
  return { q, r };
}

/**
 * Round fractional axial coordinates to nearest hex
 * Uses cube coordinate rounding for accuracy
 */
export function hexRound(q: number, r: number): AxialCoord {
  // Convert to cube coordinates
  const s = -q - r;

  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);

  // Fix rounding errors by setting largest diff from rounded sum
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }

  return { q: rq, r: rr };
}

/**
 * Convert world coordinates to nearest hex (integer axial coordinates)
 */
export function worldToHex(x: number, y: number, size: number): AxialCoord {
  const { q, r } = worldToHexFractional(x, y, size);
  return hexRound(q, r);
}

/**
 * Get hex neighbors in axial coordinates
 */
export function hexNeighbors(q: number, r: number): AxialCoord[] {
  return [
    { q: q + 1, r: r },     // East
    { q: q + 1, r: r - 1 }, // Northeast
    { q: q, r: r - 1 },     // Northwest
    { q: q - 1, r: r },     // West
    { q: q - 1, r: r + 1 }, // Southwest
    { q: q, r: r + 1 },     // Southeast
  ];
}

/**
 * Calculate distance between two hexes (in hex steps)
 */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = Math.abs(q1 - q2);
  const dr = Math.abs(r1 - r2);
  const ds = Math.abs((-q1 - r1) - (-q2 - r2));
  return Math.max(dq, dr, ds);
}

/**
 * Generate hex coordinates for a ring at given radius
 */
export function hexRing(centerQ: number, centerR: number, radius: number): AxialCoord[] {
  if (radius === 0) return [{ q: centerQ, r: centerR }];

  const results: AxialCoord[] = [];
  // Start at the "east" hex of the ring
  let q = centerQ + radius;
  let r = centerR;

  // Direction vectors for the 6 sides of the ring
  const directions = [
    { dq: 0, dr: -1 },  // NW
    { dq: -1, dr: 0 },  // W
    { dq: -1, dr: 1 },  // SW
    { dq: 0, dr: 1 },   // SE
    { dq: 1, dr: 0 },   // E
    { dq: 1, dr: -1 },  // NE
  ];

  for (const dir of directions) {
    for (let step = 0; step < radius; step++) {
      results.push({ q, r });
      q += dir.dq;
      r += dir.dr;
    }
  }

  return results;
}

/**
 * Generate hex coordinates for a filled hexagonal area (spiral pattern)
 */
export function hexSpiral(centerQ: number, centerR: number, radius: number): AxialCoord[] {
  const results: AxialCoord[] = [{ q: centerQ, r: centerR }];
  for (let ring = 1; ring <= radius; ring++) {
    results.push(...hexRing(centerQ, centerR, ring));
  }
  return results;
}

/**
 * Calculate child hex positions within a parent hex
 * Creates 7 sub-hexes (center + 6 neighbors) scaled down
 */
export function getChildPositions(
  parentQ: number,
  parentR: number,
  parentSize: number,
  childScale: number = 0.3
): Array<{ q: number; r: number; worldX: number; worldY: number; size: number }> {
  const parentWorld = hexToWorld(parentQ, parentR, parentSize);
  const childSize = parentSize * childScale;
  const childSpacing = childSize * 2.1; // Slight gap between children

  // Center child
  const children = [
    {
      q: 0,
      r: 0,
      worldX: parentWorld.x,
      worldY: parentWorld.y,
      size: childSize,
    },
  ];

  // 6 surrounding children
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6; // Offset for flat-top
    const dx = Math.cos(angle) * childSpacing;
    const dy = Math.sin(angle) * childSpacing;
    children.push({
      q: i + 1,
      r: 0,
      worldX: parentWorld.x + dx,
      worldY: parentWorld.y + dy,
      size: childSize,
    });
  }

  return children;
}
