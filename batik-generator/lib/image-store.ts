/**
 * Local image storage utility.
 *
 * Directory layout under <project>/generated-images/:
 *   faces/         – input face photos (keyed by SHA-256 hash)
 *   garments/      – Imagen-4-generated flat-lay product images
 *   results/       – VTO composite outputs
 *
 * Every file name follows the pattern:
 *   <timestamp>_<outfitId>_<hash8>.<ext>
 *
 * A manifest.json in each sub-folder keeps metadata so garments can be
 * reused without regenerating.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

// ── Paths ────────────────────────────────────────────────────────────────────

// Cloud Run: DATA_DIR=/data; local dev: parent of cwd
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "..");
const ROOT = path.join(DATA_DIR, "generated-images");
const FACES_DIR = path.join(ROOT, "faces");
const GARMENTS_DIR = path.join(ROOT, "garments");
const RESULTS_DIR = path.join(ROOT, "results");

function ensureDirs() {
  for (const dir of [FACES_DIR, GARMENTS_DIR, RESULTS_DIR]) {
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

function manifestPath(dir: string): string {
  return path.join(dir, "manifest.json");
}

function readManifest(dir: string): ManifestEntry[] {
  const p = manifestPath(dir);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as ManifestEntry[];
  } catch {
    return [];
  }
}

function appendManifest(dir: string, entry: ManifestEntry) {
  const entries = readManifest(dir);
  entries.push(entry);
  writeFileSync(manifestPath(dir), JSON.stringify(entries, null, 2));
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Save an input face image. Returns the filename. */
export function saveFaceImage(
  b64OrDataUri: string,
  meta: { outfitId: string; regionId: string; gender: string },
): string {
  ensureDirs();
  const { mime, b64 } = stripDataUrl(b64OrDataUri);
  const hash = shortHash(b64);
  const ext = extFromMime(mime);
  const filename = `${ts()}_${meta.outfitId}_face_${hash}.${ext}`;
  const filepath = path.join(FACES_DIR, filename);

  // Avoid duplicate writes for the same content
  const existing = readManifest(FACES_DIR).find((e) => e.hash === hash);
  if (existing) return existing.filename;

  writeFileSync(filepath, Buffer.from(b64, "base64"));
  appendManifest(FACES_DIR, {
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
export function saveGarmentImage(
  b64OrDataUri: string,
  meta: { outfitId: string; regionId: string; gender: string; prompt: string },
): string {
  ensureDirs();
  const { mime, b64 } = stripDataUrl(b64OrDataUri);
  const hash = shortHash(b64);
  const ext = extFromMime(mime);
  const filename = `${ts()}_${meta.outfitId}_garment_${hash}.${ext}`;
  const filepath = path.join(GARMENTS_DIR, filename);

  writeFileSync(filepath, Buffer.from(b64, "base64"));
  appendManifest(GARMENTS_DIR, {
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
export function saveResultImage(
  b64OrDataUri: string,
  meta: { outfitId: string; regionId: string; gender: string; index: number },
): string {
  ensureDirs();
  const { mime, b64 } = stripDataUrl(b64OrDataUri);
  const hash = shortHash(b64);
  const ext = extFromMime(mime);
  const filename = `${ts()}_${meta.outfitId}_result${meta.index}_${hash}.${ext}`;
  const filepath = path.join(RESULTS_DIR, filename);

  writeFileSync(filepath, Buffer.from(b64, "base64"));
  appendManifest(RESULTS_DIR, {
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
export function findGarmentsByOutfit(outfitId: string): ManifestEntry[] {
  ensureDirs();
  return readManifest(GARMENTS_DIR).filter((e) => e.outfitId === outfitId);
}

/** Load a garment's raw base64 by filename. */
export function loadGarmentB64(filename: string): string | null {
  const filepath = path.join(GARMENTS_DIR, filename);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath).toString("base64");
}

/** List all garments with public info for the frontend. */
export async function listAllGarments(): Promise<
  (ManifestEntry & { url: string })[]
> {
  ensureDirs();
  const entries = readManifest(GARMENTS_DIR);
  return entries.map((e) => ({ ...e, url: `/api/garments/image/${e.filename}` }));
}

/** Return the absolute path to a garment file (for serving). */
export function garmentFilePath(filename: string): string {
  return path.join(GARMENTS_DIR, filename);
}

/** List all generated result images. */
export async function listAllResults(): Promise<
  (ManifestEntry & { url: string })[]
> {
  ensureDirs();
  const entries = readManifest(RESULTS_DIR);
  return entries.map((e) => ({ ...e, url: `/api/results/image/${e.filename}` }));
}

export function resultFilePath(filename: string): string {
  return path.join(RESULTS_DIR, filename);
}
