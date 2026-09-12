/**
 * The shapes a 2D column can hold, read out of the text Postgres writes them as.
 *
 * Postgres has seven geometric types and writes each one its own way: a point as `(x,y)`, a
 * segment as `[(x1,y1),(x2,y2)]`, a box as `(x1,y1),(x2,y2)` with no brackets around the pair, a
 * path as `((...))` when it is closed and `[(...)]` when it is open, a polygon as `((...))`, a
 * circle as `<(x,y),r>`, and a line as `{A,B,C}` for Ax + By + C = 0.
 *
 * Which type a column holds is already known, so each is read by taking the numbers in the order
 * they are written and, where it matters, looking at which bracket the text opens with. That is
 * steadier than a parser for each spelling and it reads what Postgres writes.
 */
import { DB_TYPES } from '@mathesar/stores/abstract-types/dbTypes';

export interface Point {
  x: number;
  y: number;
}

export type Shape =
  | { kind: 'point'; at: Point }
  | { kind: 'segment'; from: Point; to: Point }
  | { kind: 'box'; a: Point; b: Point }
  | { kind: 'path'; points: Point[]; isClosed: boolean }
  | { kind: 'polygon'; points: Point[] }
  | { kind: 'circle'; centre: Point; radius: number }
  /** Ax + By + C = 0, which goes on forever and so has no extent of its own */
  | { kind: 'line'; a: number; b: number; c: number };

export interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The types a 2D column can be, which are the ones this knows how to draw */
export const shapeDbTypes: string[] = [
  DB_TYPES.POINT,
  DB_TYPES.LSEG,
  DB_TYPES.BOX,
  DB_TYPES.PATH,
  DB_TYPES.POLYGON,
  DB_TYPES.CIRCLE,
  DB_TYPES.LINE,
];

export function isShapeDbType(dbType: string): boolean {
  return shapeDbTypes.includes(dbType);
}

function numbersIn(text: string): number[] {
  const found = text.match(/-?\d+(\.\d+)?([eE][+-]?\d+)?/g);
  return found ? found.map(Number) : [];
}

function pointsFrom(numbers: number[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

/**
 * Read a shape out of the text Postgres wrote it as, or nothing if the text does not say one.
 *
 * Args:
 *   dbType: Which of the geometric types the column holds.
 *   text: The value, as Postgres writes it.
 */
export function parseShape(dbType: string, text: unknown): Shape | undefined {
  if (typeof text !== 'string') return undefined;
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const numbers = numbersIn(trimmed);
  const points = pointsFrom(numbers);

  // Counted rather than taken as they come: a value with a number too many or too few in it is
  // not the shape it was meant to be, and half-reading it would draw something nobody wrote.
  const pairs = numbers.length % 2 === 0;

  switch (dbType) {
    case DB_TYPES.POINT:
      return numbers.length === 2
        ? { kind: 'point', at: points[0] }
        : undefined;
    case DB_TYPES.LSEG:
      return numbers.length === 4
        ? { kind: 'segment', from: points[0], to: points[1] }
        : undefined;
    case DB_TYPES.BOX:
      return numbers.length === 4
        ? { kind: 'box', a: points[0], b: points[1] }
        : undefined;
    case DB_TYPES.PATH:
      // A path written with square brackets is one with two ends; with round ones it comes back
      // round to where it started.
      return pairs && points.length >= 2
        ? { kind: 'path', points, isClosed: !trimmed.startsWith('[') }
        : undefined;
    case DB_TYPES.POLYGON:
      return pairs && points.length >= 3
        ? { kind: 'polygon', points }
        : undefined;
    case DB_TYPES.CIRCLE:
      return numbers.length === 3
        ? {
            kind: 'circle',
            centre: { x: numbers[0], y: numbers[1] },
            radius: Math.abs(numbers[2]),
          }
        : undefined;
    case DB_TYPES.LINE:
      return numbers.length === 3
        ? { kind: 'line', a: numbers[0], b: numbers[1], c: numbers[2] }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * The points a shape is written with, which are what it is drawn between.
 *
 * A line has none: it is given as three coefficients rather than as anywhere in particular.
 */
export function pointsOf(shape: Shape): Point[] {
  switch (shape.kind) {
    case 'point':
      return [shape.at];
    case 'segment':
      return [shape.from, shape.to];
    case 'box':
      return [shape.a, shape.b];
    case 'path':
    case 'polygon':
      return shape.points;
    case 'circle':
      return [shape.centre];
    case 'line':
    default:
      return [];
  }
}

function extentOfPoints(points: Point[]): Extent {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/**
 * How much room a shape takes up, or nothing for one that goes on forever.
 *
 * A line has no extent: it is drawn across whatever the rest of the shapes turn out to need.
 */
export function shapeExtent(shape: Shape): Extent | undefined {
  switch (shape.kind) {
    case 'point':
      return extentOfPoints([shape.at]);
    case 'segment':
      return extentOfPoints([shape.from, shape.to]);
    case 'box':
      return extentOfPoints([shape.a, shape.b]);
    case 'path':
    case 'polygon':
      return extentOfPoints(shape.points);
    case 'circle':
      return {
        minX: shape.centre.x - shape.radius,
        minY: shape.centre.y - shape.radius,
        maxX: shape.centre.x + shape.radius,
        maxY: shape.centre.y + shape.radius,
      };
    case 'line':
    default:
      return undefined;
  }
}

/** How much room all of them take up together, or nothing if none of them takes up any */
export function extentOfAll(shapes: Shape[]): Extent | undefined {
  const extents = shapes
    .map(shapeExtent)
    .filter((e): e is Extent => e !== undefined);
  if (extents.length === 0) return undefined;
  return {
    minX: Math.min(...extents.map((e) => e.minX)),
    minY: Math.min(...extents.map((e) => e.minY)),
    maxX: Math.max(...extents.map((e) => e.maxX)),
    maxY: Math.max(...extents.map((e) => e.maxY)),
  };
}

/**
 * Where the shapes sit on the canvas, and how to get from one to the other.
 *
 * Everything is fitted into the room there is, at one scale for both directions so that a circle
 * stays round, and the y axis is turned over: Postgres counts y upwards and a canvas counts it
 * down. An extent with no width or height at all -- a single point, or several in a row -- is
 * given some, so that it lands in the middle rather than being divided by nothing.
 */
export interface Placing {
  toCanvas: (point: Point) => Point;
  /** The length on the canvas of a length among the shapes, for a circle's radius */
  scale: number;
}

export function placeShapes(
  extent: Extent,
  width: number,
  height: number,
  padding: number,
): Placing {
  const room = {
    width: Math.max(width - padding * 2, 1),
    height: Math.max(height - padding * 2, 1),
  };
  const spread = {
    x: extent.maxX - extent.minX,
    y: extent.maxY - extent.minY,
  };
  const scale = Math.min(
    spread.x > 0 ? room.width / spread.x : Infinity,
    spread.y > 0 ? room.height / spread.y : Infinity,
  );
  // Nothing spreads in either direction, so there is no scale to work out and any will do.
  const settled = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const drawn = { width: spread.x * settled, height: spread.y * settled };
  const left = padding + (room.width - drawn.width) / 2;
  const top = padding + (room.height - drawn.height) / 2;
  return {
    scale: settled,
    toCanvas: (point: Point) => ({
      x: left + (point.x - extent.minX) * settled,
      // Turned over, so that up among the shapes is up on the screen.
      y: top + (extent.maxY - point.y) * settled,
    }),
  };
}

/** A shape to draw, and which record and column it came from */
export interface DrawnShape {
  shape: Shape;
  recordKey: string;
  columnName: string;
}
