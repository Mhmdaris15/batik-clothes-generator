/**
 * Child-process worker for background removal via ORMBG ONNX model.
 * Spawns scripts/ormbg_inference.py (onnxruntime + Pillow + numpy).
 * Runs in isolation so ONNX Runtime never conflicts with sharp/libvips.
 *
 * Protocol: reads JSON from stdin, writes JSON to stdout.
 *   Input:  { "pngBase64": "<base64 encoded PNG>" }
 *   Output: { "resultBase64": "<base64 encoded RGBA PNG>" }
 *   Error:  { "error": "<message>" }
 */

import { spawn } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the Python inference script path
function findScriptPath() {
  const candidates = [
    // Docker / production: cwd is /app (standalone)
    join(process.cwd(), "scripts", "ormbg_inference.py"),
    // Local dev: cwd is batik-generator/
    join(__dirname, "..", "scripts", "ormbg_inference.py"),
    join(__dirname, "scripts", "ormbg_inference.py"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0]; // use first as fallback, will fail with clear error
}

// Resolve ORMBG ONNX model path
function findModelPath() {
  if (process.env.ORMBG_MODEL_PATH) return process.env.ORMBG_MODEL_PATH;

  const candidates = [
    // Docker: copied to /app/models/ormbg.onnx
    join(process.cwd(), "models", "ormbg.onnx"),
    join(__dirname, "..", "models", "ormbg.onnx"),
    // HF cache (local dev on Windows)
    join(
      process.env.HOME || process.env.USERPROFILE || "",
      ".cache", "huggingface", "hub",
      "models--schirrmacher--ormbg", "snapshots",
      "6253b318240ef7a8670017b88d242f9f87f5abeb",
      "ormbg.onnx",
    ),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[0];
}

// Resolve python executable
function findPython() {
  return process.env.ORMBG_PYTHON || process.env.PYTHON || "python3";
}

let input = "";

process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const scriptPath = findScriptPath();
  const modelPath = findModelPath();
  const python = findPython();

  process.stderr.write(`[ormbg-worker] python=${python} script=${scriptPath} model=${modelPath}\n`);

  const child = spawn(python, [scriptPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      ORMBG_MODEL_PATH: modelPath,
    },
  });

  let output = "";
  child.stdout.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => { output += chunk; });

  child.on("error", (err) => {
    process.stdout.write(JSON.stringify({ error: `Failed to spawn python: ${err.message}` }));
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      process.stdout.write(JSON.stringify({ error: `Python process exited with code ${code}` }));
      process.exit(1);
    }
    // Forward the Python script's JSON output directly
    process.stdout.write(output);
  });

  // Forward input to Python stdin
  child.stdin.write(input);
  child.stdin.end();
});

