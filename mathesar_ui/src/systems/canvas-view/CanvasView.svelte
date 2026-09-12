<script lang="ts">
  import { _ } from 'svelte-i18n';

  import {
    type DrawnShape,
    type Extent,
    type Placing,
    type Shape,
    extentOfAll,
    placeShapes,
    pointsOf,
  } from './shapes';

  export let shapes: DrawnShape[];
  /** Told which record was clicked, so that the page can open it */
  export let onRecordClick: ((recordKey: string) => void) | undefined =
    undefined;

  const padding = 24;

  let canvas: HTMLCanvasElement | undefined;
  /**
   * How much room there is to draw in, which the shapes are fitted into. Used for the backing
   * store and the arithmetic; the canvas element itself fills its box in CSS, so that it is
   * never the wrong size on screen even for the moment before this catches up.
   */
  let width = 0;
  let height = 0;
  /** The record under the pointer, drawn on top and in full */
  let hovered: string | undefined = undefined;

  $: extent = extentOfAll(shapes.map((s) => s.shape));

  /**
   * A colour per record, so that the shapes belonging to one record are the ones that go
   * together. Spread around the wheel by the record's place in the list rather than by its key,
   * which may be anything at all.
   */
  function colourOf(recordKey: string, isHovered: boolean): string {
    const keys = [...new Set(shapes.map((s) => s.recordKey))];
    const turn = keys.indexOf(recordKey) / Math.max(keys.length, 1);
    const lightness = isHovered ? 45 : 55;
    return `hsl(${Math.round(turn * 360)}deg 65% ${lightness}%)`;
  }

  function drawPoints(
    context: CanvasRenderingContext2D,
    placing: Placing,
    points: { x: number; y: number }[],
    isClosed: boolean,
  ) {
    context.beginPath();
    points.forEach((point, index) => {
      const at = placing.toCanvas(point);
      if (index === 0) context.moveTo(at.x, at.y);
      else context.lineTo(at.x, at.y);
    });
    if (isClosed) context.closePath();
  }

  function drawShape(
    context: CanvasRenderingContext2D,
    placing: Placing,
    room: Extent,
    shape: Shape,
    colour: string,
  ) {
    context.strokeStyle = colour;
    context.fillStyle = colour;
    context.lineWidth = 2;

    if (shape.kind === 'point') {
      const at = placing.toCanvas(shape.at);
      context.beginPath();
      context.arc(at.x, at.y, 4, 0, Math.PI * 2);
      context.fill();
      return;
    }
    if (shape.kind === 'segment') {
      drawPoints(context, placing, [shape.from, shape.to], false);
      context.stroke();
      return;
    }
    if (shape.kind === 'box') {
      const a = placing.toCanvas(shape.a);
      const b = placing.toCanvas(shape.b);
      context.strokeRect(
        Math.min(a.x, b.x),
        Math.min(a.y, b.y),
        Math.abs(a.x - b.x),
        Math.abs(a.y - b.y),
      );
      return;
    }
    if (shape.kind === 'path') {
      drawPoints(context, placing, shape.points, shape.isClosed);
      context.stroke();
      return;
    }
    if (shape.kind === 'polygon') {
      drawPoints(context, placing, shape.points, true);
      context.globalAlpha = 0.15;
      context.fill();
      context.globalAlpha = 1;
      context.stroke();
      return;
    }
    if (shape.kind === 'circle') {
      const centre = placing.toCanvas(shape.centre);
      context.beginPath();
      context.arc(
        centre.x,
        centre.y,
        shape.radius * placing.scale,
        0,
        Math.PI * 2,
      );
      context.stroke();
      return;
    }
    if (shape.kind === 'line') {
      // Ax + By + C = 0, drawn right across whatever the other shapes needed. Where B is nothing
      // the line is vertical and x is the same all the way down.
      const { a, b, c } = shape;
      if (a === 0 && b === 0) return;
      const ends =
        b === 0
          ? [
              { x: -c / a, y: room.minY },
              { x: -c / a, y: room.maxY },
            ]
          : [
              { x: room.minX, y: -(a * room.minX + c) / b },
              { x: room.maxX, y: -(a * room.maxX + c) / b },
            ];
      context.setLineDash([6, 4]);
      drawPoints(context, placing, ends, false);
      context.stroke();
      context.setLineDash([]);
    }
  }

  function draw() {
    const room = extent;
    if (!canvas || !room) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Drawn at the screen's own resolution, so that a line is a line rather than a smudge.
    const density = window.devicePixelRatio || 1;
    canvas.width = width * density;
    canvas.height = height * density;
    context.setTransform(density, 0, 0, density, 0, 0);
    context.clearRect(0, 0, width, height);

    const placing = placeShapes(room, width, height, padding);
    // The record under the pointer goes on last, so that it is the one on top.
    const order = [...shapes].sort(
      (one, other) =>
        Number(one.recordKey === hovered) - Number(other.recordKey === hovered),
    );
    order.forEach((drawn) => {
      const isHovered = drawn.recordKey === hovered;
      context.globalAlpha = hovered === undefined || isHovered ? 1 : 0.35;
      drawShape(
        context,
        placing,
        room,
        drawn.shape,
        colourOf(drawn.recordKey, isHovered),
      );
    });
    context.globalAlpha = 1;
  }

  $: shapes, extent, width, height, hovered, draw();

  /** Which record's shapes are nearest the pointer, so that hovering picks one out */
  function recordNear(offsetX: number, offsetY: number): string | undefined {
    const room = extent;
    if (!room) return undefined;
    const placing = placeShapes(room, width, height, padding);
    let nearest: { key: string; distance: number } | undefined;
    shapes.forEach((drawn) => {
      pointsOf(drawn.shape).forEach((point) => {
        const at = placing.toCanvas(point);
        const distance = Math.hypot(at.x - offsetX, at.y - offsetY);
        if (!nearest || distance < nearest.distance) {
          nearest = { key: drawn.recordKey, distance };
        }
      });
    });
    // Only near enough to be what was meant.
    return nearest && nearest.distance <= 20 ? nearest.key : undefined;
  }
</script>

<div
  class="canvas-view"
  bind:clientWidth={width}
  bind:clientHeight={height}
  role="presentation"
>
  {#if !extent}
    <p class="nothing">{$_('no_shapes_to_draw')}</p>
  {:else}
    <canvas
      bind:this={canvas}
      on:mousemove={(e) => {
        hovered = recordNear(e.offsetX, e.offsetY);
      }}
      on:mouseleave={() => {
        hovered = undefined;
      }}
      on:click={() => {
        if (hovered && onRecordClick) onRecordClick(hovered);
      }}
    ></canvas>
  {/if}
</div>

<style lang="scss">
  .canvas-view {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 20rem;
    overflow: hidden;
    background: var(--color-bg-base);
  }

  canvas {
    display: block;
    /* Filled by CSS; the measured size is for the backing store and the drawing maths. */
    width: 100%;
    height: 100%;
  }

  .nothing {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    color: var(--color-fg-base-muted);
  }
</style>
