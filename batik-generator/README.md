# Batik Generator

A Next.js app that generates virtual try-on images of Indonesian traditional batik clothing, composited onto regional landscape backgrounds.

## Screens

| Route | Description |
|---|---|
| `/` | Landing page |
| `/capture` | Face capture interface |
| `/workspace` | Image generation workspace |
| `/gallery` | Generated image gallery |
| `/settings` | App settings |

## Architecture

- **Phase 1** – Generates a garment image via Imagen 4 (Vertex AI) or Gemini, then applies Virtual Try-On (`virtual-try-on-001`)
- **Phase 2** – Removes background using [ORMBG](https://huggingface.co/schirrmacher/ormbg) (Python + onnxruntime child process) and composites the result onto a regional landscape via `sharp`
- **Images** – Stored in Google Cloud Storage (`itmo-batik-prod`)
- **Notifications** – Resend (email) + Telegram bot

---

## Running Locally

### Prerequisites

- **Node.js 20+**
- **Python 3.9+** with a virtual environment (for ORMBG background removal)
- **gcloud CLI** authenticated to `itmo-indo-family-1945`

### 1. Install Node dependencies

```bash
cd batik-generator
npm install
```

### 2. Set up the Python environment for ORMBG

```bash
# From the repo root, create and activate a venv
python -m venv batik-gen
# Windows:
batik-gen\Scripts\activate
# macOS/Linux:
source batik-gen/bin/activate

pip install onnxruntime Pillow numpy
```

### 3. Download the ORMBG model

```bash
pip install huggingface_hub
huggingface-cli download schirrmacher/ormbg ormbg.onnx
```

The model (~168 MB) will be saved under `~/.cache/huggingface/hub/`.

### 4. Configure environment variables

Create `batik-generator/.env.local` with the following:

```bash
# ORMBG background removal
# Full path to the downloaded ormbg.onnx
ORMBG_MODEL_PATH=C:\Users\YOU\.cache\huggingface\hub\models--schirrmacher--ormbg\snapshots\<hash>\ormbg.onnx
# Python executable that has onnxruntime/Pillow/numpy installed
ORMBG_PYTHON=C:\path\to\batik-gen\Scripts\python.exe
```

The server also reads the root `.env` file (one level above `batik-generator/`). The sensitive keys live there:

```bash
# Google / Vertex AI
GEMINI_API_KEY=...
GOOGLE_CLOUD_API_KEY=...
GOOGLE_CLOUD_PROJECT=itmo-indo-family-1945
GOOGLE_CLOUD_LOCATION=us-central1

# Generation backend: gemini | vertex | chutes
GENERATION_BACKEND=gemini
GEMINI_IMAGE_MODEL=virtual-try-on-001
NUM_IMAGES=4

# Imagen 4 model
IMAGEN_MODEL=imagen-4.0-generate-001

# Chutes (alternative backend)
CHUTES_API_TOKEN=...
CHUTES_IMAGE_URL=https://chutes-qwen-image-edit-2509.chutes.ai/generate
CHUTES_NUM_INFERENCE_STEPS=40
CHUTES_TRUE_CFG_SCALE=4
CHUTES_NEGATIVE_PROMPT=

# Notifications
RESEND_API_KEY=...
TELEGRAM_BOT_TOKEN=...
```

### 5. Start the dev server

```bash
cd batik-generator
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The server loads `.env.local` (Next.js built-in) **and** `../.env` (via `lib/server-env.ts`), so both files are active during development.

---

## Deploying to Production (Cloud Run)

Deployment uses **Cloud Build** to build the Docker image remotely — no local Docker required.

### What the Dockerfile does

1. Builds the Next.js app in a `node:20-alpine` builder stage
2. Copies the standalone output into a `node:20-slim` (Debian) runtime
3. Installs **Python 3 + onnxruntime + Pillow + numpy** (for ORMBG)
4. Downloads `ormbg.onnx` (~168 MB) from HuggingFace during build
5. Serves on port 8080 as a non-root user

### Prerequisites

- `gcloud` CLI authenticated and pointing to `itmo-indo-family-1945`
- Root `.env` populated with all required keys (the deploy script reads it)

### Deploy

```powershell
cd batik-generator
.\deploy.ps1
```

Optional parameters:

```powershell
.\deploy.ps1 -ProjectId itmo-indo-family-1945 -Region us-central1 -GCSBucket itmo-batik-prod
```

The script will:
1. Enable required GCP APIs (Cloud Build, Cloud Run, GCS)
2. Create the GCS bucket if it doesn't exist
3. Copy data JSON files and `.env` into `./data/` build context
4. Submit the build to Cloud Build (`gcloud builds submit`)
5. Deploy the resulting image to Cloud Run with:
   - 2 vCPU / 2 GiB RAM
   - 300 s request timeout (for VTO + bg removal)
   - 0–10 instances (scales to zero)
   - Env vars: `GOOGLE_CLOUD_API_KEY`, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `GCS_BUCKET_NAME`

### Environment variables in Cloud Run

Secret/sensitive values are set via `--set-env-vars` during deploy (extracted automatically from root `.env`). To update a single value after deployment:

```bash
gcloud run services update batik-generator \
  --region us-central1 \
  --project itmo-indo-family-1945 \
  --set-env-vars KEY=VALUE
```

To use Secret Manager instead of plain env vars:

```bash
gcloud run services update batik-generator \
  --region us-central1 \
  --project itmo-indo-family-1945 \
  --set-secrets GOOGLE_CLOUD_API_KEY=your-secret-name:latest
```

### ORMBG in production

The model path is baked into the image at build time:

```
ORMBG_MODEL_PATH=/app/models/ormbg.onnx
ORMBG_PYTHON=python3
```

No additional configuration is needed after deployment.

---

## Project Structure

```
batik-generator/
├── app/                   # Next.js App Router pages & API routes
│   ├── api/generate/      # Main generation endpoint (Phase 1 + Phase 2)
│   ├── workspace/         # Generation workspace UI
│   ├── gallery/           # Image gallery
│   └── capture/           # Face capture
├── lib/
│   ├── remove-background.ts   # Phase 2 orchestrator (bg removal + composite)
│   ├── rembg-worker.mjs       # Node.js child process that calls Python ORMBG
│   ├── image-store.ts         # GCS image storage
│   ├── watermark.ts           # Watermark overlay
│   └── server-env.ts          # Env var loader (reads ../.env + process.env)
├── scripts/
│   └── ormbg_inference.py     # Python ONNX inference for ORMBG
├── data/                  # JSON data (clothes, provinces, landmarks, models)
├── public/                # Static assets
├── Dockerfile             # Multi-stage build (node:20-alpine → node:20-slim)
└── deploy.ps1             # Cloud Run deploy script (PowerShell)
```

## Deploy on Google Cloud Run

This project is configured for deployment to Google Cloud Run with Google Cloud Storage for image persistence.

### Prerequisites

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and configured
2. Docker installed (for local builds)
3. A Google Cloud project with billing enabled

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GCS_BUCKET_NAME` | GCS bucket for storing generated images | Yes (Cloud Run) |
| `GOOGLE_CLOUD_PROJECT` | Your GCP project ID | Yes |
| `GOOGLE_CLOUD_LOCATION` | GCP region (default: us-central1) | No |
| `GOOGLE_CLOUD_API_KEY` | API key for Google AI services | Yes |
| `GENERATION_BACKEND` | Generation backend: "vertex", "gemini", or "chutes" | No |

### Quick Deploy

**PowerShell (Windows):**
```powershell
.\deploy.ps1 -ProjectId "your-project-id" -Region "us-central1" -GCSBucket "your-bucket-name"
```

**Bash (Linux/Mac):**
```bash
chmod +x deploy.sh
./deploy.sh your-project-id us-central1 your-bucket-name
```

### Manual Deploy Steps

1. **Create a GCS bucket:**
   ```bash
   gsutil mb -p YOUR_PROJECT -l us-central1 gs://your-bucket-name
   gsutil uniformbucketlevelaccess set on gs://your-bucket-name
   ```

2. **Build and push the Docker image:**
   ```bash
   docker build -t gcr.io/YOUR_PROJECT/batik-generator:latest .
   docker push gcr.io/YOUR_PROJECT/batik-generator:latest
   ```

3. **Deploy to Cloud Run:**
   ```bash
   gcloud run deploy batik-generator \
     --image gcr.io/YOUR_PROJECT/batik-generator:latest \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --set-env-vars "GCS_BUCKET_NAME=your-bucket-name,GOOGLE_CLOUD_PROJECT=YOUR_PROJECT" \
     --memory 2Gi \
     --cpu 2
   ```

4. **Set secrets:**
   ```bash
   # Create a secret for your API key
   echo -n "your-api-key" | gcloud secrets create google-cloud-api-key --data-file=-
   
   # Grant Cloud Run access to the secret
   gcloud secrets add-iam-policy-binding google-cloud-api-key \
     --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   
   # Update Cloud Run service to use the secret
   gcloud run services update batik-generator \
     --region us-central1 \
     --set-secrets "GOOGLE_CLOUD_API_KEY=google-cloud-api-key:latest"
   ```

### Cloud Build (CI/CD)

The project includes a `cloudbuild.yaml` for automated deployments. Trigger it with:

```bash
gcloud builds submit --substitutions=_GCS_BUCKET_NAME=your-bucket-name,_REGION=us-central1
```

### Storage Architecture

- **Local development:** Images are stored in `../generated-images/` relative to the project
- **Cloud Run:** Images are stored in GCS bucket under prefixes: `faces/`, `garments/`, `results/`, `landscapes/`
- Each directory contains a `manifest.json` for metadata indexing

