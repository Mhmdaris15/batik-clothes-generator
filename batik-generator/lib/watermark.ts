/**
 * Watermark utility using sharp.
 * Applies the ITMO logo to the bottom-right corner of a base64-encoded image.
 */

import sharp from "sharp";
import path from "node:path";
import { existsSync } from "node:fs";

// The logo lives in the Next.js public folder, which is always at <cwd>/public in production.
const LOGO_PATH = path.join(process.cwd(), "public", "itmo-logo.png");

/** Maximum width of the watermark relative to the image width (25%). */
const WATERMARK_RATIO = 0.20;

/** Opacity of the watermark (0–1). */
const WATERMARK_OPACITY = 0.5;

/** Padding from the edge in pixels. */
const PADDING = 24;

/**
 * Apply the ITMO logo watermark to a data-URI or raw base64 image.
 * Returns a data-URI string with the watermark applied.
 * Falls back to the original image if sharp or the logo file is unavailable.
 */
export async function applyWatermark(dataUriOrB64: string): Promise<string> {
  if (!existsSync(LOGO_PATH)) {
    console.warn(`[watermark] Logo not found at ${LOGO_PATH} — skipping watermark`);
    return dataUriOrB64;
  }

  try {
    // Strip data-URI prefix and detect mime type
    let mime = "image/png";
    let b64 = dataUriOrB64;
    if (dataUriOrB64.includes(",")) {
      const [prefix, rest] = dataUriOrB64.split(",", 2);
      const mimeMatch = prefix.match(/data:([^;]+)/);
      if (mimeMatch) mime = mimeMatch[1];
      b64 = rest;
    }

    const inputBuffer = Buffer.from(b64, "base64");

    // Get image dimensions
    const meta = await sharp(inputBuffer).metadata();
    const imgWidth = meta.width ?? 1024;
    const imgHeight = meta.height ?? 1024;

    // Calculate watermark size scaled to image width
    const wmWidth = Math.round(imgWidth * WATERMARK_RATIO);

    // Resize and set opacity on logo
    const logoBuffer = await sharp(LOGO_PATH)
      .resize({ width: wmWidth, withoutEnlargement: true })
      .png()
      .ensureAlpha(WATERMARK_OPACITY)
      .toBuffer();

    // Get actual logo dimensions after resize
    const logoMeta = await sharp(logoBuffer).metadata();
    const wmH = logoMeta.height ?? 80;
    const wmW = logoMeta.width ?? wmWidth;

    // Composite onto image — bottom right with padding
    const outputBuffer = await sharp(inputBuffer)
      .composite([
        {
          input: logoBuffer,
          left: imgWidth - wmW - PADDING,
          top: imgHeight - wmH - PADDING,
        },
      ])
      .png()
      .toBuffer();

    const resultMime = "image/png";
    const resultB64 = outputBuffer.toString("base64");
    console.log(`[watermark] ✓ watermark applied (${Math.round(outputBuffer.length / 1024)}KB)`);
    return `data:${resultMime};base64,${resultB64}`;
  } catch (err) {
    console.error(`[watermark] Failed to apply watermark: ${err instanceof Error ? err.message : String(err)}`);
    return dataUriOrB64;
  }
}

/**
 * Apply watermark to an array of data-URI images in parallel.
 */
export async function applyWatermarkToAll(images: string[]): Promise<string[]> {
  return Promise.all(images.map(applyWatermark));
}
