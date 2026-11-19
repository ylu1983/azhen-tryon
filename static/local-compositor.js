/** Local-only renderer boundary. A future AI adapter must be an explicit opt-in,
 * never an automatic fallback: this adapter has no upload or network methods. */
export class LocalCompositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
  }
  draw(
    base,
    layers,
    active,
    original = false,
    exporting = false,
    isPersonal = false,
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
      for (const layer of Object.values(layers)) {
        ctx.save();
        ctx.translate(layer.x, layer.y);
        ctx.rotate((layer.rotation * Math.PI) / 180);
        ctx.globalAlpha = layer.opacity / 100;
        ctx.drawImage(
          layer.image,
          -layer.width / 2,
          -layer.height / 2,
          layer.width,
          layer.height,
        );
        ctx.globalAlpha = 1;
        if (layer.key === active && !exporting) {
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
    if (exporting) {
      ctx.fillStyle = "rgba(255,254,250,.94)";
      ctx.fillRect(0, height - 66, width, 66);
      ctx.fillStyle = "#282a25";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `阿蓁の衣舖子｜疊衣示意・非 AI 換衣${isPersonal ? "" : "・模特兒示範"}`,
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
