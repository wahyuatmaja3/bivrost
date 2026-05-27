const state = {
  view: "browser",
  currentPath: "",
  rootName: "Root",
  folders: [],
  media: [],
  currentVideoIndex: -1,
};

const elements = {
  title: document.getElementById("page-title"),
  status: document.getElementById("status"),
  grid: document.getElementById("grid"),
  breadcrumbs: document.getElementById("breadcrumbs"),
  upButton: document.getElementById("up-button"),
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

function openImage(item) {
  elements.lightboxImage.src = item.streamUrl;
  elements.lightboxImage.alt = item.name;
  elements.lightbox.showModal();
}

async function openVideo(index) {
  const current = state.media[index];
  if (!current) return;
  state.currentVideoIndex = index;
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

function closePlayer() {
  const video = elements.fullscreenVideo;
  video.pause();
  video.style.display = "none";
  video.removeAttribute("src");
  video.load();
}

function renderBrowser() {
  elements.title.textContent = `Media Browser ${formatPath(state.currentPath)}`;
  elements.upButton.disabled = !state.currentPath;
  renderBreadcrumbs();
  clearGrid();

  const items = [...state.folders.map(createFolderCard), ...state.media.map(createMediaCard)];
  if (!items.length) {
    renderEmpty("This folder does not contain any supported media yet.");
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

async function loadDirectory(path = "") {
  setStatus("Loading media…");
  try {
    const query = buildQuery(path);
    const data = await fetchJson(`/api/browse${query ? `?${query}` : ""}`);
    state.currentPath = data.path;
    state.rootName = data.rootName || "Root";
    state.folders = data.folders || [];
    state.media = (data.media || []).filter((item) => item.type === "image" || item.type === "video");
    state.view = "browser";
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

elements.lightbox.addEventListener("click", (event) => {
  const rect = elements.lightbox.getBoundingClientRect();
  const inDialog = rect.top <= event.clientY && event.clientY <= rect.bottom && rect.left <= event.clientX && event.clientX <= rect.right;
  if (!inDialog) {
    elements.lightbox.close();
  }
});

elements.fullscreenVideo.addEventListener("ended", () => stepVideo(1));
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    closePlayer();
  }
});

loadDirectory();
