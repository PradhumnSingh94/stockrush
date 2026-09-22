#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."
echo "📁 Working directory: $(pwd)"

AWS_ACCOUNT_ID="185529490222"
AWS_REGION="us-east-1"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
PROJECT="stockrush"

SERVICES=(
  "api-gateway"
  "product-service"
  "order-service"
  "auth-service"
  "notification-service"
  "flashsale"
)

echo "🔐 Authenticating Docker to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login \
  --username AWS \
  --password-stdin \
  ${ECR_REGISTRY}
echo "✅ Authentication successful"
echo ""

for SERVICE in "${SERVICES[@]}"; do
  echo "─────────────────────────────────────────"
  echo "🔨 Building: ${SERVICE}"
  echo "─────────────────────────────────────────"

  APP_DIR="apps/${SERVICE}"
  LOCAL_TAG="${PROJECT}/${SERVICE}:latest"
  ECR_TAG="${ECR_REGISTRY}/${PROJECT}/${SERVICE}:latest"

  echo "📦 Building image..."
  docker build \
    -t ${LOCAL_TAG} \
    -f ${APP_DIR}/Dockerfile \
    .

  echo "🏷️  Tagging image..."
  docker tag ${LOCAL_TAG} ${ECR_TAG}

  echo "🚀 Pushing to ECR..."
  for i in {1..3}; do
    if docker push ${ECR_TAG}; then
      echo "✅ ${SERVICE} pushed successfully"
      break
    else
      echo "❌ Attempt ${i} failed — retrying in 10 seconds..."
      sleep 10
      aws ecr get-login-password --region ${AWS_REGION} | \
        docker login \
        --username AWS \
        --password-stdin \
        ${ECR_REGISTRY}
    fi
  done  # closes inner for loop

  echo ""
done  # closes outer for loop

echo "═════════════════════════════════════════"
echo "✅ All images pushed to ECR successfully"
echo "═════════════════════════════════════════"
echo ""
echo "ECR Registry: ${ECR_REGISTRY}"
echo ""
echo "Images pushed:"
for SERVICE in "${SERVICES[@]}"; do
  echo "  ${ECR_REGISTRY}/${PROJECT}/${SERVICE}:latest"
done