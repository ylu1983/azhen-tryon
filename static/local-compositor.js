import { affine, bodyTriangles, imageBox, validPose } from "./body-fit.js";
/** Local-only renderer. A remote adapter must be a separate explicit opt-in. */
export class LocalCompositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
  }
  fit(image, metadata, body) {
    if (!validPose(body)) return null;
    const work = document.createElement("canvas");
    work.width = 720;
    work.height = 960;
    const context = work.getContext("2d", { willReadFrequently: true });
    for (const triangle of bodyTriangles(metadata.pose, body, metadata.kind)) {
      const matrix = affine(triangle.source, triangle.target);
      if (!matrix) continue;
      context.save();
      context.beginPath();
      const cx = triangle.target.reduce((sum, p) => sum + p[0], 0) / 3,
        cy = triangle.target.reduce((sum, p) => sum + p[1], 0) / 3;
      triangle.target.forEach(([x, y], index) => {
        const length = Math.hypot(x - cx, y - cy) || 1,
          px = x + ((x - cx) / length) * 0.6,
          py = y + ((y - cy) / length) * 0.6;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.closePath();
      context.clip();
      context.transform(...matrix);
      context.drawImage(image, ...metadata.crop);
      context.restore();
    }
    const alpha = context.getImageData(0, 0, 720, 960).data;
    let left = 720,
      right = -1,
      top = 960,
      bottom = -1;
    for (let y = 0; y < 960; y++)
      for (let x = 0; x < 720; x++)
        if (alpha[(y * 720 + x) * 4 + 3] > 8) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    if (right < left) return null;
    const surface = document.createElement("canvas");
    surface.width = right - left + 1;
    surface.height = bottom - top + 1;
    surface.getContext("2d").drawImage(work, -left, -top);
    return {
      surface,
      x: left + surface.width / 2,
      y: top + surface.height / 2,
      width: surface.width,
      height: surface.height,
    };
  }
  draw(
    base,
    layers,
    active,
    original = false,
    exporting = false,
    isPersonal = false,
    options = {},
  ) {
    const ctx = this.context,
      { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#eeece3";
    ctx.fillRect(0, 0, width, height);
    if (base) {
      const scale = Math.min(width / base.width, height / base.height);
      ctx.drawImage(
        base,
        (width - base.width * scale) / 2,
        (height - base.height * scale) / 2,
        base.width * scale,
        base.height * scale,
      );
    }
    if (!original)
      for (const key of ["bottoms", "tops", "dress"]) {
        const layer = layers[key];
        if (!layer) continue;
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.globalAlpha = layer.opacity / 100;
        ctx.drawImage(
          layer.surface || layer.image,
          -layer.width / 2,
          -layer.height / 2,
          layer.width,
          layer.height,
        );
        ctx.globalAlpha = 1;
        if (layer.key === active && !exporting && !options.calibrating) {
          ctx.strokeStyle = "#616249";
          ctx.lineWidth = 2;
          ctx.setLineDash([9, 6]);
          ctx.strokeRect(
            -layer.width / 2,
            -layer.height / 2,
            layer.width,
            layer.height,
          );
        }
        ctx.restore();
      }
    if (!original && options.foreground && options.preserve && base) {
      const box = imageBox(base, width, height);
      ctx.drawImage(options.foreground, box.x, box.y, box.width, box.height);
    }
    if (!original && options.calibrating && !exporting && options.body) {
      ctx.save();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      for (const [a, b] of [
        [0, 1],
        [0, 2],
        [1, 3],
        [2, 3],
        [2, 4],
        [3, 5],
        [4, 6],
        [5, 7],
      ]) {
        ctx.beginPath();
        ctx.moveTo(...options.body[a]);
        ctx.lineTo(...options.body[b]);
        ctx.stroke();
      }
      options.body.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fillStyle = i === options.bodyPoint ? "#74633d" : "#fffefa";
        ctx.fill();
        ctx.strokeStyle = "#282a25";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = i === options.bodyPoint ? "#fff" : "#282a25";
        ctx.font = "bold 19px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i + 1), x, y);
      });
      ctx.restore();
    }
    if (exporting) {
      ctx.fillStyle = "rgba(255,254,250,.94)";
      ctx.fillRect(0, height - 66, width, 66);
      ctx.fillStyle = "#282a25";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `阿蓁の衣舖子｜身形對位示意・非 AI 換衣${isPersonal ? "" : "・模特兒示範"}`,
        width / 2,
        height - 25,
      );
    }
  }
  hit(layer, x, y) {
    const a = (-layer.rotation * Math.PI) / 180,
      dx = x - layer.x,
      dy = y - layer.y;
    return (
      Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= layer.width / 2 &&
      Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= layer.height / 2
    );
  }
}
