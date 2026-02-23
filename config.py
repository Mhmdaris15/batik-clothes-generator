"""
Configuration for Batik Clothes Generator
"""
import os
import json
from pathlib import Path
from dotenv import load_dotenv

# ─── Base Paths ───────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
CLOTHES_DATA_PATH = BASE_DIR / "clothes_data.json"
DOTENV_PATH = BASE_DIR / ".env"


def refresh_env() -> None:
    """Reload .env values and override existing process env vars."""
    load_dotenv(dotenv_path=DOTENV_PATH, override=True)


# Load environment variables from .env file
refresh_env()

# ─── API Configuration ────────────────────────────────────────────────────────
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
GOOGLE_CLOUD_API_KEY: str = os.getenv("GOOGLE_CLOUD_API_KEY", "")
USE_VERTEX_AI: bool = os.getenv("USE_VERTEX_AI", "true").lower() in {"1", "true", "yes", "on"}
GENERATION_BACKEND: str = os.getenv("GENERATION_BACKEND", "chutes").strip().lower()

# Chutes API settings
CHUTES_API_KEY: str = os.getenv("CHUTES_API_KEY", "")
CHUTES_API_TOKEN: str = os.getenv("CHUTES_API_TOKEN", "")
CHUTES_IMAGE_URL: str = os.getenv("CHUTES_IMAGE_URL", "")
CHUTES_TIMEOUT_SECONDS: int = int(os.getenv("CHUTES_TIMEOUT_SECONDS", "120"))
CHUTES_NUM_INFERENCE_STEPS: int = int(os.getenv("CHUTES_NUM_INFERENCE_STEPS", "40"))
CHUTES_TRUE_CFG_SCALE: float = float(os.getenv("CHUTES_TRUE_CFG_SCALE", "4"))
CHUTES_NEGATIVE_PROMPT: str = os.getenv("CHUTES_NEGATIVE_PROMPT", "")


def get_generation_backend() -> str:
    return os.getenv("GENERATION_BACKEND", GENERATION_BACKEND).strip().lower()


def get_chutes_api_token() -> str:
    return os.getenv("CHUTES_API_TOKEN", CHUTES_API_TOKEN) or os.getenv("CHUTES_API_KEY", CHUTES_API_KEY)


def get_chutes_image_url() -> str:
    return os.getenv("CHUTES_IMAGE_URL", CHUTES_IMAGE_URL).strip()


def get_chutes_timeout_seconds() -> int:
    raw = os.getenv("CHUTES_TIMEOUT_SECONDS", str(CHUTES_TIMEOUT_SECONDS))
    return int(raw)


def get_chutes_num_inference_steps() -> int:
    raw = os.getenv("CHUTES_NUM_INFERENCE_STEPS", str(CHUTES_NUM_INFERENCE_STEPS))
    return int(raw)


def get_chutes_true_cfg_scale() -> float:
    raw = os.getenv("CHUTES_TRUE_CFG_SCALE", str(CHUTES_TRUE_CFG_SCALE))
    return float(raw)


def get_chutes_negative_prompt() -> str:
    return os.getenv("CHUTES_NEGATIVE_PROMPT", CHUTES_NEGATIVE_PROMPT)

# Models
IMAGE_MODEL: str = os.getenv("IMAGE_MODEL", "gemini-3-pro-image-preview")
VISION_MODEL: str = os.getenv("VISION_MODEL", "gemini-2.0-flash")

# Generation settings
NUM_IMAGES: int = int(os.getenv("NUM_IMAGES", "4"))
IMAGE_WIDTH: int = 1024
IMAGE_HEIGHT: int = 1024

# ─── App Configuration ────────────────────────────────────────────────────────
APP_TITLE = "🎨 Batik Clothes Generator – Indonesian Traditional Fashion AI"
APP_DESCRIPTION = """
Transform yourself into traditional Indonesian fashion!
Select your region, gender, and outfit type, then capture your face — 
our AI will create stunning images of you wearing beautiful traditional Indonesian clothes.
"""

# ─── Load Clothes Data ────────────────────────────────────────────────────────
def load_clothes_data() -> dict:
    """Load and return the clothes database."""
    with open(CLOTHES_DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_regions(data: dict) -> list[str]:
    """Return list of region names."""
    return [r["name"] for r in data["regions"]]


def get_region_by_name(data: dict, name: str) -> dict | None:
    """Return region dict by display name."""
    for r in data["regions"]:
        if r["name"] == name:
            return r
    return None


def get_clothes_for_region_and_gender(data: dict, region_name: str, gender: str) -> list[dict]:
    """Return clothes list for a given region and gender ('female' or 'male')."""
    region = get_region_by_name(data, region_name)
    if not region:
        return []
    return region["clothes"].get(gender, [])


def get_outfit_names(clothes: list[dict]) -> list[str]:
    """Return display names for a list of clothes."""
    return [c["name"] for c in clothes]


def get_outfit_by_name(clothes: list[dict], name: str) -> dict | None:
    """Return outfit dict by name."""
    for c in clothes:
        if c["name"] == name:
            return c
    return None
