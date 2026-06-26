const state = {
  view: "browser",
  currentPath: "",
  rootName: "Root",
  folders: [],
  media: [],
  currentVideoIndex: -1,
  searchQuery: "",
  searchResults: [],
};

const elements = {
  title: document.getElementById("page-title"),
  status: document.getElementById("status"),
  statusText: document.querySelector("#status .status-text"),
  grid: document.getElementById("grid"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  upButton: document.getElementById("up-button"),
  searchInput: document.getElementById("search-input"),
  lightbox: document.getElementById("lightbox"),
  lightboxImage: document.getElementById("lightbox-image"),
  folderTemplate: document.getElementById("folder-card-template"),
  mediaTemplate: document.getElementById("media-card-template"),
  player: document.getElementById("player"),
  playerTopbar: document.getElementById("player-topbar"),
  playerTitle: document.getElementById("player-title"),
  playerBack: document.getElementById("player-back"),
  ctrlPrev: document.getElementById("ctrl-prev"),
  ctrlNext: document.getElementById("ctrl-next"),
};

// ---- Plyr instance (lazy-initialized on first video open) ----
let plyr = null;

function getPlyr() {
  if (plyr) return plyr;
  plyr = new Plyr("#player-video", {
    controls: [
      "play-large",
      "play",
      "rewind",
      "fast-forward",
      "progress",
      "current-time",
      "duration",
      "mute",
      "volume",
      "fullscreen",
    ],
    keyboard: { focused: true, global: false },
    tooltips: { controls: true, seek: true },
    invertTime: false,
    toggleInvert: false,
    fullscreen: { enabled: true, fallback: true, iosNative: true },
    ratio: undefined,
    speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
  });

  plyr.on("ended", () => stepVideo(1));
  plyr.on("enterfullscreen", () => lockOrientationToVideo());
  plyr.on("exitfullscreen", () => unlockOrientation());

  // Sync topbar visibility with Plyr's idle/controls behaviour
  plyr.on("controlshidden", () => {
    if (elements.playerTopbar) elements.playerTopbar.style.opacity = "0";
  });
  plyr.on("controlsshown", () => {
    if (elements.playerTopbar) elements.playerTopbar.style.opacity = "1";
  });

  return plyr;
}

// ---- Utilities ----
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

function buildQuery(path) {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  return params.toString();
}

function setStatus(message) {
  if (elements.statusText) elements.statusText.textContent = message;
  else elements.status.textContent = message;
}

function svgIcon(id, className = "icon") {
  return `<svg class="${className}"><use href="#${id}" /></svg>`;
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function browseSummary() {
  if (!state.folders.length && !state.media.length) return "Empty folder";
  const parts = [];
  if (state.folders.length) parts.push(plural(state.folders.length, "folder"));
  if (state.media.length) parts.push(plural(state.media.length, "media item"));
  return parts.join("  ·  ");
}

// ---- Orientation lock ----
function lockOrientationToVideo() {
  const video = document.getElementById("player-video");
  if (!video || !video.videoWidth || !video.videoHeight) return;
  const target = video.videoHeight > video.videoWidth ? "portrait" : "landscape";
  try { screen.orientation?.lock?.(target).catch(() => {}); } catch {}
}

function unlockOrientation() {
  try { screen.orientation?.unlock?.(); } catch {}
}

// ---- History ----
let mediaHistoryOpen = false;
let tearingDownMedia = false;

function pushMediaHistory() {
  if (mediaHistoryOpen) return;
  mediaHistoryOpen = true;
  history.pushState({ media: true, path: state.currentPath }, "", location.href);
}

function teardownMediaUI() {
  tearingDownMedia = true;
  if (plyr) {
    plyr.pause();
    plyr.source = { type: "video", sources: [] };
  }
  elements.player.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  if (elements.lightbox.open) elements.lightbox.close();
  tearingDownMedia = false;
}

function requestCloseMedia() {
  if (tearingDownMedia) return;
  if (mediaHistoryOpen) history.back();
  else teardownMediaUI();
}

// ---- Grid rendering ----
function clearGrid() { elements.grid.innerHTML = ""; }

function renderSkeletons(count = 10) {
  clearGrid();
  for (let i = 0; i < count; i++) {
    const card = document.createElement("div");
    card.className = "card skeleton";
    card.style.setProperty("--stagger", `${i * 40}ms`);
    card.innerHTML =
      '<div class="thumb"></div>' +
      '<div class="card-body">' +
      '<div class="sk-line"></div>' +
      '<div class="sk-line sk-line--short"></div>' +
      "</div>";
    elements.grid.appendChild(card);
  }
}

function renderBreadcrumbs() {
  const segments = state.currentPath ? state.currentPath.split("/").filter(Boolean) : [];
  const crumbs = [{ label: state.rootName, path: "" }];
  let current = "";
  for (const seg of segments) {
    current = current ? `${current}/${seg}` : seg;
    crumbs.push({ label: seg, path: current });
  }
  elements.breadcrumbs.innerHTML = "";
  crumbs.forEach((crumb, index) => {
    const isCurrent = index === crumbs.length - 1;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isCurrent ? "crumb is-current" : "crumb";
    btn.innerHTML =
      index === 0
        ? `${svgIcon("ico-folder")}<span>${crumb.label}</span>`
        : crumb.label;
    btn.addEventListener("click", () => loadDirectory(crumb.path));
    elements.breadcrumbs.appendChild(btn);
    if (!isCurrent) {
      const sep = document.createElement("span");
      sep.className = "crumb-sep";
      sep.innerHTML = svgIcon("ico-chevron");
      elements.breadcrumbs.appendChild(sep);
    }
  });
}

function renderEmpty(message, title = "Nothing here yet") {
  clearGrid();
  const el = document.createElement("div");
  el.className = "empty-state";
  el.innerHTML =
    svgIcon("ico-image", "icon empty-glyph") +
    `<h3>${title}</h3>` +
    `<p>${message}</p>`;
  elements.grid.appendChild(el);
}

function createFolderCard(folder) {
  const node = elements.folderTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".card-title").textContent = folder.name;
  node.addEventListener("click", () => loadDirectory(folder.relativePath));
  return node;
}

function createMediaCard(item, index) {
  const node = elements.mediaTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".card-title").textContent = item.name;
  const meta = node.querySelector(".card-meta");
  meta.innerHTML =
    svgIcon(item.type === "image" ? "ico-image" : "ico-play", "icon meta-icon") +
    `<span>${item.extension.replace(".", "").toUpperCase()}</span>`;
  const badge = node.querySelector(".badge");
  badge.textContent = item.type;
  badge.dataset.type = item.type;

  const overlay = node.querySelector(".play-overlay");
  if (overlay && item.type !== "video") overlay.remove();

  const image = node.querySelector("img");
  const thumb = node.querySelector(".thumb");
  image.dataset.loaded = "false";
  image.addEventListener("load", () => {
    image.dataset.loaded = "true";
    if (image.naturalHeight > image.naturalWidth) thumb.classList.add("is-portrait");
  });
  image.addEventListener("error", () => { image.dataset.loaded = "true"; });
  image.src = item.thumbnailUrl;
  image.alt = item.name;

  node.addEventListener("click", () => {
    if (item.type === "image") { openImage(item); return; }
    openVideo(index);
  });
  return node;
}

function openImage(item) {
  elements.lightboxImage.src = item.streamUrl;
  elements.lightboxImage.alt = item.name;
  elements.lightbox.showModal();
  pushMediaHistory();
}

// ---- Video player ----
function videoIndices() {
  return state.media.reduce((acc, item, i) => {
    if (item.type === "video") acc.push(i);
    return acc;
  }, []);
}

function updateNavButtons() {
  const order = videoIndices();
  const pos = order.indexOf(state.currentVideoIndex);
  elements.ctrlPrev.disabled = pos <= 0;
  elements.ctrlNext.disabled = pos === -1 || pos >= order.length - 1;
}

function stepVideo(delta) {
  const order = videoIndices();
  const pos = order.indexOf(state.currentVideoIndex);
  if (pos === -1) return;
  const next = pos + delta;
  if (next < 0 || next >= order.length) return;
  openVideo(order[next]);
}

async function openVideo(index) {
  const current = state.media[index];
  if (!current || current.type !== "video") return;
  state.currentVideoIndex = index;
  pushMediaHistory();

  elements.player.hidden = false;
  elements.playerTitle.textContent = current.name;
  updateNavButtons();

  const p = getPlyr();
  p.source = {
    type: "video",
    sources: [{ src: current.streamUrl, type: `video/${current.extension.replace(".", "")}` }],
  };

  try { await p.play(); } catch {}
}

// ---- Browser view ----
function renderBrowser() {
  const segments = state.currentPath ? state.currentPath.split("/").filter(Boolean) : [];
  elements.title.textContent = segments.length ? segments[segments.length - 1] : "Bivröst";
  elements.upButton.disabled = !state.currentPath;
  renderBreadcrumbs();
  clearGrid();

  const items = state.searchQuery
    ? state.searchResults.map(createSearchResultCard)
    : [...state.folders.map(createFolderCard), ...state.media.map(createMediaCard)];

  if (!items.length) {
    renderEmpty(
      state.searchQuery
        ? "No files or folders match your search in this location."
        : "This folder doesn't contain any supported media yet.",
      state.searchQuery ? "No matches found" : "Empty folder"
    );
    return;
  }

  items.forEach((item, index) => {
    item.style.setProperty("--stagger", `${Math.min(index * 35, 600)}ms`);
    elements.grid.appendChild(item);
  });
}

function createSearchResultCard(item) {
  if (item.type === "folder") return createFolderCard(item);
  const node = elements.folderTemplate.content.firstElementChild.cloneNode(true);
  const glyph = node.querySelector(".thumb-glyph use");
  if (glyph) glyph.setAttribute("href", "#ico-file");
  node.querySelector(".card-title").textContent = item.name;
  node.querySelector(".card-meta").innerHTML =
    svgIcon("ico-file", "icon meta-icon") + "<span>File</span>";
  return node;
}

async function searchEntries(queryText) {
  state.searchQuery = queryText.trim();
  if (!state.searchQuery) {
    state.searchResults = [];
    setStatus(browseSummary());
    renderBrowser();
    return;
  }
  setStatus("Searching…");
  try {
    const params = new URLSearchParams();
    params.set("path", state.currentPath);
    params.set("q", state.searchQuery);
    const data = await fetchJson(`/api/search?${params.toString()}`);
    state.searchResults = data.results || [];
    setStatus(`${plural(state.searchResults.length, "result")} for "${state.searchQuery}"`);
    renderBrowser();
  } catch (error) {
    setStatus(error.message || "Search failed.");
    renderEmpty("Unable to search this folder.");
  }
}

async function loadDirectory(path = "", { pushHistory = true } = {}) {
  setStatus("Loading media…");
  renderSkeletons();
  try {
    const query = buildQuery(path);
    const data = await fetchJson(`/api/browse${query ? `?${query}` : ""}`);
    if (pushHistory) {
      const url = data.path ? `?${buildQuery(data.path)}` : location.pathname;
      history.pushState({ path: data.path }, "", url);
    }
    state.currentPath = data.path;
    state.rootName = data.rootName || "Root";
    state.folders = data.folders || [];
    state.media = (data.media || []).filter((i) => i.type === "image" || i.type === "video");
    state.view = "browser";
    state.searchQuery = "";
    state.searchResults = [];
    elements.searchInput.value = "";
    setStatus(browseSummary());
    renderBrowser();
  } catch (error) {
    setStatus(error.message || "Failed to load media.");
    renderEmpty("Unable to load folder contents.");
  }
}

// ---- Event wiring ----
elements.upButton.addEventListener("click", () => {
  if (!state.currentPath) return;
  const parts = state.currentPath.split("/").filter(Boolean);
  parts.pop();
  loadDirectory(parts.join("/"));
});

elements.searchInput.addEventListener("input", (e) => searchEntries(e.target.value));

elements.lightbox.addEventListener("click", (e) => {
  const rect = elements.lightbox.getBoundingClientRect();
  const inside =
    rect.top <= e.clientY && e.clientY <= rect.bottom &&
    rect.left <= e.clientX && e.clientX <= rect.right;
  if (!inside) requestCloseMedia();
});
elements.lightbox.addEventListener("close", () => requestCloseMedia());

elements.playerBack.addEventListener("click", () => requestCloseMedia());
elements.ctrlPrev.addEventListener("click", () => stepVideo(-1));
elements.ctrlNext.addEventListener("click", () => stepVideo(1));

// Global keyboard (Escape to close, N/P for prev/next)
document.addEventListener("keydown", (e) => {
  if (elements.player.hidden) return;
  if (e.target instanceof HTMLInputElement) return;
  switch (e.key) {
    case "Escape":
      if (!document.fullscreenElement) requestCloseMedia();
      break;
    case "n": stepVideo(1); break;
    case "p": stepVideo(-1); break;
  }
});

window.addEventListener("popstate", (e) => {
  const newState = e.state;
  if (mediaHistoryOpen && !newState?.media) {
    mediaHistoryOpen = false;
    teardownMediaUI();
    return;
  }
  if (newState?.media) return;
  const path = newState?.path ?? new URLSearchParams(location.search).get("path") ?? "";
  loadDirectory(path, { pushHistory: false });
});

const initialPath = new URLSearchParams(location.search).get("path") || "";
loadDirectory(initialPath, { pushHistory: false });
history.replaceState({ path: initialPath }, "", location.href);
