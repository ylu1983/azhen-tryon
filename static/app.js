"use strict";
const $ = (id) => document.getElementById(id);
const state = { catalog: [], category: "auto", occasion: "全部", selected: {}, photo: null,
  result: null, showingOriginal: false, enabled: false, csrf: "", busy: false, job: null, epoch: 0 };
let toastTimer;

function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6500);
}

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": state.csrf, ...options.headers } });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "連線暫時中斷，請稍後再試。");
  return body;
}

function steps() {
  return ["auto", "tops", "bottoms"].filter((key) => state.selected[key])
    .map((category) => ({ id: state.selected[category], category }));
}

function invalidateResult() {
  if (state.result) {
    state.result = null; state.showingOriginal = false;
    discardJob(); renderMirror();
    $("service-notice").textContent = "已更換選衣，請重新開始試穿以產生這套搭配的結果。";
  }
}

function renderSelection() {
  const selected = steps();
  const labels = { auto: "整套", tops: "上身", bottoms: "下身" };
  $("selected-summary").textContent = selected.length ? selected.map((step) => {
    const item = state.catalog.find((entry) => entry.id === step.id);
    return `${labels[step.category]}｜${item.name}`;
  }).join("；") : "還沒選衣服，從下面挑一套吧";
  $("credit-hint").textContent = selected.length === 2 ? "上下身會依序生成，共 2 次；下身失敗時會保留已完成的上身結果。" : "整套或單一部位試穿，共 1 次生成。";
  $("generate-button").disabled = !state.enabled || !state.photo || !selected.length || !$("consent").checked || state.busy;
  $("generate-text").textContent = state.busy ? "AI 正在試穿中…" : !state.enabled ? "AI 試穿尚未開放" : !state.photo ? "先上傳自己的照片" : !selected.length ? "先選一套喜歡的衣服" : "開始 AI 試穿";
  $("compare-button").disabled = !state.result || state.busy;
  $("download-button").disabled = !state.result || state.busy;
  $("clear-selection").disabled = state.busy || !selected.length;
  for (const button of document.querySelectorAll("[data-category]")) button.disabled = state.busy;
  renderCatalog();
}

function renderCatalog() {
  const query = $("search").value.trim().toLowerCase();
  const filtered = state.catalog.filter((item) => item.categories.includes(state.category)
    && (state.occasion === "全部" || item.occasions.includes(state.occasion))
    && (!query || `${item.name}${item.copy}${item.occasions.join("")}`.toLowerCase().includes(query)));
  $("catalog-count").textContent = `${filtered.length} 套穿搭`;
  $("empty-catalog").hidden = filtered.length > 0;
  $("catalog").replaceChildren(...filtered.map((item) => {
    const selected = state.selected[state.category] === item.id;
    const button = document.createElement("button");
    button.className = `outfit-card${selected ? " selected" : ""}`;
    button.type = "button";
    button.disabled = state.busy;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", `${selected ? "已選取：" : "選擇："}${item.name}`);
    const image = document.createElement("img");
    image.src = `/static/assets/outfit-${String(item.id).padStart(2, "0")}-small.webp`;
    image.alt = ""; image.width = 480; image.height = 600;
    image.loading = item.id <= 4 ? "eager" : "lazy";
    const info = document.createElement("span"); info.className = "outfit-info";
    const number = document.createElement("span"); number.textContent = `LOOK ${String(item.id).padStart(2, "0")}`;
    const title = document.createElement("strong"); title.textContent = item.name;
    info.append(number, title); button.append(image, info);
    if (item.onePiece) { const badge = document.createElement("span"); badge.className = "outfit-badge"; badge.textContent = "洋裝"; button.append(badge); }
    if (selected) { const check = document.createElement("span"); check.className = "outfit-check"; check.textContent = "✓"; check.setAttribute("aria-hidden", "true"); button.append(check); }
    button.addEventListener("click", () => {
      invalidateResult();
      if (state.category === "auto") state.selected = { auto: item.id };
      else { delete state.selected.auto; state.selected[state.category] = item.id; }
      renderSelection();
      toast(`已選${{ auto: "整套", tops: "上身", bottoms: "下身" }[state.category]}：${item.name}`);
    });
    return button;
  }));
}

function renderMirror() {
  const result = state.result && !state.showingOriginal;
  $("mirror-image").src = result ? state.result : state.photo || "/static/assets/outfit-11-large.webp";
  $("mirror-image").alt = result ? "你的 AI 試穿結果，效果僅供參考" : state.photo ? "你選擇的原始照片，尚未換衣" : "店內 AI 模特兒穿搭展示，非顧客試穿結果";
  $("image-label").textContent = result ? "你的 AI 試穿結果・僅供搭配參考" : state.photo ? "你的原照・尚未換衣" : "店內穿搭示範・非你的試穿結果";
  $("compare-button").textContent = state.showingOriginal ? "回到試穿結果" : "查看原照";
  $("compare-button").setAttribute("aria-pressed", String(state.showingOriginal));
  $("photo-status").textContent = state.result ? "試穿完成，看看新的自己" : state.photo ? "照片已備妥，請挑選喜歡的衣服" : "先挑一套喜歡的，再放上自己的照片";
}

async function discardJob() {
  const id = state.job; state.job = null;
  if (id) await api(`/api/tryons/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
}

async function readPhoto(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    toast("請使用 JPG、PNG 或 WebP；iPhone 的 HEIC 請先轉成 JPG。"); $("photo-input").value = ""; return;
  }
  if (file.size > 10 * 1024 * 1024) { toast("照片超過 10 MB，請先縮小照片。"); $("photo-input").value = ""; return; }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (bitmap.width * bitmap.height > 20_000_000 || Math.min(bitmap.width, bitmap.height) < 128)
      throw new Error("照片短邊需至少 128 像素，且不超過 2,000 萬像素。");
    const scale = Math.min(1, 1296 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    state.epoch++; await discardJob();
    state.photo = canvas.toDataURL("image/jpeg", .92);
    state.result = null; state.showingOriginal = false; state.busy = false;
    $("consent").checked = false;
    $("upload-title").textContent = "照片已選好 ✓";
    $("upload-button").classList.add("has-photo");
    $("photo-actions").hidden = false; $("progress-overlay").hidden = true;
    renderMirror(); renderSelection();
    toast("照片已放入試衣鏡，尚未送出。");
  } catch (error) { toast(error.message.includes("像素") ? error.message : "無法讀取照片，請換一張 JPG、PNG 或 WebP。"); }
  finally { bitmap?.close(); $("photo-input").value = ""; }
}

async function generate() {
  if ($("generate-button").disabled) return;
  const epoch = ++state.epoch;
  state.busy = true; state.result = null; state.showingOriginal = false;
  $("progress-overlay").hidden = false;
  $("service-notice").textContent = "照片已送交 FASHN 處理；整套通常需十多秒，混搭會分兩次生成。";
  renderMirror(); renderSelection();
  try {
    await discardJob();
    const submitted = await api("/api/tryons", { method: "POST", body: JSON.stringify({ photo: state.photo, steps: steps(), consent: true }) });
    if (epoch !== state.epoch) {
      await api(`/api/tryons/${encodeURIComponent(submitted.id)}`, { method: "DELETE" }).catch(() => {}); return;
    }
    state.job = submitted.id;
    const deadline = Date.now() + 450_000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (epoch !== state.epoch) return;
      const job = await api(`/api/tryons/${encodeURIComponent(state.job)}`);
      if (epoch !== state.epoch) return;
      $("progress-text").textContent = job.total === 2 ? `正在試穿${job.step <= 1 ? "上身" : "下身"}（${job.step || 1}/2）` : "正在準備你的新穿搭";
      if (["completed", "partial"].includes(job.status)) {
        state.result = job.output;
        $("service-notice").textContent = job.status === "partial" ? `上身試穿已完成；下身未完成。${job.error}` : "你的新穿搭完成了。可以查看原照比較，或下載留下搭配靈感。";
        toast(job.status === "partial" ? "下身未完成，已保留上身的試穿結果。" : "試穿完成！看看這套適不適合今天的你。");
        break;
      }
      if (job.status === "failed") throw new Error(job.error);
    }
    if (!state.result) throw new Error("試穿等候逾時，請稍後再試；原請求仍可能完成並產生費用。");
  } catch (error) {
    if (epoch === state.epoch) { $("service-notice").textContent = error.message; toast(error.message); }
  } finally {
    if (epoch === state.epoch) { state.busy = false; $("progress-overlay").hidden = true; $("consent").checked = false; renderMirror(); renderSelection(); }
  }
}

$("upload-button").addEventListener("click", () => $("photo-input").click());
$("replace-photo").addEventListener("click", () => $("photo-input").click());
$("photo-input").addEventListener("change", (event) => readPhoto(event.target.files[0]));
$("clear-photo").addEventListener("click", async () => {
  const wasBusy = state.busy;
  state.epoch++; state.photo = null; state.result = null; state.showingOriginal = false; state.busy = false;
  $("consent").checked = false; $("photo-actions").hidden = true;
  $("progress-overlay").hidden = true; $("upload-title").textContent = "上傳自己的照片";
  $("upload-button").classList.remove("has-photo");
  renderMirror(); renderSelection(); await discardJob();
  toast(wasBusy ? "已移除本站照片紀錄；已送出的 AI 請求無法撤回，仍可能計費。" : "已移除照片與本站試穿紀錄。");
});
$("clear-selection").addEventListener("click", () => { invalidateResult(); state.selected = {}; renderSelection(); });
$("consent").addEventListener("change", renderSelection);
$("search").addEventListener("input", renderCatalog);
$("generate-button").addEventListener("click", generate);
$("compare-button").addEventListener("click", () => { state.showingOriginal = !state.showingOriginal; renderMirror(); });
$("download-button").addEventListener("click", () => {
  if (!state.result) return;
  const link = document.createElement("a"); link.href = state.result; link.download = "阿蓁の衣舖子-AI試穿參考.jpg"; link.click();
});
for (const button of document.querySelectorAll("[data-category]")) button.addEventListener("click", () => {
  state.category = button.dataset.category;
  for (const tab of document.querySelectorAll("[data-category]")) { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-pressed", String(active)); }
  renderCatalog();
});
for (const button of document.querySelectorAll("[data-occasion]")) button.addEventListener("click", () => {
  state.occasion = button.dataset.occasion;
  for (const tab of document.querySelectorAll("[data-occasion]")) { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-pressed", String(active)); }
  renderCatalog();
});

async function init() {
  try {
    const [config, catalog] = await Promise.all([api("/api/config"), fetch("/static/catalog.json").then((r) => { if (!r.ok) throw new Error(); return r.json(); })]);
    state.catalog = catalog; state.csrf = config.csrf; state.enabled = config.enabled;
    $("mode-label").textContent = config.enabled ? "AI 試穿已開放" : "選衣流程示範";
    $("service-notice").textContent = config.enabled ? "上傳照片並選好衣服後，就能開始 AI 試穿。只有你同意後，照片才會送交 FASHN。" : "目前是選衣流程示範：可放入自己的照片、挑選整套或上下身，但尚未開通 AI 換衣，不會生成試穿結果，也不會送出照片。";
    $("consent-label").hidden = !config.enabled;
    renderSelection();
  } catch (_) {
    $("mode-label").textContent = "暫時無法連線";
    $("service-notice").textContent = "試衣間暫時無法連線，請重新整理；照片不會送出。";
    $("catalog").textContent = "衣櫥載入失敗，請重新整理頁面。";
    renderSelection();
  }
}
init();
