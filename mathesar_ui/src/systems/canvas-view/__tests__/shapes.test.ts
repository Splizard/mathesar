import {
  type Shape,
  extentOfAll,
  isShapeDbType,
  parseShape,
  placeShapes,
  pointsOf,
  shapeExtent,
} from '../shapes';

describe('reading the text Postgres writes a shape as', () => {
  test('a point', () => {
    expect(parseShape('point', '(1,2)')).toEqual({
      kind: 'point',
      at: { x: 1, y: 2 },
    });
  });

  test('a point with a decimal and a negative', () => {
    expect(parseShape('point', '(-1.5,2.25)')).toEqual({
      kind: 'point',
      at: { x: -1.5, y: 2.25 },
    });
  });

  test('a segment', () => {
    expect(parseShape('lseg', '[(1,2),(3,4)]')).toEqual({
      kind: 'segment',
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 },
    });
  });

  test('a box, which Postgres writes without brackets round the pair', () => {
    expect(parseShape('box', '(3,4),(1,2)')).toEqual({
      kind: 'box',
      a: { x: 3, y: 4 },
      b: { x: 1, y: 2 },
    });
  });

  test('a circle', () => {
    expect(parseShape('circle', '<(1,2),3>')).toEqual({
      kind: 'circle',
      centre: { x: 1, y: 2 },
      radius: 3,
    });
  });

  test('a line, which is its three coefficients', () => {
    expect(parseShape('line', '{1,-1,0}')).toEqual({
      kind: 'line',
      a: 1,
      b: -1,
      c: 0,
    });
  });

  test('a path that comes back to where it started', () => {
    expect(parseShape('path', '((0,0),(1,0),(1,1))')).toEqual({
      kind: 'path',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      isClosed: true,
    });
  });

  test('a path with two ends, which Postgres writes with square brackets', () => {
    expect(parseShape('path', '[(0,0),(1,0),(1,1)]')).toEqual({
      kind: 'path',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      isClosed: false,
    });
  });

  test('a polygon', () => {
    expect(parseShape('polygon', '((0,0),(2,0),(1,2))')).toEqual({
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 2 },
      ],
    });
  });

  test('nothing at all', () => {
    expect(parseShape('point', null)).toBeUndefined();
    expect(parseShape('point', '')).toBeUndefined();
    expect(parseShape('point', '   ')).toBeUndefined();
  });

  test('a value with the wrong number of numbers in it', () => {
    expect(parseShape('point', '(1,2,3)')).toBeUndefined();
    expect(parseShape('circle', '<(1,2)>')).toBeUndefined();
    expect(parseShape('polygon', '((0,0),(1,1))')).toBeUndefined();
  });

  test('a type that holds no shape', () => {
    expect(parseShape('text', '(1,2)')).toBeUndefined();
  });

  test('which types hold a shape', () => {
    ['point', 'lseg', 'box', 'path', 'polygon', 'circle', 'line'].forEach(
      (dbType) => expect(isShapeDbType(dbType)).toBe(true),
    );
    ['text', 'numeric', 'jsonb'].forEach((dbType) =>
      expect(isShapeDbType(dbType)).toBe(false),
    );
  });
});

describe('how much room a shape takes up', () => {
  test('a circle takes up its radius in every direction', () => {
    const circle: Shape = {
      kind: 'circle',
      centre: { x: 10, y: 10 },
      radius: 4,
    };
    expect(shapeExtent(circle)).toEqual({
      minX: 6,
      minY: 6,
      maxX: 14,
      maxY: 14,
    });
  });

  test('a line goes on forever and so takes up none of it', () => {
    expect(shapeExtent({ kind: 'line', a: 1, b: 1, c: 0 })).toBeUndefined();
  });

  test('all of them together', () => {
    expect(
      extentOfAll([
        { kind: 'point', at: { x: 0, y: 0 } },
        { kind: 'point', at: { x: 5, y: -2 } },
        { kind: 'line', a: 1, b: 1, c: 0 },
      ]),
    ).toEqual({ minX: 0, minY: -2, maxX: 5, maxY: 0 });
  });

  test('nothing that takes up any room', () => {
    expect(extentOfAll([{ kind: 'line', a: 1, b: 1, c: 0 }])).toBeUndefined();
    expect(extentOfAll([])).toBeUndefined();
  });
});

describe('placing the shapes on the canvas', () => {
  test('the shapes fill the room they are given, less the padding', () => {
    const placing = placeShapes(
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      120,
      120,
      10,
    );
    expect(placing.toCanvas({ x: 0, y: 0 })).toEqual({ x: 10, y: 110 });
    expect(placing.toCanvas({ x: 10, y: 10 })).toEqual({ x: 110, y: 10 });
  });

  test('up among the shapes is up on the screen', () => {
    const placing = placeShapes(
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      120,
      120,
      10,
    );
    const low = placing.toCanvas({ x: 5, y: 1 });
    const high = placing.toCanvas({ x: 5, y: 9 });
    expect(high.y).toBeLessThan(low.y);
  });

  test('one scale for both directions, so a circle stays round', () => {
    const placing = placeShapes(
      { minX: 0, minY: 0, maxX: 10, maxY: 5 },
      120,
      120,
      10,
    );
    // The wider spread is the one that runs out of room first.
    expect(placing.scale).toBe(10);
  });

  test('shapes that spread no distance at all land in the middle', () => {
    const placing = placeShapes(
      { minX: 3, minY: 3, maxX: 3, maxY: 3 },
      100,
      100,
      10,
    );
    expect(placing.toCanvas({ x: 3, y: 3 })).toEqual({ x: 50, y: 50 });
  });
});

describe('the points a shape is drawn between', () => {
  test('a box is drawn between its two corners', () => {
    expect(
      pointsOf({ kind: 'box', a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }),
    ).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  test('a circle is drawn about its centre', () => {
    expect(
      pointsOf({ kind: 'circle', centre: { x: 1, y: 2 }, radius: 3 }),
    ).toEqual([{ x: 1, y: 2 }]);
  });

  test('a line is not drawn between anywhere in particular', () => {
    expect(pointsOf({ kind: 'line', a: 1, b: 1, c: 0 })).toEqual([]);
  });

  test('a polygon is drawn between all of its points', () => {
    const shape: Shape = {
      kind: 'polygon',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 1, y: 2 },
      ],
    };
    expect(pointsOf(shape)).toHaveLength(3);
  });
});
