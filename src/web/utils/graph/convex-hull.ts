/**
 * Convex Hull utilities for cluster visualization
 *
 * Uses Graham scan algorithm for computing convex hulls
 * and provides drawing utilities for canvas overlay
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Compute the convex hull of a set of points using Graham scan
 * Returns points in counter-clockwise order
 */
export function computeConvexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;

  // Find the lowest point (and leftmost if tie)
  let lowest = 0;
  for (let i = 1; i < points.length; i++) {
    if (
      points[i].y < points[lowest].y ||
      (points[i].y === points[lowest].y && points[i].x < points[lowest].x)
    ) {
      lowest = i;
    }
  }

  // Swap lowest to first position
  const pivot = points[lowest];
  const sorted = points
    .filter((_, i) => i !== lowest)
    .sort((a, b) => {
      const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      if (angleA !== angleB) return angleA - angleB;
      // If same angle, closer point first
      const distA = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
      const distB = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
      return distA - distB;
    });

  // Graham scan
  const hull: Point[] = [pivot];
  for (const point of sorted) {
    while (
      hull.length > 1 && crossProduct(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
    ) {
      hull.pop();
    }
    hull.push(point);
  }

  return hull;
}

/**
 * Cross product of vectors OA and OB where O is origin
 * Positive = counter-clockwise, Negative = clockwise, 0 = collinear
 */
function crossProduct(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Expand hull outward by padding amount
 * Creates a smooth rounded hull effect
 */
export function expandHull(hull: Point[], padding: number): Point[] {
  if (hull.length < 3) return hull;

  // Calculate centroid
  const centroid = {
    x: hull.reduce((sum, p) => sum + p.x, 0) / hull.length,
    y: hull.reduce((sum, p) => sum + p.y, 0) / hull.length,
  };

  // Expand each point outward from centroid
  return hull.map((p) => {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return p;
    const scale = (dist + padding) / dist;
    return {
      x: centroid.x + dx * scale,
      y: centroid.y + dy * scale,
    };
  });
}

/**
 * Draw a smooth curved hull path on canvas
 * Uses quadratic bezier curves for rounded corners
 */
export function drawSmoothHull(
  ctx: CanvasRenderingContext2D,
  hull: Point[],
  options: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
  },
): void {
  if (hull.length < 3) return;

  const { fillColor, strokeColor, strokeWidth } = options;

  ctx.beginPath();

  // Start from midpoint of first edge
  const firstMid = midpoint(hull[hull.length - 1], hull[0]);
  ctx.moveTo(firstMid.x, firstMid.y);

  // Draw curved path through each vertex
  for (let i = 0; i < hull.length; i++) {
    const current = hull[i];
    const next = hull[(i + 1) % hull.length];
    const mid = midpoint(current, next);

    // Quadratic curve to midpoint using current vertex as control point
    ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
  }

  ctx.closePath();

  // Fill
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Stroke
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();
}

/**
 * Draw hull with animation (pulsing glow effect)
 */
export function drawAnimatedHull(
  ctx: CanvasRenderingContext2D,
  hull: Point[],
  options: {
    baseColor: string;
    phase: number; // 0-1 animation phase
    strokeWidth: number;
  },
): void {
  if (hull.length < 3) return;

  const { baseColor, phase, strokeWidth } = options;

  // Pulsing opacity based on phase
  const pulseOpacity = 0.15 + 0.1 * Math.sin(phase * Math.PI * 2);
  const glowOpacity = 0.4 + 0.2 * Math.sin(phase * Math.PI * 2);

  // Parse base color and apply opacity
  const fillColor = hexToRgba(baseColor, pulseOpacity);
  const strokeColor = hexToRgba(baseColor, glowOpacity);

  // Draw with glow effect
  ctx.shadowColor = baseColor;
  ctx.shadowBlur = 15 + 5 * Math.sin(phase * Math.PI * 2);

  drawSmoothHull(ctx, hull, {
    fillColor,
    strokeColor,
    strokeWidth,
  });

  // Reset shadow
  ctx.shadowBlur = 0;
}

/**
 * Draw animated flow paths for co-occurrence visualization
 */
export function drawFlowPath(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  options: {
    color: string;
    phase: number; // 0-1 for dash animation
    strokeWidth: number;
  },
): void {
  if (points.length < 2) return;

  const { color, phase, strokeWidth } = options;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  // Draw smooth curve through points
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    if (i === 1) {
      ctx.lineTo(curr.x, curr.y);
    } else {
      const prevPrev = points[i - 2];
      const cpx = prev.x + (curr.x - prevPrev.x) * 0.2;
      const cpy = prev.y + (curr.y - prevPrev.y) * 0.2;
      ctx.quadraticCurveTo(cpx, cpy, curr.x, curr.y);
    }
  }

  // Animated dashed line
  const dashLength = 10;
  const gapLength = 5;
  const offset = phase * (dashLength + gapLength) * 3;

  ctx.setLineDash([dashLength, gapLength]);
  ctx.lineDashOffset = -offset;
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // Draw arrow at end
  if (points.length >= 2) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    drawArrow(ctx, prev, last, color, strokeWidth);
  }

  // Reset dash
  ctx.setLineDash([]);
}

/**
 * Draw arrow head at end of path
 */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  strokeWidth: number,
): void {
  const headLength = 10 + strokeWidth * 2;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 6),
    to.y - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 6),
    to.y - headLength * Math.sin(angle + Math.PI / 6),
  );

  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.stroke();
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function hexToRgba(hex: string, alpha: number): string {
  // Handle shorthand hex
  let r = 0, g = 0, b = 0;

  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Visualization types for different algorithms
 */
export type ClusterVizType = "hull" | "highlight" | "edges" | "animated-path" | "nodes-edges";

/**
 * Configuration for cluster visualization
 */
export interface ClusterVizConfig {
  type: ClusterVizType;
  color: string;
  nodeIds: string[];
  animated?: boolean;
  phase?: number;
  /** Unique ID for this visualization (for pinned sets) */
  id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hull Intersection & Merging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if two line segments intersect
 */
function segmentsIntersect(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point,
): boolean {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;

  return false;
}

function direction(pi: Point, pj: Point, pk: Point): number {
  return (pk.x - pi.x) * (pj.y - pi.y) - (pj.x - pi.x) * (pk.y - pi.y);
}

function onSegment(pi: Point, pj: Point, pk: Point): boolean {
  return Math.min(pi.x, pj.x) <= pk.x && pk.x <= Math.max(pi.x, pj.x) &&
    Math.min(pi.y, pj.y) <= pk.y && pk.y <= Math.max(pi.y, pj.y);
}

/**
 * Check if a point is inside a convex polygon
 */
function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (
      ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if two convex hulls intersect or overlap
 */
export function hullsIntersect(hull1: Point[], hull2: Point[]): boolean {
  if (hull1.length < 3 || hull2.length < 3) return false;

  // Check if any edge of hull1 intersects any edge of hull2
  for (let i = 0; i < hull1.length; i++) {
    const p1 = hull1[i];
    const p2 = hull1[(i + 1) % hull1.length];

    for (let j = 0; j < hull2.length; j++) {
      const p3 = hull2[j];
      const p4 = hull2[(j + 1) % hull2.length];

      if (segmentsIntersect(p1, p2, p3, p4)) {
        return true;
      }
    }
  }

  // Check if any point of hull1 is inside hull2 or vice versa
  for (const p of hull1) {
    if (pointInPolygon(p, hull2)) return true;
  }
  for (const p of hull2) {
    if (pointInPolygon(p, hull1)) return true;
  }

  return false;
}

/**
 * Merge multiple hulls into groups of intersecting hulls
 * Returns array of merged hulls (each is a convex hull of combined points)
 */
export function mergeIntersectingHulls(
  hulls: Array<{ points: Point[]; color: string; animated?: boolean }>,
): Array<{ points: Point[]; color: string; animated?: boolean }> {
  if (hulls.length <= 1) return hulls;

  // Build adjacency: which hulls intersect
  const n = hulls.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x: number, y: number): void {
    const px = find(x), py = find(y);
    if (px !== py) parent[px] = py;
  }

  // Check all pairs for intersection
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hullsIntersect(hulls[i].points, hulls[j].points)) {
        union(i, j);
      }
    }
  }

  // Group by connected component
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // Merge each group into a single hull
  const result: Array<{ points: Point[]; color: string; animated?: boolean }> = [];

  for (const indices of groups.values()) {
    if (indices.length === 1) {
      // No merge needed
      result.push(hulls[indices[0]]);
    } else {
      // Combine all points and compute new convex hull
      const allPoints: Point[] = [];
      let animated = false;
      // Use color of the first hull in group (or could blend colors)
      const color = hulls[indices[0]].color;

      for (const idx of indices) {
        allPoints.push(...hulls[idx].points);
        if (hulls[idx].animated) animated = true;
      }

      const mergedHull = computeConvexHull(allPoints);
      result.push({ points: mergedHull, color, animated });
    }
  }

  return result;
}
