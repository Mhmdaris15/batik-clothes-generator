import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  EditMode,
  GoogleGenAI,
  MaskReferenceImage,
  MaskReferenceMode,
  PersonGeneration,
  RawReferenceImage,
  SafetyFilterLevel,
} from "@google/genai";
import sharp from "sharp";
import { getServerEnv } from "@/lib/server-env";
import {
  saveFaceImage,
  saveGarmentImage,
  saveResultImage,
  loadGarmentB64,
  findGarmentsByOutfit,
  loadLandscapeB64,
  listAllLandscapes,
} from "@/lib/image-store";
import { applyWatermarkToAll } from "@/lib/watermark";

type Outfit = {
  id: string;
  name: string;
  description: string;
  motifs: string[];
  colors: string[];
  accessories: string;
};

/** One person in a group generation request. */
type PersonInput = {
  faceImageB64: string;
  gender: "female" | "male";
  outfit: Outfit;
};

type RequestBody = {
  regionName: string;
  regionId?: string;
  /** Group mode: array of 2-4 persons, each with their own face/gender/outfit. */
  persons?: PersonInput[];
  /** Single-person mode (legacy / backward compat). */
  gender?: "female" | "male";
  outfit?: Outfit;
  faceImageB64?: string;
  numImages?: number;
  /** If provided, skip garment generation and reuse this stored garment (single-person only). */
  garmentFilename?: string;
  /** If provided, use this stored landscape as background reference. */
  landscapeFilename?: string;
  /** Client-selected model from models_config.json (overrides GENERATION_BACKEND env). */
  modelType?: string;
  /** Province background prompt for scene setting. */
  backgroundPrompt?: string;
  /** Additional model-specific parameters from the dynamic form. */
  modelParams?: Record<string, unknown>;
  /** Group photo mode: one photo of multiple people — clothing inpaint + BGSwap. */
  groupPhotoMode?: boolean;
  groupPhotoB64?: string;
  /** How many males/females are in the group photo (used for clothing prompt). */
  maleCount?: number;
  femaleCount?: number;
  /** Selected outfit name/description for group photo clothing style. */
  groupOutfitName?: string;
};

// ── Cultural variation hints for Indonesian heritage photography ─────────────
const variationHints = [
  "warm golden-hour light, authentic Indonesian cultural setting, soft bokeh background",
  "vibrant cultural festival atmosphere, ornate traditional Indonesian architectural backdrop",
  "elegant daytime scene, temple courtyard background, natural diffused lighting",
  "dignified portrait with lush Indonesian tropical garden backdrop, soft natural light",
];

/** A RequestBody where single-person fields are guaranteed to be present. */
type SinglePersonBody = RequestBody & Required<Pick<RequestBody, "gender" | "outfit" | "faceImageB64">>;

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildPrompt(body: SinglePersonBody, numImages: number): string {
  const motifs = body.outfit.motifs.join(", ");
  const colors = body.outfit.colors.join(", ");
  const genderTerm = body.gender === "female" ? "woman" : "man";
  const hints = variationHints.slice(0, numImages).join("; ");

  return [
    `TASK: Generate a photorealistic, culturally respectful FULL-BODY portrait of a ${genderTerm} wearing authentic traditional Indonesian ${body.outfit.name} attire from ${body.regionName}.`,

    // ── Framing: 4:3 landscape with subject occupying 80% of frame height ──
    "FRAMING: Landscape orientation (4:3 aspect ratio). The person stands centered, occupying roughly 80% of the frame height, from crown of head to below the knees. Full outfit must be visible from collar to hemline. Do NOT crop to bust or face only.",

    // ── Identity preservation ──────────────────────────────────────────────
    "IDENTITY: Preserve the subject's exact face, skin tone, facial bone structure, and expression precisely as shown in the reference image. The output person must be unmistakably the same individual.",

    // ── Clothing detail ────────────────────────────────────────────────────
    `CLOTHING: ${body.outfit.name} — ${body.outfit.description}`,
    `Fabric motifs: ${motifs}.`,
    `Authentic color palette: ${colors}.`,
    `Accessories and styling: ${body.outfit.accessories}.`,
    "Garment must be shown in full, draped naturally, with correct fabric weight and authentic batik texture detail.",

    // ── Background / scene ─────────────────────────────────────────────────
    body.backgroundPrompt
      ? `BACKGROUND: ${body.backgroundPrompt}. Background must complement the traditional attire — architecturally or naturally Indonesian.`
      : `BACKGROUND: Authentic Indonesian cultural setting — traditional Javanese pendopo, temple courtyard, or tropical garden. Background should celebrate Indonesian heritage from ${body.regionName}.`,

    // ── Photography style ──────────────────────────────────────────────────
    "PHOTOGRAPHY: Professional fashion portrait photography. Moderate shooting distance — 3 to 4 metres. Camera at chest height to show the full ensemble. Shallow depth of field, subject in sharp focus, background tastefully blurred.",
    "Cinematic lighting with warm tones. Vivid, saturated colors. 8K resolution. Award-winning cultural fashion photography.",

    `Stylistic variation hints for this batch: ${hints}.`,
  ].join(" ");
}

function buildGarmentPrompt(body: SinglePersonBody): string {
  const motifs = body.outfit.motifs.join(", ");
  const colors = body.outfit.colors.join(", ");
  // Only remove anatomical/person words — preserve fabric/drape descriptors
  const cleanDescription = body.outfit.description
    .replace(/\b(woman|women|man|men|person|people|body|worn by|dressed in|draped over the head and shoulders|modestly)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return [
    // Front-facing product shot on white background — VTO models work best with this format
    `Front-facing fashion product photography of ${body.outfit.name}, a traditional Indonesian ${body.regionName} textile garment, displayed on a clean pure white background.`,
    `Garment fully visible from top to bottom, shown spread out in natural upright presentation as in a high-end fashion catalog.`,
    cleanDescription,
    `Authentic batik fabric motifs: ${motifs}.`,
    `Color palette: ${colors}.`,
    "Soft even studio lighting, no harsh shadows. Crisp sharp focus on every detail of the fabric texture and batik pattern.",
    "No human figure, no face, no skin, no mannequin, no hanger — garment only on white background.",
    "High-end fashion e-commerce photography, 4K, ultra-detailed.",
  ].join(" ");
}

function buildGarmentPromptFallback(body: SinglePersonBody): string {
  const colors = body.outfit.colors.join(", ");
  return [
    `Front-facing product photo of a traditional Indonesian ${body.regionName} batik garment on a plain white background.`,
    `Color palette: ${colors}. Authentic hand-drawn batik motifs clearly visible.`,
    "Soft studio lighting, garment fully visible. No human, no face, no mannequin.",
  ].join(" ");
}

function buildBgSwapPrompt(_body: SinglePersonBody, landscapeSceneHint: string): string {
  return [
    landscapeSceneHint + ".",
    "Editorial portrait style — rich, painterly atmosphere with deep golden and amber tones.",
    "Soft dramatic lighting from above, casting warm highlights on traditional architecture.",
    "Lush tropical foliage framing the scene, slightly soft-focused.",
    "Cinematic color grading: saturated earth tones, teal shadows, golden highlights.",
    "Empty background — no other people, no crowd, no tourists.",
    "No text, no watermark.",
  ].join(" ");
}

function cleanLandscapePrompt(raw: string): string {
  return raw
    .replace(/No people[^.]*\./gi, "")
    .replace(/no text[^.]*\./gi, "")
    .replace(/no watermark[^.]*\./gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildGroupBgSwapPrompt(body: RequestBody, persons: PersonInput[], landscapeSceneHint: string): string {
  const outfitNames = [...new Set(persons.map((p) => p.outfit.name))].join(" and ");
  const groupDesc = persons.length === 2 ? "a couple" : `a group of ${persons.length} people`;
  return [
    `Replace the background behind ${groupDesc} wearing traditional Indonesian ${outfitNames} attire with: ${landscapeSceneHint}.`,
    `Preserve the appearance, complete outfits, and natural poses of all ${persons.length} people exactly.`,
    "Output landscape orientation (4:3 aspect ratio). All subjects centered and clearly visible, full outfits shown.",
    "Follow the reference background image closely for composition, perspective, depth of field, and atmospheric lighting.",
    "Natural perspective, coherent lighting between subjects and background. Warm, cinematic color grade.",
    "Single unified image — no compositing artifacts, no color mismatch.",
    "No additional people, no text, no watermark.",
  ].join(" ");
}

function buildGroupPhotoBatikClothingPrompt(body: RequestBody): string {
  const maleCount = body.maleCount ?? 0;
  const femaleCount = body.femaleCount ?? 0;
  const outfitName = body.groupOutfitName || `traditional ${body.regionName} batik`;

  const clothingLines: string[] = [];
  if (femaleCount > 0 && maleCount > 0) {
    clothingLines.push(
      `Dress the ${femaleCount} ${femaleCount === 1 ? "woman" : "women"} in elegant traditional Indonesian ${outfitName} kebaya attire with batik skirt and the ${maleCount} ${maleCount === 1 ? "man" : "men"} in formal traditional Indonesian ${outfitName} batik shirts with batik trousers or sarong.`,
    );
  } else if (femaleCount > 0) {
    clothingLines.push(
      `Dress all ${femaleCount} ${femaleCount === 1 ? "person" : "people"} in elegant traditional Indonesian ${outfitName} kebaya attire with authentic batik patterns and accessories.`,
    );
  } else if (maleCount > 0) {
    clothingLines.push(
      `Dress all ${maleCount} ${maleCount === 1 ? "person" : "people"} in formal traditional Indonesian ${outfitName} batik shirts with batik trousers or ceremonial sarong.`,
    );
  } else {
    clothingLines.push(
      `Dress everyone in traditional Indonesian ${outfitName} batik attire appropriate to their gender — kebaya for women, batik shirt and trousers for men.`,
    );
  }

  return [
    ...clothingLines,
    "Preserve the exact body positions, heights, and spatial arrangement of every person. Keep their faces, skin tones, and hair as close as possible to the original.",
    `The clothing should feature authentic ${body.regionName} batik motifs, rich colors, and traditional Indonesian accessories.`,
    "Photorealistic, natural fabric draping, correct proportions.",
  ].join(" ");
}

function buildGroupPhotoBgSwapPrompt(body: RequestBody, landscapeSceneHint: string): string {
  return [
    `Transport this group wearing traditional Indonesian batik to an authentic ${body.regionName} cultural setting: ${landscapeSceneHint}.`,
    "Replace only the background. Keep all people exactly as they appear — do not alter their faces, clothing, or positions.",
    "The new background should be photorealistic, culturally rich, and evoke the beauty of Indonesian heritage.",
    "Warm natural lighting matching the subjects. No text, no watermarks.",
  ].join(" ");
}

// ── Data URI helpers ─────────────────────────────────────────────────────────

function splitDataUri(input: string): { mimeType: string; bytesBase64: string } {
  if (input.includes(",")) {
    const [header, data] = input.split(",", 2);
    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
    return {
      mimeType: mimeMatch?.[1] ?? "image/png",
      bytesBase64: data,
    };
  }
  return { mimeType: "image/png", bytesBase64: input };
}

// ── Person image preparation for VTO ────────────────────────────────────────

/**
 * Prepares a stable, well-framed person image for the VTO model.
 * Uses a portrait crop internally (VTO models prefer portrait input),
 * but centers the subject with generous padding so the full figure is visible.
 */
async function preparePersonImageForVto(personB64: string): Promise<string> {
  const input = Buffer.from(personB64, "base64");

  // VTO models expect portrait (3:4) person images for best results.
  // We use 768×1024 internally but ensure the subject occupies ~80% of height.
  const targetW = 768;
  const targetH = 1024;

  // Clean neutral white background gives VTO the clearest subject boundary.
  // A blurred version of the original image confuses subject segmentation.
  const bg = await sharp({
    create: { width: targetW, height: targetH, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .png()
    .toBuffer();

  // Subject: sized to occupy ~80% of frame height with full figure showing.
  const subjectTargetH = Math.round(targetH * 0.82);
  const subjectTargetW = Math.round(targetW * 0.88);

  const subject = await sharp(input)
    .resize(subjectTargetW, subjectTargetH, {
      fit: "contain",
      background: { r: 245, g: 245, b: 245, alpha: 1 },
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  // Composite: center horizontally, slight breathing room at the top for the head.
  const subjectMeta = await sharp(subject).metadata();
  const subjectH = subjectMeta.height ?? subjectTargetH;
  const topOffset = Math.max(0, Math.round((targetH - subjectH) * 0.08));

  const framed = await sharp(bg)
    .composite([{ input: subject, gravity: "center", top: topOffset, left: Math.round((targetW - (subjectMeta.width ?? subjectTargetW)) / 2) }])
    .png()
    .toBuffer();

  return framed.toString("base64");
}

// ── Imagen background swap (Phase 2) — raw REST API matching the test script ──

async function runImagenBgSwap(
  vtoImageDataUri: string,
  prompt: string,
  location: string,
  project: string,
  landscapeB64?: string | null,
  _aspectRatio = "3:4",
): Promise<string> {
  const apiKey = getServerEnv("GOOGLE_CLOUD_API_KEY");
  const model = getServerEnv("IMAGEN_EDIT_MODEL", "imagen-3.0-capability-001");
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict?key=${apiKey}`;

  const { mimeType, bytesBase64 } = splitDataUri(vtoImageDataUri);

  const referenceImages: unknown[] = [
    {
      referenceType: "REFERENCE_TYPE_RAW",
      referenceId: 1,
      referenceImage: { bytesBase64Encoded: bytesBase64, mimeType },
    },
    {
      referenceType: "REFERENCE_TYPE_MASK",
      referenceId: 2,
      maskImageConfig: { maskMode: "MASK_MODE_BACKGROUND", dilation: 0.02 },
    },
  ];

  if (landscapeB64) {
    referenceImages.push({
      referenceType: "REFERENCE_TYPE_STYLE",
      referenceId: 3,
      referenceImage: { bytesBase64Encoded: landscapeB64 },
      referenceConfig: {
        styleDescription: "Match the perspective, ambient lighting, and composition of this location.",
      },
    });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt, referenceImages }],
      parameters: {
        editMode: "EDIT_MODE_BGSWAP",
        editConfig: { baseSteps: 75 },
        sampleCount: 1,
        personGeneration: "allow_all",
        safetyFilterLevel: "block_some",
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BGSwap HTTP ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json() as { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> };
  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    throw new Error("BGSwap returned no image: " + JSON.stringify(data).slice(0, 300));
  }
  return `data:${data.predictions![0].mimeType ?? "image/png"};base64,${b64}`;
}

// ── Group photo: inpaint clothing change (foreground mask) ───────────────────

async function runImagenClothingChange(
  groupPhotoDataUri: string,
  clothingPrompt: string,
  location: string,
  project: string,
): Promise<string> {
  const { mimeType, bytesBase64 } = splitDataUri(groupPhotoDataUri);
  const client = new GoogleGenAI({ vertexai: true, project, location });

  const rawRef = new RawReferenceImage();
  rawRef.referenceId = 0;
  rawRef.referenceImage = { imageBytes: bytesBase64, mimeType };

  const maskRef = new MaskReferenceImage();
  maskRef.referenceId = 1;
  maskRef.config = {
    maskMode: MaskReferenceMode.MASK_MODE_FOREGROUND,
    maskDilation: 0.01,
  };

  const response = await client.models.editImage({
    model: getServerEnv("IMAGEN_EDIT_MODEL", "imagen-3.0-capability-001"),
    prompt: clothingPrompt,
    referenceImages: [rawRef, maskRef],
    config: {
      editMode: EditMode.EDIT_MODE_INPAINT_INSERTION,
      numberOfImages: 1,
      aspectRatio: "4:3",
      personGeneration: PersonGeneration.ALLOW_ALL,
      safetyFilterLevel: SafetyFilterLevel.BLOCK_MEDIUM_AND_ABOVE,
      negativePrompt: [
        "extra people", "missing people", "wrong number of people",
        "deformed clothing", "unrealistic garments", "floating garments",
        "text", "watermark", "logo",
        "low quality", "blurry",
      ].join(", "),
      addWatermark: false,
      baseSteps: 50,
    },
  });

  const generated = response.generatedImages?.[0]?.image;
  const outB64 = generated?.imageBytes;
  if (!outB64) {
    throw new Error("Imagen clothing change returned no image bytes");
  }
  return `data:${generated?.mimeType || "image/png"};base64,${outB64}`;
}

// ── Virtual Try-On types ─────────────────────────────────────────────────────

type VTOPrediction = {
  bytesBase64Encoded?: string;
  mimeType?: string;
};

type VTOResponse = {
  predictions?: VTOPrediction[];
  error?: { code?: number; message?: string };
};

// ── Step 1: Generate flat-lay garment image ──────────────────────────────────

async function generateGarmentImage(
  garmentPrompt: string,
  apiKey: string,
  location: string,
  project: string,
): Promise<string> {
  const imagenModel = getServerEnv("IMAGEN_MODEL", "imagen-4.0-generate-001");
  const imagenUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${imagenModel}:predict?key=${apiKey}`;

  console.log(`[vto-step1] Generating garment with ${imagenModel}`);
  console.log(`[vto-step1] prompt: ${garmentPrompt.slice(0, 200)}...`);

  const payload = {
    instances: [{ prompt: garmentPrompt }],
    parameters: {
      sampleCount: 1,
      // Square aspect ratio gives VTO the most faithful garment layout
      aspectRatio: "1:1",
      personGeneration: "allow_adult",
      safetyFilterLevel: "block_few",
    },
  };

  const t0 = Date.now();
  const resp = await fetch(imagenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  console.log(`[vto-step1] ${resp.status} ${resp.statusText} in ${Date.now() - t0}ms`);

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`[vto-step1] ERROR: ${err.slice(0, 600)}`);
    throw new Error(`Garment generation failed (${resp.status}): ${err.slice(0, 600)}`);
  }

  const data = (await resp.json()) as VTOResponse;
  const garmentB64 = data.predictions?.[0]?.bytesBase64Encoded;

  if (!garmentB64) {
    console.warn(`[vto-step1] ⚠ safety filter blocked garment: ${JSON.stringify(data).slice(0, 300)}`);
    throw new Error(`Imagen 4 returned no garment image (safety filter). Response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  console.log(`[vto-step1] ✓ garment generated (${Math.round(garmentB64.length * 0.75 / 1024)}KB)`);
  return garmentB64;
}

// ── Step 2: Virtual Try-On ───────────────────────────────────────────────────

async function runVirtualTryOn(
  personB64: string,
  garmentB64: string,
  numImages: number,
  apiKey: string,
  location: string,
  project: string,
): Promise<string[]> {
  const vtoModel = getServerEnv("GEMINI_IMAGE_MODEL", "virtual-try-on-001");
  const vtoUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${vtoModel}:predict?key=${apiKey}`;
  const safeVtoUrl = vtoUrl.replace(apiKey, "***");

  const vtoPayload = {
    instances: [{
      personImage: {
        image: { bytesBase64Encoded: personB64 },
      },
      productImages: [{
        image: { bytesBase64Encoded: garmentB64 },
      }],
    }],
    parameters: {
      sampleCount: numImages,
      baseSteps: 75,
      personGeneration: "allow_all",
      negativePrompt: "multiple people, extra person, background person, crowd, bystander, second person, third person, group of people",
    },
  };

  console.log(`[vto-step2] POST ${safeVtoUrl}`);
  console.log(`[vto-step2] model=${vtoModel}  sampleCount=${numImages}`);

  const t1 = Date.now();
  const response = await fetch(vtoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vtoPayload),
  });

  console.log(`[vto-step2] ${response.status} ${response.statusText} in ${Date.now() - t1}ms`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[vto-step2] ERROR: ${errorText.slice(0, 600)}`);
    throw new Error(`Virtual Try-On failed (${response.status}): ${errorText.slice(0, 600)}`);
  }

  const data = (await response.json()) as VTOResponse;

  if (data.error) {
    console.error(`[vto-step2] API error: ${JSON.stringify(data.error)}`);
    throw new Error(`Virtual Try-On error ${data.error.code}: ${data.error.message}`);
  }

  const predictions = data.predictions ?? [];
  console.log(`[vto-step2] predictions: ${predictions.length}`);

  if (predictions.length === 0) {
    throw new Error(`Virtual Try-On returned no predictions. Response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return predictions
    .filter((p) => typeof p.bytesBase64Encoded === "string" && p.bytesBase64Encoded.length > 0)
    .map((p) => {
      const mime = p.mimeType ?? "image/png";
      const kb = Math.round((p.bytesBase64Encoded?.length ?? 0) * 0.75 / 1024);
      console.log(`[vto-step2] ✓ image  mimeType=${mime}  ~${kb}KB`);
      return `data:${mime};base64,${p.bytesBase64Encoded}`;
    });
}

// ── Imagen 4 direct generation (vertex backend) ──────────────────────────────

type Imagen4Prediction = {
  bytesBase64Encoded?: string;
  mimeType?: string;
};

type Imagen4Response = {
  predictions?: Imagen4Prediction[];
};

async function generateWithImagen4(
  prompt: string,
  numImages: number,
  apiKey: string,
  model: string,
  baseUrl: string,
  aspectRatio: string,
  referenceImageB64?: string | null,
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/${model}:predict?key=${apiKey}`;
  const safeUrl = url.replace(apiKey, "***");

  const instance: Record<string, unknown> = { prompt };
  if (referenceImageB64) {
    instance.referenceImages = [{
      referenceType: "STYLE",
      referenceId: 1,
      referenceImage: { bytesBase64Encoded: referenceImageB64 },
    }];
    console.log(`[imagen4] Including landscape as STYLE reference`);
  }

  const payload = {
    instances: [instance],
    parameters: {
      sampleCount: numImages,
      aspectRatio,
      personGeneration: "allow_adult",
      safetyFilterLevel: "block_some",
    },
  };

  console.log(`[imagen4] POST ${safeUrl}`);
  console.log(`[imagen4] model=${model}  aspectRatio=${aspectRatio}`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  console.log(`[imagen4] ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[imagen4] ERROR: ${errorText.slice(0, 600)}`);
    throw new Error(`Imagen 4 request failed (${response.status}): ${errorText.slice(0, 600)}`);
  }

  const data = (await response.json()) as Imagen4Response;
  const predictions = data.predictions ?? [];
  console.log(`[imagen4] predictions: ${predictions.length}`);

  if (predictions.length === 0) {
    throw new Error(`Imagen 4 returned no predictions. Response: ${JSON.stringify(data)}`);
  }

  return predictions
    .filter((p) => typeof p.bytesBase64Encoded === "string" && p.bytesBase64Encoded.length > 0)
    .map((p) => `data:${p.mimeType ?? "image/png"};base64,${p.bytesBase64Encoded}`);
}

// ── Chutes fallback helpers ───────────────────────────────────────────────────

function extractBase64FromChutesResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  for (const key of ["image", "image_b64"]) {
    if (typeof payload[key] === "string" && (payload[key] as string).length > 0) {
      return payload[key] as string;
    }
  }
  for (const key of ["images", "image_b64s"]) {
    const arr = payload[key];
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string") {
      return arr[0] as string;
    }
  }
  return null;
}

// ── Group: composite multiple VTO portraits side-by-side on a 4:3 canvas ───────
// Each portrait (768×1024) is placed side by side with equal spacing.
// The canvas is always 4:3 so BGSwap receives the right aspect ratio.

async function compositeGroupPortraits(portraitDataUris: string[]): Promise<string> {
  const count = portraitDataUris.length;
  // Decode all portraits and get metadata in parallel
  const buffers = await Promise.all(
    portraitDataUris.map(async (uri) => {
      const { bytesBase64 } = splitDataUri(uri);
      return Buffer.from(bytesBase64, "base64");
    }),
  );
  const metas = await Promise.all(buffers.map((b) => sharp(b).metadata()));

  const srcH = metas[0].height ?? 1024;
  const srcW = metas[0].width ?? 768;

  // Canvas: height = srcH, width = 4:3 × srcH
  const targetH = srcH;
  const targetW = Math.round(srcH * (4 / 3));

  // Scale each portrait so all fit within the canvas at equal width
  const slotW = Math.floor(targetW / count);
  const scale = Math.min(slotW / srcW, 1); // never upscale
  const thumbH = Math.round(srcH * scale);
  const thumbW = Math.round(srcW * scale);

  // Neutral background
  const bg = await sharp({
    create: { width: targetW, height: targetH, channels: 3, background: { r: 245, g: 245, b: 245 } },
  })
    .png()
    .toBuffer();

  // Resize each portrait and compute offsets
  const composites: sharp.OverlayOptions[] = await Promise.all(
    buffers.map(async (buf, i) => {
      const thumb = await sharp(buf)
        .resize(thumbW, thumbH, { fit: "contain", background: { r: 245, g: 245, b: 245, alpha: 1 } })
        .png()
        .toBuffer();
      const left = Math.round(slotW * i + (slotW - thumbW) / 2);
      const top = Math.round((targetH - thumbH) / 2);
      return { input: thumb, left, top };
    }),
  );

  const composite = await sharp(bg).composite(composites).png().toBuffer();
  console.log(`[group-composite] ${count} portraits → ${targetW}×${targetH}`);
  return `data:image/png;base64,${composite.toString("base64")}`;
}

// ── Traditional garment loader ────────────────────────────────────────────────
// Maps clothes_data.json regionId → filename prefix in indonesia_traditional_clothes/

const REGION_TO_PROVINCE_DIR: Record<string, string> = {
  aceh:                "Aceh",
  sumatera_utara:      "North_Sumatra",
  sumatera_barat:      "West_Sumatra",
  riau:                "Riau",
  jambi:               "Jambi",
  sumatera_selatan:    "South_Sumatra",
  bengkulu:            "Bengkulu",
  lampung:             "Lampung",
  kep_bangka_belitung: "Bangka_Belitung_Islands",
  kep_riau:            "Riau_Islands",
  dki_jakarta:         "Jakarta",
  jawa_barat:          "West_Java",
  jawa_tengah:         "Central_Java",
  di_yogyakarta:       "Yogyakarta",
  jawa_timur:          "East_Java",
  banten:              "Banten",
  bali:                "Bali",
  nusa_tenggara_barat: "West_Nusa_Tenggara",
  nusa_tenggara_timur: "East_Nusa_Tenggara",
  kalimantan_barat:    "West_Kalimantan",
  kalimantan_tengah:   "Central_Kalimantan",
  kalimantan_selatan:  "South_Kalimantan",
  kalimantan_timur:    "East_Kalimantan",
  kalimantan_utara:    "North_Kalimantan",
  sulawesi_utara:      "North_Sulawesi",
  sulawesi_tengah:     "Central_Sulawesi",
  sulawesi_selatan:    "South_Sulawesi",
  sulawesi_tenggara:   "Southeast_Sulawesi",
  gorontalo:           "Gorontalo",
  sulawesi_barat:      "West_Sulawesi",
  maluku:              "Maluku",
  maluku_utara:        "North_Maluku",
  papua_barat:         "West_Papua",
  papua_barat_daya:    "Southwest_Papua",
  papua:               "Papua",
  papua_selatan:       "South_Papua",
  papua_tengah:        "Central_Papua",
  papua_pegunungan:    "Highland_Papua",
};

/**
 * Load a garment from indonesia_traditional_clothes/ by regionId + gender.
 * Randomly picks between the _0 and _1 variants.
 * Returns base64 PNG, or null if the directory / file is unavailable.
 */
function loadTraditionalGarmentB64(regionId: string, gender: "female" | "male"): string | null {
  try {
    const dirPrefix = REGION_TO_PROVINCE_DIR[regionId];
    if (!dirPrefix) return null;

    // DATA_DIR=/app/data in Cloud Run; locally falls back to parent of cwd
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "..");
    const clothesDir = path.join(dataDir, "indonesia_traditional_clothes");
    if (!existsSync(clothesDir)) return null;

    const candidates = [0, 1]
      .map((i) => path.join(clothesDir, `${dirPrefix}_${gender}_${i}.png`))
      .filter((p) => existsSync(p));

    if (candidates.length === 0) return null;

    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    const b64 = readFileSync(picked).toString("base64");
    console.log(`[generate] 👘 Traditional garment: ${path.basename(picked)}`);
    return b64;
  } catch {
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const numImages = Math.min(4, Math.max(1, Number(body.numImages ?? 1)));

    // ── Normalise: accept group photo mode, group mode, or legacy single-person mode ──
    if (!body.regionName) {
      return NextResponse.json({ error: "regionName is required." }, { status: 400 });
    }

    const isGroupPhotoMode = Boolean(body.groupPhotoMode && body.groupPhotoB64);
    const isGroupMode = !isGroupPhotoMode && Array.isArray(body.persons) && body.persons.length >= 2;

    if (isGroupPhotoMode) {
      // No extra validation needed beyond regionName
    } else if (isGroupMode) {
      if (body.persons!.length > 4) {
        return NextResponse.json({ error: "Maximum 4 persons supported in group mode." }, { status: 400 });
      }
      if (body.persons!.some((p) => !p.faceImageB64 || !p.outfit || !p.gender)) {
        return NextResponse.json({ error: "Each person must have faceImageB64, outfit, and gender." }, { status: 400 });
      }
    } else {
      if (!body.outfit || !body.faceImageB64) {
        return NextResponse.json({ error: "Missing required payload fields" }, { status: 400 });
      }
    }

    // Resolve backend
    const modelTypeToBackend: Record<string, string> = {
      gemini_vto: "gemini",
      imagen4: "vertex",
      chutes: "chutes",
      gemini_flash: "default",
    };
    const clientModel = body.modelType ?? "";
    const resolvedBackend = modelTypeToBackend[clientModel]
      || (getServerEnv("GENERATION_BACKEND", "vertex") || "vertex").toLowerCase();
    const backend = resolvedBackend;

    const ASPECT_RATIO = "4:3";

    // For single-person mode, build the prompt as before
    const prompt = isGroupMode || isGroupPhotoMode ? "" : buildPrompt(body as SinglePersonBody, numImages);

    if (isGroupPhotoMode) {
      console.log(`[generate] GROUP PHOTO MODE  backend="${backend}"  region="${body.regionName}"`);
    } else if (isGroupMode) {
      console.log(`[generate] GROUP MODE  backend="${backend}"  persons=${body.persons!.length}  region="${body.regionName}"`);
    } else {
      console.log(`[generate] backend="${backend}" modelType="${clientModel}" numImages=${numImages} region="${body.regionName}" outfit="${body.outfit!.name}" aspect="${ASPECT_RATIO}"`);
    }
    if (body.backgroundPrompt) {
      console.log(`[generate] backgroundPrompt: ${body.backgroundPrompt.slice(0, 120)}`);
    }

    const storageMeta = isGroupPhotoMode
      ? { outfitId: "group-photo", regionId: body.regionId ?? body.regionName, gender: "group" }
      : isGroupMode
      ? { outfitId: "group", regionId: body.regionId ?? body.regionName, gender: "group" }
      : { outfitId: body.outfit!.id, regionId: body.regionId ?? body.regionName, gender: body.gender! };

    if (isGroupPhotoMode) {
      await saveFaceImage(body.groupPhotoB64!, storageMeta);
    } else if (!isGroupMode) {
      await saveFaceImage(body.faceImageB64!, storageMeta);
    } else {
      await Promise.all(
        body.persons!.map((person) =>
          saveFaceImage(person.faceImageB64, { ...storageMeta, gender: person.gender }),
        ),
      );
    }

    // ── Resolve landscape reference ─────────────────────────────────────────
    let landscapeB64: string | null = null;
    if (body.landscapeFilename) {
      landscapeB64 = await loadLandscapeB64(body.landscapeFilename);
      if (landscapeB64) {
        console.log(`[generate] 🏔 Landscape: ${body.landscapeFilename}`);
      } else {
        console.warn(`[generate] ⚠ Landscape not found: ${body.landscapeFilename}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── Gemini VTO pipeline ───────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    if (backend === "gemini") {
      const apiKey = getServerEnv("GOOGLE_CLOUD_API_KEY");
      if (!apiKey) {
        return NextResponse.json({ error: "GOOGLE_CLOUD_API_KEY is not configured." }, { status: 500 });
      }
      const location = getServerEnv("GOOGLE_CLOUD_LOCATION", "us-central1");
      const project = getServerEnv("GOOGLE_CLOUD_PROJECT", "");

      // ── Helper: resolve/generate garment for one person ──────────────────
      async function resolveGarment(person: PersonInput, garmentFilename?: string): Promise<{ garmentB64: string; garmentPrompt: string; garmentReused: boolean }> {
        let garmentB64: string;
        let garmentPrompt = "";
        let garmentReused = false;

        const personBody = { ...body, gender: person.gender, outfit: person.outfit, faceImageB64: person.faceImageB64 } as SinglePersonBody;

        if (garmentFilename) {
          const loaded = await loadGarmentB64(garmentFilename);
          if (!loaded) throw new Error("Stored garment not found.");
          garmentB64 = loaded;
          garmentReused = true;
          console.log(`[generate] ♻ Reusing stored garment: ${garmentFilename}`);
        } else {
          // ── 1. Try traditional garment from disk (fastest, no API call) ──
          const traditional = loadTraditionalGarmentB64(body.regionId ?? "", person.gender);
          if (traditional) {
            garmentB64 = traditional;
            garmentReused = true; // skip saveGarmentImage — it's a static asset
          } else {
            // ── 2. Reuse previously generated garment for same outfit ──
            const existing = await findGarmentsByOutfit(person.outfit.id);
            if (existing.length > 0) {
              const loaded = await loadGarmentB64(existing[existing.length - 1].filename);
              if (loaded) {
                garmentB64 = loaded;
                garmentReused = true;
                console.log(`[generate] ♻ Auto-reusing garment for outfit ${person.outfit.id}`);
              }
            }

            // ── 3. Generate garment with Imagen 4 (fallback) ──
            if (!garmentB64!) {
              garmentPrompt = buildGarmentPrompt(personBody);
              try {
                garmentB64 = await generateGarmentImage(garmentPrompt, apiKey, location, project);
              } catch (err) {
                if (err instanceof Error && err.message.includes("safety filter")) {
                  garmentPrompt = buildGarmentPromptFallback(personBody);
                  garmentB64 = await generateGarmentImage(garmentPrompt, apiKey, location, project);
                } else throw err;
              }
            }
          }
        }

        if (!garmentReused) {
          await saveGarmentImage(`data:image/png;base64,${garmentB64}`, {
            outfitId: person.outfit.id,
            regionId: body.regionId ?? body.regionName,
            gender: person.gender,
            prompt: garmentPrompt,
          });
        }

        return { garmentB64, garmentPrompt, garmentReused };
      }

      // ── Helper: build BGSwap scene hint ──────────────────────────────────
      async function resolveLandscapeSceneHint(): Promise<string> {
        let hint = body.backgroundPrompt
          || `authentic ${body.regionName} Indonesian cultural landscape with traditional architecture and lush tropical surroundings`;
        if (body.landscapeFilename) {
          const allLandscapes = await listAllLandscapes();
          const selected = allLandscapes.find((l) => l.filename === body.landscapeFilename);
          if (selected?.prompt) hint = cleanLandscapePrompt(selected.prompt);
        }
        return hint;
      }

      // ── Helper: run BGSwap on an array of 4:3 canvases ───────────────────
      async function runBgSwapOnCanvases(
        canvases: string[],
        swapPrompt: string,
        aspectRatio = "3:4",
      ): Promise<{ finalImages: string[]; phase2Applied: boolean }> {
        const bgImages: string[] = [];
        for (let i = 0; i < canvases.length; i++) {
          try {
            const swapped = await runImagenBgSwap(canvases[i], swapPrompt, location, project, landscapeB64, aspectRatio);
            bgImages.push(swapped);
            console.log(`[generate] [phase2] ✓ bgswap ${i + 1}/${canvases.length}`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[generate] ⚠ Phase 2 image ${i + 1} failed: ${msg} — fallback`);
            bgImages.push(canvases[i]);
          }
        }
        return {
          finalImages: bgImages,
          phase2Applied: bgImages.some((img, i) => img !== canvases[i]),
        };
      }

      console.log(`[generate] → VTO  location="${location}" project="${project}" groupMode=${isGroupMode} groupPhotoMode=${isGroupPhotoMode}`);

      // ══════════════════════════════════════════════════════════════════════
      // ── GROUP PHOTO MODE: BGSwap a single group photo to Indonesian scene ─
      // ══════════════════════════════════════════════════════════════════════
      if (isGroupPhotoMode) {
        const { bytesBase64: photoB64Raw } = splitDataUri(body.groupPhotoB64!);
        const photoDataUri = `data:image/jpeg;base64,${photoB64Raw}`;

        // Pass 1: Dress everyone in batik (foreground inpainting)
        const clothingPrompt = buildGroupPhotoBatikClothingPrompt(body);
        console.log(`[generate] [group-photo pass1 clothing] prompt: ${clothingPrompt.slice(0, 220)}`);
        let clothedDataUri = photoDataUri;
        try {
          clothedDataUri = await runImagenClothingChange(photoDataUri, clothingPrompt, location, project);
          console.log(`[generate] [group-photo pass1] ✓ clothing applied`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[generate] [group-photo pass1] ⚠ clothing change failed: ${msg} — proceeding with original`);
        }

        // Pass 2: BGSwap to Indonesian scene background (N times for numImages)
        const photoCanvases = Array<string>(numImages).fill(clothedDataUri);
        const sceneHint = await resolveLandscapeSceneHint();
        const bgSwapPrompt = buildGroupPhotoBgSwapPrompt(body, sceneHint);
        console.log(`[generate] [group-photo pass2 bgswap] prompt: ${bgSwapPrompt.slice(0, 220)}`);

        const { finalImages, phase2Applied } = await runBgSwapOnCanvases(photoCanvases, bgSwapPrompt);
        const watermarkedFinal = await applyWatermarkToAll(finalImages);
        await Promise.all(watermarkedFinal.map((img, i) => saveResultImage(img, { ...storageMeta, index: i })));

        return NextResponse.json({
          images: watermarkedFinal,
          prompt: clothingPrompt,
          backend: "gemini",
          garmentReused: false,
          phase2Applied,
          groupPhotoMode: true,
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // ── GROUP MODE: VTO each person individually, composite, then BGSwap ──
      // ══════════════════════════════════════════════════════════════════════
      if (isGroupMode) {
        const persons = body.persons!;

        // Run VTO for each person (sequential to avoid rate-limit spikes)
        const personPortraits: string[] = [];
        let allGarmentPrompts = "";
        for (const person of persons) {
          const { bytesBase64: personB64Raw } = splitDataUri(person.faceImageB64);
          const personB64 = await preparePersonImageForVto(personB64Raw);

          const { garmentB64, garmentPrompt } = await resolveGarment(person);
          allGarmentPrompts = allGarmentPrompts ? `${allGarmentPrompts} | ${garmentPrompt}` : garmentPrompt;

          const t0 = Date.now();
          // Request 1 image per person for group mode
          const vto = await runVirtualTryOn(personB64, garmentB64, 1, apiKey, location, project);
          console.log(`[generate] ✓ VTO person ${persons.indexOf(person) + 1}/${persons.length} in ${Date.now() - t0}ms`);
          personPortraits.push(vto[0]);
        }

        // Composite all person portraits side-by-side — one canvas, reused for each BGSwap call
        const groupCanvas = await compositeGroupPortraits(personPortraits);
        const groupCanvases = Array<string>(numImages).fill(groupCanvas);

        // Phase 2: BGSwap on the group composite
        const sceneHint = await resolveLandscapeSceneHint();
        const bgSwapPrompt = buildGroupBgSwapPrompt(body, persons, sceneHint);
        console.log(`[generate] [group phase2] prompt: ${bgSwapPrompt.slice(0, 220)}`);

        const { finalImages, phase2Applied } = await runBgSwapOnCanvases(groupCanvases, bgSwapPrompt);
        const watermarkedFinal = await applyWatermarkToAll(finalImages);
        await Promise.all(watermarkedFinal.map((img, i) => saveResultImage(img, { ...storageMeta, index: i })));

        return NextResponse.json({
          images: watermarkedFinal,
          prompt: allGarmentPrompts || "(group generation)",
          backend: "gemini",
          garmentReused: false,
          phase2Applied,
          groupMode: true,
          personCount: persons.length,
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // ── SINGLE-PERSON MODE (legacy) ────────────────────────────────────────
      // ══════════════════════════════════════════════════════════════════════
      const singlePerson: PersonInput = {
        faceImageB64: body.faceImageB64!,
        gender: body.gender!,
        outfit: body.outfit!,
      };

      // Pass raw photo bytes directly — auto-rotate via EXIF so VTO sees an upright person
      const { bytesBase64: personB64Raw } = splitDataUri(singlePerson.faceImageB64);
      const personB64 = await sharp(Buffer.from(personB64Raw, "base64"))
        .rotate() // applies EXIF orientation, then strips the tag
        .jpeg({ quality: 95 })
        .toBuffer()
        .then(b => b.toString("base64"));

      const { garmentB64, garmentPrompt, garmentReused } = await resolveGarment(singlePerson, body.garmentFilename);

      const t0 = Date.now();
      const vtoImages = await runVirtualTryOn(personB64, garmentB64, numImages, apiKey, location, project);
      console.log(`[generate] ✓ VTO: ${vtoImages.length} image(s) in ${Date.now() - t0}ms`);

      // Phase 2: BGSwap on the portrait directly (3:4) — no landscape expansion
      const sceneHint = await resolveLandscapeSceneHint();
      const bgSwapPrompt = buildBgSwapPrompt({ ...body, ...singlePerson } as SinglePersonBody, sceneHint);
      console.log(`[generate] [phase2] prompt: ${bgSwapPrompt.slice(0, 220)}`);

      const { finalImages, phase2Applied } = await runBgSwapOnCanvases(vtoImages, bgSwapPrompt, "3:4");

      const watermarkedFinal = await applyWatermarkToAll(finalImages);
      await Promise.all(watermarkedFinal.map((img, i) => saveResultImage(img, { ...storageMeta, index: i })));

      return NextResponse.json({
        images: watermarkedFinal,
        prompt: garmentPrompt || "(reused garment)",
        backend: "gemini",
        garmentReused,
        phase2Applied,
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── Vertex AI / Imagen 4 ──────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    if (backend === "vertex") {
      const apiKey = getServerEnv("GOOGLE_CLOUD_API_KEY");
      if (!apiKey) {
        return NextResponse.json(
          { error: "GOOGLE_CLOUD_API_KEY is not configured for the Vertex AI backend." },
          { status: 500 },
        );
      }

      const model = getServerEnv("IMAGEN_MODEL", "imagen-4.0-generate-001");
      const baseUrl = getServerEnv(
        "IMAGEN_BASE_URL",
        "https://aiplatform.googleapis.com/v1/publishers/google/models",
      );

      // ── Always output 4:3 landscape ────────────────────────────────────────
      const aspectRatio = ASPECT_RATIO;
      const endpointUrl = `${baseUrl.replace(/\/$/, "")}/${model}:predict?key=***`;

      console.log(`[generate] → Imagen 4  model="${model}"  aspectRatio="${aspectRatio}"  endpoint="${endpointUrl}"`);

      // Inject landscape description into text prompt
      let vertexPrompt = prompt;
      if (body.landscapeFilename) {
        const allLandscapes = await listAllLandscapes();
        const landscapeEntry = allLandscapes.find((l) => l.filename === body.landscapeFilename);
        if (landscapeEntry?.prompt) {
          const landscapeDesc = cleanLandscapePrompt(landscapeEntry.prompt);
          vertexPrompt = prompt.replace(
            /BACKGROUND[\s\S]*?(?=PHOTOGRAPHY:|$)/,
            `BACKGROUND: ${landscapeDesc} `,
          );
          console.log(`[generate] ✓ Landscape description injected into vertex prompt`);
        }
      }

      console.log(`[generate] prompt: ${vertexPrompt.slice(0, 200)}...`);

      const t0 = Date.now();
      const images = await generateWithImagen4(vertexPrompt, numImages, apiKey, model, baseUrl, aspectRatio, null);
      console.log(`[generate] ✓ Imagen 4: ${images.length} image(s) in ${Date.now() - t0}ms`);

      const watermarkedImages = await applyWatermarkToAll(images);
      await Promise.all(watermarkedImages.map((img, i) => saveResultImage(img, { ...storageMeta, index: i })));

      return NextResponse.json({ images: watermarkedImages, prompt: vertexPrompt, backend: "vertex" });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ── Chutes fallback ───────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════════

    const chutesUrl = getServerEnv("CHUTES_IMAGE_URL");
    const chutesToken = getServerEnv("CHUTES_API_TOKEN") || getServerEnv("CHUTES_API_KEY");
    const trueCfgScale = Number(getServerEnv("CHUTES_TRUE_CFG_SCALE", "4"));
    const numInferenceSteps = Number(getServerEnv("CHUTES_NUM_INFERENCE_STEPS", "40"));
    const negativePrompt = getServerEnv("CHUTES_NEGATIVE_PROMPT", "");

    console.log(`[generate] → Chutes fallback  url="${chutesUrl}"  hasToken=${!!chutesToken}`);

    if (!chutesUrl || !chutesToken) {
      return NextResponse.json(
        { error: "Neither Vertex AI nor Chutes backend is properly configured." },
        { status: 500 },
      );
    }

    const results: string[] = [];
    // Chutes does not support group mode — fall back to first person's face
    const chutesFaceB64 = isGroupMode ? body.persons![0].faceImageB64 : (body.faceImageB64 ?? "");
    const chutesRefImages = [chutesFaceB64];
    if (landscapeB64) chutesRefImages.push(`data:image/png;base64,${landscapeB64}`);

    for (let i = 0; i < numImages; i++) {
      const resp = await fetch(chutesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${chutesToken}`,
          "x-api-key": chutesToken,
        },
        body: JSON.stringify({
          seed: null,
          // ── 4:3 landscape dimensions ──────────────────────────────────────
          width: 1365,
          height: 1024,
          prompt,
          image_b64s: chutesRefImages,
          true_cfg_scale: trueCfgScale,
          negative_prompt: negativePrompt,
          num_inference_steps: numInferenceSteps,
        }),
      });

      if (!resp.ok) {
        const errorText = await resp.text();
        return NextResponse.json(
          { error: `Chutes request failed (${resp.status}): ${errorText.slice(0, 400)}` },
          { status: 502 },
        );
      }

      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (ct.startsWith("image/")) {
        const bytes = Buffer.from(await resp.arrayBuffer());
        results.push(`data:${ct};base64,${bytes.toString("base64")}`);
        continue;
      }

      const json = (await resp.json()) as unknown;
      const imageB64 = extractBase64FromChutesResponse(json);
      if (!imageB64) {
        return NextResponse.json({ error: "Unexpected Chutes response format" }, { status: 502 });
      }
      results.push(`data:image/png;base64,${imageB64}`);
    }

    const watermarkedResults = await applyWatermarkToAll(results);
    await Promise.all(watermarkedResults.map((img, i) => saveResultImage(img, { ...storageMeta, index: i })));

    return NextResponse.json({ images: watermarkedResults, prompt, backend: "chutes" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation request failed" },
      { status: 500 },
    );
  }
}