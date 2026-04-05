/**
 * Background removal via ORMBG (child-process) + landscape compositing via sharp.
 *
 * The ORMBG model (Python + onnxruntime) runs in a separate child process to avoid
 * GLib conflicts with sharp's libvips on Windows.
 *
 * Pipeline: person image → sharp (normalize PNG) → child process (ORMBG bg removal) → sharp (composite onto landscape).
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import sharp from "sharp";

type AlphaBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

async function getAlphaBounds(imageRgba: Buffer): Promise<AlphaBounds> {
  const meta = await sharp(imageRgba).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  const alpha = await sharp(imageRgba)
    .ensureAlpha()
    .extractChannel("alpha")
    .raw()
    .toBuffer();

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { left: 0, top: 0, width, height };
  }

  return {
    left: minX,
    top: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

async function harmonizeComposite(personRgba: Buffer, landscapeBuf: Buffer): Promise<Buffer> {
  const personMeta = await sharp(personRgba).metadata();
  const width = personMeta.width ?? 768;
  const height = personMeta.height ?? 1024;

  const bg = await sharp(landscapeBuf)
    .resize(width, height, { fit: "cover" })
    .modulate({ brightness: 1.04, saturation: 0.98 })
    .png()
    .toBuffer();

  const bgStats = await sharp(bg).stats();
  const [rMean, , bMean] = bgStats.channels.map((channel) => channel.mean / 255);
  const warmth = Math.max(-0.12, Math.min(0.12, rMean - bMean));

  const bounds = await getAlphaBounds(personRgba);
  const cropped = await sharp(personRgba)
    .extract(bounds)
    .png()
    .toBuffer();

  const targetSubjectHeight = Math.round(height * 0.66);
  const subject = await sharp(cropped)
    .resize({ height: targetSubjectHeight, fit: "inside", withoutEnlargement: false })
    .linear([1 + warmth * 0.15, 1, 1 - warmth * 0.15], [0, 0, 0])
    .modulate({ brightness: 1.01, saturation: 0.97 })
    .sharpen({ sigma: 0.85 })
    .png()
    .toBuffer();

  const subjectMeta = await sharp(subject).metadata();
  const subW = subjectMeta.width ?? Math.round(width * 0.35);
  const subH = subjectMeta.height ?? Math.round(height * 0.66);
  const left = Math.max(0, Math.round((width - subW) / 2));
  const top = Math.max(0, height - subH - Math.round(height * 0.055));

  const subjectAlpha = await sharp(subject)
    .ensureAlpha()
    .extractChannel("alpha")
    .blur(1.2)
    .png()
    .toBuffer();

  const softenedSubject = await sharp(subject)
    .removeAlpha()
    .joinChannel(subjectAlpha)
    .png()
    .toBuffer();

  const shadowAlpha = await sharp(subject)
    .ensureAlpha()
    .extractChannel("alpha")
    .blur(13)
    .linear(0.36, 0)
    .toBuffer();

  const shadow = await sharp({
    create: {
      width: subW,
      height: subH,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .joinChannel(shadowAlpha)
    .png()
    .toBuffer();

  const contactShadow = await sharp({
    create: {
      width: subW,
      height: Math.max(8, Math.round(subH * 0.08)),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 110 },
    },
  })
    .blur(6)
    .png()
    .toBuffer();

  const composited = await sharp(bg)
    .composite([
      { input: shadow, left, top: top + 14 },
      { input: contactShadow, left, top: Math.min(height - 1, top + subH - 2), blend: "multiply" },
      { input: softenedSubject, left, top },
    ])
    .sharpen({ sigma: 0.55 })
    .png()
    .toBuffer();

  return composited;
}

/**
 * Remove background by spawning rembg-worker.mjs in a child process.
 * @param imageB64 raw base64 OR full data URI
 * @returns RGBA PNG buffer with transparent background
 */
export async function removeBackground(imageB64: string): Promise<Buffer> {
  // Strip data URI prefix if present
  const raw = imageB64.includes(",") ? imageB64.split(",")[1] : imageB64;
  const inputBuffer = Buffer.from(raw, "base64");

  // Normalize to clean PNG via sharp (done here, in the main process)
  const pngBuffer = await sharp(inputBuffer).png().toBuffer();
  const pngBase64 = pngBuffer.toString("base64");

  return new Promise((resolve, reject) => {
    // Try multiple possible paths for the worker
    const workerPaths = [
      join(process.cwd(), "lib", "rembg-worker.mjs"),
      join(__dirname, "rembg-worker.mjs"),
      join(__dirname, "..", "lib", "rembg-worker.mjs"),
    ];

    let workerPath = workerPaths[0];
    for (const p of workerPaths) {
      if (existsSync(p)) { workerPath = p; break; }
    }

    console.log(`[rembg] Spawning worker: ${workerPath}`);

    const child = spawn(process.execPath, [workerPath], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, ONNXRUNTIME_EXECUTION_PROVIDERS: "CPUExecutionProvider" },
    });

    let stdout = "";
    child.stdout!.setEncoding("utf-8");
    child.stdout!.on("data", (chunk: string) => { stdout += chunk; });

    child.on("error", (err) => reject(new Error(`rembg worker failed to start: ${err.message}`)));

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`rembg worker exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          reject(new Error(`rembg worker error: ${parsed.error}`));
        } else {
          resolve(Buffer.from(parsed.resultBase64, "base64"));
        }
      } catch (e) {
        reject(new Error(`rembg worker returned invalid JSON: ${stdout.slice(0, 200)}`));
      }
    });

    // Send input and close stdin
    child.stdin!.write(JSON.stringify({ pngBase64 }));
    child.stdin!.end();
  });
}

/**
 * Remove background from a person image and composite onto a landscape.
 * @param personImage raw base64 OR full data URI of person image
 * @param landscapeB64 raw base64 of landscape image (no data: prefix)
 * @returns data URI string (data:image/png;base64,…)
 */
export async function removeAndCompositeBackground(
  personImage: string,
  landscapeB64: string,
): Promise<string> {
  console.log("[rembg] Removing background…");
  const t0 = Date.now();

  const personRgba = await removeBackground(personImage);
  console.log(`[rembg] ✓ Background removed in ${Date.now() - t0}ms`);

  const landscapeBuf = Buffer.from(landscapeB64, "base64");
  const meta = await sharp(personRgba).metadata();
  const width = meta.width ?? 768;
  const height = meta.height ?? 1024;
  const result = await harmonizeComposite(personRgba, landscapeBuf);

  console.log(
    `[rembg] ✓ Composited onto landscape (${width}×${height}, ${Math.round(result.length / 1024)}KB)`,
  );

  return `data:image/png;base64,${result.toString("base64")}`;
}
