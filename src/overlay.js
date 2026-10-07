// whodid overlay: draws who-built-what rings over elements tagged with `data-who`.
// Framework-agnostic, no dependencies, lives in a Shadow DOM so page CSS can't touch it.

(function whodid() {
  if (typeof window === "undefined" || window.__whodid) return;
  window.__whodid = true;

  const ATTR = "data-who";
  const STORE_KEY = "whodid:v1";
  const ROOT = typeof __WHODID_ROOT__ !== "undefined" ? __WHODID_ROOT__ : "";
  const PALETTE = [
    "#ff5c7a", "#3d9bff", "#2fd38a", "#ffb020",
    "#b46bff", "#00c2c7", "#ff7a2f", "#e4e44a",
  ];

  const state = load({ on: false, collapse: true, hidden: [] });
  const hidden = new Set(state.hidden);
  const parsed = new WeakMap();
  const colors = new Map();

  function load(fallback) {
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
    } catch {
      return fallback;
    }
  }
  function save() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ on: state.on, collapse: state.collapse, hidden: [...hidden] })
      );
    } catch {}
  }

  function info(el) {
    const raw = el.getAttribute(ATTR);
    const cached = parsed.get(el);
    if (cached && cached.raw === raw) return cached;
    let data = null;
    try {
      const [file, start, end, author, email, sha, time, summary, share] = JSON.parse(raw);
      data = { raw, file, start, end, author, email, sha, time, summary, share };
    } catch {}
    parsed.set(el, data);
    return data;
  }

  function colorFor(author) {
    if (!colors.has(author)) colors.set(author, PALETTE[colors.size % PALETTE.length]);
    return colors.get(author);
  }

  function initials(name) {
    const parts = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
    if (!parts[0]) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function ago(unix) {
    if (!unix) return "";
    const s = Date.now() / 1000 - unix;
    const units = [["y", 31536000], ["mo", 2592000], ["d", 86400], ["h", 3600], ["m", 60]];
    for (const [u, n] of units) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
    return "just now";
  }

  // ---------- DOM ----------
  const host = document.createElement("whodid-root");
  host.style.cssText = "position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
      .layer { position: fixed; inset: 0; pointer-events: none; }
      .ring {
        position: fixed; border: 2px solid var(--c); border-radius: 8px;
        background: color-mix(in srgb, var(--c) 7%, transparent);
        transition: opacity .15s;
      }
      .ring.dim { opacity: .15; }
      .badge {
        position: fixed; width: 24px; height: 24px; border-radius: 50%;
        background: var(--c); color: #0b0b0f; font: 700 10px/24px ui-sans-serif, system-ui;
        text-align: center; letter-spacing: .02em; pointer-events: auto; cursor: pointer;
        box-shadow: 0 0 0 2px #0b0b0f, 0 0 0 4px var(--c), 0 4px 12px rgba(0,0,0,.35);
        transition: transform .12s;
      }
      .badge:hover { transform: scale(1.18); }
      .panel {
        position: fixed; right: 16px; bottom: 16px; pointer-events: auto;
        background: #111116f2; color: #ececf1; border: 1px solid #2a2a33;
        border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.45);
        font-size: 12px; min-width: 200px; max-width: 280px; overflow: hidden;
        backdrop-filter: blur(8px);
      }
      .head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; user-select: none; }
      .head b { font-weight: 700; letter-spacing: .02em; }
      .head kbd { margin-left: auto; font: 10px ui-monospace, monospace; color: #8b8b98; border: 1px solid #33333d; border-radius: 4px; padding: 1px 4px; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #555; }
      .on .dot { background: #2fd38a; box-shadow: 0 0 8px #2fd38a; }
      .body { display: none; border-top: 1px solid #23232b; padding: 6px; }
      .on .body { display: block; }
      .row { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 6px; cursor: pointer; }
      .row:hover { background: #1c1c24; }
      .row.off { opacity: .35; }
      .sw { width: 18px; height: 18px; border-radius: 50%; background: var(--c); color: #0b0b0f; font: 700 8px/18px ui-sans-serif, system-ui; text-align: center; flex: none; }
      .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .count { margin-left: auto; color: #8b8b98; font-variant-numeric: tabular-nums; }
      .opt { display: flex; align-items: center; gap: 6px; padding: 6px; color: #a9a9b5; border-top: 1px solid #23232b; margin-top: 4px; cursor: pointer; }
      .empty { padding: 6px; color: #8b8b98; }
      .tip {
        position: fixed; pointer-events: none; display: none; max-width: 320px;
        background: #111116f7; color: #ececf1; border: 1px solid #2a2a33; border-left: 3px solid var(--c);
        border-radius: 8px; padding: 8px 10px; font-size: 12px; line-height: 1.45;
        box-shadow: 0 10px 30px rgba(0,0,0,.45);
      }
      .tip .who { font-weight: 700; }
      .tip .mail, .tip .meta { color: #8b8b98; }
      .tip code { font: 11px ui-monospace, monospace; color: #c9c9d6; }
      .tip .msg { margin-top: 4px; }
      .tip .hint { margin-top: 6px; color: #6d6d7a; font-size: 11px; }
    </style>
    <div class="layer"></div>
    <div class="tip"></div>
    <div class="panel">
      <div class="head"><span class="dot"></span><b>whodid</b><kbd>Alt+W</kbd></div>
      <div class="body"><div class="list"></div>
        <label class="opt"><input type="checkbox" class="collapse"> Merge nested same-author</label>
      </div>
    </div>`;

  const layer = shadow.querySelector(".layer");
  const tip = shadow.querySelector(".tip");
  const panel = shadow.querySelector(".panel");
  const list = shadow.querySelector(".list");
  const collapseBox = shadow.querySelector(".collapse");
  collapseBox.checked = state.collapse;

  const rings = [];
  const badges = [];
  let focused = null;

  function pooled(pool, cls, i) {
    if (!pool[i]) {
      const el = document.createElement("div");
      el.className = cls;
      if (cls === "badge") {
        el.addEventListener("mouseenter", () => showTip(el));
        el.addEventListener("mouseleave", hideTip);
        el.addEventListener("click", () => openInEditor(el._who));
      }
      layer.appendChild(el);
      pool[i] = el;
    }
    pool[i].style.display = "";
    return pool[i];
  }

  function showTip(badge) {
    const d = badge._who;
    if (!d) return;
    focused = d.author;
    tip.style.setProperty("--c", colorFor(d.author));
    tip.innerHTML = "";
    const add = (cls, text, tag = "div") => {
      const el = document.createElement(tag);
      el.className = cls;
      el.textContent = text;
      tip.appendChild(el);
      return el;
    };
    add("who", d.author);
    if (d.email) add("mail", d.email);
    const loc = add("meta", "");
    const code = document.createElement("code");
    code.textContent = `${d.file}:${d.start}-${d.end}`;
    loc.appendChild(code);
    loc.append(`  ·  owns ${Math.round(d.share * 100)}% of lines`);
    add("msg", `“${d.summary}”`);
    add("meta", `${d.sha}  ·  ${ago(d.time)}`);
    if (ROOT) add("hint", "Click to open in VS Code");

    const r = badge.getBoundingClientRect();
    tip.style.display = "block";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.right + 8, y = r.top;
    if (x + w > innerWidth - 8) x = r.left - w - 8;
    if (y + h > innerHeight - 8) y = innerHeight - h - 8;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }

  function hideTip() {
    focused = null;
    tip.style.display = "none";
  }

  function openInEditor(d) {
    if (!d || !ROOT) return;
    location.href = `vscode://file/${ROOT}/${d.file}:${d.start}`;
  }

  // ---------- render loop ----------
  let lastLegend = "";

  function render() {
    const counts = new Map();
    const draw = [];

    for (const el of document.querySelectorAll(`[${ATTR}]`)) {
      const d = info(el);
      if (!d) continue;
      counts.set(d.author, (counts.get(d.author) || 0) + 1);
      if (hidden.has(d.author)) continue;
      if (state.collapse) {
        const parent = el.parentElement && el.parentElement.closest(`[${ATTR}]`);
        const pd = parent && info(parent);
        if (pd && pd.author === d.author && !hidden.has(pd.author)) continue;
      }
      draw.push({ el, d });
    }

    // Read all rects first, then write, to avoid layout thrash.
    const rects = draw.map(({ el }) => el.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < draw.length; i++) {
      const r = rects[i];
      if (r.width < 4 || r.height < 4) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
      const { d } = draw[i];
      const c = colorFor(d.author);

      const ring = pooled(rings, "ring", n);
      ring.style.setProperty("--c", c);
      ring.style.left = `${r.left - 3}px`;
      ring.style.top = `${r.top - 3}px`;
      ring.style.width = `${r.width + 6}px`;
      ring.style.height = `${r.height + 6}px`;
      ring.classList.toggle("dim", focused !== null && focused !== d.author);

      const badge = pooled(badges, "badge", n);
      badge.style.setProperty("--c", c);
      badge.style.left = `${Math.max(2, r.left - 12)}px`;
      badge.style.top = `${Math.max(2, r.top - 12)}px`;
      badge.textContent = initials(d.author);
      badge._who = d;
      n++;
    }
    for (let i = n; i < rings.length; i++) {
      rings[i].style.display = "none";
      badges[i].style.display = "none";
    }

    renderLegend(counts);
  }

  function renderLegend(counts) {
    const authors = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [a] of authors) colorFor(a);
    const key = authors.map(([a, c]) => `${a}:${c}:${hidden.has(a)}`).join("|");
    if (key === lastLegend) return;
    lastLegend = key;

    list.innerHTML = "";
    if (!authors.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No tagged elements on this page.";
      list.appendChild(empty);
      return;
    }
    for (const [author, count] of authors) {
      const row = document.createElement("div");
      row.className = "row" + (hidden.has(author) ? " off" : "");
      row.style.setProperty("--c", colorFor(author));
      row.innerHTML = `<span class="sw"></span><span class="name"></span><span class="count"></span>`;
      row.querySelector(".sw").textContent = initials(author);
      row.querySelector(".name").textContent = author;
      row.querySelector(".count").textContent = count;
      row.title = "Click to show/hide";
      row.addEventListener("click", () => {
        hidden.has(author) ? hidden.delete(author) : hidden.add(author);
        save();
      });
      list.appendChild(row);
    }
  }

  let frame = 0;
  function loop() {
    if (!state.on) return;
    render();
    frame = requestAnimationFrame(loop);
  }

  function setOn(on) {
    state.on = on;
    save();
    panel.classList.toggle("on", on);
    layer.style.display = on ? "" : "none";
    if (!on) hideTip();
    cancelAnimationFrame(frame);
    if (on) loop();
  }

  shadow.querySelector(".head").addEventListener("click", () => setOn(!state.on));
  collapseBox.addEventListener("change", () => {
    state.collapse = collapseBox.checked;
    save();
  });
  addEventListener("keydown", (e) => {
    if (e.altKey && e.code === "KeyW") {
      e.preventDefault();
      setOn(!state.on);
    }
  });

  function mount() {
    document.documentElement.appendChild(host);
    setOn(state.on);
  }
  // Mount after load so the host node never interferes with React hydration.
  if (document.readyState === "complete") setTimeout(mount, 0);
  else addEventListener("load", () => setTimeout(mount, 0));
})();
