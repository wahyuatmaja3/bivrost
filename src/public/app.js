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
  fullscreenVideo: document.getElementById("fullscreen-video"),
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
  image.dataset.loaded = "false";
  image.addEventListener("load", () => {
    image.dataset.loaded = "true";
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
  const video = elements.fullscreenVideo;
  video.pause();
  video.style.display = "none";
  video.removeAttribute("src");
  video.load();
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

async function openVideo(index) {
  const current = state.media[index];
  if (!current) return;
  state.currentVideoIndex = index;
  pushMediaHistory();
  const video = elements.fullscreenVideo;
  video.src = current.streamUrl;
  video.style.display = "block";
  try {
    if (video.requestFullscreen) {
      await video.requestFullscreen();
    }
  } catch {}
  try {
    await video.play();
  } catch {}
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

function renderPlayer() {}

function stepVideo(delta) {
  const nextIndex = state.currentVideoIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.media.length) return;
  openVideo(nextIndex);
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

elements.fullscreenVideo.addEventListener("ended", () => stepVideo(1));
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && elements.fullscreenVideo.style.display !== "none") {
    requestCloseMedia();
  }
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
