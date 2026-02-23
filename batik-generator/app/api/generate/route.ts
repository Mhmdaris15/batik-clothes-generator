import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/server-env";

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
  gender: "female" | "male";
  outfit: Outfit;
  faceImageB64: string;
  numImages?: number;
};

const variationHints = [
  "soft natural daylight, outdoor temple background",
  "vibrant studio portrait with ornate Indonesian backdrop",
  "elegant evening scene with golden bokeh lighting",
  "cultural festival atmosphere, dynamic pose",
];

function buildPrompt(body: RequestBody, numImages: number): string {
  const genderLabel = body.gender === "female" ? "woman" : "man";
  const motifs = body.outfit.motifs.join(", ");
  const colors = body.outfit.colors.join(", ");
  const hints = variationHints.slice(0, numImages).join("; ");

  return [
    `High-quality photorealistic portrait of a ${genderLabel} wearing ${body.outfit.name}, a traditional Indonesian outfit from ${body.regionName}.`,
    body.outfit.description,
    `Fabric motifs include ${motifs}.`,
    `Color palette: ${colors}.`,
    `Accessories: ${body.outfit.accessories}.`,
    "Keep identity consistent with the provided portrait photo.",
    "Full body or three-quarter portrait, culturally authentic and respectful depiction.",
    `Create ${numImages} diverse variations with these styles: ${hints}.`,
  ].join(" ");
}

function extractBase64FromChutesResponse(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const payload = data as Record<string, unknown>;
  const scalarCandidates = [payload.image, payload.image_b64];
  for (const candidate of scalarCandidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  const listCandidates = [payload.images, payload.image_b64s];
  for (const candidate of listCandidates) {
    if (Array.isArray(candidate) && candidate.length > 0 && typeof candidate[0] === "string") {
      return candidate[0];
    }
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const numImages = Math.min(4, Math.max(1, Number(body.numImages || 1)));

    if (!body.regionName || !body.outfit || !body.faceImageB64) {
      return NextResponse.json({ error: "Missing required payload fields" }, { status: 400 });
    }

    const chutesUrl = getServerEnv("CHUTES_IMAGE_URL");
    const chutesToken = getServerEnv("CHUTES_API_TOKEN") || getServerEnv("CHUTES_API_KEY");
    const trueCfgScale = Number(getServerEnv("CHUTES_TRUE_CFG_SCALE", "4"));
    const numInferenceSteps = Number(getServerEnv("CHUTES_NUM_INFERENCE_STEPS", "40"));
    const negativePrompt = getServerEnv("CHUTES_NEGATIVE_PROMPT", "");

    if (!chutesUrl) {
      return NextResponse.json({ error: "CHUTES_IMAGE_URL is not configured" }, { status: 500 });
    }
    if (!chutesToken) {
      return NextResponse.json({ error: "CHUTES_API_TOKEN is not configured" }, { status: 500 });
    }

    const prompt = buildPrompt(body, numImages);
    const results: string[] = [];

    for (let index = 0; index < numImages; index += 1) {
      const response = await fetch(chutesUrl, {
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

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: `Chutes request failed (${response.status}): ${errorText.slice(0, 400)}` },
          { status: 502 },
        );
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (contentType.startsWith("image/")) {
        const bytes = Buffer.from(await response.arrayBuffer());
        results.push(`data:${contentType};base64,${bytes.toString("base64")}`);
        continue;
      }

      const json = (await response.json()) as unknown;
      const imageB64 = extractBase64FromChutesResponse(json);
      if (!imageB64) {
        return NextResponse.json({ error: "Unexpected Chutes response format" }, { status: 502 });
      }
      results.push(`data:image/png;base64,${imageB64}`);
    }

    return NextResponse.json({ images: results, prompt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation request failed" },
      { status: 500 },
    );
  }
}
