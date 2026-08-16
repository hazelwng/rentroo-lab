/**
 * RENTROO pixel wordmark
 */

const GLYPHS: Record<string, string[]> = {
  R: ["###.", "#..#", "###.", "#.#.", "#..#"],
  E: ["###", "#..", "##.", "#..", "###"],
  N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
  O: ["####", "#..#", "#..#", "#..#", "####"],
};

const T_WIDTH = 5;

/** Bricks as {x, y, w}; each is one cell tall minus a mortar gap. */
const T_BRICKS = [
  { x: 0.0, y: 0, w: 2.4 },
  { x: 2.55, y: 0, w: 2.45 },
  { x: 1.85, y: 1, w: 1.3 },
  { x: 1.72, y: 2, w: 1.3 },
  { x: 1.98, y: 3, w: 1.3 },
  { x: 1.79, y: 4, w: 1.3 },
];

const BRICK_H = 0.9;

function Brick({ x, y, w }: { x: number; y: number; w: number }) {
  const edge = 0.12;
  return (
    <g>
      <rect x={x} y={y} width={w} height={BRICK_H} fill="var(--color-sun)" />
      <rect x={x} y={y} width={w} height={0.18} fill="var(--color-sun-hi)" />
      <rect x={x} y={y + BRICK_H - 0.18} width={w} height={0.18} fill="var(--color-sun-lo)" />
      <rect x={x + w - edge} y={y} width={edge} height={BRICK_H} fill="var(--color-sun-lo)" />
    </g>
  );
}

function letterCells(bitmap: string[], x0: number) {
  const cells: { x: number; y: number }[] = [];
  bitmap.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === "#") cells.push({ x: x0 + x, y });
    });
  });
  return cells;
}

export function Logo({ height = 20 }: { height?: number }) {
  const cells: { x: number; y: number }[] = [];
  let bricksX = 0;
  let x = 0;

  for (const letter of "RENTROO") {
    if (letter === "T") {
      bricksX = x;
      x += T_WIDTH + 1;
    } else {
      cells.push(...letterCells(GLYPHS[letter], x));
      x += GLYPHS[letter][0].length + 1;
    }
  }
  const width = x - 1;

  return (
    <svg
      viewBox={`0 0 ${width} 5`}
      height={height}
      width={(height * width) / 5}
      shapeRendering="crispEdges"
      aria-label="RENTROO"
      role="img"
    >
      {cells.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="var(--color-ink)" />
      ))}
      <g transform={`translate(${bricksX} 0)`}>
        {T_BRICKS.map((b, i) => (
          <Brick key={i} {...b} />
        ))}
      </g>
    </svg>
  );
}
