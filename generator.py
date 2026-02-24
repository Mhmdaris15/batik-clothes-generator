"""
Gemini AI Generator for Batik Clothes Generator
Handles face analysis and traditional clothes image generation using Google Gemini & Imagen.
"""
import io
import base64
import logging
import os
import requests

from google import genai
from google.genai import types as genai_types
from PIL import Image

import config

logger = logging.getLogger(__name__)

# Module-level clients — initialised once per session
_vision_client: genai.Client | None = None
_image_client: genai.Client | None = None


# ─── Initialisation ───────────────────────────────────────────────────────────

def init_gemini(api_key: str) -> bool:
    """Create the google.genai Client. Returns True on success."""
    global _vision_client, _image_client

    if config.get_generation_backend() == "chutes":
        cloud_key = config.GOOGLE_CLOUD_API_KEY or os.getenv("GOOGLE_CLOUD_API_KEY", "")
        if not cloud_key and not api_key:
            _vision_client = None
            _image_client = None
            logger.info("Running in Chutes-only mode without Gemini face analysis client.")
            return True

    cloud_key = config.GOOGLE_CLOUD_API_KEY or os.getenv("GOOGLE_CLOUD_API_KEY", "")
    chosen_key = cloud_key or api_key
    if not chosen_key or chosen_key == "your_gemini_api_key_here":
        logger.error("No usable API key is set.")
        return False

    if cloud_key and config.USE_VERTEX_AI:
        logger.info("Initialising genai client with vertexai=True using GOOGLE_CLOUD_API_KEY.")
        client = genai.Client(vertexai=True, api_key=cloud_key)
        _vision_client = client
        _image_client = client
        return True

    logger.info("Initialising genai client with Gemini API key (v1beta).")
    client = genai.Client(
        api_key=chosen_key,
        http_options=genai_types.HttpOptions(api_version="v1beta"),
    )
    _vision_client = client
    _image_client = client
    return True


# ─── Face Analysis ────────────────────────────────────────────────────────────

def analyse_face(image: Image.Image) -> str:
    """
    Use Gemini Vision to produce a concise physical description of the person
    in the photo. This description is injected into the Imagen prompt so that
    the generated outfit images reflect the user's actual appearance.
    """
    if _vision_client is None:
        raise RuntimeError("Gemini client not initialised. Call init_gemini() first.")

    prompt = (
        "You are a professional portrait analyst. "
        "Describe the person in this photo in 2-3 sentences, focusing on: "
        "face shape, skin tone, hair style and color, approximate age range, "
        "and any notable facial features. "
        "Be objective, respectful, and precise. "
        "Do NOT include any sensitive or personal attributes. "
        "Output plain text only."
    )

    response = _vision_client.models.generate_content(
        model=config.VISION_MODEL,
        contents=[prompt, image],
    )
    description = response.text.strip()
    logger.info("Face analysis: %s", description)
    return description


# ─── Prompt Builder ───────────────────────────────────────────────────────────

def build_generation_prompt(
    face_description: str,
    outfit: dict,
    region_name: str,
    gender: str,
    variation_hint: str = "",
) -> str:
    """
    Construct a detailed Imagen-quality prompt that asks for a photorealistic
    portrait of the described person wearing the chosen traditional outfit.
    """
    gender_label = "woman" if gender == "female" else "man"
    motifs = ", ".join(outfit.get("motifs", []))
    colors = ", ".join(outfit.get("colors", []))
    accessories = outfit.get("accessories", "")

    prompt = (
        f"High-quality photorealistic portrait of a {gender_label} "
        f"wearing {outfit['name']}, a traditional Indonesian outfit from {region_name}. "
        f"{outfit['description']} "
        f"Fabric motifs include {motifs}. "
        f"Color palette: {colors}. "
        f"Accessories: {accessories}. "
        f"The person has the following appearance: {face_description}. "
        f"The setting is a beautiful traditional Indonesian background with soft studio lighting. "
        f"Full body or three-quarter portrait, sharp focus, professional photography style, "
        f"vivid colors, culturally authentic and respectful depiction. "
        f"8K resolution, award-winning fashion photography. "
    )

    if variation_hint:
        prompt += f"Variation style: {variation_hint}. "

    return prompt


# ─── Image Generation ─────────────────────────────────────────────────────────

VARIATION_HINTS = [
    "soft natural daylight, outdoor temple background",
    "vibrant studio portrait with ornate Indonesian backdrop",
    "elegant evening scene with golden bokeh lighting",
    "cultural festival atmosphere, dynamic pose",
]


def _resolve_image_models(preferred_model: str) -> list[str]:
    """Return ordered Gemini image model candidates based on env + API availability."""
    preferred = preferred_model.replace("models/", "") if preferred_model else ""
    candidates: list[str] = [preferred] if preferred else []

    for model_name in ("gemini-3-pro-image-preview", "gemini-2.5-flash-image"):
        if model_name not in candidates:
            candidates.append(model_name)

    if _image_client is None:
        return candidates

    try:
        available = {
            (m.name or "").replace("models/", "")
            for m in _image_client.models.list()
            if getattr(m, "name", None)
        }
        filtered = [model for model in candidates if model in available]
        if filtered:
            return filtered
    except Exception as exc:
        logger.warning("Could not list models for fallback resolution: %s", exc)

    return candidates


def _decode_image_bytes(value) -> bytes | None:
    """Decode image payload that may be bytes or base64 string."""
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, str):
        try:
            return base64.b64decode(value)
        except Exception:
            return None
    return None


def _generated_to_pil(generated_image) -> Image.Image | None:
    """Best-effort conversion from SDK generated image object to PIL image."""
    image_obj = getattr(generated_image, "image", generated_image)

    if isinstance(image_obj, Image.Image):
        return image_obj

    for attr in ("image_bytes", "imageBytes", "data", "bytes"):
        raw = _decode_image_bytes(getattr(image_obj, attr, None))
        if raw:
            return Image.open(io.BytesIO(raw)).convert("RGB")

    if isinstance(image_obj, str):
        raw = _decode_image_bytes(image_obj)
        if raw:
            return Image.open(io.BytesIO(raw)).convert("RGB")

    return None


def _parts_to_pil_images(response) -> list[Image.Image]:
    """Extract PIL images from GenerateContent response candidates/parts."""
    results: list[Image.Image] = []
    for candidate in response.candidates or []:
        for part in candidate.content.parts or []:
            inline_data = getattr(part, "inline_data", None)
            raw = _decode_image_bytes(getattr(inline_data, "data", None))
            if raw:
                try:
                    results.append(Image.open(io.BytesIO(raw)).convert("RGB"))
                except Exception as exc:
                    logger.warning("Failed to decode inline image part: %s", exc)
    return results

# ─── Gemini Flash image generation (generativelanguage.googleapis.com) ────────


def _generate_images_with_gemini_flash(
    prompt: str,
    num_images: int,
    face_image: Image.Image,
    api_key: str | None = None,
) -> list[Image.Image]:
    """
    Two-step Virtual Try-On pipeline:
      Step 1 → Imagen 4 generates a flat-lay product image of the garment.
      Step 2 → VTO composites the person wearing that garment.
    Uses GOOGLE_CLOUD_API_KEY with project+location in the URL.
    """
    key = api_key or config.GOOGLE_CLOUD_API_KEY
    if not key:
        raise RuntimeError("GOOGLE_CLOUD_API_KEY is not set. Add it to .env.")

    location = config.GOOGLE_CLOUD_LOCATION
    project = config.GOOGLE_CLOUD_PROJECT
    timeout = 180
    results: list[Image.Image] = []
    batch = max(1, min(4, int(num_images)))

    face_b64 = pil_to_base64(face_image, fmt="JPEG")

    # ── Step 1: Generate clothing product image with Imagen 4 ─────────────
    imagen_model = os.getenv("IMAGEN_MODEL", "imagen-4.0-generate-001")
    imagen_url = (
        f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}"
        f"/locations/{location}/publishers/google/models/{imagen_model}:predict?key={key}"
    )
    garment_payload = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "3:4",
            "personGeneration": "dont_allow",
        },
    }
    logger.info("VTO Step 1: Generating garment with %s", imagen_model)
    resp1 = requests.post(imagen_url, json=garment_payload,
                          headers={"Content-Type": "application/json"}, timeout=timeout)
    if resp1.status_code != 200:
        raise RuntimeError(f"Garment generation failed ({resp1.status_code}): {resp1.text[:600]}")

    garment_data = resp1.json()
    garment_preds = garment_data.get("predictions", [])
    if not garment_preds or not garment_preds[0].get("bytesBase64Encoded"):
        raise RuntimeError(f"Imagen 4 returned no garment image. Response: {garment_data}")

    garment_b64 = garment_preds[0]["bytesBase64Encoded"]
    logger.info("VTO Step 1: garment image generated OK (%dKB)", len(garment_b64) * 3 // 4 // 1024)

    # ── Step 2: Virtual Try-On — person + garment → composite ─────────────
    vto_model = config.GEMINI_IMAGE_MODEL  # virtual-try-on-001
    vto_url = (
        f"https://{location}-aiplatform.googleapis.com/v1/projects/{project}"
        f"/locations/{location}/publishers/google/models/{vto_model}:predict?key={key}"
    )
    vto_payload = {
        "instances": [{
            "personImage": {
                "image": {"bytesBase64Encoded": face_b64},
            },
            "productImages": [{
                "image": {"bytesBase64Encoded": garment_b64},
            }],
        }],
        "parameters": {
            "sampleCount": batch,
            "baseSteps": 32,
            "personGeneration": "allow_all",
            "addWatermark": True,
        },
    }
    logger.info("VTO Step 2: model=%s  sampleCount=%d  location=%s", vto_model, batch, location)
    resp2 = requests.post(vto_url, json=vto_payload,
                          headers={"Content-Type": "application/json"}, timeout=timeout)
    if resp2.status_code != 200:
        raise RuntimeError(f"Virtual Try-On failed ({resp2.status_code}): {resp2.text[:600]}")

    data = resp2.json()
    if "error" in data:
        raise RuntimeError(f"Virtual Try-On API error: {data['error']}")

    for pred in data.get("predictions", []):
        b64 = pred.get("bytesBase64Encoded")
        if b64:
            raw = base64.b64decode(b64)
            results.append(Image.open(io.BytesIO(raw)).convert("RGB"))
            logger.info("VTO Step 2: image decoded OK")

    if not results:
        raise RuntimeError(f"Virtual Try-On returned 0 decodable images. Response: {data}")

    return results

# ─── Imagen 4 (Vertex AI – API-key auth) ────────────────────────────────────


def _generate_images_with_imagen4(
    prompt: str,
    num_images: int,
    api_key: str | None = None,
) -> list[Image.Image]:
    """
    Generate images using Imagen 4 via the Vertex AI publisher endpoint.
    Authentication uses a Google Cloud API key (no service account needed).

    Endpoint pattern:
      POST https://aiplatform.googleapis.com/v1/publishers/google/models/{model}:predict?key={API_KEY}
    """
    key = api_key or config.get_imagen_api_key()
    if not key:
        raise RuntimeError(
            "GOOGLE_CLOUD_API_KEY is not set. Add it to .env to use Imagen 4."
        )

    model = config.get_imagen_model()
    base_url = config.get_imagen_base_url()
    url = f"{base_url}/{model}:predict?key={key}"

    timeout = config.get_imagen_timeout_seconds()
    aspect_ratio = config.get_imagen_aspect_ratio()
    results: list[Image.Image] = []

    batch_size = max(1, min(4, int(num_images)))
    payload = {
        "instances": [{"prompt": prompt}],
        "parameters": {
            "sampleCount": batch_size,
            "aspectRatio": aspect_ratio,
            "personGeneration": "allow_adult",
            "safetyFilterLevel": "block_some",
        },
    }

    logger.info("Calling Imagen 4 model=%s sampleCount=%d", model, batch_size)
    try:
        resp = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=timeout,
        )
    except requests.exceptions.Timeout as exc:
        raise RuntimeError(
            f"Imagen 4 request timed out after {timeout}s. "
            "Increase IMAGEN_TIMEOUT_SECONDS in .env and retry."
        ) from exc

    if resp.status_code != 200:
        raise RuntimeError(
            f"Imagen 4 request failed ({resp.status_code}): {resp.text[:600]}"
        )

    data = resp.json()
    predictions = data.get("predictions", [])
    if not predictions:
        raise RuntimeError(f"Imagen 4 returned no predictions. Response: {data}")

    for prediction in predictions:
        b64 = prediction.get("bytesBase64Encoded")
        if not b64:
            logger.warning("Imagen 4 prediction missing bytesBase64Encoded; skipping.")
            continue
        raw = base64.b64decode(b64)
        mime = prediction.get("mimeType", "image/png")
        try:
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            results.append(img)
        except Exception as exc:
            logger.warning("Failed to decode Imagen 4 image bytes: %s", exc)

    if not results:
        raise RuntimeError("Imagen 4 returned predictions but none could be decoded.")

    return results[:batch_size]


def _chutes_headers(token_override: str | None = None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    token = token_override or config.get_chutes_api_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["x-api-key"] = token
    return headers


def _decode_chutes_response(response: requests.Response) -> Image.Image:
    content_type = (response.headers.get("Content-Type") or "").lower()
    if content_type.startswith("image/"):
        return Image.open(io.BytesIO(response.content)).convert("RGB")

    data = response.json()
    image_b64 = data.get("image") if isinstance(data, dict) else None
    if not image_b64 and isinstance(data, dict):
        image_b64 = data.get("image_b64")
    if not image_b64 and isinstance(data, dict):
        images = data.get("images")
        if isinstance(images, list) and images:
            image_b64 = images[0]
    if not image_b64 and isinstance(data, dict):
        image_b64s = data.get("image_b64s")
        if isinstance(image_b64s, list) and image_b64s:
            image_b64 = image_b64s[0]

    if not image_b64:
        raise RuntimeError(f"Unexpected Chutes response format: {data}")

    raw = _decode_image_bytes(image_b64)
    if not raw:
        raise RuntimeError("Chutes returned non-decodable image payload.")
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _generate_images_with_chutes(
    prompt: str,
    face_image: Image.Image,
    num_images: int,
    chutes_token: str | None = None,
) -> list[Image.Image]:
    chutes_url = config.get_chutes_image_url()
    if not chutes_url:
        raise RuntimeError("CHUTES_IMAGE_URL is not set. Please set your deployed Chutes endpoint URL in .env.")

    results: list[Image.Image] = []
    headers = _chutes_headers(chutes_token)
    timeout = max(30, int(config.get_chutes_timeout_seconds()))

    for _ in range(max(1, min(4, int(num_images)))):
        input_image_b64 = pil_to_base64(face_image, fmt="PNG")
        payload = {
            "seed": None,
            "width": 1024,
            "height": 1024,
            "prompt": prompt,
            "image_b64s": [input_image_b64],
            "true_cfg_scale": config.get_chutes_true_cfg_scale(),
            "negative_prompt": config.get_chutes_negative_prompt(),
            "num_inference_steps": config.get_chutes_num_inference_steps(),
        }
        try:
            resp = requests.post(chutes_url, json=payload, headers=headers, timeout=timeout)
        except requests.exceptions.ReadTimeout as exc:
            raise RuntimeError(
                "Chutes request timed out while waiting for image generation. "
                "Increase CHUTES_TIMEOUT_SECONDS (for example 300) and retry."
            ) from exc
        if resp.status_code != 200:
            raise RuntimeError(f"Chutes request failed ({resp.status_code}): {resp.text[:500]}")
        results.append(_decode_chutes_response(resp))

    return results


def generate_outfit_images(
    face_image: Image.Image,
    outfit: dict,
    region_name: str,
    gender: str,
    num_images: int = 4,
    chutes_token: str | None = None,
) -> list[Image.Image]:
    """
    Main generation pipeline:
    1. Analyse the user's face with Gemini Vision.
    2. Build one detailed generation prompt.
    3. Generate N images using Gemini image-capable models.
    Returns a list of PIL Images.
    """
    if _vision_client is None or _image_client is None:
        if config.get_generation_backend() != "chutes":
            results = _generate_images_with_chutes(prompt, face_image, num_images, chutes_token=chutes_token)

    # Step 1 – Analyse face
    if config.get_generation_backend() == "chutes":
        face_description = "the same person as the provided portrait photo"
    elif _vision_client is not None:
        try:
            face_description = analyse_face(face_image)
        except Exception as exc:
            logger.warning("Face analysis failed (%s). Using generic description.", exc)
            face_description = "a person with a friendly expression"
    else:
        face_description = "the same person as the provided portrait photo"

    # Step 2 – Build prompt and generate images via selected backend
    results: list[Image.Image] = []
    hints = "; ".join((VARIATION_HINTS * 4)[:num_images])
    prompt = build_generation_prompt(
        face_description=face_description,
        outfit=outfit,
        region_name=region_name,
        gender=gender,
        variation_hint=f"Create {num_images} diverse variations with these styles: {hints}",
    )

    backend = config.get_generation_backend()

    if backend == "gemini":
        results = _generate_images_with_gemini_flash(prompt, num_images, face_image)
        return results[: max(1, min(4, int(num_images)))]

    if backend == "vertex":
        results = _generate_images_with_imagen4(prompt, num_images)
        return results[: max(1, min(4, int(num_images)))]

    if backend == "chutes":
        results = _generate_images_with_chutes(prompt, face_image, num_images, chutes_token=chutes_token)
        return results[: max(1, min(4, int(num_images)))]

    image_models = _resolve_image_models(config.IMAGE_MODEL)
    logger.info("Trying image models in order: %s", ", ".join(image_models))

    last_error: Exception | None = None
    for image_model in image_models:
        try:
            logger.info("Attempting image generation with model: %s", image_model)
            for _ in range(max(1, min(4, int(num_images)))):
                response = _image_client.models.generate_content(
                    model=image_model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        temperature=1,
                        top_p=0.95,
                        max_output_tokens=32768,
                        response_modalities=["TEXT", "IMAGE"],
                        image_config=genai_types.ImageConfig(
                            aspect_ratio="1:1",
                            image_size="1K",
                            output_mime_type="image/png",
                        ),
                    ),
                )
                results.extend(_parts_to_pil_images(response))
            if results:
                break
        except Exception as exc:
            last_error = exc
            logger.warning("Image generation failed for %s: %s", image_model, exc)

    if not results:
        raise RuntimeError(
            f"Image generation failed: {last_error}. "
            "Check your API key permissions, quota, and model availability."
        )

    return results[: max(1, min(4, int(num_images)))]


# ─── Utility ──────────────────────────────────────────────────────────────────

def pil_to_bytes(image: Image.Image, fmt: str = "PNG") -> bytes:
    """Convert a PIL image to bytes."""
    buf = io.BytesIO()
    image.save(buf, format=fmt)
    return buf.getvalue()


def pil_to_base64(image: Image.Image, fmt: str = "PNG") -> str:
    """Convert a PIL image to a base64-encoded string."""
    return base64.b64encode(pil_to_bytes(image, fmt)).decode("utf-8")
