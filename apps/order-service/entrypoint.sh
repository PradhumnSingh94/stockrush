#!/bin/sh
set -e

echo "Running order-service migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Starting order-service..."
exec node dist/index.js