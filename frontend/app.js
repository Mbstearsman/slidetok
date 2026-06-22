// ---- API address (remembered per device) ---------------------------------
const apiInput = document.getElementById("apiBase");
const STORAGE_KEY = "slidetok_api_base";
apiInput.value = localStorage.getItem(STORAGE_KEY) || "";

function apiBase() {
  return (apiInput.value || "").trim().replace(/\/+$/, "");
}

apiInput.addEventListener("change", () => {
  localStorage.setItem(STORAGE_KEY, apiBase());
  checkHealth();
});

// ---- health indicator ------------------------------------------------------
const statusEl = document.getElementById("apiStatus");

async function checkHealth() {
  const base = apiBase();
  if (!base) {
    statusEl.className = "status";
    statusEl.innerHTML = '<span class="dot"></span>no API set';
    return;
  }
  statusEl.className = "status";
  statusEl.innerHTML = '<span class="dot"></span>waking…';
  try {
    const r = await fetch(base + "/", { method: "GET" });
    if (r.ok) {
      statusEl.className = "status online";
      statusEl.innerHTML = '<span class="dot"></span>connected';
    } else { throw new Error(); }
  } catch {
    statusEl.className = "status offline";
    statusEl.innerHTML = '<span class="dot"></span>unreachable';
  }
}
checkHealth();

// ===========================================================================
//  Color picker  (preset boxes + spectrum/hue + hex — like the desktop dialog)
// ===========================================================================
const PRESETS = [
  "#FFFFFF", "#D9D9D9", "#9AA0AA", "#4A4A4A", "#000000",
  "#FE2C55", "#FF4D4D", "#FF8A00", "#FFE94D", "#39E07B",
  "#25F4EE", "#3DA5FF", "#2D4BFF", "#A65BFF", "#FF7AB6",
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexToRgb = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; };
const rgbToHex = (r,g,b) => { const x = n => clamp(Math.round(n),0,255).toString(16).padStart(2,"0"); return "#"+x(r)+x(g)+x(b); };
function rgbToHsv(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; let h=0; if(d){ if(mx===r)h=((g-b)/d)%6; else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0)h+=360;} return {h,s:mx?d/mx:0,v:mx}; }
function hsvToRgb(h,s,v){ const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c; let r,g,b; if(h<60)[r,g,b]=[c,x,0]; else if(h<120)[r,g,b]=[x,c,0]; else if(h<180)[r,g,b]=[0,c,x]; else if(h<240)[r,g,b]=[0,x,c]; else if(h<300)[r,g,b]=[x,0,c]; else [r,g,b]=[c,0,x]; return [(r+m)*255,(g+m)*255,(b+m)*255]; }
const hexToHsv = (hex) => { const [r,g,b]=hexToRgb(hex); return rgbToHsv(r,g,b); };
const hsvToHex = (h,s,v) => { const [r,g,b]=hsvToRgb(h,s,v); return rgbToHex(r,g,b); };
const isHex = (s) => /^#?[0-9a-fA-F]{6}$/.test(s);

let openPop = null;
document.addEventListener("click", () => { if (openPop) { openPop.hidden = true; openPop = null; } });

function createColorPicker({ initial = "#FFFFFF", allowNone = false } = {}) {
  let value = (allowNone && (initial == null || initial === "None")) ? "None" : (initial || "#FFFFFF");
  let hsv = hexToHsv(value !== "None" ? value : "#FFFFFF");

  const wrap = document.createElement("div");
  wrap.className = "cp";

  const current = document.createElement("button");
  current.type = "button";
  current.className = "cp-current";

  const pop = document.createElement("div");
  pop.className = "cp-pop";
  pop.hidden = true;
  pop.addEventListener("click", (e) => e.stopPropagation());

  // preset grid
  const grid = document.createElement("div");
  grid.className = "cp-grid";
  PRESETS.forEach((hex) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "cp-box"; b.style.background = hex; b.title = hex;
    b.addEventListener("click", () => { setHex(hex); closePop(); });
    grid.appendChild(b);
  });
  if (allowNone) {
    const n = document.createElement("button");
    n.type = "button"; n.className = "cp-box cp-none-box"; n.title = "None";
    n.addEventListener("click", () => { setNone(); closePop(); });
    grid.appendChild(n);
  }

  // SV square
  const sv = document.createElement("div");
  sv.className = "cp-sv";
  const svPoint = document.createElement("div");
  svPoint.className = "cp-sv-point";
  sv.appendChild(svPoint);

  // hue slider
  const hue = document.createElement("div");
  hue.className = "cp-hue";
  const huePoint = document.createElement("div");
  huePoint.className = "cp-hue-point";
  hue.appendChild(huePoint);

  // hex input
  const hexRow = document.createElement("div");
  hexRow.className = "cp-hexrow";
  const hash = document.createElement("span"); hash.textContent = "#"; hash.className = "cp-hash";
  const hexIn = document.createElement("input");
  hexIn.type = "text"; hexIn.className = "cp-hex"; hexIn.maxLength = 7;
  hexRow.appendChild(hash); hexRow.appendChild(hexIn);

  pop.appendChild(grid);
  pop.appendChild(sv);
  pop.appendChild(hue);
  pop.appendChild(hexRow);
  wrap.appendChild(current);
  wrap.appendChild(pop);

  function renderCurrent() {
    if (value === "None") { current.classList.add("is-none"); current.style.background = ""; current.textContent = "None"; }
    else { current.classList.remove("is-none"); current.style.background = value; current.textContent = ""; }
  }
  function renderEditor() {
    sv.style.background = `hsl(${hsv.h}, 100%, 50%)`;
    svPoint.style.left = (hsv.s * 100) + "%";
    svPoint.style.top = ((1 - hsv.v) * 100) + "%";
    huePoint.style.left = (hsv.h / 360 * 100) + "%";
    const hx = hsvToHex(hsv.h, hsv.s, hsv.v);
    svPoint.style.background = hx;
    if (document.activeElement !== hexIn) hexIn.value = hx.replace("#", "").toUpperCase();
  }
  function commitFromHsv() { value = hsvToHex(hsv.h, hsv.s, hsv.v); renderCurrent(); renderEditor(); }
  function setHex(hex) { value = hex; hsv = hexToHsv(hex); renderCurrent(); renderEditor(); }
  function setNone() { value = "None"; renderCurrent(); }

  // drag handling for SV + hue
  function dragify(el, onMove) {
    const handler = (e) => {
      const rect = el.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX);
      const cy = (e.touches ? e.touches[0].clientY : e.clientY);
      onMove(clamp((cx - rect.left) / rect.width, 0, 1), clamp((cy - rect.top) / rect.height, 0, 1));
    };
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handler(e);
      const move = (ev) => handler(ev);
      const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }
  dragify(sv, (x, y) => { hsv.s = x; hsv.v = 1 - y; commitFromHsv(); });
  dragify(hue, (x) => { hsv.h = x * 360; commitFromHsv(); });

  hexIn.addEventListener("input", () => {
    const v = hexIn.value.trim();
    if (isHex(v)) { const hx = (v[0] === "#" ? v : "#" + v); value = hx; hsv = hexToHsv(hx); renderCurrent(); renderEditor(); }
  });

  function openPopFn() { if (openPop && openPop !== pop) openPop.hidden = true; pop.hidden = false; openPop = pop; renderEditor(); }
  function closePop() { pop.hidden = true; if (openPop === pop) openPop = null; }
  current.addEventListener("click", (e) => { e.stopPropagation(); pop.hidden ? openPopFn() : closePop(); });

  renderCurrent();
  return { el: wrap, getValue: () => value };
}

// ---- per-slide colour rows -------------------------------------------------
const captionsInput = document.getElementById("captions");
const slidePanel = document.getElementById("slidePanel");
const slideRows = document.getElementById("slideRows");
let slidePickers = [];

function cell(label, el) {
  const d = document.createElement("div");
  const s = document.createElement("span");
  s.className = "mini-label"; s.textContent = label;
  d.appendChild(s); d.appendChild(el);
  return d;
}

function buildSlideRows(n) {
  slideRows.innerHTML = "";
  slidePickers = [];
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "slide-row";
    const num = document.createElement("div");
    num.className = "num"; num.textContent = "S" + (i + 1);
    row.appendChild(num);

    const textP = createColorPicker({ initial: "#FFFFFF" });
    const bubbleP = createColorPicker({ initial: "None", allowNone: true });
    const outlineP = createColorPicker({ initial: "None", allowNone: true });

    row.appendChild(cell("Text", textP.el));
    row.appendChild(cell("Bubble", bubbleP.el));
    row.appendChild(cell("Outline", outlineP.el));
    slideRows.appendChild(row);
    slidePickers.push({ text: textP, bubble: bubbleP, outline: outlineP });
  }
  slidePanel.hidden = false;
}

// ---- bubble-word colour pickers (mounted once) -----------------------------
const bwTextPicker = createColorPicker({ initial: "#000000" });
const bwFillPicker = createColorPicker({ initial: "#FFE94D", allowNone: true });
document.getElementById("bwTextMount").appendChild(bwTextPicker.el);
document.getElementById("bwFillMount").appendChild(bwFillPicker.el);

captionsInput.addEventListener("change", async () => {
  const file = captionsInput.files[0];
  const base = apiBase();
  if (!file) return;
  if (!base) { setStatus("Set your Render API address first, then re-pick the captions file.", "error"); return; }
  setStatus("Reading captions…");
  try {
    const fd = new FormData();
    fd.append("captions", file);
    const r = await fetch(base + "/columns", { method: "POST", body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not read file");
    buildSlideRows(data.columns);
    setStatus(`${data.columns} slides × up to ${data.rows} caption sets detected.`, "ok");
  } catch (e) { setStatus(e.message, "error"); }
});

// ---- collect per-slide colour arrays --------------------------------------
function collectColors() {
  const text = [], bubble = [], outline = [];
  slidePickers.forEach((p) => { text.push(p.text.getValue()); bubble.push(p.bubble.getValue()); outline.push(p.outline.getValue()); });
  return { text, bubble, outline };
}

// ---- generate --------------------------------------------------------------
const genBtn = document.getElementById("generate");
const statusLine = document.getElementById("statusLine");

// ---- output folder (File System Access API, Chrome/Edge) -------------------
let dirHandle = null;
let dirName = "";
const chooseFolderBtn = document.getElementById("chooseFolder");
const folderLabel = document.getElementById("folderLabel");
const supportsFS = "showDirectoryPicker" in window;

if (!supportsFS) {
  chooseFolderBtn.hidden = true;
  folderLabel.textContent = "Your browser will download a zip. Folder-saving needs Chrome or Edge.";
} else {
  chooseFolderBtn.addEventListener("click", async () => {
    try {
      dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      dirName = dirHandle.name;
      folderLabel.textContent = `Saving into: ${dirName}`;
      folderLabel.classList.add("set");
    } catch (e) {
      // user cancelled the picker — leave as-is
    }
  });
}

async function writeFilesToDir(rootHandle, files) {
  let count = 0;
  for (const path of Object.keys(files)) {
    const data = files[path];
    if (!data || data.length === 0 || path.endsWith("/")) continue;
    const parts = path.split("/").filter(Boolean);
    const fname = parts.pop();
    let dir = rootHandle;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const fh = await dir.getFileHandle(fname, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
    count++;
  }
  return count;
}

function setStatus(msg, kind = "") {
  statusLine.textContent = msg;
  statusLine.className = "status-line" + (kind ? " " + kind : "");
}

function buildChunkForm(numPosts, captionOffset) {
  const fd = new FormData();
  fd.append("captions", captionsInput.files[0]);
  const fontFile = document.getElementById("font").files[0];
  if (fontFile) fd.append("font", fontFile);
  for (const f of document.getElementById("backgrounds").files) fd.append("backgrounds", f);
  const cta = document.getElementById("cta").files[0];
  if (cta) fd.append("cta", cta);
  const colors = collectColors();
  fd.append("text_colors", JSON.stringify(colors.text));
  fd.append("bubble_colors", JSON.stringify(colors.bubble));
  fd.append("outline_colors", JSON.stringify(colors.outline));
  fd.append("num_posts", String(numPosts));
  fd.append("caption_offset", String(captionOffset));
  fd.append("font_size", document.getElementById("fontSize").value || "45");
  fd.append("lock_font_size", document.getElementById("lockSize").checked ? "true" : "false");
  fd.append("random_backgrounds", document.getElementById("randomBg").checked ? "true" : "false");
  fd.append("avoid_faces", document.getElementById("avoidFaces").checked ? "true" : "false");
  fd.append("bubble_words", document.getElementById("bubbleWords").value || "");
  fd.append("bubble_word_text_color", bwTextPicker.getValue());
  fd.append("bubble_word_fill_color", bwFillPicker.getValue());
  const ctaSlide = document.getElementById("ctaSlide").value;
  if (ctaSlide) fd.append("cta_slide", ctaSlide);
  return fd;
}

async function renderChunk(base, numPosts, captionOffset) {
  const r = await fetch(base + "/generate", { method: "POST", body: buildChunkForm(numPosts, captionOffset) });
  if (!r.ok) { let msg = "Something went wrong."; try { msg = (await r.json()).error || msg; } catch {} throw new Error(msg); }
  return await r.blob();
}

genBtn.addEventListener("click", async () => {
  const base = apiBase();
  if (!base) return setStatus("Set your Render API address first.", "error");
  if (!captionsInput.files[0]) return setStatus("Add a captions file.", "error");
  if (!document.getElementById("backgrounds").files.length) return setStatus("Add at least one background image.", "error");

  const total = Math.max(1, parseInt(document.getElementById("numPosts").value || "1", 10));
  const batch = Math.max(1, parseInt(document.getElementById("batchSize").value || "5", 10));

  genBtn.disabled = true;
  try {
    if (dirHandle) {
      // ask for write permission once, up front
      if (dirHandle.requestPermission) {
        const perm = await dirHandle.requestPermission({ mode: "readwrite" });
        if (perm !== "granted") throw new Error("Write permission to the folder was denied.");
      }
      let done = 0;
      while (done < total) {
        const thisChunk = Math.min(batch, total - done);
        setStatus(`Rendering shows ${done + 1}–${done + thisChunk} of ${total}…${done === 0 ? " (first batch wakes the server, ~30s)" : ""}`);
        const blob = await renderChunk(base, thisChunk, done);
        const files = fflate.unzipSync(new Uint8Array(await blob.arrayBuffer()));
        await writeFilesToDir(dirHandle, files);
        done += thisChunk;
        setStatus(`Saved ${done} / ${total} shows into "${dirName}"…`, "ok");
      }
      setStatus(`Done — ${total} shows saved into "${dirName}".`, "ok");
    } else {
      // no folder chosen -> single request, zip download
      setStatus("Waking the server and rendering… first run after idle can take ~30s.");
      const blob = await renderChunk(base, total, 0);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "slides.zip"; a.click();
      URL.revokeObjectURL(url);
      setStatus("Done — slides.zip downloaded. (Tip: choose an output folder to run big batches 5 at a time.)", "ok");
    }
  } catch (e) {
    setStatus(`${e.message} — anything already saved is in your folder.`, "error");
  } finally {
    genBtn.disabled = false;
  }
});
