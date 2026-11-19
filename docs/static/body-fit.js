/** Pure geometry shared by the local renderer and tests. No network or storage. */
export const BODY_NAMES = [
  "左肩",
  "右肩",
  "左腰",
  "右腰",
  "左膝",
  "右膝",
  "左腳踝",
  "右腳踝",
];
export function orderedLayers(layers) {
  return ["bottoms", "tops", "dress"].map((key) => layers[key]).filter(Boolean);
}
export function imageBox(image, width = 720, height = 960) {
  const scale = Math.min(width / image.width, height / image.height);
  return {
    x: (width - image.width * scale) / 2,
    y: (height - image.height * scale) / 2,
    width: image.width * scale,
    height: image.height * scale,
    scale,
  };
}
export function canvasPose(points, image) {
  const box = imageBox(image);
  return points.map(([x, y]) => [box.x + x * box.scale, box.y + y * box.scale]);
}
export function manualPose(image) {
  return canvasPose(
    [
      [0.34, 0.23],
      [0.66, 0.23],
      [0.38, 0.49],
      [0.62, 0.49],
      [0.41, 0.7],
      [0.59, 0.7],
      [0.41, 0.92],
      [0.59, 0.92],
    ].map(([x, y]) => [x * image.width, y * image.height]),
    image,
  );
}
export function validPose(points) {
  return (
    points?.length === 8 &&
    points.every((p) => p.length === 2 && p.every(Number.isFinite)) &&
    points[1][0] - points[0][0] > 12 &&
    points[3][0] - points[2][0] > 8 &&
    points[5][0] > points[4][0] + 2 &&
    points[7][0] > points[6][0] + 2 &&
    (points[2][1] + points[3][1] - points[0][1] - points[1][1]) / 2 > 25 &&
    (points[4][1] + points[5][1] - points[2][1] - points[3][1]) / 2 > 15 &&
    (points[6][1] + points[7][1] - points[4][1] - points[5][1]) / 2 > 15
  );
}
function rows(p, kind) {
  const shoulder = p[1][0] - p[0][0],
    hip = p[3][0] - p[2][0];
  const torso = (p[2][1] + p[3][1] - p[0][1] - p[1][1]) / 2;
  const pair = (a, b, padding) => [
    [a[0] - padding, a[1]],
    [b[0] + padding, b[1]],
  ];
  const skirt = kind === "skirt" || kind === "dress";
  const lower = (a, b) =>
    skirt
      ? [
          [p[2][0], (a[1] + b[1]) / 2],
          [p[3][0], (a[1] + b[1]) / 2],
        ]
      : [a, b];
  const knee = lower(p[4], p[5]),
    ankle = lower(p[6], p[7]);
  return [
    pair(
      ...p.slice(0, 2).map(([x, y]) => [x, y - torso * 0.32]),
      shoulder * 0.8,
    ),
    pair(p[0], p[1], shoulder * 0.8),
    pair(p[2], p[3], hip * 0.85),
    pair(knee[0], knee[1], hip * 0.9),
    pair(ankle[0], ankle[1], hip * 0.9),
    pair(...ankle.map(([x, y]) => [x, y + torso * 0.5]), hip * 0.9),
  ];
}
export function bodyTriangles(source, target, kind) {
  const src = rows(source, kind),
    dst = rows(target, kind),
    triangles = [];
  for (let row = 0; row < src.length - 1; row++) {
    for (const indices of [
      [
        [row, 0],
        [row, 1],
        [row + 1, 1],
      ],
      [
        [row, 0],
        [row + 1, 1],
        [row + 1, 0],
      ],
    ])
      triangles.push({
        source: indices.map(([r, c]) => src[r][c]),
        target: indices.map(([r, c]) => dst[r][c]),
      });
  }
  return triangles;
}
export function affine(source, target) {
  const [[x0, y0], [x1, y1], [x2, y2]] = source,
    [[u0, v0], [u1, v1], [u2, v2]] = target;
  const det = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
  if (Math.abs(det) < 0.001) return null;
  const coefficients = (a, b, c) => [
    (a * (y1 - y2) + b * (y2 - y0) + c * (y0 - y1)) / det,
    (a * (x2 - x1) + b * (x0 - x2) + c * (x1 - x0)) / det,
    (a * (x1 * y2 - x2 * y1) +
      b * (x2 * y0 - x0 * y2) +
      c * (x0 * y1 - x1 * y0)) /
      det,
  ];
  const [a, c, e] = coefficients(u0, u1, u2),
    [b, d, f] = coefficients(v0, v1, v2);
  return [a, b, c, d, e, f];
}
export function customMetadata(image, key) {
  const points =
    key === "tops"
      ? [
          [0.18, 0.1],
          [0.82, 0.1],
          [0.28, 0.95],
          [0.72, 0.95],
          [0.3, 1.6],
          [0.7, 1.6],
          [0.3, 2.3],
          [0.7, 2.3],
        ]
      : key === "bottoms"
        ? [
            [0.15, -0.8],
            [0.85, -0.8],
            [0.24, 0.03],
            [0.76, 0.03],
            [0.32, 0.5],
            [0.68, 0.5],
            [0.32, 0.98],
            [0.68, 0.98],
          ]
        : [
            [0.2, 0.07],
            [0.8, 0.07],
            [0.29, 0.4],
            [0.71, 0.4],
            [0.35, 0.7],
            [0.65, 0.7],
            [0.35, 0.98],
            [0.65, 0.98],
          ];
  return {
    pose: points.map(([x, y]) => [x * image.width, y * image.height]),
    crop: [0, 0, image.width, image.height],
    kind: key,
  };
}
