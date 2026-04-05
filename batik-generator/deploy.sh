#!/bin/bash

# Deploy script for batik-generator to Cloud Run
# Usage: ./deploy.sh [PROJECT_ID] [REGION] [GCS_BUCKET_NAME]

set -e

PROJECT_ID=${1:-$(gcloud config get-value project)}
REGION=${2:-us-central1}
GCS_BUCKET_NAME=${3:-batik-generator-images}
SERVICE_NAME="batik-generator"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "🚀 Deploying $SERVICE_NAME to Cloud Run"
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo "   GCS Bucket: $GCS_BUCKET_NAME"

# Check if GCS bucket exists, create if not
if ! gsutil ls -b gs://$GCS_BUCKET_NAME &>/dev/null; then
    echo "📦 Creating GCS bucket: gs://$GCS_BUCKET_NAME"
    gsutil mb -p $PROJECT_ID -l $REGION gs://$GCS_BUCKET_NAME
    gsutil uniformbucketlevelaccess set on gs://$GCS_BUCKET_NAME
fi

# Build and push the Docker image
echo "🔨 Building Docker image..."
docker build -t $IMAGE_NAME:latest .

echo "📤 Pushing to Container Registry..."
docker push $IMAGE_NAME:latest

# Deploy to Cloud Run
echo "☁️  Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME:latest \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "GCS_BUCKET_NAME=$GCS_BUCKET_NAME,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$REGION" \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300s \
    --min-instances 0 \
    --max-instances 10

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo ""
echo "✅ Deployment complete!"
echo "   Service URL: $SERVICE_URL"
echo ""
echo "📝 Don't forget to set these secrets in Cloud Run:"
echo "   - GOOGLE_CLOUD_API_KEY"
echo ""
echo "You can set secrets with:"
echo "   gcloud run services update $SERVICE_NAME --region $REGION --set-secrets GOOGLE_CLOUD_API_KEY=your-secret-name:latest"
