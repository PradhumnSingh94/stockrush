# StockRush

A production-grade flash-sale e-commerce platform built with Node.js microservices, deployed on AWS EKS with full GitOps, observability, and load-tested at 200 concurrent users.

---

## Architecture

```
                          ┌─────────────────┐
                          │   Load Balancer  │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │   API Gateway   │  :3000
                          │  Rate Limiting  │
                          │  Auth Verify    │
                          │  Correlation ID │
                          └────┬───┬───┬───┘
                               │   │   │
              ┌────────────────┘   │   └────────────────┐
              │                    │                    │
    ┌─────────▼──────┐   ┌────────▼───────┐   ┌───────▼────────┐
    │ Product Service│   │  Order Service  │   │  Auth Service  │
    │   :3001 HTTP   │   │    :3002 HTTP   │   │   :3003 HTTP   │
    │   :50051 gRPC  │◄──│  Circuit Breaker│   │  Paseto v4     │
    │  Redis Cache   │   │  Idempotency   │   │  Argon2id      │
    │  Stock Sync    │   │  Saga Pattern  │   └────────────────┘
    └───────┬────────┘   └───────┬────────┘
            │                    │
            │         ┌──────────▼──────────┐
            │         │  Notification Service│
            │         │     :3004 HTTP       │
            │         │   Redis Streams      │
            │         │   Nodemailer         │
            │         └─────────────────────┘
            │
    ┌───────▼────────────────────────┐
    │           PostgreSQL           │
    │  stockrush_products            │
    │  stockrush_orders              │
    │  stockrush_auth                │
    └────────────────────────────────┘
            │
    ┌───────▼────────────────────────┐
    │             Redis              │
    │  Stock cache (atomic DECRBY)   │
    │  Rate limiting                 │
    │  Idempotency keys              │
    │  Order event streams           │
    └────────────────────────────────┘
```

---

## Services

| Service | Port | Responsibility |
|---|---|---|
| api-gateway | 3000 | Request routing, rate limiting, auth verification, correlation IDs |
| product-service | 3001 / 50051 | Product CRUD, Redis stock cache, gRPC stock operations, 5-min sync job |
| order-service | 3002 | Order creation, gRPC stock decrement, saga compensation, idempotency |
| auth-service | 3003 | Registration, login, Paseto v4 token issuance |
| notification-service | 3004 | Redis Stream consumer, email notifications via Nodemailer |

---

## Tech Stack

**Runtime:** Node.js 20, TypeScript  
**Monorepo:** Turborepo + pnpm workspaces  
**Framework:** Express.js  
**ORM:** Prisma 7 with PrismaPg adapter  
**Databases:** PostgreSQL (3 separate DBs), Redis  
**Auth:** Paseto v4 asymmetric (private key signs, gateway verifies with public key only)  
**Password hashing:** Argon2id (64MB memory cost, 3 iterations — OWASP recommended)  
**Messaging:** Redis Streams (order confirmed events → notification-service)  
**Service comms:** gRPC with Protocol Buffers (order→product for stock ops)  
**Containerisation:** Docker multi-stage builds  
**Orchestration:** AWS EKS (Kubernetes)  
**IaC:** Terraform (modular — vpc, eks, ecr modules)  
**GitOps:** ArgoCD watching `infra/k8s/` on main branch  
**Observability:** Prometheus + Grafana via kube-prometheus-stack Helm chart  
**Load testing:** k6  
**CI/CD:** GitHub + ArgoCD (push to main → auto-deploy to EKS within 3 minutes)

---

## Key Engineering Decisions

### Database per service
Each service owns its database — `stockrush_products`, `stockrush_orders`, `stockrush_auth`. Services cannot join across databases, which forces correct design: order-service snapshots `productName` and `unitPrice` at creation time, so order history is immutable even if products are renamed or repriced later.

### Redis atomic stock management
Stock decrements use Redis `DECRBY` — a single atomic operation. Two concurrent requests cannot interleave. If the result goes negative, the decrement is reversed and the order is rejected. A background sync job runs every 5 minutes, compares Redis keys against Postgres, detects drift, and reseeds from Postgres as the source of truth.

### Paseto over JWT
Paseto v4 uses asymmetric cryptography — auth-service signs with a private key, api-gateway verifies with the public key only. The private key never leaves auth-service. Eliminates JWT algorithm confusion attacks (`alg: none`, RS256→HS256 downgrade).

### gRPC for stock operations
Order-service calls product-service via gRPC for stock get and decrement operations. Binary Protocol Buffers serialization with HTTP/2 multiplexing — lower latency than REST for high-frequency inter-service calls during flash sale concurrency.

### Saga pattern for compensation
Order creation follows a saga: decrement stock → create order record → publish event. If any step fails, all successful decrements are reversed via compensating increments. No distributed transaction coordinator needed.

### Circuit breaker on gRPC calls
Opossum circuit breaker wraps all gRPC calls from order-service to product-service. Opens after 50% failure rate over 5 requests, fast-fails in <1ms vs 3s timeout, preventing cascade failures. Compensation logic uses direct client — rollback must proceed even when the circuit is open.

### Idempotency keys on order creation
`POST /orders` accepts `X-Idempotency-Key` header. First request processes normally and caches the response in Redis with 24h TTL. Subsequent requests with the same key return the cached response immediately — no duplicate order, no duplicate stock decrement. Safe for client retries and network timeouts.

### Rate limiting per endpoint
Redis-backed `rate-limiter-flexible` with separate limiters per endpoint type. Configurable via environment variables — load testing uses high limits without code changes, production enforces strict limits. Limits enforced at api-gateway before requests reach downstream services.

---

## Infrastructure

```
AWS Account
├── VPC (10.0.0.0/16)
│   ├── Public subnets — Load Balancers, NAT Gateway
│   └── Private subnets — EKS nodes
├── EKS Cluster (stockrush-production)
│   ├── Node group — t3.medium, On-Demand
│   ├── aws-ebs-csi-driver addon (IRSA via OIDC)
│   └── StorageClass gp2-csi (WaitForFirstConsumer)
├── ECR Repositories (6 — one per service)
├── S3 — Terraform remote state
└── DynamoDB — Terraform state locking
```

---

## Observability

Prometheus scrapes all 5 services via ServiceMonitor. Grafana dashboards cover:

**Infrastructure metrics:**
- Pod status per service
- CPU and memory usage per pod
- Pod restart count
- Network in/out per service

**Application metrics (prom-client):**
- `api_gateway_http_requests_total` — by method, route, status code
- `api_gateway_http_request_duration_seconds` — histogram with p50/p95/p99
- `api_gateway_rate_limit_hits_total` — rate limit enforcement visibility
- `product_service_cache_hits_total` / `product_service_cache_misses_total` — cache hit ratio
- `product_service_stock_decrements_total` — flash sale throughput
- `order_service_orders_created_total` — by status (confirmed/failed)
- `order_service_order_creation_duration_seconds` — order latency histogram
- `order_service_grpc_duration_seconds` — gRPC call latency
- `auth_service_login_attempts_total` — by success/failure

---

## Load Test Results

k6 flash sale simulation — ramp up from 0 to 200 concurrent users over 5 minutes.

### 100 VUs

| Metric | Value |
|---|---|
| Orders processed | 5,125 confirmed |
| Order throughput | 17 orders/sec |
| Total throughput | 34 req/sec |
| p50 latency | 292ms |
| p90 latency | 584ms |
| p95 latency | 730ms |
| Error rate | 0% |

### 200 VUs

| Metric | Value |
|---|---|
| Orders processed | 8,902 confirmed |
| Order throughput | 29 orders/sec |
| Total throughput | 59 req/sec |
| p50 latency | 478ms |
| p90 latency | 1.39s |
| p95 latency | 1.7s |
| Error rate | 0% |

Zero oversells across 50,000 unit inventory. System scaled linearly from 100 to 200 VUs — throughput increased from 17 to 29 orders/sec with no errors.

---

## Project Structure

```
stockrush/
├── apps/
│   ├── api-gateway/          # Express gateway, rate limiting, auth middleware
│   ├── product-service/      # Products, Redis cache, gRPC server, stock sync job
│   ├── order-service/        # Orders, saga, circuit breaker, idempotency
│   ├── auth-service/         # Auth, Paseto tokens, Argon2id
│   ├── notification-service/ # Redis Stream consumer, email
│   └── flashsale/            # Next.js frontend
├── packages/
│   ├── shared/               # DTOs, error classes, logger, Prometheus registry, proto
│   └── tsconfig/             # Shared TypeScript config
├── infra/
│   ├── terraform/            # VPC, EKS, ECR modules
│   └── k8s/                  # Kubernetes manifests, ArgoCD app, ServiceMonitors
├── tests/
│   └── load/                 # k6 load test scripts
└── scripts/
    └── build-and-push.sh     # Build all images and push to ECR
```

---

## Running Locally

**Prerequisites:** Docker Desktop, Node.js 20, pnpm 12

```bash
# Clone
git clone https://github.com/PradhumnSingh94/stockrush.git
cd stockrush

# Install dependencies
pnpm install

# Start infrastructure
docker compose up postgres redis -d

# Run migrations and seed
pnpm --filter @stockrush/product-service db:migrate
pnpm --filter @stockrush/product-service db:seed
pnpm --filter @stockrush/order-service db:migrate
pnpm --filter @stockrush/auth-service db:migrate

# Start all services (except flashsale frontend)
pnpm turbo run dev --filter='!@stockrush/flashsale'
```

Services available at:
- API Gateway: `http://localhost:3000`
- Product Service: `http://localhost:3001`
- Order Service: `http://localhost:3002`
- Auth Service: `http://localhost:3003`

---

## API Reference

### Auth

```bash
# Register
POST /api/auth/register
{ "email": "user@example.com", "password": "password123", "name": "User" }

# Login
POST /api/auth/login
{ "email": "user@example.com", "password": "password123" }
```

### Products

```bash
# List all products
GET /api/products
Authorization: Bearer <token>

# Get single product
GET /api/products/:id
Authorization: Bearer <token>
```

### Orders

```bash
# Create order (with idempotency)
POST /api/orders
Authorization: Bearer <token>
X-Idempotency-Key: <uuid>
{
  "userId": "user-id",
  "userEmail": "user@example.com",
  "items": [
    { "productId": "product-id", "quantity": 1 }
  ]
}
```

---

## Load Testing

```bash
# Install k6
winget install k6   # Windows
brew install k6     # macOS

# Run flash sale scenario (ramp to 200 VUs)
k6 run tests/load/flash-sale.js
```

---

## Deployment

Full deployment guide in [`infra/README.md`](infra/README.md).

Quick recreate after `terraform apply`:

```bash
# Connect kubectl
aws eks update-kubeconfig --region us-east-1 --name stockrush-production

# OIDC + EBS CSI setup (required every cluster recreate)
eksctl utils associate-iam-oidc-provider --cluster stockrush-production --region us-east-1 --approve
aws eks create-addon --cluster-name stockrush-production --addon-name aws-ebs-csi-driver \
  --service-account-role-arn arn:aws:iam::185529490222:role/AmazonEKS_EBS_CSI_DriverRole --region us-east-1

# Deploy
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/secrets/
kubectl apply -f infra/k8s/configmaps/
kubectl apply -f infra/k8s/databases/
kubectl apply -f infra/k8s/services/api-gateway/
kubectl apply -f infra/k8s/services/product-service/
kubectl apply -f infra/k8s/services/order-service/
kubectl apply -f infra/k8s/services/auth-service/
kubectl apply -f infra/k8s/services/notification-service/
```
