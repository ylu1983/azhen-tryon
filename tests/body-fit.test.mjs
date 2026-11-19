import { test } from "node:test";
import assert from "node:assert/strict";
import {
  affine,
  bodyTriangles,
  canvasPose,
  manualPose,
  validPose,
  customMetadata,
} from "../static/body-fit.js";
import { readFileSync } from "node:fs";
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const apply = (m, [x, y]) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];
const source = manualPose({ width: 720, height: 960 });

test("every mesh anchor maps to its corresponding shoulder/hip/leg region", () => {
  const target = source.map(([x, y], i) => [
    x + (i < 2 ? -18 : 22),
    y + (i < 4 ? 30 : -15),
  ]);
  for (const kind of ["tops", "bottoms", "skirt", "dress"])
    for (const triangle of bodyTriangles(source, target, kind)) {
      const matrix = affine(triangle.source, triangle.target);
      assert.ok(matrix);
      triangle.source.forEach((point, i) =>
        apply(matrix, point).forEach((value, j) =>
          close(value, triangle.target[i][j]),
        ),
      );
    }
});
test("unchanged pose yields an identity warp, bent knees change lower-body transforms", () => {
  for (const triangle of bodyTriangles(source, source, "bottoms"))
    affine(triangle.source, triangle.target).forEach((v, i) =>
      close(v, [1, 0, 0, 1, 0, 0][i]),
    );
  const bent = source.map((p) => [...p]);
  bent[4][0] -= 70;
  bent[5][0] += 70;
  const triangles = bodyTriangles(source, bent, "bottoms");
  assert.notDeepEqual(
    affine(triangles[4].source, triangles[4].target),
    [1, 0, 0, 1, 0, 0],
  );
  assert.equal(
    affine(
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    ),
    null,
  );
});
test("portrait and landscape photo letterboxes share the same image-to-canvas mapping", () => {
  assert.deepEqual(
    canvasPose(
      [
        [0, 0],
        [1000, 500],
      ],
      { width: 1000, height: 500 },
    ),
    [
      [0, 300],
      [720, 660],
    ],
  );
  assert.deepEqual(
    canvasPose(
      [
        [0, 0],
        [500, 1000],
      ],
      { width: 500, height: 1000 },
    ),
    [
      [120, 0],
      [600, 960],
    ],
  );
});
test("rejects collapsed/flipped/missing landmarks rather than creating invalid transforms", () => {
  assert.equal(validPose(source), true);
  assert.equal(validPose(null), false);
  for (const bad of [
    source.map(() => [0, 0]),
    source.map(() => [NaN, 10]),
    [...source].reverse(),
  ])
    assert.equal(validPose(bad), false);
  const crossing = source.map((p) => [...p]);
  crossing[2][0] = crossing[3][0] + 1;
  assert.equal(validPose(crossing), false);
});
test("all catalog garment metadata and custom templates produce finite invertible meshes", () => {
  const entries = Object.values(
    JSON.parse(
      readFileSync(new URL("../static/garments/fit.json", import.meta.url)),
    ),
  );
  for (const key of ["tops", "bottoms", "dress"])
    entries.push(customMetadata({ width: 500, height: 800 }, key));
  for (const metadata of entries)
    for (const triangle of bodyTriangles(
      metadata.pose,
      source,
      metadata.kind,
    )) {
      const matrix = affine(triangle.source, triangle.target);
      assert.ok(matrix);
      assert.ok(matrix.every(Number.isFinite));
    }
});
