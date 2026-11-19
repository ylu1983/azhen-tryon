/** Only same-origin model downloads. Customer images are passed to local WASM, never fetch. */
import { canvasPose, validPose } from "./body-fit.js";
let loading;
async function models() {
  if (!loading)
    loading = (async () => {
      const { FilesetResolver, PoseLandmarker, ImageSegmenter } = await import(
        "./vendor/mediapipe/vision_bundle.mjs"
      );
      const vision = await FilesetResolver.forVisionTasks(
        new URL("./vendor/mediapipe/wasm", import.meta.url).href,
      );
      const pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: new URL(
            "./models/pose_landmarker_lite.task",
            import.meta.url,
          ).href,
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });
      try {
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: new URL(
              "./models/selfie_multiclass.tflite",
              import.meta.url,
            ).href,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        return { pose, segmenter };
      } catch (error) {
        pose.close();
        throw error;
      }
    })().catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}
function nearSegment(x, y, a, b, radius) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length))
    : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < radius;
}
function foreground(image, mask, landmarks) {
  const { width, height } = mask,
    data = mask.getAsUint8Array();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d"),
    pixels = context.createImageData(width, height);
  const points = landmarks.map((p) => ({ x: p.x * width, y: p.y * height }));
  const radius =
    Math.hypot(points[11].x - points[12].x, points[11].y - points[12].y) *
    0.095;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * width + x,
        category = data[index];
      const arm =
        category === 2 &&
        [
          [13, 15],
          [14, 16],
          [15, 19],
          [16, 20],
        ].some(([a, b]) => nearSegment(x, y, points[a], points[b], radius));
      pixels.data[index * 4 + 3] =
        category === 1 || category === 3 || arm ? 255 : 0;
    }
  context.putImageData(pixels, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}
export async function analyzeBody(image) {
  const { pose, segmenter } = await models();
  // Yield so the loading message paints before synchronous one-image WASM inference.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const found = pose.detect(image).landmarks[0];
  if (
    !found ||
    [11, 12, 23, 24, 25, 26, 27, 28].some(
      (i) => (found[i].visibility ?? 0) < 0.45,
    )
  )
    return null;
  const raw = [];
  for (const [a, b] of [
    [11, 12],
    [23, 24],
    [25, 26],
    [27, 28],
  ])
    raw.push(
      ...[found[a], found[b]]
        .sort((a, b) => a.x - b.x)
        .map((p) => [p.x * image.width, p.y * image.height]),
    );
  const points = canvasPose(raw, image);
  if (!validPose(points)) return null;
  const result = segmenter.segment(image);
  try {
    return {
      points,
      foreground: foreground(image, result.categoryMask, found),
    };
  } finally {
    result.close();
  }
}
