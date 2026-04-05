/**
 * test_api_generate.mjs
 *
 * Calls the live /api/generate endpoint (Next.js dev server must be running)
 * using aris-photo-museum.jpg as the person photo, picks a random region,
 * and saves the result to public/test-output/
 *
 * Usage:
 *   node batik-generator/test_api_generate.mjs
 *   node batik-generator/test_api_generate.mjs --region di_yogyakarta
 *   node batik-generator/test_api_generate.mjs --gender female
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE = "http://localhost:3000";
const OUT_DIR  = path.join(__dirname, "public", "test-output");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argRegion = args[args.indexOf("--region") + 1] ?? null;
const argGender = args[args.indexOf("--gender") + 1] ?? "male";

// ── Available regions (must match REGION_TO_PROVINCE_DIR in route.ts) ────────
const REGIONS = [
  "aceh","bali","banten","bengkulu","di_yogyakarta","dki_jakarta",
  "gorontalo","jambi","jawa_barat","jawa_tengah","jawa_timur","kalimantan_barat",
  "kalimantan_selatan","kalimantan_tengah","kalimantan_timur","kalimantan_utara",
  "kepulauan_bangka_belitung","kepulauan_riau","lampung","maluku","maluku_utara",
  "nusa_tenggara_barat","nusa_tenggara_timur","papua","papua_barat","riau",
  "sulawesi_barat","sulawesi_selatan","sulawesi_tengah","sulawesi_tenggara",
  "sulawesi_utara","sumatera_barat","sumatera_selatan","sumatera_utara",
  "papua_selatan","papua_tengah","papua_pegunungan","papua_barat_daya",
];

const regionId   = argRegion ?? REGIONS[Math.floor(Math.random() * REGIONS.length)];
const regionName = regionId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
const gender     = argGender === "female" ? "female" : "male";

// ── Load person image ─────────────────────────────────────────────────────────
const personPath = path.join(__dirname, "public", "aris-photo-museum.jpg");
if (!fs.existsSync(personPath)) {
  console.error("❌ Person image not found:", personPath);
  process.exit(1);
}
const personB64     = fs.readFileSync(personPath).toString("base64");
const faceImageB64  = `data:image/jpeg;base64,${personB64}`;

// ── Build outfit payload ──────────────────────────────────────────────────────
const outfit = {
  id:          `${regionId}_batik`,
  name:        `Traditional ${regionName} Batik`,
  description: `Traditional Indonesian batik outfit from ${regionName}`,
  motifs:      ["batik", "traditional"],
  colors:      ["brown", "gold", "cream"],
};

// ── Call the API ──────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════");
console.log("  /api/generate — Live API Test");
console.log(`  Region : ${regionId} (${regionName})`);
console.log(`  Gender : ${gender}`);
console.log(`  Server : ${API_BASE}`);
console.log("═══════════════════════════════════════════════════════\n");

const t0 = Date.now();

let response;
try {
  response = await fetch(`${API_BASE}/api/generate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      regionId,
      regionName,
      gender,
      outfit,
      faceImageB64,
      numImages: 1,
    }),
  });
} catch (err) {
  console.error("❌ Could not reach server. Is `npm run dev` running?\n", err.message);
  process.exit(1);
}

console.log(`→ HTTP ${response.status} ${response.statusText}  (${Date.now() - t0}ms so far)`);

if (!response.ok) {
  const text = await response.text();
  console.error("❌ API error:\n", text.slice(0, 800));
  process.exit(1);
}

const json = await response.json();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

if (!json.images || json.images.length === 0) {
  console.error("❌ No images in response:", JSON.stringify(json).slice(0, 400));
  process.exit(1);
}

// ── Save results ──────────────────────────────────────────────────────────────
json.images.forEach((dataUri, i) => {
  const [header, b64] = dataUri.split(",");
  const ext  = header.includes("png") ? "png" : "jpg";
  const name = `api_result_${regionId}_${i + 1}.${ext}`;
  const buf  = Buffer.from(b64, "base64");
  fs.writeFileSync(path.join(OUT_DIR, name), buf);
  console.log(`💾 Saved → public/test-output/${name}  (${Math.round(buf.length / 1024)} KB)`);
});

console.log(`\n✅ Done in ${elapsed}s`);
console.log(`   Region      : ${regionName}`);
console.log(`   Gender      : ${gender}`);
console.log(`   Phase2      : ${json.phase2Applied}`);
console.log(`   Garment     : ${json.garmentReused ? "reused" : "generated"}`);
console.log(`   Prompt      : ${(json.prompt ?? "").slice(0, 120)}`);
