import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";
import {
  saveFaceImage,
  saveGarmentImage,
  saveResultImage,
  loadGarmentB64,
  findGarmentsByOutfit,
} from "@/lib/image-store";

type Outfit = {
  id: string;
  name: string;
  description: string;
  motifs: string[];
  colors: string[];
  accessories: string;
};

type RequestBody = {
  regionName: string;
  regionId?: string;
  gender: "female" | "male";
  outfit: Outfit;
  faceImageB64: string;
  numImages?: number;
  /** If provided, skip garment generation and reuse this stored garment. */
  garmentFilename?: string;
};

const variationHints = [
  "soft natural daylight, outdoor temple background",
  "vibrant studio portrait with ornate Indonesian backdrop",
  "elegant evening scene with golden bokeh lighting",
  "cultural festival atmosphere, dynamic pose",
];

function buildPrompt(body: RequestBody, numImages: number): string {
  const motifs = body.outfit.motifs.join(", ");
  const colors = body.outfit.colors.join(", ");
  const hints = variationHints.slice(0, numImages).join("; ");

  return [
    "TASK: Virtual Try-On for Indonesian Batik clothing.",
    "STRICT IDENTITY PRESERVATION: Keep the person's face, facial features, bone structure, skin tone, and expression EXACTLY as they appear in the provided image. The person in the output must be unmistakably the same person.",
    `CLOTHING: Dress the person in ${body.outfit.name}, a traditional Indonesian outfit from ${body.regionName}.`,
    body.outfit.description,
    `Fabric motifs: ${motifs}.`,
    `Color palette: ${colors}.`,
    `Accessories: ${body.outfit.accessories}.`,
    "SCENE: Professional portrait setting, full body or three-quarter view, culturally authentic and respectful,",
    "sharp focus, vivid colors, 8K resolution, award-winning fashion photography.",
    `Variation styles: ${hints}.`,
  ].join(" ");
}

/** Build a prompt to generate a flat-lay product image of the garment for VTO. */
function buildGarmentPrompt(body: RequestBody): string {
  const motifs = body.outfit.motifs.join(", ");
  const colors = body.outfit.colors.join(", ");
  const genderLabel = body.gender === "female" ? "women's" : "men's";

  return [
    `Professional e-commerce product photo of ${body.outfit.name}, a traditional Indonesian ${genderLabel} batik garment from ${body.regionName}.`,
    body.outfit.description,
    `Fabric features motifs: ${motifs}. Color palette: ${colors}.`,
    "Flat-lay display on clean plain white background.",
    "Full garment visible, neatly arranged, no person, no mannequin.",
    "Studio lighting, sharp focus, high resolution product photography.",
  ].join(" ");
}

// ── Virtual Try-On via Vertex AI :predict endpoint ──────────────────────────

type VTOPrediction = {
  bytesBase64Encoded?: string;
  mimeType?: string;
};

type VTOResponse = {
  predictions?: VTOPrediction[];
  error?: { code?: number; message?: string };
};

/**
 * Two-step Virtual Try-On pipeline:
 *   Step 1 → Imagen 4 generates a flat-lay product image of the garment.
 *   Step 2 → VTO composites the person wearing that garment.
 */
/**
 * Step 1 only: generate a flat-lay garment image with Imagen 4.
 * Returns raw base64 (no data: prefix).
 */
async function generateGarmentImage(
  garmentPrompt: string,
  apiKey: string,
  location: string,
  project: string,
): Promise<string> {
  const imagenModel = getServerEnv("IMAGEN_MODEL", "imagen-4.0-generate-001");
  const imagenUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${imagenModel}:predict?key=${apiKey}`;

  console.log(`[vto-step1] Generating garment image with ${imagenModel}`);
  console.log(`[vto-step1] garmentPrompt: ${garmentPrompt.slice(0, 200)}...`);

  const garmentPayload = {
    instances: [{ prompt: garmentPrompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio: "3:4",
      personGeneration: "dont_allow",
    },
  };

  const t0 = Date.now();
  const garmentResp = await fetch(imagenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(garmentPayload),
  });

  console.log(`[vto-step1] response: ${garmentResp.status} ${garmentResp.statusText} in ${Date.now() - t0}ms`);

  if (!garmentResp.ok) {
    const err = await garmentResp.text();
    console.error(`[vto-step1] ERROR: ${err.slice(0, 600)}`);
    throw new Error(`Garment generation failed (${garmentResp.status}): ${err.slice(0, 600)}`);
  }

  const garmentData = (await garmentResp.json()) as VTOResponse;
  const garmentB64 = garmentData.predictions?.[0]?.bytesBase64Encoded;
  if (!garmentB64) {
    throw new Error(`Imagen 4 returned no garment image. Response: ${JSON.stringify(garmentData).slice(0, 300)}`);
  }
  console.log(`[vto-step1] ✓ garment image generated (${Math.round(garmentB64.length * 0.75 / 1024)}KB)`);
  return garmentB64;
}

/**
 * Step 2 only: Virtual Try-On — person + garment → composite images.
 * Both personB64 and garmentB64 are raw base64 (no data: prefix).
 */
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
      baseSteps: 32,
      personGeneration: "allow_all",
      addWatermark: true,
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

  console.log(`[vto-step2] response: ${response.status} ${response.statusText} in ${Date.now() - t1}ms`);

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
  console.log(`[vto-step2] predictions count: ${predictions.length}`);

  if (predictions.length === 0) {
    throw new Error(`Virtual Try-On returned no predictions. Response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return predictions
    .filter((p) => typeof p.bytesBase64Encoded === "string" && p.bytesBase64Encoded.length > 0)
    .map((p) => {
      const mime = p.mimeType ?? "image/png";
      const kb = Math.round((p.bytesBase64Encoded?.length ?? 0) * 0.75 / 1024);
      console.log(`[vto-step2] ✓ image decoded  mimeType=${mime}  bytes≈${kb}KB`);
      return `data:${mime};base64,${p.bytesBase64Encoded}`;
    });
}

// ── Imagen 4 via Vertex AI publisher endpoint (API-key auth) ─────────────────

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
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/${model}:predict?key=${apiKey}`;
  const safeUrl = url.replace(apiKey, "***");

  const payload = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: numImages,
      aspectRatio,
      personGeneration: "allow_adult",
      safetyFilterLevel: "block_some",
    },
  };

  console.log(`[imagen4] POST ${safeUrl}`);
  console.log(`[imagen4] payload:`, JSON.stringify({ ...payload, instances: [{ prompt: prompt.slice(0, 120) + "..." }] }, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  console.log(`[imagen4] response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[imagen4] ERROR body: ${errorText.slice(0, 600)}`);
    throw new Error(`Imagen 4 request failed (${response.status}): ${errorText.slice(0, 600)}`);
  }

  const data = (await response.json()) as Imagen4Response;
  console.log(`[imagen4] predictions count: ${data.predictions?.length ?? 0}`);

  const predictions = data.predictions ?? [];
  if (predictions.length === 0) {
    throw new Error(`Imagen 4 returned no predictions. Full response: ${JSON.stringify(data)}`);
  }

  const images = predictions
    .filter((p) => typeof p.bytesBase64Encoded === "string" && p.bytesBase64Encoded.length > 0)
    .map((p) => `data:${p.mimeType ?? "image/png"};base64,${p.bytesBase64Encoded}`);

  console.log(`[imagen4] decoded ${images.length} image(s), mimeTypes: ${predictions.map((p) => p.mimeType ?? "image/png").join(", ")}`);
  return images;
}

// ── Chutes fallback ───────────────────────────────────────────────────────────

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const numImages = Math.min(4, Math.max(1, Number(body.numImages ?? 1)));

    if (!body.regionName || !body.outfit || !body.faceImageB64) {
      return NextResponse.json({ error: "Missing required payload fields" }, { status: 400 });
    }

    const backend = (getServerEnv("GENERATION_BACKEND", "vertex") || "vertex").toLowerCase();
    const prompt = buildPrompt(body, numImages);

    console.log(`[generate] backend="${backend}" numImages=${numImages} region="${body.regionName}" outfit="${body.outfit.name}"`);

    const storageMeta = {
      outfitId: body.outfit.id,
      regionId: body.regionId ?? body.regionName,
      gender: body.gender,
    };

    // Save input face image locally
    saveFaceImage(body.faceImageB64, storageMeta);

    // ── Two-step VTO pipeline (Imagen 4 → virtual-try-on-001) ─────────────
    if (backend === "gemini") {
      const apiKey = getServerEnv("GOOGLE_CLOUD_API_KEY");
      if (!apiKey) {
        console.error("[generate] ERROR: GOOGLE_CLOUD_API_KEY is not set.");
        return NextResponse.json(
          { error: "GOOGLE_CLOUD_API_KEY is not configured." },
          { status: 500 },
        );
      }
      const location = getServerEnv("GOOGLE_CLOUD_LOCATION", "us-central1");
      const project = getServerEnv("GOOGLE_CLOUD_PROJECT", "");

      // Strip data-URL prefix from person image
      const personB64 = body.faceImageB64.includes(",")
        ? body.faceImageB64.split(",")[1]
        : body.faceImageB64;

      // ── Resolve garment: reuse existing or generate new ──────────────────
      let garmentB64: string;
      let garmentPrompt = "";
      let garmentReused = false;

      if (body.garmentFilename) {
        // Client explicitly chose a stored garment
        const loaded = loadGarmentB64(body.garmentFilename);
        if (!loaded) {
          return NextResponse.json({ error: "Stored garment not found." }, { status: 404 });
        }
        garmentB64 = loaded;
        garmentReused = true;
        console.log(`[generate] ♻ Reusing stored garment: ${body.garmentFilename}`);
      } else {
        // Check if we already have a garment for this outfit
        const existing = findGarmentsByOutfit(body.outfit.id);
        if (existing.length > 0) {
          const latest = existing[existing.length - 1];
          const loaded = loadGarmentB64(latest.filename);
          if (loaded) {
            garmentB64 = loaded;
            garmentReused = true;
            console.log(`[generate] ♻ Auto-reusing garment for ${body.outfit.id}: ${latest.filename}`);
          } else {
            // File missing — generate fresh
            garmentPrompt = buildGarmentPrompt(body);
            garmentB64 = await generateGarmentImage(garmentPrompt, apiKey, location, project);
          }
        } else {
          // No existing garment — generate new one
          garmentPrompt = buildGarmentPrompt(body);
          garmentB64 = await generateGarmentImage(garmentPrompt, apiKey, location, project);
        }
      }

      // Save newly generated garment
      if (!garmentReused) {
        saveGarmentImage(`data:image/png;base64,${garmentB64}`, {
          ...storageMeta,
          prompt: garmentPrompt,
        });
      }

      console.log(`[generate] → VTO step 2  location="${location}"  project="${project}"  garmentReused=${garmentReused}`);

      const t0 = Date.now();
      const images = await runVirtualTryOn(personB64, garmentB64, numImages, apiKey, location, project);
      console.log(`[generate] ✓ VTO pipeline returned ${images.length} image(s) in ${Date.now() - t0}ms`);

      // Save result images locally
      images.forEach((img, i) => saveResultImage(img, { ...storageMeta, index: i }));

      return NextResponse.json({
        images,
        prompt: garmentPrompt || "(reused garment)",
        backend: "gemini",
        garmentReused,
      });
    }

    // ── Vertex AI / Imagen 4 ──────────────────────────────────────────────────
    if (backend === "vertex") {
      const apiKey = getServerEnv("GOOGLE_CLOUD_API_KEY");
      if (!apiKey) {
        console.error("[generate] ERROR: GOOGLE_CLOUD_API_KEY is not set.");
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
      const aspectRatio = getServerEnv("IMAGEN_ASPECT_RATIO", "1:1");
      const endpointUrl = `${baseUrl.replace(/\/$/, "")}/${model}:predict?key=***`;

      console.log(`[generate] → Imagen 4  model="${model}"  aspectRatio="${aspectRatio}"  endpoint="${endpointUrl}"`);
      console.log(`[generate] prompt: ${prompt.slice(0, 200)}...`);

      const t0 = Date.now();
      const images = await generateWithImagen4(prompt, numImages, apiKey, model, baseUrl, aspectRatio);
      console.log(`[generate] ✓ Imagen 4 returned ${images.length} image(s) in ${Date.now() - t0}ms`);

      return NextResponse.json({ images, prompt, backend: "vertex" });
    }

    // ── Chutes fallback ───────────────────────────────────────────────────────
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
          width: 1024,
          height: 1024,
          prompt,
          image_b64s: [body.faceImageB64],
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

    return NextResponse.json({ images: results, prompt, backend: "chutes" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation request failed" },
      { status: 500 },
    );
  }
}
