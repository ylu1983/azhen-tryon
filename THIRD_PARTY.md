# Third-party runtime and models

All runtime assets below are committed and served from this site's own origin. Download URLs are provenance only; customer photos are never sent to them.

## MediaPipe Tasks Vision

- Author: The MediaPipe Authors / Google
- Version: `@mediapipe/tasks-vision@0.10.21`
- Source: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.21
- Upstream: https://github.com/google-ai-edge/mediapipe
- Files: `static/vendor/mediapipe/vision_bundle.mjs`, SIMD/non-SIMD loaders and WASM in `wasm/`
- License: Apache License 2.0, included in `static/vendor/mediapipe/LICENSE` (upstream notices retained)
- Unmodified distribution files from `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/`

## Google MediaPipe Pose Landmarker Lite

- Local file: `static/models/pose_landmarker_lite.task`
- Source: https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- Guide/model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
- SHA-256: `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`
- License: Apache License 2.0 (MediaPipe); copy in `static/vendor/mediapipe/LICENSE`

## Google MediaPipe Selfie Multiclass 256×256

- Local file: `static/models/selfie_multiclass.tflite`
- Source: https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite
- Guide/model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter
- SHA-256: `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0`
- License: Apache License 2.0 (MediaPipe); copy in `static/vendor/mediapipe/LICENSE`
- Classes: background (0), hair (1), body skin (2), face skin (3), clothing (4), accessories/other (5)

Model weights and runtime are unmodified. App-specific clothing masks, source anchors and mesh renderer are separate. These are detection/segmentation models, not generative garment replacement models. Their output can be inaccurate, especially with occlusion, unusual poses, dim light or subjects unlike their training distribution.
