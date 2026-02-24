#!/usr/bin/env bash
# deploy.sh — Deploy batik-generator to Google Cloud Run
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - project set (gcloud config set project itmo-indo-family-1945)
#   - APIs enabled: Cloud Run, Cloud Build, Container Registry, Secret Manager
#
# Usage:
#   chmod +x deploy.sh && ./deploy.sh

set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-itmo-indo-family-1945}"
REGION="${GOOGLE_CLOUD_LOCATION:-us-central1}"
SERVICE_NAME="batik-generator"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "==> Project: ${PROJECT_ID}"
echo "==> Region:  ${REGION}"
echo "==> Service: ${SERVICE_NAME}"
echo ""

# ── 1. Enable required APIs ──────────────────────────────────────────────────
echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  --project="${PROJECT_ID}" --quiet

# ── 2. Store secrets in Secret Manager ────────────────────────────────────────
echo "==> Storing secrets..."
for SECRET_NAME in GOOGLE_CLOUD_API_KEY GEMINI_API_KEY; do
  # Check if secret exists
  if ! gcloud secrets describe "${SECRET_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "    Creating secret ${SECRET_NAME}..."
    printf '%s' "${!SECRET_NAME}" | gcloud secrets create "${SECRET_NAME}" \
      --data-file=- --project="${PROJECT_ID}" --replication-policy=automatic
  else
    echo "    Secret ${SECRET_NAME} already exists, adding new version..."
    printf '%s' "${!SECRET_NAME}" | gcloud secrets versions add "${SECRET_NAME}" \
      --data-file=- --project="${PROJECT_ID}"
  fi
done

# ── 3. Build and push Docker image ───────────────────────────────────────────
echo "==> Building Docker image..."
gcloud builds submit \
  --tag "${IMAGE}:latest" \
  --project="${PROJECT_ID}" \
  --timeout=600s \
  .

# ── 4. Deploy to Cloud Run ───────────────────────────────────────────────────
echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}:latest" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=2 \
  --timeout=300s \
  --min-instances=0 \
  --max-instances=5 \
  --set-env-vars="NODE_ENV=production,GENERATION_BACKEND=gemini,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GEMINI_IMAGE_MODEL=virtual-try-on-001,IMAGEN_MODEL=imagen-4.0-generate-001" \
  --update-secrets="GOOGLE_CLOUD_API_KEY=GOOGLE_CLOUD_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --project="${PROJECT_ID}"

# ── 5. Print URL ─────────────────────────────────────────────────────────────
URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format='value(status.url)')

echo ""
echo "==> Deployed! URL: ${URL}"
echo ""
