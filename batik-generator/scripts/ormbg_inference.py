#!/usr/bin/env python3
"""
ORMBG inference script using ONNX Runtime (no PyTorch required).

Protocol (stdin → stdout):
  Input:  JSON { "pngBase64": "<base64 PNG>" }
  Output: JSON { "resultBase64": "<base64 RGBA PNG>" }
  Error:  JSON { "error": "<message>" }

Model: schirrmacher/ormbg  (Apache 2.0)
ONNX file path from env var ORMBG_MODEL_PATH, default: ./models/ormbg.onnx
"""

import sys
import os
import json
import base64
import io

import numpy as np
from PIL import Image
import onnxruntime as ort


MODEL_PATH = os.environ.get(
    "ORMBG_MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "models", "ormbg.onnx"),
)
MODEL_INPUT_SIZE = (1024, 1024)

_session = None


def get_session():
    global _session
    if _session is None:
        providers = ["CPUExecutionProvider"]
        sess_opts = ort.SessionOptions()
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _session = ort.InferenceSession(MODEL_PATH, sess_opts, providers=providers)
    return _session


def preprocess(img: Image.Image) -> np.ndarray:
    """Resize to 1024×1024, normalize to [0,1], return NCHW float32 array."""
    img_resized = img.convert("RGB").resize(MODEL_INPUT_SIZE, Image.BILINEAR)
    arr = np.array(img_resized, dtype=np.float32) / 255.0          # HWC [0,1]
    arr = arr.transpose(2, 0, 1)                                    # CHW
    arr = np.expand_dims(arr, axis=0)                               # NCHW
    return arr


def postprocess(mask: np.ndarray, orig_size: tuple) -> Image.Image:
    """
    mask: NCHW float32 output from model, values roughly [0,1].
    Returns a PIL Image in mode 'L' (grayscale alpha mask), resized to orig_size.
    """
    mask = mask.squeeze()                                           # HW
    # min-max normalize
    mn, mx = mask.min(), mask.max()
    if mx > mn:
        mask = (mask - mn) / (mx - mn)
    mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    mask_img = mask_img.resize(orig_size, Image.BILINEAR)
    return mask_img


def remove_background(img: Image.Image) -> Image.Image:
    orig_size = img.size  # (W, H)
    inp = preprocess(img)

    session = get_session()
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: inp})
    mask_arr = outputs[0]                                           # NCHW

    mask = postprocess(mask_arr, orig_size)

    # Compose: paste original RGB onto transparent RGBA canvas using mask as alpha
    result = Image.new("RGBA", orig_size, (0, 0, 0, 0))
    result.paste(img.convert("RGBA"), mask=mask)
    return result


def main():
    raw = sys.stdin.buffer.read()
    try:
        payload = json.loads(raw)
        png_b64 = payload["pngBase64"]
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"Failed to parse input: {e}"}))
        sys.exit(1)

    try:
        img_bytes = base64.b64decode(png_b64)
        img = Image.open(io.BytesIO(img_bytes))
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"Failed to decode image: {e}"}))
        sys.exit(1)

    try:
        result_img = remove_background(img)
    except Exception as e:
        sys.stdout.write(json.dumps({"error": f"Inference failed: {e}"}))
        sys.exit(1)

    buf = io.BytesIO()
    result_img.save(buf, format="PNG")
    result_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    sys.stdout.write(json.dumps({"resultBase64": result_b64}))


if __name__ == "__main__":
    main()
