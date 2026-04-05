# Deploy script for batik-generator to Cloud Run (PowerShell version)
# Uses Cloud Build to build the image remotely (no local Docker needed).
#
# Usage: .\deploy.ps1 [-ProjectId PROJECT_ID] [-Region REGION] [-GCSBucket GCS_BUCKET_NAME]

param(
    [string]$ProjectId,
    [string]$Region = "us-central1",
    [string]$GCSBucket = "itmo-batik-prod"
)

$ErrorActionPreference = "Stop"
$ServiceName = "batik-generator"

# ── Pre-flight checks ────────────────────────────────────────────────────────

# Resolve project ID
if (-not $ProjectId) {
    $ProjectId = gcloud config get-value project 2>$null
    if (-not $ProjectId) {
        Write-Host "❌ No project ID. Pass -ProjectId or run: gcloud config set project YOUR_PROJECT" -ForegroundColor Red
        exit 1
    }
}

# Check gcloud auth
$account = gcloud auth list --filter="status:ACTIVE" --format="value(account)" 2>$null
if (-not $account) {
    Write-Host "❌ Not authenticated. Running gcloud auth login..." -ForegroundColor Red
    gcloud auth login
    if ($LASTEXITCODE -ne 0) { exit 1 }
}
Write-Host "✅ Authenticated as: $account" -ForegroundColor Green

$ImageName = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$ServiceName"

Write-Host ""
Write-Host "🚀 Deploying $ServiceName to Cloud Run" -ForegroundColor Cyan
Write-Host "   Project:    $ProjectId"
Write-Host "   Region:     $Region"
Write-Host "   GCS Bucket: $GCSBucket"
Write-Host "   Image:      $ImageName"
Write-Host ""

# ── Enable required APIs ─────────────────────────────────────────────────────

Write-Host "🔧 Ensuring required APIs are enabled..." -ForegroundColor Yellow
gcloud services enable `
    cloudbuild.googleapis.com `
    run.googleapis.com `
    containerregistry.googleapis.com `
    storage.googleapis.com `
    --project $ProjectId

# ── Create GCS bucket ────────────────────────────────────────────────────────

$bucketExists = gsutil ls -p $ProjectId -b "gs://$GCSBucket" 2>$null
if (-not $bucketExists) {
    Write-Host "📦 Creating GCS bucket: gs://$GCSBucket" -ForegroundColor Yellow
    gsutil mb -p $ProjectId -l $Region "gs://$GCSBucket"
    gsutil uniformbucketlevelaccess set on "gs://$GCSBucket"
} else {
    Write-Host "📦 GCS bucket already exists: gs://$GCSBucket" -ForegroundColor Green
}

# ── Copy root configurations ──────────────────────────────────────────────────
Write-Host "📂 Copying data files to build context..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path ".\data" | Out-Null
Copy-Item "..\clothes_data.json" -Destination ".\data\" -Force
Copy-Item "..\models_config.json" -Destination ".\data\" -Force
Copy-Item "..\province_clothes_cache.json" -Destination ".\data\" -Force
Copy-Item "..\province_landmarks.json" -Destination ".\data\" -Force
Copy-Item "..\.env" -Destination ".\data\" -Force -ErrorAction SilentlyContinue

# Copy traditional garment images (required for loadTraditionalGarmentB64 in Cloud Run)
# DATA_DIR=/app/data -> /app/data/indonesia_traditional_clothes/
$clothesSource = "..\indonesia_traditional_clothes"
if (Test-Path $clothesSource) {
    Write-Host "Copying traditional garment images (~150 PNGs)..." -ForegroundColor Yellow
    Copy-Item $clothesSource -Destination ".\data\indonesia_traditional_clothes" -Recurse -Force
    $count = (Get-ChildItem ".\data\indonesia_traditional_clothes" -File).Count
    Write-Host "   Copied $count garment files" -ForegroundColor Green
} else {
    Write-Host "WARNING: indonesia_traditional_clothes not found at $clothesSource" -ForegroundColor Red
}

$envFile = "..\.env"
$GoogleCloudApiKey = ""
$ResendApiKey = ""
$TelegramBotToken = ""
if (Test-Path $envFile) {
    Write-Host "🔑 Extracting env vars from .env..." -ForegroundColor Yellow
    foreach ($line in Get-Content $envFile) {
        if ($line -match "^GOOGLE_CLOUD_API_KEY=(.*)") {
            $GoogleCloudApiKey = $matches[1].Trim()
        }
        if ($line -match "^RESEND_API_KEY=(.*)") {
            $ResendApiKey = $matches[1].Trim()
        }
        if ($line -match "^TELEGRAM_BOT_TOKEN=(.*)") {
            $TelegramBotToken = $matches[1].Trim()
        }
    }
}

if (-not $GoogleCloudApiKey) {
    Write-Host "⚠️ Warning: GOOGLE_CLOUD_API_KEY not found in .env" -ForegroundColor Yellow
}
if (-not $ResendApiKey) {
    Write-Host "⚠️ Warning: RESEND_API_KEY not found in .env (email feature will be disabled)" -ForegroundColor Yellow
}
if (-not $TelegramBotToken) {
    Write-Host "⚠️ Warning: TELEGRAM_BOT_TOKEN not found in .env (Telegram bot will be disabled)" -ForegroundColor Yellow
}

# ── Build with Cloud Build (no local Docker required) ─────────────────────────

Write-Host "🔨 Building image with Cloud Build (remote)..." -ForegroundColor Yellow
gcloud builds submit `
    --tag "${ImageName}:latest" `
    --project $ProjectId `
    --timeout 600s

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cloud Build failed." -ForegroundColor Red
    exit 1
}

# ── Deploy to Cloud Run ──────────────────────────────────────────────────────

Write-Host "☁️  Deploying to Cloud Run..." -ForegroundColor Yellow
gcloud run deploy $ServiceName `
    --image "${ImageName}:latest" `
    --region $Region `
    --project $ProjectId `
    --platform managed `
    --allow-unauthenticated `
    --set-env-vars "GCS_BUCKET_NAME=$GCSBucket,GOOGLE_CLOUD_PROJECT=$ProjectId,GOOGLE_CLOUD_LOCATION=$Region,GOOGLE_CLOUD_API_KEY=$GoogleCloudApiKey,RESEND_API_KEY=$ResendApiKey,TELEGRAM_BOT_TOKEN=$TelegramBotToken" `
    --memory 2Gi `
    --cpu 2 `
    --timeout 300s `
    --min-instances 0 `
    --max-instances 10

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Cloud Run deploy failed." -ForegroundColor Red
    exit 1
}

# ── Print result ──────────────────────────────────────────────────────────────

$ServiceUrl = gcloud run services describe $ServiceName `
    --region $Region `
    --project $ProjectId `
    --format 'value(status.url)'

Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "   Service URL: $ServiceUrl"
Write-Host ""
Write-Host "📝 Don't forget to set these secrets in Cloud Run:" -ForegroundColor Yellow
Write-Host "   - GOOGLE_CLOUD_API_KEY"
Write-Host ""
Write-Host "Set secrets with:"
Write-Host "   gcloud run services update $ServiceName --region $Region --project $ProjectId --set-secrets GOOGLE_CLOUD_API_KEY=your-secret-name:latest"
