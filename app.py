"""
Batik Clothes Generator – Main Application
Traditional Indonesian Fashion AI powered by Google Gemini & Imagen
"""
import logging
import os
from pathlib import Path
from typing import Optional

import gradio as gr
from PIL import Image

import config
import generator

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Load clothes database ────────────────────────────────────────────────────
CLOTHES_DATA = config.load_clothes_data()
REGIONS = config.get_regions(CLOTHES_DATA)

# ─── Helper callbacks ─────────────────────────────────────────────────────────

def _outfit_names_for(region_name: str, gender: str) -> list[str]:
    """Return outfit display names for the given region + gender selection."""
    if not region_name or not gender:
        return []
    gender_key = "female" if gender == "Wanita (Female)" else "male"
    clothes = config.get_clothes_for_region_and_gender(CLOTHES_DATA, region_name, gender_key)
    return config.get_outfit_names(clothes)


def update_outfit_choices(region_name: str, gender: str) -> gr.Dropdown:
    """Return a Dropdown update for the outfit selector."""
    names = _outfit_names_for(region_name, gender)
    return gr.Dropdown(
        choices=names,
        value=names[0] if names else None,
        interactive=bool(names),
    )


def get_outfit_info(region_name: str, gender: str, outfit_name: str) -> str:
    """Return a markdown description of the selected outfit."""
    if not region_name or not gender or not outfit_name:
        return ""
    gender_key = "female" if gender == "Wanita (Female)" else "male"
    clothes = config.get_clothes_for_region_and_gender(CLOTHES_DATA, region_name, gender_key)
    outfit = config.get_outfit_by_name(clothes, outfit_name)
    if not outfit:
        return ""

    motifs = " · ".join(outfit.get("motifs", []))
    colors = " · ".join(outfit.get("colors", []))
    md = (
        f"### {outfit['name']}\n\n"
        f"{outfit['description']}\n\n"
        f"**Motifs:** {motifs}\n\n"
        f"**Colors:** {colors}\n\n"
        f"**Accessories:** {outfit.get('accessories', '—')}"
    )
    return md


def generate_images(
    api_key: str,
    region_name: str,
    gender_label: str,
    outfit_name: str,
    face_image,
    num_images: int,
    progress: gr.Progress = gr.Progress(track_tqdm=True),
) -> tuple[list, str]:
    """
    Core generation function called by the Generate button.
    Returns (gallery_images, status_message).
    """
    config.refresh_env()
    backend = config.get_generation_backend()
    ui_key = api_key.strip() if api_key and api_key.strip() else ""
    env_chutes_token = config.get_chutes_api_token()
    chutes_token = env_chutes_token or (ui_key if ui_key.startswith("cpk_") else "")

    # ── Validate inputs ──────────────────────────────────────────────────
    errors = []
    effective_key = ui_key or config.GEMINI_API_KEY
    if backend == "chutes":
        if not config.get_chutes_image_url():
            errors.append("❌ CHUTES_IMAGE_URL is required when GENERATION_BACKEND=chutes.")
        if not chutes_token:
            errors.append("❌ CHUTES_API_TOKEN is required for Chutes backend (set it in .env).")
    else:
        if not effective_key and not config.GOOGLE_CLOUD_API_KEY:
            errors.append("❌ Please enter your Gemini API key or set GOOGLE_CLOUD_API_KEY in .env.")
    if not region_name:
        errors.append("❌ Please select a region.")
    if not gender_label:
        errors.append("❌ Please select a gender.")
    if not outfit_name:
        errors.append("❌ Please select an outfit.")
    if face_image is None:
        errors.append("❌ Please capture or upload a face photo.")

    if errors:
        return [], "\n".join(errors)

    # ── Init Gemini ──────────────────────────────────────────────────────
    if not generator.init_gemini(effective_key):
        if backend == "chutes":
            return [], "❌ Failed to initialize backend. Check CHUTES settings in .env."
        return [], "❌ Invalid or missing API key. Please check GEMINI_API_KEY / GOOGLE_CLOUD_API_KEY and try again."

    # ── Prepare data ─────────────────────────────────────────────────────
    gender_key = "female" if gender_label == "Wanita (Female)" else "male"
    clothes = config.get_clothes_for_region_and_gender(CLOTHES_DATA, region_name, gender_key)
    outfit = config.get_outfit_by_name(clothes, outfit_name)
    if not outfit:
        return [], f"❌ Outfit '{outfit_name}' not found. Please re-select."

    # Convert face image to PIL
    if not isinstance(face_image, Image.Image):
        face_pil = Image.fromarray(face_image)
    else:
        face_pil = face_image

    # ── Generate ─────────────────────────────────────────────────────────
    try:
        progress(0, desc="Analysing your face…")
        images = generator.generate_outfit_images(
            face_image=face_pil,
            outfit=outfit,
            region_name=region_name,
            gender=gender_key,
            num_images=int(num_images),
            chutes_token=chutes_token if backend == "chutes" else None,
        )
        progress(1, desc="Done!")
        status = (
            f"✅ Generated {len(images)} image(s) of **{outfit_name}** "
            f"from **{region_name}**. Click any image to view full size!"
        )
        return images, status

    except Exception as exc:
        logger.exception("Generation failed.")
        err = str(exc)
        if "BILLING_DISABLED" in err or "requires billing to be enabled" in err:
            return [], (
                "❌ Generation failed: Billing is disabled for the configured Google Cloud project. "
                "Enable billing in Google Cloud Console, wait a few minutes, then try again."
            )
        if "RESOURCE_EXHAUSTED" in err or "quota" in err.lower():
            return [], (
                "❌ Generation failed: API quota/rate limit reached. "
                "Please wait and retry, or use a key/project with available quota."
            )
        if "timed out" in err.lower() and "chutes" in err.lower():
            return [], (
                "❌ Generation failed: Chutes request timed out (queue/cold start). "
                "Retry in a moment or increase CHUTES_TIMEOUT_SECONDS in .env."
            )
        if "Authentication required" in err or "(401)" in err:
            return [], (
                "❌ Generation failed: Chutes authentication failed (401). "
                "Set a valid CHUTES_API_TOKEN in .env and try again."
            )
        return [], f"❌ Generation failed: {exc}"


# ─── Custom CSS ───────────────────────────────────────────────────────────────
CUSTOM_CSS = """
/* ── Global ── */
body { font-family: 'Segoe UI', sans-serif; }

/* ── Header ── */
#app-header {
    background: linear-gradient(135deg, #7B3F00 0%, #C8860A 50%, #8B0000 100%);
    border-radius: 12px;
    padding: 24px 32px;
    margin-bottom: 8px;
    color: white !important;
    text-align: center;
}
#app-header h1 { color: white !important; font-size: 2rem; margin: 0; }
#app-header p  { color: rgba(255,255,255,0.88) !important; font-size: 1rem; margin: 8px 0 0; }

/* ── Panels ── */
.panel-card {
    background: #fdf6ec;
    border: 1px solid #e8d5b7;
    border-radius: 10px;
    padding: 16px;
}

/* ── Generate button ── */
#generate-btn {
    background: linear-gradient(135deg, #7B3F00, #C8860A) !important;
    color: white !important;
    font-size: 1.1rem !important;
    font-weight: 700 !important;
    border-radius: 8px !important;
    padding: 14px !important;
    border: none !important;
    box-shadow: 0 4px 12px rgba(123,63,0,0.35);
    transition: opacity .2s;
}
#generate-btn:hover { opacity: 0.88; }

/* ── Gallery ── */
#results-gallery .thumbnail-item img { border-radius: 8px; }

/* ── Status ── */
#status-box { font-size: 0.95rem; }

/* ── Outfit info ── */
#outfit-info { font-size: 0.9rem; line-height: 1.6; }

/* ── Step labels ── */
.step-label {
    background: #7B3F00;
    color: white;
    border-radius: 50%;
    width: 28px; height: 28px;
    display: inline-flex;
    align-items: center; justify-content: center;
    font-weight: bold; margin-right: 6px;
    font-size: 0.85rem;
}
"""

# ─── Build Gradio UI ─────────────────────────────────────────────────────────

def build_app() -> gr.Blocks:
    with gr.Blocks(
        title="Batik Clothes Generator",
    ) as app:

        # ── Header ──────────────────────────────────────────────────────
        gr.HTML(
            """
            <div id="app-header">
              <h1>🎨 Batik Clothes Generator</h1>
              <p>Experience the beauty of Indonesian Traditional Fashion &mdash; powered by Google Gemini AI</p>
            </div>
            """
        )

        with gr.Row():
            # ────────────────────────── LEFT COLUMN ──────────────────────
            with gr.Column(scale=1, min_width=340):

                # API Key
                with gr.Group(elem_classes="panel-card"):
                    gr.Markdown("#### 🔑 API Configuration")
                    _env_key = config.GEMINI_API_KEY if config.GEMINI_API_KEY and config.GEMINI_API_KEY != "your_gemini_api_key_here" else ""
                    api_key_input = gr.Textbox(
                        label="Gemini API Key (optional when using Chutes backend)",
                        placeholder="Paste your Google Gemini API key here (optional for Chutes mode)…",
                        value=_env_key,
                        type="password",
                        info="Used for Gemini backend and optional face analysis. Chutes backend uses CHUTES_API_KEY + CHUTES_IMAGE_URL in .env.",
                    )

                # Step 1 – Region & Gender
                with gr.Group(elem_classes="panel-card"):
                    gr.Markdown("#### <span class='step-label'>1</span> Select Region & Gender")

                    region_dd = gr.Dropdown(
                        label="Indonesian Region",
                        choices=REGIONS,
                        value=REGIONS[0],
                        info="Choose a region to explore its traditional attire",
                    )
                    gender_dd = gr.Dropdown(
                        label="Gender",
                        choices=["Wanita (Female)", "Pria (Male)"],
                        value="Wanita (Female)",
                    )

                # Step 2 – Choose Outfit
                with gr.Group(elem_classes="panel-card"):
                    gr.Markdown("#### <span class='step-label'>2</span> Choose Outfit")

                    outfit_dd = gr.Dropdown(
                        label="Traditional Outfit",
                        choices=[],
                        interactive=False,
                        info="Outfit list updates when you pick a region and gender",
                    )

                    outfit_info_md = gr.Markdown(
                        value="",
                        elem_id="outfit-info",
                        label="Outfit Details",
                    )

                # Step 3 – Face Photo
                with gr.Group(elem_classes="panel-card"):
                    gr.Markdown("#### <span class='step-label'>3</span> Capture Your Face")
                    face_input = gr.Image(
                        label="Face Photo",
                        sources=["webcam", "upload"],
                        type="pil",
                        height=280,
                        elem_id="face-capture",
                    )
                    gr.Markdown(
                        "<small>📸 Use your webcam for best results, or upload a clear front-facing photo.</small>"
                    )

                # Number of images
                num_images_slider = gr.Slider(
                    label="Number of Variations to Generate",
                    minimum=1, maximum=4, step=1, value=4,
                )

                # Generate button
                generate_btn = gr.Button(
                    "✨ Generate My Traditional Look",
                    variant="primary",
                    elem_id="generate-btn",
                )

            # ────────────────────────── RIGHT COLUMN ─────────────────────
            with gr.Column(scale=2, min_width=480):

                gr.Markdown("#### 🖼️ Generated Looks – Click an image to view full size")

                results_gallery = gr.Gallery(
                    label="Your Traditional Outfit Looks",
                    show_label=False,
                    elem_id="results-gallery",
                    columns=2,
                    rows=2,
                    height=580,
                    object_fit="cover",
                    preview=True,
                )

                status_md = gr.Markdown(
                    value=(
                        "👆 Fill in the steps on the left and click **Generate** to see your "
                        "traditional Indonesian look!"
                    ),
                    elem_id="status-box",
                )

                # Download selected
                with gr.Accordion("💾 Save / Download Images", open=False):
                    gr.Markdown(
                        "Click any image in the gallery above to open it full-screen. "
                        "Right-click → *Save image as…* to download."
                    )

                # How it works
                with gr.Accordion("ℹ️ How It Works", open=False):
                    gr.Markdown(
                        """
**Step 1 – Select your outfit**
Choose from 11 Indonesian regions and dozens of authentic traditional outfits for both genders.

**Step 2 – Capture your face**
Use the webcam or upload a clear, front-facing photo. The AI uses this to tailor the generated images to your appearance.

**Step 3 – AI Generation**
Google Gemini analyses your face and Google Imagen 4 generates photorealistic portraits of you wearing the chosen traditional outfit in up to 4 beautiful variations.

**Step 4 – Choose your favourite**
Browse the gallery and save the image(s) you love most!

> **Privacy note:** Your photo is sent securely to Google's API only for this generation and is not stored.
                        """
                    )

        # ─── Event wiring ────────────────────────────────────────────────

        # Update outfit list + info when region or gender changes
        def _update_from_region_gender(region: str, gender: str):
            names = _outfit_names_for(region, gender)
            first = names[0] if names else None
            info = get_outfit_info(region, gender, first)
            dd_update = gr.Dropdown(choices=names, value=first, interactive=bool(names))
            return dd_update, info

        region_dd.change(
            fn=_update_from_region_gender,
            inputs=[region_dd, gender_dd],
            outputs=[outfit_dd, outfit_info_md],
        )
        gender_dd.change(
            fn=_update_from_region_gender,
            inputs=[region_dd, gender_dd],
            outputs=[outfit_dd, outfit_info_md],
        )

        # Show outfit detail card when outfit is selected
        outfit_dd.change(
            fn=get_outfit_info,
            inputs=[region_dd, gender_dd, outfit_dd],
            outputs=[outfit_info_md],
        )

        # Generate button
        generate_btn.click(
            fn=generate_images,
            inputs=[
                api_key_input,
                region_dd,
                gender_dd,
                outfit_dd,
                face_input,
                num_images_slider,
            ],
            outputs=[results_gallery, status_md],
        )

        # Auto-populate outfit dropdown + info on initial page load
        def _on_load(region: str, gender: str):
            names = _outfit_names_for(region, gender)
            first = names[0] if names else None
            info = get_outfit_info(region, gender, first)
            dd_update = gr.Dropdown(choices=names, value=first, interactive=bool(names))
            return dd_update, info

        app.load(
            fn=_on_load,
            inputs=[region_dd, gender_dd],
            outputs=[outfit_dd, outfit_info_md],
        )

    return app


# ─── Entry Point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = build_app()
    app.launch(
        server_name="0.0.0.0",
        server_port=7860,
        share=False,
        show_error=True,
        favicon_path=None,
        css=CUSTOM_CSS,
        theme=gr.themes.Soft(
            primary_hue="orange",
            secondary_hue="amber",
            neutral_hue="stone",
        ),
    )
