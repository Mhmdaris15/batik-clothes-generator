/**
 * test_vto_pipeline.mjs
 *
 * Quick end-to-end test:
 *   1. Pick a random male garment from ../indonesia_traditional_clothes/
 *   2. Virtual Try-On (VTO) — dress the person in the garment
 *   3. Background swap — put them in an Indonesian cultural scene (text prompt)
 *
 * Usage:
 *   node batik-generator/test_vto_pipeline.mjs
 *
 * Output files are saved to batik-generator/public/test-output/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env from parent directory ─────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    console.warn("⚠  No .env found at", envPath, "— relying on process.env");
    return;
  }
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx <= 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const API_KEY  = process.env.GOOGLE_CLOUD_API_KEY  || "";
const PROJECT  = process.env.GOOGLE_CLOUD_PROJECT  || "";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

if (!API_KEY || !PROJECT) {
  console.error("❌ Missing GOOGLE_CLOUD_API_KEY or GOOGLE_CLOUD_PROJECT in .env");
  process.exit(1);
}

const BASE = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models`;

// ── Pick random male garment ─────────────────────────────────────────────────
const CLOTHES_DIR = path.join(__dirname, "..", "indonesia_traditional_clothes");
const maleGarments = fs.readdirSync(CLOTHES_DIR).filter(f => f.includes("_male_") && f.endsWith(".png"));

if (maleGarments.length === 0) {
  console.error("❌ No male garment files found in", CLOTHES_DIR);
  process.exit(1);
}

const pickedFile = maleGarments[Math.floor(Math.random() * maleGarments.length)];
// filename: Province_Name_male_0.png → extract province
const province = pickedFile.replace(/_male_\d+\.png$/, "").replace(/_/g, " ");

console.log(`\n🎲 Random garment: ${pickedFile}`);
console.log(`   Province: ${province}\n`);

// ── Output directory ─────────────────────────────────────────────────────────
const OUT_DIR = path.join(__dirname, "public", "test-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

function saveB64(b64, filename) {
  const buf = Buffer.from(b64, "base64");
  const p = path.join(OUT_DIR, filename);
  fs.writeFileSync(p, buf);
  console.log(`   💾 Saved → public/test-output/${filename}  (${Math.round(buf.length / 1024)} KB)`);
  return p;
}

// ── Helper: POST to Vertex AI ────────────────────────────────────────────────
async function vertexPost(model, body) {
  const url = `${BASE}/${model}:predict?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${model} → HTTP ${res.status}: ${text.slice(0, 600)}`);
  }
  return JSON.parse(text);
}

// ── Step 0: load images ──────────────────────────────────────────────────────
function loadPersonImage() {
  console.log("📷 Step 0: Loading person image …");
  const imgPath = path.join(__dirname, "public", "aris-photo-museum.jpg");
  const b64 = fs.readFileSync(imgPath).toString("base64");
  console.log(`   ✓ aris-photo-museum.jpg  (${Math.round(b64.length * 0.75 / 1024)} KB)`);
  return b64;
}

function loadGarmentImage() {
  console.log("👘 Step 0b: Loading garment image …");
  const b64 = fs.readFileSync(path.join(CLOTHES_DIR, pickedFile)).toString("base64");
  console.log(`   ✓ ${pickedFile}  (${Math.round(b64.length * 0.75 / 1024)} KB)`);
  // Also copy garment to output for reference
  saveB64(b64, "step1_garment.png");
  return b64;
}

// ── Step 1: Virtual Try-On ───────────────────────────────────────────────────
async function runVTO(personB64, garmentB64) {
  console.log("\n👗 Step 1: Virtual Try-On …");

  const data = await vertexPost("virtual-try-on-001", {
    instances: [{
      personImage:   { image: { bytesBase64Encoded: personB64 } },
      productImages: [{ image: { bytesBase64Encoded: garmentB64 } }],
    }],
    parameters: {
      sampleCount: 1,
      baseSteps: 75,
      personGeneration: "allow_all",
    },
  });

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("VTO returned no image: " + JSON.stringify(data).slice(0, 400));

  console.log("   ✓ Try-on complete");
  saveB64(b64, "step2_vto.png");
  return b64;
}

// ── Step 2: Background swap to Indonesian cultural scene ─────────────────────
async function runBgSwap(vtoB64) {
  console.log("\n🏛️  Step 2: Background swap …");

  const bgPrompt = [
    `Authentic ${province} Indonesian cultural heritage setting.`,
    `Traditional architecture, lush tropical surroundings, ornate carvings,`,
    `warm golden-hour sunlight filtering through tropical trees.`,
    `Photorealistic, vibrant colors, cinematic. No text, no watermark.`,
  ].join(" ");

  console.log(`   Prompt: ${bgPrompt.slice(0, 120)} …`);

  const data = await vertexPost("imagen-3.0-capability-001", {
    instances: [{
      prompt: bgPrompt,
      referenceImages: [
        {
          referenceType: "REFERENCE_TYPE_RAW",
          referenceId: 1,
          referenceImage: { bytesBase64Encoded: vtoB64 },
        },
        {
          referenceType: "REFERENCE_TYPE_MASK",
          referenceId: 2,
          maskImageConfig: {
            maskMode: "MASK_MODE_BACKGROUND",
            dilation: 0.02,
          },
        },
      ],
    }],
    parameters: {
      editMode: "EDIT_MODE_BGSWAP",
      editConfig: { baseSteps: 75 },
      sampleCount: 1,
      personGeneration: "allow_all",
      safetyFilterLevel: "block_some",
    },
  });

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error("BGSwap returned no image: " + JSON.stringify(data).slice(0, 400));

  console.log("   ✓ Background swapped");
  saveB64(b64, "step3_final.png");
  return b64;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Batik VTO Pipeline — Quick Test");
  console.log(`  Project : ${PROJECT}`);
  console.log(`  Location: ${LOCATION}`);
  console.log("═══════════════════════════════════════════════");

  const t0 = Date.now();
  try {
    const personB64  = loadPersonImage();
    const garmentB64 = loadGarmentImage();
    const vtoB64     = await runVTO(personB64, garmentB64);
    await runBgSwap(vtoB64);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ Done in ${elapsed}s — Province: ${province}`);
    console.log(`   Results in: batik-generator/public/test-output/`);
    console.log(`     step1_garment.png  — garment from indonesia_traditional_clothes/`);
    console.log(`     step2_vto.png      — person wearing the garment`);
    console.log(`     step3_final.png    — final with ${province} background`);
  } catch (err) {
    console.error("\n❌ Pipeline failed:", err.message);
    process.exit(1);
  }
}

main();
