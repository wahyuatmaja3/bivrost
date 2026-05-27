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

const app = express();
const PORT = Number(process.env.PORT || 5000);
const PUBLIC_DIR = path.join(__dirname, "public");
const THUMB_DIR = path.join(os.tmpdir(), "bivrost-thumbs");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".mov", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]);

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

app.use(cors());
app.use(express.static(PUBLIC_DIR));

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

async function promptRootDirectory(): Promise<AppState> {
  const rl = readline.createInterface({ input, output });

  try {
    const answer = (await rl.question("Masukkan path folder media yang akan di-share: ")).trim();
    if (!answer) {
      throw new Error("Path folder wajib diisi.");
    }

    const rootDir = path.resolve(answer);
    const stat = await fsp.stat(rootDir);
    if (!stat.isDirectory()) {
      throw new Error("Path harus berupa folder.");
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
              thumbnailUrl: type === "image" ? `/api/file/${encodedPath}` : `/api/thumbnail/${encodedPath}`,
              streamUrl: type === "image" ? `/api/file/${encodedPath}` : `/api/stream/${encodedPath}`,
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

  app.get("/api/file/:relativePath(*)", async (req, res) => {
    try {
      const relativePath = decodeURIComponent(req.params.relativePath);
      const filePath = resolveSafePath(state.rootDir, relativePath);
      const extension = path.extname(filePath).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        res.status(404).end();
        return;
      }

      const contentType = mime.lookup(filePath) || "application/octet-stream";
      res.type(contentType);
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/thumbnail/:relativePath(*)", async (req, res) => {
    try {
      const relativePath = decodeURIComponent(req.params.relativePath);
      const filePath = resolveSafePath(state.rootDir, relativePath);
      const extension = path.extname(filePath).toLowerCase();
      if (!VIDEO_EXTENSIONS.has(extension)) {
        res.status(404).end();
        return;
      }

      const cacheKey = createCacheKey(relativePath);
      const thumbnailPath = await ensureVideoThumbnail(filePath, cacheKey);
      res.type("image/jpeg");
      fs.createReadStream(thumbnailPath).pipe(res);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/api/stream/:relativePath(*)", async (req, res) => {
    try {
      const relativePath = decodeURIComponent(req.params.relativePath);
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
        fs.createReadStream(filePath).pipe(res);
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

      fs.createReadStream(filePath, { start, end }).pipe(res);
    } catch {
      res.status(404).end();
    }
  });
}

async function start() {
  const state = await promptRootDirectory();
  installRoutes(state);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Bivrost running at http://localhost:${PORT}`);
    console.log(`Folder shared: ${state.rootDir}`);
  });
}

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
