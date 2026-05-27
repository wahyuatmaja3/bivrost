"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const mime_types_1 = __importDefault(require("mime-types"));
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const promises_2 = __importDefault(require("node:readline/promises"));
const node_process_1 = require("node:process");
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT || 5000);
const PUBLIC_DIR = node_path_1.default.resolve(__dirname, "..", "src", "public");
const THUMB_DIR = node_path_1.default.join(node_os_1.default.tmpdir(), "bivrost-thumbs");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".mov", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const ALLOWED_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]);
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
app.use((0, cors_1.default)());
app.use(express_1.default.static(PUBLIC_DIR));
function normalizeRelativePath(relativePath) {
    return relativePath.replace(/\\/g, "/").split("/").filter(Boolean).join("/");
}
function resolveSafePath(rootDir, relativePath = "") {
    const normalized = normalizeRelativePath(relativePath);
    const resolved = node_path_1.default.resolve(rootDir, normalized);
    const safeRoot = node_path_1.default.resolve(rootDir);
    if (resolved !== safeRoot && !resolved.startsWith(`${safeRoot}${node_path_1.default.sep}`)) {
        throw new Error("Invalid path");
    }
    return resolved;
}
function toMediaType(extension) {
    if (VIDEO_EXTENSIONS.has(extension))
        return "video";
    if (IMAGE_EXTENSIONS.has(extension))
        return "image";
    return null;
}
function sortByName(items) {
    return [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
async function ensureThumbDir() {
    await promises_1.default.mkdir(THUMB_DIR, { recursive: true });
}
async function ensureVideoThumbnail(filePath, cacheKey) {
    await ensureThumbDir();
    const target = node_path_1.default.join(THUMB_DIR, `${cacheKey}.jpg`);
    try {
        await promises_1.default.access(target, node_fs_1.default.constants.F_OK);
        return target;
    }
    catch { }
    await new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)(filePath)
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
function createCacheKey(relativePath) {
    return Buffer.from(relativePath).toString("base64url");
}
function getRootFromArgs() {
    const arg = process.argv[2];
    if (arg) {
        return node_path_1.default.resolve(arg);
    }
    return null;
}
async function promptRootDirectory() {
    const fromArg = getRootFromArgs();
    if (fromArg) {
        try {
            const stat = await promises_1.default.stat(fromArg);
            if (!stat.isDirectory()) {
                throw new Error("Path must be a folder.");
            }
            return { rootDir: fromArg, rootName: node_path_1.default.basename(fromArg) };
        }
        catch (e) {
            console.error("Invalid argument path, switching to manual input.");
        }
    }
    const rl = promises_2.default.createInterface({ input: node_process_1.stdin, output: node_process_1.stdout });
    try {
        const answer = (await rl.question("Enter the media folder path to share: ")).trim();
        if (!answer) {
            throw new Error("A folder path is required.");
        }
        const rootDir = node_path_1.default.resolve(answer);
        const stat = await promises_1.default.stat(rootDir);
        if (!stat.isDirectory()) {
            throw new Error("Path must be a folder.");
        }
        return {
            rootDir,
            rootName: node_path_1.default.basename(rootDir) || rootDir,
        };
    }
    finally {
        rl.close();
    }
}
function installRoutes(state) {
    app.get("/api/browse", async (req, res) => {
        try {
            const requestedPath = typeof req.query.path === "string" ? req.query.path : "";
            const directoryPath = resolveSafePath(state.rootDir, requestedPath);
            const directoryEntries = await promises_1.default.readdir(directoryPath, { withFileTypes: true });
            const folders = sortByName(directoryEntries
                .filter((entry) => entry.isDirectory())
                .map((entry) => {
                const relativePath = normalizeRelativePath(node_path_1.default.relative(state.rootDir, node_path_1.default.join(directoryPath, entry.name)));
                return {
                    name: entry.name,
                    relativePath,
                };
            }));
            const media = sortByName(directoryEntries
                .filter((entry) => entry.isFile())
                .map((entry) => {
                const extension = node_path_1.default.extname(entry.name).toLowerCase();
                const type = toMediaType(extension);
                if (!type || !ALLOWED_EXTENSIONS.has(extension)) {
                    return null;
                }
                const relativePath = normalizeRelativePath(node_path_1.default.relative(state.rootDir, node_path_1.default.join(directoryPath, entry.name)));
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
                .filter((item) => Boolean(item)));
            res.json({
                rootName: state.rootName,
                path: normalizeRelativePath(requestedPath),
                folders,
                media,
            });
        }
        catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : "Browse failed" });
        }
    });
    app.get("/api/file", async (req, res) => {
        try {
            const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
            const filePath = resolveSafePath(state.rootDir, relativePath);
            const extension = node_path_1.default.extname(filePath).toLowerCase();
            if (!IMAGE_EXTENSIONS.has(extension)) {
                res.status(404).end();
                return;
            }
            const contentType = mime_types_1.default.lookup(filePath) || "application/octet-stream";
            res.type(contentType);
            node_fs_1.default.createReadStream(filePath).pipe(res);
        }
        catch {
            res.status(404).end();
        }
    });
    app.get("/api/thumbnail", async (req, res) => {
        try {
            const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
            const filePath = resolveSafePath(state.rootDir, relativePath);
            const extension = node_path_1.default.extname(filePath).toLowerCase();
            if (!VIDEO_EXTENSIONS.has(extension)) {
                res.status(404).end();
                return;
            }
            const cacheKey = createCacheKey(relativePath);
            const thumbnailPath = await ensureVideoThumbnail(filePath, cacheKey);
            res.type("image/jpeg");
            node_fs_1.default.createReadStream(thumbnailPath).pipe(res);
        }
        catch {
            res.status(404).end();
        }
    });
    app.get("/api/stream", async (req, res) => {
        try {
            const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
            const filePath = resolveSafePath(state.rootDir, relativePath);
            const extension = node_path_1.default.extname(filePath).toLowerCase();
            if (!VIDEO_EXTENSIONS.has(extension)) {
                res.status(404).end();
                return;
            }
            const stat = await promises_1.default.stat(filePath);
            const fileSize = stat.size;
            const range = req.headers.range;
            const contentType = mime_types_1.default.lookup(filePath) || "video/mp4";
            if (!range) {
                res.writeHead(200, {
                    "Content-Length": fileSize,
                    "Content-Type": contentType,
                    "Accept-Ranges": "bytes",
                });
                node_fs_1.default.createReadStream(filePath).pipe(res);
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
            node_fs_1.default.createReadStream(filePath, { start, end }).pipe(res);
        }
        catch {
            res.status(404).end();
        }
    });
    app.get("/api/search", async (req, res) => {
        try {
            const relativePath = typeof req.query.path === "string" ? decodeURIComponent(req.query.path) : "";
            const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
            const directoryPath = resolveSafePath(state.rootDir, relativePath);
            const entries = await promises_1.default.readdir(directoryPath, { withFileTypes: true });
            const results = entries
                .filter((entry) => entry.name.toLowerCase().includes(query))
                .map((entry) => {
                const rel = normalizeRelativePath(node_path_1.default.relative(state.rootDir, node_path_1.default.join(directoryPath, entry.name)));
                return {
                    name: entry.name,
                    relativePath: rel,
                    type: entry.isDirectory() ? "folder" : "file",
                };
            });
            res.json({ results });
        }
        catch (error) {
            res
                .status(400)
                .json({ error: error instanceof Error ? error.message : "Search failed" });
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
//# sourceMappingURL=server.js.map