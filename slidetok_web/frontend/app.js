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
    } else {
      throw new Error();
    }
  } catch {
    statusEl.className = "status offline";
    statusEl.innerHTML = '<span class="dot"></span>unreachable';
  }
}
checkHealth();

// ---- per-slide colour rows -------------------------------------------------
const captionsInput = document.getElementById("captions");
const slidePanel = document.getElementById("slidePanel");
const slideRows = document.getElementById("slideRows");

function buildSlideRows(n) {
  slideRows.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const row = document.createElement("div");
    row.className = "slide-row";
    row.innerHTML = `
      <div class="num">S${i + 1}</div>
      <div>
        <span class="mini-label">Text</span>
        <input type="color" class="text-color" value="#ffffff" />
      </div>
      <div>
        <span class="mini-label">Bubble</span>
        <input type="color" class="bubble-color swatch" data-none="true" value="#000000" />
        <label class="none-toggle"><input type="checkbox" class="bubble-none" checked /> None</label>
      </div>
      <div>
        <span class="mini-label">Outline</span>
        <input type="color" class="outline-color swatch" data-none="true" value="#000000" />
        <label class="none-toggle"><input type="checkbox" class="outline-none" checked /> None</label>
      </div>`;
    slideRows.appendChild(row);
  }
  // dim swatches whose "None" box is ticked
  slideRows.querySelectorAll(".none-toggle input").forEach((box) => {
    const swatch = box.closest("div").querySelector("input[type=color]");
    box.addEventListener("change", () => {
      swatch.dataset.none = box.checked ? "true" : "false";
    });
  });
  slidePanel.hidden = false;
}

captionsInput.addEventListener("change", async () => {
  const file = captionsInput.files[0];
  const base = apiBase();
  if (!file) return;
  if (!base) {
    setStatus("Set your Render API address first, then re-pick the captions file.", "error");
    return;
  }
  setStatus("Reading captions…");
  try {
    const fd = new FormData();
    fd.append("captions", file);
    const r = await fetch(base + "/columns", { method: "POST", body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Could not read file");
    buildSlideRows(data.columns);
    setStatus(`${data.columns} slides × up to ${data.rows} posts detected.`, "ok");
  } catch (e) {
    setStatus(e.message, "error");
  }
});

// ---- collect per-slide colour arrays --------------------------------------
function collectColors() {
  const rows = [...slideRows.querySelectorAll(".slide-row")];
  const text = [], bubble = [], outline = [];
  rows.forEach((row) => {
    text.push(row.querySelector(".text-color").value);
    bubble.push(
      row.querySelector(".bubble-none").checked ? "None" : row.querySelector(".bubble-color").value
    );
    outline.push(
      row.querySelector(".outline-none").checked ? "None" : row.querySelector(".outline-color").value
    );
  });
  return { text, bubble, outline };
}

// ---- generate --------------------------------------------------------------
const genBtn = document.getElementById("generate");
const statusLine = document.getElementById("statusLine");

function setStatus(msg, kind = "") {
  statusLine.textContent = msg;
  statusLine.className = "status-line" + (kind ? " " + kind : "");
}

genBtn.addEventListener("click", async () => {
  const base = apiBase();
  if (!base) return setStatus("Set your Render API address first.", "error");
  if (!captionsInput.files[0]) return setStatus("Add a captions file.", "error");
  if (!document.getElementById("backgrounds").files.length) return setStatus("Add at least one background image.", "error");

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
  fd.append("num_posts", document.getElementById("numPosts").value || "1");
  fd.append("font_size", document.getElementById("fontSize").value || "45");
  fd.append("lock_font_size", document.getElementById("lockSize").checked ? "true" : "false");
  fd.append("random_backgrounds", document.getElementById("randomBg").checked ? "true" : "false");
  fd.append("bubble_words", document.getElementById("bubbleWords").value || "");
  fd.append("bubble_word_text_color", document.getElementById("bwText").value);
  fd.append("bubble_word_fill_color", document.getElementById("bwFill").value);
  const ctaSlide = document.getElementById("ctaSlide").value;
  if (ctaSlide) fd.append("cta_slide", ctaSlide);

  genBtn.disabled = true;
  setStatus("Waking the server and rendering… first run after idle can take ~30s.");
  try {
    const r = await fetch(base + "/generate", { method: "POST", body: fd });
    if (!r.ok) {
      let msg = "Something went wrong.";
      try { msg = (await r.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "slides.zip";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Done — slides.zip downloaded.", "ok");
  } catch (e) {
    setStatus(e.message, "error");
  } finally {
    genBtn.disabled = false;
  }
});
