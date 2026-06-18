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

function formatPath(path) {
  return path || "/";
}

function buildQuery(path) {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  return params.toString();
}

function setStatus(message) {
  elements.status.textContent = message;
}

function clearGrid() {
  elements.grid.innerHTML = "";
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "crumb";
    button.textContent = crumb.label;
    button.addEventListener("click", () => loadDirectory(crumb.path));
    elements.breadcrumbs.appendChild(button);

    if (index < crumbs.length - 1) {
      const separator = document.createElement("span");
      separator.textContent = "/";
      separator.style.color = "#64748b";
      elements.breadcrumbs.appendChild(separator);
    }
  });
}

function renderEmpty(message) {
  clearGrid();
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
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
  node.querySelector(".card-meta").textContent = item.extension.toUpperCase();
  node.querySelector(".badge").textContent = item.type;
  const image = node.querySelector("img");
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
  node.querySelector(".thumb").textContent = "📄";
  node.querySelector(".card-title").textContent = item.name;
  node.querySelector(".card-meta").textContent = "File";
  return node;
}

function renderBrowser() {
  elements.title.textContent = `Media Browser ${formatPath(state.currentPath)}`;
  elements.upButton.disabled = !state.currentPath;
  renderBreadcrumbs();
  clearGrid();

  const items = state.searchQuery
    ? state.searchResults.map(createSearchResultCard)
    : [...state.folders.map(createFolderCard), ...state.media.map(createMediaCard)];

  if (!items.length) {
    renderEmpty(
      state.searchQuery
        ? "No matching files or folders in this location."
        : "This folder does not contain any supported media yet.",
    );
    return;
  }

  items.forEach((item) => elements.grid.appendChild(item));
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
    setStatus(`${state.folders.length} folders, ${state.media.length} media items`);
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
    setStatus(`${state.searchResults.length} results`);
    renderBrowser();
  } catch (error) {
    setStatus(error.message || "Search failed.");
    renderEmpty("Unable to search this folder.");
  }
}

async function loadDirectory(path = "", { pushHistory = true } = {}) {
  setStatus("Loading media…");
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
    setStatus(`${state.folders.length} folders, ${state.media.length} media items`);
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
