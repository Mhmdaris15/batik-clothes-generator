/**
 * Image storage utility supporting both local file system and Google Cloud Storage.
 *
 * Directory layout under <project>/generated-images/ (or GCS bucket):
 *   faces/         – input face photos (keyed by SHA-256 hash)
 *   garments/      – Imagen-4-generated flat-lay product images
 *   results/       – VTO composite outputs
 *   landscapes/    – Background landscapes
 *
 * Every file name follows the pattern:
 *   <timestamp>_<outfitId>_<hash8>.<ext>
 *
 * A manifest.json in each sub-folder keeps metadata so garments can be
 * reused without regenerating.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { Storage } from "@google-cloud/storage";

// ── Configuration ────────────────────────────────────────────────────────────

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const storage = GCS_BUCKET_NAME ? new Storage() : null;
const bucket = GCS_BUCKET_NAME ? storage?.bucket(GCS_BUCKET_NAME) : null;

// Cloud Run: DATA_DIR=/data; local dev: parent of cwd
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "..");
const ROOT = path.join(DATA_DIR, "generated-images");
const FACES_DIR = path.join(ROOT, "faces");
const GARMENTS_DIR = path.join(ROOT, "garments");
const RESULTS_DIR = path.join(ROOT, "results");
const LANDSCAPES_DIR = path.join(ROOT, "landscapes");

function ensureDirs() {
  if (bucket) return; // GCS doesn't need explicit directories
  for (const dir of [FACES_DIR, GARMENTS_DIR, RESULTS_DIR, LANDSCAPES_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortHash(data: string): string {
  return createHash("sha256").update(data).digest("hex").slice(0, 12);
}

function stripDataUrl(dataUri: string): { mime: string; b64: string } {
  if (dataUri.includes(",")) {
    const [prefix, b64] = dataUri.split(",", 2);
    const mimeMatch = prefix.match(/data:([^;]+)/);
    return { mime: mimeMatch?.[1] ?? "image/png", b64 };
  }
  return { mime: "image/png", b64: dataUri };
}

function extFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

function ts(): string {
  return new Date().toISOString().replace(/[:\-T]/g, "").slice(0, 15);
}

// ── Manifest (per-folder JSON index) ─────────────────────────────────────────

export type ManifestEntry = {
  filename: string;
  outfitId: string;
  regionId: string;
  gender: string;
  prompt?: string;
  hash: string;
  createdAt: string;
};

async function readManifest(dir: string, gcsPrefix: string): Promise<ManifestEntry[]> {
  if (bucket) {
    const file = bucket.file(`${gcsPrefix}/manifest.json`);
    try {
      const [content] = await file.download();
      return JSON.parse(content.toString("utf-8")) as ManifestEntry[];
    } catch {
      return [];
    }
  } else {
    const p = path.join(dir, "manifest.json");
    if (!existsSync(p)) return [];
    try {
      return JSON.parse(readFileSync(p, "utf-8")) as ManifestEntry[];
    } catch {
      return [];
    }
  }
}

async function appendManifest(dir: string, gcsPrefix: string, entry: ManifestEntry) {
  const entries = await readManifest(dir, gcsPrefix);
  entries.push(entry);
  const data = JSON.stringify(entries, null, 2);
  
  if (bucket) {
    const file = bucket.file(`${gcsPrefix}/manifest.json`);
    await file.save(data, { contentType: "application/json" });
  } else {
    writeFileSync(path.join(dir, "manifest.json"), data);
  }
}

async function saveFile(dir: string, gcsPrefix: string, filename: string, buffer: Buffer, mime: string) {
  if (bucket) {
    const file = bucket.file(`${gcsPrefix}/${filename}`);
    await file.save(buffer, { contentType: mime });
  } else {
    writeFileSync(path.join(dir, filename), buffer);
  }
}

async function loadFileB64(dir: string, gcsPrefix: string, filename: string): Promise<string | null> {
  if (bucket) {
    const file = bucket.file(`${gcsPrefix}/${filename}`);
    try {
      const [content] = await file.download();
      return content.toString("base64");
    } catch {
      return null;
    }
  } else {
    const filepath = path.join(dir, filename);
    if (!existsSync(filepath)) return null;
    return readFileSync(filepath).toString("base64");
  }
}

async function loadFileBuffer(dir: string, gcsPrefix: string, filename: string): Promise<Buffer | null> {
  if (bucket) {
    const file = bucket.file(`${gcsPrefix}/${filename}`);
    try {
      const [content] = await file.download();
      return content;
    } catch {
      return null;
    }
  } else {
    const filepath = path.join(dir, filename);
    if (!existsSync(filepath)) return null;
    return readFileSync(filepath);
  }
}

async function deleteFile(dir: string, gcsPrefix: string, filename: string): Promise<boolean> {
  if (bucket) {
    const file = bucket.file(`${gcsPrefix}/${filename}`);
    try {
      await file.delete();
      return true;
    } catch {
      return false;
    }
  } else {
    const filepath = path.join(dir, filename);
    if (!existsSync(filepath)) return false;
    unlinkSync(filepath);
    return true;
  }
}

async function writeManifest(dir: string, gcsPrefix: string, entries: ManifestEntry[]) {
  const data = JSON.stringify(entries, null, 2);
  if (bucket) {
    const file = bucket.file(`${gcsPrefix}/manifest.json`);
    await file.save(data, { contentType: "application/json" });
  } else {
    writeFileSync(path.join(dir, "manifest.json"), data);
  }
}

async function removeFromManifest(dir: string, gcsPrefix: string, filename: string): Promise<boolean> {
  const entries = await readManifest(dir, gcsPrefix);
  const idx = entries.findIndex((e) => e.filename === filename);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  await writeManifest(dir, gcsPrefix, entries);
  return true;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Save an input face image. Returns the filename. */
export async function saveFaceImage(
  b64OrDataUri: string,
  meta: { outfitId: string; regionId: string; gender: string },
): Promise<string> {
  ensureDirs();
  const { mime, b64 } = stripDataUrl(b64OrDataUri);
  const hash = shortHash(b64);
  const ext = extFromMime(mime);
  const filename = `${ts()}_${meta.outfitId}_face_${hash}.${ext}`;

  // Avoid duplicate writes for the same content
  const entries = await readManifest(FACES_DIR, "faces");
  const existing = entries.find((e) => e.hash === hash);
  if (existing) return existing.filename;

  await saveFile(FACES_DIR, "faces", filename, Buffer.from(b64, "base64"), mime);
  await appendManifest(FACES_DIR, "faces", {
    filename,
    outfitId: meta.outfitId,
    regionId: meta.regionId,
    gender: meta.gender,
    hash,
    createdAt: new Date().toISOString(),
  });
  console.log(`[image-store] saved face → ${filename}`);
  return filename;
}

/** Save a generated garment image. Returns the filename. */
export async function saveGarmentImage(
  b64OrDataUri: string,
  meta: { outfitId: string; regionId: string; gender: string; prompt: string },
): Promise<string> {
  ensureDirs();
  const { mime, b64 } = stripDataUrl(b64OrDataUri);
  const hash = shortHash(b64);
  const ext = extFromMime(mime);
  const filename = `${ts()}_${meta.outfitId}_garment_${hash}.${ext}`;

  await saveFile(GARMENTS_DIR, "garments", filename, Buffer.from(b64, "base64"), mime);
  await appendManifest(GARMENTS_DIR, "garments", {
    filename,
    outfitId: meta.outfitId,
    regionId: meta.regionId,
    gender: meta.gender,
    prompt: meta.prompt,
    hash,
    createdAt: new Date().toISOString(),
  });
  console.log(`[image-store] saved garment → ${filename}`);
  return filename;
}

/** Save a VTO result image. Returns the filename. */
export async function saveResultImage(
  b64OrDataUri: string,
  meta: { outfitId: string; regionId: string; gender: string; index: number },
): Promise<string> {
  ensureDirs();
  const { mime, b64 } = stripDataUrl(b64OrDataUri);
  const hash = shortHash(b64);
  const ext = extFromMime(mime);
  const filename = `${ts()}_${meta.outfitId}_result${meta.index}_${hash}.${ext}`;

  await saveFile(RESULTS_DIR, "results", filename, Buffer.from(b64, "base64"), mime);
  await appendManifest(RESULTS_DIR, "results", {
    filename,
    outfitId: meta.outfitId,
    regionId: meta.regionId,
    gender: meta.gender,
    hash,
    createdAt: new Date().toISOString(),
  });
  console.log(`[image-store] saved result → ${filename}`);
  return filename;
}

/** Find garment images for a given outfit. Used to skip Imagen 4 step. */
export async function findGarmentsByOutfit(outfitId: string): Promise<ManifestEntry[]> {
  ensureDirs();
  const entries = await readManifest(GARMENTS_DIR, "garments");
  return entries.filter((e) => e.outfitId === outfitId);
}

/** Load a garment's raw base64 by filename. */
export async function loadGarmentB64(filename: string): Promise<string | null> {
  return loadFileB64(GARMENTS_DIR, "garments", filename);
}

export async function getGarmentImageBuffer(filename: string): Promise<Buffer | null> {
  return loadFileBuffer(GARMENTS_DIR, "garments", filename);
}

/** List all garments with public info for the frontend. */
export async function listAllGarments(): Promise<
  (ManifestEntry & { url: string })[]
> {
  ensureDirs();
  const entries = await readManifest(GARMENTS_DIR, "garments");
  return entries.map((e) => ({ ...e, url: `/api/garments/image/${e.filename}` }));
}

/** List all generated result images. */
export async function listAllResults(): Promise<
  (ManifestEntry & { url: string })[]
> {
  ensureDirs();
  const entries = await readManifest(RESULTS_DIR, "results");
  return entries.map((e) => ({ ...e, url: `/api/results/image/${e.filename}` }));
}

export async function getResultImageBuffer(filename: string): Promise<Buffer | null> {
  return loadFileBuffer(RESULTS_DIR, "results", filename);
}

export async function getFaceImageBuffer(filename: string): Promise<Buffer | null> {
  return loadFileBuffer(FACES_DIR, "faces", filename);
}

/** List all stored face images. */
export async function listAllFaces(): Promise<
  (ManifestEntry & { url: string })[]
> {
  ensureDirs();
  const entries = await readManifest(FACES_DIR, "faces");
  return entries.map((e) => ({ ...e, url: `/api/faces/image/${e.filename}` }));
}

export async function getLandscapeImageBuffer(filename: string): Promise<Buffer | null> {
  return loadFileBuffer(LANDSCAPES_DIR, "landscapes", filename);
}

/** Load a landscape's raw base64 by filename. */
export async function loadLandscapeB64(filename: string): Promise<string | null> {
  return loadFileB64(LANDSCAPES_DIR, "landscapes", filename);
}

/** Find landscape entries for a given region. */
export async function findLandscapesByRegion(regionId: string): Promise<ManifestEntry[]> {
  ensureDirs();
  const entries = await readManifest(LANDSCAPES_DIR, "landscapes");
  return entries.filter((e) => e.regionId === regionId);
}

/** List all stored landscape images. */
export async function listAllLandscapes(): Promise<
  (ManifestEntry & { url: string })[]
> {
  ensureDirs();
  const entries = await readManifest(LANDSCAPES_DIR, "landscapes");
  return entries.map((e) => ({ ...e, url: `/api/landscapes/image/${e.filename}` }));
}

// ── Delete API ──────────────────────────────────────────────────────────────

/** Delete a face image by filename. Returns true if found and deleted. */
export async function deleteFaceImage(filename: string): Promise<boolean> {
  const removed = await removeFromManifest(FACES_DIR, "faces", filename);
  if (!removed) return false;
  await deleteFile(FACES_DIR, "faces", filename);
  console.log(`[image-store] deleted face → ${filename}`);
  return true;
}

/** Delete a garment image by filename. Returns true if found and deleted. */
export async function deleteGarmentImage(filename: string): Promise<boolean> {
  const removed = await removeFromManifest(GARMENTS_DIR, "garments", filename);
  if (!removed) return false;
  await deleteFile(GARMENTS_DIR, "garments", filename);
  console.log(`[image-store] deleted garment → ${filename}`);
  return true;
}

/** Delete a result image by filename. Returns true if found and deleted. */
export async function deleteResultImage(filename: string): Promise<boolean> {
  const removed = await removeFromManifest(RESULTS_DIR, "results", filename);
  if (!removed) return false;
  await deleteFile(RESULTS_DIR, "results", filename);
  console.log(`[image-store] deleted result → ${filename}`);
  return true;
}

/** Delete a landscape image by filename. Returns true if found and deleted. */
export async function deleteLandscapeImage(filename: string): Promise<boolean> {
  const removed = await removeFromManifest(LANDSCAPES_DIR, "landscapes", filename);
  if (!removed) return false;
  await deleteFile(LANDSCAPES_DIR, "landscapes", filename);
  console.log(`[image-store] deleted landscape → ${filename}`);
  return true;
}

