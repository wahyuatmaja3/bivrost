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
  playerVideo: document.getElementById("player-video"),
  playerTitle: document.getElementById("player-title"),
  playerBack: document.getElementById("player-back"),
  playerBigplay: document.getElementById("player-bigplay"),
  playerSpinner: document.getElementById("player-spinner"),
  playerTouch: document.getElementById("player-touch"),
  rippleBack: document.getElementById("ripple-back"),
  rippleFwd: document.getElementById("ripple-fwd"),
  progress: document.getElementById("player-progress"),
  progressBuffer: document.getElementById("progress-buffer"),
  progressPlayed: document.getElementById("progress-played"),
  ctrlPrev: document.getElementById("ctrl-prev"),
  ctrlPlay: document.getElementById("ctrl-play"),
  ctrlNext: document.getElementById("ctrl-next"),
  ctrlMute: document.getElementById("ctrl-mute"),
  ctrlVolume: document.getElementById("ctrl-volume"),
  ctrlFullscreen: document.getElementById("ctrl-fullscreen"),
  timeCurrent: document.getElementById("time-current"),
  timeDuration: document.getElementById("time-duration"),
};

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

function buildQuery(path) {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  return params.toString();
}

function setStatus(message) {
  if (elements.statusText) {
    elements.statusText.textContent = message;
  } else {
    elements.status.textContent = message;
  }
}

function svgIcon(id, className = "icon") {
  return `<svg class="${className}"><use href="#${id}" /></svg>`;
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function browseSummary() {
  if (!state.folders.length && !state.media.length) {
    return "Empty folder";
  }
  const parts = [];
  if (state.folders.length) parts.push(plural(state.folders.length, "folder"));
  if (state.media.length) parts.push(plural(state.media.length, "media item"));
  return parts.join("  ·  ");
}

function clearGrid() {
  elements.grid.innerHTML = "";
}

function renderSkeletons(count = 10) {
  clearGrid();
  for (let i = 0; i < count; i += 1) {
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

  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    crumbs.push({ label: segment, path: current });
  }

  elements.breadcrumbs.innerHTML = "";
  crumbs.forEach((crumb, index) => {
    const isCurrent = index === crumbs.length - 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = isCurrent ? "crumb is-current" : "crumb";
    if (index === 0) {
      button.innerHTML = `${svgIcon("ico-folder")}<span>${crumb.label}</span>`;
    } else {
      button.textContent = crumb.label;
    }
    button.addEventListener("click", () => loadDirectory(crumb.path));
    elements.breadcrumbs.appendChild(button);

    if (!isCurrent) {
      const separator = document.createElement("span");
      separator.className = "crumb-sep";
      separator.innerHTML = svgIcon("ico-chevron");
      elements.breadcrumbs.appendChild(separator);
    }
  });
}

function renderEmpty(message, title = "Nothing here yet") {
  clearGrid();
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML =
    svgIcon("ico-image", "icon empty-glyph") +
    `<h3>${title}</h3>` +
    `<p>${message}</p>`;
  elements.grid.appendChild(empty);
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

  // Play overlay belongs only to videos.
  const overlay = node.querySelector(".play-overlay");
  if (overlay && item.type !== "video") {
    overlay.remove();
  }

  const image = node.querySelector("img");
  const thumb = node.querySelector(".thumb");
  image.dataset.loaded = "false";
  image.addEventListener("load", () => {
    image.dataset.loaded = "true";
    // Detect portrait thumbnails and flag the container
    if (image.naturalHeight > image.naturalWidth) {
      thumb.classList.add("is-portrait");
    }
  });
  image.addEventListener("error", () => {
    image.dataset.loaded = "true";
  });
  image.src = item.thumbnailUrl;
  image.alt = item.name;

  node.addEventListener("click", () => {
    if (item.type === "image") {
      openImage(item);
      return;
    }
    openVideo(index);
  });
  return node;
}

let mediaHistoryOpen = false;
let tearingDownMedia = false;

function pushMediaHistory() {
  if (mediaHistoryOpen) return;
  mediaHistoryOpen = true;
  history.pushState({ media: true, path: state.currentPath }, "", location.href);
}

function teardownMediaUI() {
  tearingDownMedia = true;
  const video = elements.playerVideo;
  video.pause();
  video.removeAttribute("src");
  video.load();
  elements.player.hidden = true;
  elements.player.classList.remove("is-playing", "is-idle");
  stopIdleTimer();
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
  if (elements.lightbox.open) {
    elements.lightbox.close();
  }
  tearingDownMedia = false;
}

// A UI dismissal (close button, backdrop, ESC, fullscreen exit) pops the
// history entry we pushed so the URL/history stay in sync; popstate then
// performs the actual teardown.
function requestCloseMedia() {
  if (tearingDownMedia) return;
  if (mediaHistoryOpen) {
    history.back();
  } else {
    teardownMediaUI();
  }
}

function openImage(item) {
  elements.lightboxImage.src = item.streamUrl;
  elements.lightboxImage.alt = item.name;
  elements.lightbox.showModal();
  pushMediaHistory();
}

function videoIndices() {
  return state.media.reduce((acc, item, index) => {
    if (item.type === "video") acc.push(index);
    return acc;
  }, []);
}

function updateNavButtons() {
  const order = videoIndices();
  const pos = order.indexOf(state.currentVideoIndex);
  elements.ctrlPrev.disabled = pos <= 0;
  elements.ctrlNext.disabled = pos === -1 || pos >= order.length - 1;
}

async function openVideo(index) {
  const current = state.media[index];
  if (!current || current.type !== "video") return;
  state.currentVideoIndex = index;
  pushMediaHistory();

  const video = elements.playerVideo;
  elements.player.hidden = false;
  elements.player.classList.remove("is-playing");
  elements.playerTitle.textContent = current.name;
  elements.playerSpinner.hidden = false;
  video.src = current.streamUrl;
  video.load();
  updateNavButtons();
  setPlayIcon(false);
  showControls();
  kickIdleTimer();

  try {
    await video.play();
  } catch {}
}

function setPlayIcon(isPlaying) {
  const useEl = elements.ctrlPlay.querySelector("use");
  useEl.setAttribute("href", isPlaying ? "#ico-pause" : "#ico-play");
  elements.ctrlPlay.dataset.mode = isPlaying ? "pause" : "play";
  elements.ctrlPlay.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

function setMuteIcon() {
  const video = elements.playerVideo;
  const muted = video.muted || video.volume === 0;
  elements.ctrlMute.querySelector("use").setAttribute("href", muted ? "#ico-mute" : "#ico-volume");
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function togglePlay() {
  const video = elements.playerVideo;
  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
}

function seekBy(delta) {
  const video = elements.playerVideo;
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Math.min(Math.max(0, video.currentTime + delta), video.duration);
}

function flashRipple(forward) {
  const ripple = forward ? elements.rippleFwd : elements.rippleBack;
  ripple.classList.remove("flash");
  void ripple.offsetWidth;
  ripple.classList.add("flash");
}

function lockOrientationToVideo() {
  const video = elements.playerVideo;
  if (!video.videoWidth || !video.videoHeight) return;
  const target = video.videoHeight > video.videoWidth ? "portrait" : "landscape";
  try {
    screen.orientation?.lock?.(target).catch(() => {});
  } catch {}
}

function unlockOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {}
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await elements.player.requestFullscreen();
      lockOrientationToVideo();
    }
  } catch {}
}

// ---- Auto-hide controls ----
let idleTimer = null;

function stopIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function showControls() {
  elements.player.classList.remove("is-idle");
}

function kickIdleTimer() {
  showControls();
  stopIdleTimer();
  idleTimer = setTimeout(() => {
    if (!elements.playerVideo.paused) {
      elements.player.classList.add("is-idle");
    }
  }, 2800);
}

function createSearchResultCard(item) {
  if (item.type === "folder") {
    return createFolderCard(item);
  }

  const node = elements.folderTemplate.content.firstElementChild.cloneNode(true);
  const glyph = node.querySelector(".thumb-glyph use");
  if (glyph) glyph.setAttribute("href", "#ico-file");
  node.querySelector(".card-title").textContent = item.name;
  node.querySelector(".card-meta").innerHTML =
    svgIcon("ico-file", "icon meta-icon") + "<span>File</span>";
  return node;
}

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
    if (state.searchQuery) {
      renderEmpty(
        "No files or folders match your search in this location.",
        "No matches found",
      );
    } else {
      renderEmpty(
        "This folder doesn't contain any supported media yet.",
        "Empty folder",
      );
    }
    return;
  }

  items.forEach((item, index) => {
    item.style.setProperty("--stagger", `${Math.min(index * 35, 600)}ms`);
    elements.grid.appendChild(item);
  });
}

function stepVideo(delta) {
  const order = videoIndices();
  const pos = order.indexOf(state.currentVideoIndex);
  if (pos === -1) return;
  const nextPos = pos + delta;
  if (nextPos < 0 || nextPos >= order.length) return;
  openVideo(order[nextPos]);
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
    setStatus(`${plural(state.searchResults.length, "result")} for “${state.searchQuery}”`);
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
    state.media = (data.media || []).filter((item) => item.type === "image" || item.type === "video");
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

elements.upButton.addEventListener("click", () => {
  if (!state.currentPath) return;
  const parts = state.currentPath.split("/").filter(Boolean);
  parts.pop();
  loadDirectory(parts.join("/"));
});

elements.searchInput.addEventListener("input", (event) => {
  searchEntries(event.target.value);
});

elements.lightbox.addEventListener("click", (event) => {
  const rect = elements.lightbox.getBoundingClientRect();
  const inDialog = rect.top <= event.clientY && event.clientY <= rect.bottom && rect.left <= event.clientX && event.clientX <= rect.right;
  if (!inDialog) {
    requestCloseMedia();
  }
});

// Fires for the ✕ button, ESC, and programmatic close.
elements.lightbox.addEventListener("close", () => requestCloseMedia());

// ---- Player wiring ----
const video = elements.playerVideo;

video.addEventListener("play", () => {
  elements.player.classList.add("is-playing");
  setPlayIcon(true);
  kickIdleTimer();
});
video.addEventListener("pause", () => {
  elements.player.classList.remove("is-playing");
  setPlayIcon(false);
  showControls();
  stopIdleTimer();
});
video.addEventListener("waiting", () => {
  elements.playerSpinner.hidden = false;
});
video.addEventListener("playing", () => {
  elements.playerSpinner.hidden = true;
});
video.addEventListener("canplay", () => {
  elements.playerSpinner.hidden = true;
});
video.addEventListener("loadedmetadata", () => {
  elements.timeDuration.textContent = formatTime(video.duration);
});
video.addEventListener("timeupdate", () => {
  if (scrubbing) return;
  const ratio = video.duration ? video.currentTime / video.duration : 0;
  elements.progressPlayed.style.width = `${ratio * 100}%`;
  elements.timeCurrent.textContent = formatTime(video.currentTime);
});
video.addEventListener("progress", () => {
  if (!video.buffered.length || !video.duration) return;
  const end = video.buffered.end(video.buffered.length - 1);
  elements.progressBuffer.style.width = `${(end / video.duration) * 100}%`;
});
video.addEventListener("volumechange", () => {
  elements.ctrlVolume.value = video.muted ? 0 : video.volume;
  setMuteIcon();
});
video.addEventListener("ended", () => stepVideo(1));

elements.ctrlPlay.addEventListener("click", togglePlay);
elements.playerBigplay.addEventListener("click", togglePlay);
elements.ctrlPrev.addEventListener("click", () => stepVideo(-1));
elements.ctrlNext.addEventListener("click", () => stepVideo(1));
elements.playerBack.addEventListener("click", () => requestCloseMedia());
elements.ctrlFullscreen.addEventListener("click", toggleFullscreen);

elements.ctrlMute.addEventListener("click", () => {
  video.muted = !video.muted;
});
elements.ctrlVolume.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  video.volume = value;
  video.muted = value === 0;
});

// Tap to toggle controls / play; double-tap sides to seek.
let lastTap = 0;
let tapTimer = null;
elements.playerTouch.addEventListener("click", (event) => {
  const now = Date.now();
  const rect = elements.playerTouch.getBoundingClientRect();
  const forward = event.clientX - rect.left > rect.width / 2;

  if (now - lastTap < 300) {
    clearTimeout(tapTimer);
    lastTap = 0;
    seekBy(forward ? 10 : -10);
    flashRipple(forward);
    kickIdleTimer();
    return;
  }

  lastTap = now;
  tapTimer = setTimeout(() => {
    if (elements.player.classList.contains("is-idle")) {
      kickIdleTimer();
    } else if (video.paused) {
      togglePlay();
    } else {
      elements.player.classList.add("is-idle");
    }
  }, 280);
});

elements.player.addEventListener("mousemove", () => kickIdleTimer());

// Scrubbing
let scrubbing = false;

function seekFromPointer(clientX) {
  const rect = elements.progress.getBoundingClientRect();
  const ratio = Math.min(Math.max(0, (clientX - rect.left) / rect.width), 1);
  if (Number.isFinite(video.duration)) {
    elements.progressPlayed.style.width = `${ratio * 100}%`;
    elements.timeCurrent.textContent = formatTime(ratio * video.duration);
    return ratio;
  }
  return null;
}

elements.progress.addEventListener("pointerdown", (event) => {
  scrubbing = true;
  elements.progress.classList.add("is-scrubbing");
  elements.progress.setPointerCapture(event.pointerId);
  seekFromPointer(event.clientX);
  showControls();
});
elements.progress.addEventListener("pointermove", (event) => {
  if (scrubbing) seekFromPointer(event.clientX);
});
elements.progress.addEventListener("pointerup", (event) => {
  if (!scrubbing) return;
  scrubbing = false;
  elements.progress.classList.remove("is-scrubbing");
  const ratio = seekFromPointer(event.clientX);
  if (ratio !== null) video.currentTime = ratio * video.duration;
  kickIdleTimer();
});

// Keyboard shortcuts (desktop)
document.addEventListener("keydown", (event) => {
  if (elements.player.hidden) return;
  if (event.target instanceof HTMLInputElement) return;
  switch (event.key) {
    case " ":
    case "k":
      event.preventDefault();
      togglePlay();
      break;
    case "ArrowRight":
      seekBy(5);
      flashRipple(true);
      kickIdleTimer();
      break;
    case "ArrowLeft":
      seekBy(-5);
      flashRipple(false);
      kickIdleTimer();
      break;
    case "ArrowUp":
      event.preventDefault();
      video.volume = Math.min(1, video.volume + 0.1);
      video.muted = false;
      break;
    case "ArrowDown":
      event.preventDefault();
      video.volume = Math.max(0, video.volume - 0.1);
      break;
    case "m":
      video.muted = !video.muted;
      break;
    case "f":
      toggleFullscreen();
      break;
    case "n":
      stepVideo(1);
      break;
    case "p":
      stepVideo(-1);
      break;
    case "Escape":
      if (!document.fullscreenElement) requestCloseMedia();
      break;
    default:
      break;
  }
});

document.addEventListener("fullscreenchange", () => {
  const useEl = elements.ctrlFullscreen.querySelector("use");
  useEl.setAttribute("href", document.fullscreenElement ? "#ico-compress" : "#ico-expand");
  if (!document.fullscreenElement) unlockOrientation();
});

window.addEventListener("popstate", (event) => {
  const newState = event.state;
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
