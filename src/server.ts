import compression from "compression";
import cors from "cors";
import express from "express";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import mime from "mime-types";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import qrcode from "qrcode-terminal";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const PUBLIC_DIR = path.resolve(__dirname, "..", "src", "public");
const THUMB_DIR = path.join(os.tmpdir(), "bivrost-thumbs");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".mov", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]);

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

app.use(compression());
app.use(cors());

// App files (HTML/JS/CSS): no-cache so browsers always revalidate via ETag.
// ETag makes unchanged files return 304 with no body — still fast.
const STATIC_OPTS = { maxAge: 0, etag: true, lastModified: true, setHeaders(res: import("http").ServerResponse) {
  res.setHeader("Cache-Control", "no-cache");
}};
app.use(express.static(PUBLIC_DIR, STATIC_OPTS));
app.use("/plyr", express.static(
  path.resolve(__dirname, "..", "node_modules", "plyr", "dist"),
  { maxAge: "7d", immutable: true }
));

function normalizeRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
}

function resolveSafePath(rootDir: string, relativePath = "") {
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(rootDir, normalized);
  const safeRoot = path.resolve(rootDir);

  if (resolved !== safeRoot && !resolved.startsWith(`${safeRoot}${path.sep}`)) {
    throw new Error("Invalid path");
  }

  return resolved;
}

function toMediaType(extension: string) {
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return null;
}

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

async function ensureThumbDir() {
  await fsp.mkdir(THUMB_DIR, { recursive: true });
}

async function ensureVideoThumbnail(filePath: string, cacheKey: string) {
  await ensureThumbDir();
  const target = path.join(THUMB_DIR, `${cacheKey}.jpg`);

  try {
    await fsp.access(target, fs.constants.F_OK);
    return target;
  } catch {}

  await new Promise<void>((resolve, reject) => {
    ffmpeg(filePath)
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .screenshots({
        timestamps: [5],
        filename: `${cacheKey}.jpg`,
        folder: THUMB_DIR,
        size: "480x?",
      });
  });

  return target;
}

function createCacheKey(relativePath: string) {
  return Buffer.from(relativePath).toString("base64url");
}


type AppState = {
  rootDir: string;
  rootName: string;
};

function getLanAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}

function getRootFromArgs(): string | null {
  const arg = process.argv[2];
  if (arg) {
    return path.resolve(arg);
  }
  return null;
}

async function promptRootDirectory(): Promise<AppState> {
  const fromArg = getRootFromArgs();
  if (fromArg) {
    try {
      const stat = await fsp.stat(fromArg);
      if (!stat.isDirectory()) {
          throw new Error("Path must be a folder.");

      }
      return { rootDir: fromArg, rootName: path.basename(fromArg) };
    } catch (e) {
      console.error("Invalid argument path, switching to manual input.");
    }
  }
  const rl = readline.createInterface({ input, output });

  try {
    const answer = (await rl.question("Enter the media folder path to share: ")).trim();
    if (!answer) {
        throw new Error("A folder path is required.");

    }

    const rootDir = path.resolve(answer);
    const stat = await fsp.stat(rootDir);
    if (!stat.isDirectory()) {
        throw new Error("Path must be a folder.");

    }

    return {
      rootDir,
      rootName: path.basename(rootDir) || rootDir,
    };
  } finally {
    rl.close();
  }
}

function installRoutes(state: AppState) {
  app.get("/api/browse", async (req, res) => {
    try {
      const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
      const directoryPath = resolveSafePath(state.rootDir, requestedPath);
      const directoryEntries = await fsp.readdir(directoryPath, { withFileTypes: true });

      const folders = sortByName(
        directoryEntries
          .filter((entry) => entry.isDirectory())
          .map((entry) => {
            const relativePath = normalizeRelativePath(path.relative(state.rootDir, path.join(directoryPath, entry.name)));
            return {
              name: entry.name,
              relativePath,
            };
          }),
      );

      const media = sortByName(
        directoryEntries
          .filter((entry) => entry.isFile())
          .map((entry) => {
            const extension = path.extname(entry.name).toLowerCase();
            const type = toMediaType(extension);
            if (!type || !ALLOWED_EXTENSIONS.has(extension)) {
              return null;
            }

            const relativePath = normalizeRelativePath(path.relative(state.rootDir, path.join(directoryPath, entry.name)));
            const encodedPath = encodeURIComponent(relativePath);
            return {
              name: entry.name,
              relativePath,
              extension,
              type,
              thumbnailUrl: type === "image" ? `/api/file?path=${encodedPath}` : `/api/thumbnail?path=${encodedPath}`,
              streamUrl: type === "image" ? `/api/file?path=${encodedPath}` : `/api/stream?path=${encodedPath}`,
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      );

      res.json({
        rootName: state.rootName,
        path: normalizeRelativePath(requestedPath),
        folders,
        media,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Browse failed" });
    }
  });

  app.get("/api/file", async (req, res) => {
    try {
      const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
      const filePath = resolveSafePath(state.rootDir, relativePath);
      const extension = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        res.status(404).end();
        return;
      }

      const contentType = mime.lookup(filePath) || "application/octet-stream";
      res.type(contentType);
      fs.createReadStream(filePath).on("error", () => { if (!res.headersSent) res.status(404).end(); }).pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/thumbnail", async (req, res) => {
    try {
      const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
      const filePath = resolveSafePath(state.rootDir, relativePath);
      const extension = path.extname(filePath).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) {
        res.status(404).end();
        return;
      }

      const cacheKey = createCacheKey(relativePath);

      // Return 304 Not Modified if client already has this thumbnail cached
      const etag = `"${cacheKey}"`;
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      const thumbnailPath = await ensureVideoThumbnail(filePath, cacheKey);
      await fsp.access(thumbnailPath, fs.constants.F_OK);
      res.set({
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, immutable", // 7 days
        "ETag": etag,
      });
      fs.createReadStream(thumbnailPath)
        .on("error", () => { if (!res.headersSent) res.status(404).end(); })
        .pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/stream", async (req, res) => {
    try {
      const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
      const filePath = resolveSafePath(state.rootDir, relativePath);
      const extension = path.extname(filePath).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) {
        res.status(404).end();
        return;
      }

      const stat = await fsp.stat(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;
      const contentType = mime.lookup(filePath) || "video/mp4";

      if (!range) {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
        });
        fs.createReadStream(filePath).on("error", () => { if (!res.headersSent) res.status(404).end(); }).pipe(res);
        return;
      }

      const [startText, endText] = range.replace(/bytes=/, "").split("-");
      const start = Number(startText);
      const end = endText ? Number(endText) : fileSize - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end >= fileSize || start > end) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
      });

      fs.createReadStream(filePath, { start, end }).on("error", () => { if (!res.headersSent) res.status(404).end(); }).pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
      const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
      const directoryPath = resolveSafePath(state.rootDir, relativePath);
      const entries = await fsp.readdir(directoryPath, { withFileTypes: true });
      const results = entries
        .filter((entry) => entry.name.toLowerCase().includes(query))
        .map((entry) => {
          const rel = normalizeRelativePath(
            path.relative(state.rootDir, path.join(directoryPath, entry.name)),
          );
          return {
            name: entry.name,
            relativePath: rel,
            type: entry.isDirectory() ? "folder" : "file",
          };
        });
      res.json({ results });
    } catch (error) {
      res
        .status(400)
        .json({ error: error instanceof Error ? error.message : "Search failed" });
    }
  });
}

async function chooseLanAddress(addresses: string[]): Promise<string | null> {
  if (!addresses.length) return null;
  if (addresses.length === 1) return addresses[0] ?? null;

  console.log("Multiple network addresses found. Which one is your Wi-Fi?");
  addresses.forEach((address, index) => {
    console.log(`  [${index + 1}] http://${address}:${PORT}`);
  });

  const rl = readline.createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question(`Select address [1-${addresses.length}] (default 1): `)).trim();
      if (!answer) return addresses[0] ?? null;
      const choice = Number(answer);
      if (Number.isInteger(choice) && choice >= 1 && choice <= addresses.length) {
        return addresses[choice - 1] ?? null;
      }
      console.log("Invalid choice, try again.");
    }
  } finally {
    rl.close();
  }
}

async function start() {
  const state = await promptRootDirectory();
  installRoutes(state);

  await new Promise<void>((resolve) => {
    app.listen(PORT, "0.0.0.0", () => resolve());
  });

  console.log("");
  console.log(`Bivrost running. Folder shared: ${state.rootDir}`);
  console.log("");
  console.log("Open on this laptop:");
  console.log(`  http://localhost:${PORT}`);
  console.log("");

  const lanAddresses = getLanAddresses();
  const selected = await chooseLanAddress(lanAddresses);

  if (!selected) {
    console.log("No LAN address found — make sure Wi-Fi is connected.");
    console.log("");
    return;
  }

  const phoneUrl = `http://${selected}:${PORT}`;
  console.log("");
  console.log("Scan this QR with your phone (same Wi-Fi):");
  console.log(`  ${phoneUrl}`);
  console.log("");
  qrcode.generate(phoneUrl, { small: true });
  console.log("");
}

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
