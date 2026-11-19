import { LocalCompositor } from "./local-compositor.js";
const $ = (id) => document.getElementById(id);
const state = {
  catalog: [],
  category: "auto",
  occasion: "全部",
  layers: {},
  active: null,
  base: null,
  personal: false,
  original: false,
  revision: 0,
};
const renderer = new LocalCompositor($("canvas"));
const names = { tops: "上身", bottoms: "下身", dress: "洋裝" };
let toastTimer,
  loadRevision = 0,
  photoRevision = 0;
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function imageFrom(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("照片讀取失敗，請重新整理後再試。"));
    image.src = src;
  });
}
function draw(exporting = false) {
  renderer.draw(
    state.base,
    state.layers,
    state.active,
    state.original && !exporting,
    exporting,
    state.personal,
  );
}
function defaults(key, image) {
  const demo = !state.personal;
  let width = 720 * (demo ? 0.25 : 0.4),
    height = (width * image.height) / image.width;
  let y =
    key === "bottoms" ? 960 * 0.68 : key === "dress" ? 960 * 0.56 : 960 * 0.38;
  if (key === "bottoms") {
    height = 960 * 0.43;
    width = (height * image.width) / image.height;
  }
  if (key === "dress") {
    height = 960 * 0.68;
    width = (height * image.width) / image.height;
  }
  return {
    key,
    image,
    x: 720 * (demo ? 0.395 : 0.5),
    y,
    width: Math.min(650, width),
    height: Math.min(850, height),
    rotation: 0,
    opacity: 100,
  };
}
function update() {
  const entries = Object.values(state.layers);
  if (!state.layers[state.active]) state.active = entries[0]?.key || null;
  $("selected-summary").textContent = entries.length
    ? entries.map((layer) => `${names[layer.key]}｜${layer.name}`).join("；")
    : "從下面挑一套，放進試衣鏡吧";
  $("layer-tabs").replaceChildren(
    ...entries.map((layer) => {
      const button = document.createElement("button");
      button.textContent = names[layer.key];
      button.className = layer.key === state.active ? "active" : "";
      button.setAttribute("aria-pressed", String(layer.key === state.active));
      button.onclick = () => {
        state.active = layer.key;
        update();
      };
      return button;
    }),
  );
  const layer = state.layers[state.active];
  for (const key of ["x", "y", "width", "height", "rotation", "opacity"]) {
    $(`${key}-control`).disabled = !layer;
    if (layer) {
      $(`${key}-control`).value = layer[key];
      $(`${key}-value`).textContent =
        Math.round(layer[key]) +
        (key === "rotation" ? "°" : key === "opacity" ? "%" : "");
    } else $(`${key}-value`).textContent = "";
  }
  $("download-button").disabled = !entries.length;
  $("reset-layer").disabled = !entries.length;
  $("clear-selection").disabled = !entries.length;
  $("compare-button").setAttribute("aria-pressed", String(state.original));
  $("compare-button").textContent = state.original ? "回到搭配圖" : "查看原照";
  $("image-label").textContent = state.original
    ? "原始照片・未疊衣"
    : state.personal
      ? "你的照片・手動疊衣示意"
      : "店內模特兒示範・換成自己的照片試試";
  draw();
  renderCatalog();
}
function renderCatalog() {
  const query = $("search").value.trim();
  const scroll = $("catalog").scrollTop;
  const focused =
    document.activeElement?.closest(".outfit-card")?.dataset.outfit;
  const items = state.catalog.filter(
    (item) =>
      item.categories.includes(state.category) &&
      (state.occasion === "全部" || item.occasions.includes(state.occasion)) &&
      (!query || `${item.name}${item.copy}`.includes(query)),
  );
  $("catalog-count").textContent = `${items.length} 套穿搭`;
  $("empty-catalog").hidden = items.length > 0;
  $("catalog").replaceChildren(
    ...items.map((item) => {
      const selected = Object.values(state.layers).some(
        (layer) =>
          layer.id === item.id &&
          (state.category === "auto" || layer.key === state.category),
      );
      const button = document.createElement("button");
      button.className = `outfit-card${selected ? " selected" : ""}`;
      button.dataset.outfit = item.id;
      button.setAttribute("aria-label", `選擇：${item.name}`);
      button.setAttribute("aria-pressed", String(selected));
      const image = document.createElement("img");
      image.src = `static/assets/outfit-${String(item.id).padStart(2, "0")}-small.webp`;
      image.alt = "";
      image.width = 480;
      image.height = 600;
      image.loading = item.id <= 4 ? "eager" : "lazy";
      const info = document.createElement("span");
      info.className = "outfit-info";
      const number = document.createElement("span");
      number.textContent = `LOOK ${String(item.id).padStart(2, "0")}`;
      const title = document.createElement("strong");
      title.textContent = item.name;
      info.append(number, title);
      button.append(image, info);
      if (selected) {
        const check = document.createElement("span");
        check.className = "outfit-check";
        check.textContent = "✓";
        button.append(check);
      }
      button.onclick = () => choose(item);
      return button;
    }),
  );
  $("catalog").scrollTop = scroll;
  if (focused)
    $("catalog")
      .querySelector(`[data-outfit="${focused}"]`)
      ?.focus({ preventScroll: true });
}
async function choose(item) {
  const revision = ++loadRevision;
  const category = state.category;
  const keys =
    category === "auto"
      ? item.onePiece
        ? ["dress"]
        : item.categories.filter((key) => key !== "auto")
      : [category];
  try {
    const loaded = await Promise.all(
      keys.map(async (key) => ({
        key,
        image: await imageFrom(
          `static/garments/${String(item.id).padStart(2, "0")}-${key}.webp`,
        ),
      })),
    );
    if (revision !== loadRevision) return;
    if (category === "auto") state.layers = {};
    else delete state.layers.dress;
    for (const { key, image } of loaded)
      state.layers[key] = {
        ...defaults(key, image),
        name: item.name,
        id: item.id,
      };
    state.active = keys[0];
    state.original = false;
    update();
    toast("已放進試衣鏡，拖曳衣服調整位置。");
  } catch (error) {
    toast(error.message);
  }
}
async function readFile(file, preserveAlpha = false) {
  if (!file) throw new Error("沒有選擇照片。");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("請使用 JPG、PNG 或 WebP；HEIC 請先轉成 JPG。");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("照片超過 10 MB，請先縮小照片。");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (
      bitmap.width * bitmap.height > 20_000_000 ||
      Math.min(bitmap.width, bitmap.height) < 128
    )
      throw new Error("照片短邊至少 128 像素，且不超過 2,000 萬像素。");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await imageFrom(
      canvas.toDataURL(preserveAlpha ? "image/png" : "image/jpeg", 0.92),
    );
  } finally {
    bitmap.close();
  }
}
async function setPhoto(file) {
  if (!file) return;
  const revision = ++photoRevision;
  try {
    const image = await readFile(file);
    if (revision !== photoRevision) return;
    state.base = image;
    state.personal = true;
    state.original = false;
    for (const layer of Object.values(state.layers))
      Object.assign(layer, defaults(layer.key, layer.image));
    $("photo-actions").hidden = false;
    $("upload-title").textContent = "照片已放好 ✓";
    $("upload-button").classList.add("has-photo");
    update();
    toast("照片只在這個瀏覽器裡，沒有上傳。");
  } catch (error) {
    toast(error.message);
  } finally {
    $("photo-input").value = "";
  }
}
$("upload-button").onclick = () => $("photo-input").click();
$("replace-photo").onclick = () => $("photo-input").click();
$("photo-input").onchange = (event) => setPhoto(event.target.files[0]);
$("clear-photo").onclick = async () => {
  const revision = ++photoRevision;
  loadRevision++;
  state.base = null;
  state.personal = false;
  state.layers = {};
  state.active = null;
  state.original = false;
  $("photo-actions").hidden = true;
  $("upload-title").textContent = "放上自己的照片";
  $("upload-button").classList.remove("has-photo");
  update();
  try {
    const base = await imageFrom("static/assets/outfit-11-large.webp");
    if (revision === photoRevision && !state.personal) {
      state.base = base;
      draw();
    }
  } catch (error) {
    toast(error.message);
  }
  toast("已移除照片與本次搭配。");
};
$("clear-selection").onclick = () => {
  loadRevision++;
  state.layers = {};
  state.active = null;
  state.original = false;
  update();
};
$("compare-button").onclick = () => {
  state.original = !state.original;
  update();
};
$("reset-layer").onclick = () => {
  const layer = state.layers[state.active];
  if (layer) Object.assign(layer, defaults(layer.key, layer.image));
  state.original = false;
  update();
};
for (const key of ["x", "y", "width", "height", "rotation", "opacity"])
  $(`${key}-control`).oninput = (event) => {
    const layer = state.layers[state.active];
    if (layer) {
      layer[key] = Number(event.target.value);
      state.original = false;
      update();
    }
  };
for (const button of document.querySelectorAll("[data-category]"))
  button.onclick = () => {
    state.category = button.dataset.category;
    for (const tab of document.querySelectorAll("[data-category]")) {
      tab.classList.toggle("active", tab === button);
      tab.setAttribute("aria-pressed", String(tab === button));
    }
    renderCatalog();
  };
for (const button of document.querySelectorAll("[data-occasion]"))
  button.onclick = () => {
    state.occasion = button.dataset.occasion;
    for (const tab of document.querySelectorAll("[data-occasion]")) {
      tab.classList.toggle("active", tab === button);
      tab.setAttribute("aria-pressed", String(tab === button));
    }
    renderCatalog();
  };
$("search").oninput = renderCatalog;
let drag = null;
function point(event) {
  const rect = $("canvas").getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * 720) / rect.width,
    y: ((event.clientY - rect.top) * 960) / rect.height,
  };
}
$("canvas").onpointerdown = (event) => {
  if (state.original) return;
  const p = point(event);
  const layers = Object.values(state.layers).reverse();
  const layer = layers.find((layer) => renderer.hit(layer, p.x, p.y));
  if (!layer) return;
  state.active = layer.key;
  drag = { x: p.x - layer.x, y: p.y - layer.y };
  $("canvas").setPointerCapture(event.pointerId);
  update();
};
$("canvas").onpointermove = (event) => {
  if (!drag) return;
  const p = point(event),
    layer = state.layers[state.active];
  if (layer) {
    layer.x = Math.max(-200, Math.min(920, p.x - drag.x));
    layer.y = Math.max(-200, Math.min(1160, p.y - drag.y));
    update();
  }
};
function endDrag() {
  drag = null;
}
$("canvas").onpointerup = endDrag;
$("canvas").onpointercancel = endDrag;
$("canvas").onkeydown = (event) => {
  const layer = state.layers[state.active];
  if (
    !layer ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  const step = event.shiftKey ? 10 : 2;
  layer.x +=
    event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
  layer.y +=
    event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
  state.original = false;
  update();
};
$("download-button").onclick = () => {
  draw(true);
  $("canvas").toBlob((blob) => {
    draw();
    if (!blob) {
      toast("下載失敗，請稍後再試。");
      return;
    }
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "阿蓁の衣舖子-疊衣搭配示意.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
};
$("garment-upload").onclick = () => $("garment-input").click();
$("garment-input").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const revision = ++loadRevision;
  const key = $("garment-category").value;
  try {
    const image = await readFile(file, true);
    if (revision !== loadRevision) return;
    if (key === "dress") state.layers = {};
    else delete state.layers.dress;
    state.layers[key] = {
      ...defaults(key, image),
      name: "自己的衣服照片",
      id: null,
    };
    state.active = key;
    state.original = false;
    update();
    toast("已加入本機衣服照片，沒有上傳。");
  } catch (error) {
    toast(error.message);
  } finally {
    $("garment-input").value = "";
  }
};
try {
  const [catalog, base] = await Promise.all([
    fetch("static/catalog.json").then((response) => {
      if (!response.ok) throw new Error("衣櫥載入失敗，請重新整理。");
      return response.json();
    }),
    imageFrom("static/assets/outfit-11-large.webp"),
  ]);
  state.catalog = catalog;
  if (!state.personal) state.base = base;
  update();
} catch (error) {
  $("catalog").textContent = error.message;
  toast(error.message);
}
