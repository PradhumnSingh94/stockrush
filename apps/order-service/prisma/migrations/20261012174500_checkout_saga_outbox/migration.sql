-- Durable checkout workflow and transactional outbox.
CREATE TYPE "OrderWorkflowStatus" AS ENUM (
  'STARTED',
  'RESERVED',
  'COMPLETED',
  'COMPENSATION_PENDING',
  'COMPENSATED',
  'FAILED'
);

CREATE TABLE "order_workflow" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userEmail" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "reservationHash" TEXT NOT NULL,
  "requestPayload" JSONB NOT NULL,
  "correlationId" TEXT NOT NULL,
  "status" "OrderWorkflowStatus" NOT NULL DEFAULT 'STARTED',
  "lastError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_workflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderWorkflow_orderId_key" ON "order_workflow"("orderId");
CREATE INDEX "order_workflow_recovery_idx"
  ON "order_workflow"("status", "nextAttemptAt", "leaseUntil");

CREATE TABLE "outbox_event" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_event_publish_idx"
  ON "outbox_event"("publishedAt", "nextAttemptAt", "createdAt");
