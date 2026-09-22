#!/bin/sh
set -e

echo "Running product-service migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting product-service..."
exec node dist/index.js