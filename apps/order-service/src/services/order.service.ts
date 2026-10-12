import { createHash, randomUUID } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import {
  AppError,
  CreateOrderDto,
  ErrorCode,
  OrderConfirmedEvent,
  OrderResponse,
  OrderResponseSchema,
} from "@stockrush/shared";
import { prisma } from "../db/prisma.client";
import { productClient, ReservationRpcResponse } from "../clients/product.grpc.client";
import { reserveStockBreaker } from "../clients/circuit-breaker";
import { ordersCreatedCounter, orderCreationDuration } from "../metrics";

type NormalizedItem = { productId: string; quantity: number };

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeItems(items: CreateOrderDto["items"]): NormalizedItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Order must contain 1-100 items", 400);
  }

  const quantities = new Map<string, number>();
  for (const item of items) {
    if (
      !item.productId ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 2_147_483_647
    ) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Invalid order item", 400);
    }

    const total = (quantities.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(total) || total > 2_147_483_647) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Aggregated quantity is too large", 400);
    }
    quantities.set(item.productId, total);
  }

  return [...quantities.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

function isPrismaUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { code?: unknown }).code === "P2002";
}

function grpcCode(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: number }).code
    : undefined;
}

function isStockRejection(error: unknown): boolean {
  return grpcCode(error) === grpc.status.FAILED_PRECONDITION;
}

type Workflow = NonNullable<Awaited<ReturnType<typeof prisma.orderWorkflow.findUnique>>>;

function workflowItems(workflow: Workflow): NormalizedItem[] {
  const payload = workflow.requestPayload as { items?: NormalizedItem[] };
  if (!Array.isArray(payload?.items) || payload.items.length === 0) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, "Workflow is missing its persisted request payload", 500);
  }
  return normalizeItems(payload.items);
}

function toOrderResponse(order: {
  id: string;
  userId: string;
  status: string;
  createdAt: Date;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: { toString(): string } | string | number;
  }>;
}): OrderResponse {
  return OrderResponseSchema.parse({
    id: order.id,
    userId: order.userId,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice.toString()),
    })),
  });
}

function eventPayload(
  workflow: Workflow,
  order: {
    id: string;
    userId: string;
    items: Array<{
      productId: string;
      productName: string;
      quantity: number;
      unitPrice: { toString(): string } | string | number;
    }>;
  },
): OrderConfirmedEvent["payload"] {
  return {
    orderId: order.id,
    userId: order.userId,
    userEmail: workflow.userEmail,
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice.toString()),
    })),
  };
}

async function getOrCreateWorkflow(
  dto: CreateOrderDto,
  correlationId: string,
  idempotencyKey: string,
  items: NormalizedItem[],
): Promise<Workflow> {
  const id = sha256({
    userId: dto.userId,
    operation: "POST:/orders",
    idempotencyKey,
  });
  const requestHash = sha256({ userId: dto.userId, items });
  // Must be byte-for-byte consistent with Product Service's hash helper.
  const reservationHash = sha256(items);

  const existing = await prisma.orderWorkflow.findUnique({ where: { id } });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        "Idempotency key was already used with a different order request",
        409,
      );
    }
    return existing;
  }

  try {
    return await prisma.orderWorkflow.create({
      data: {
        id,
        orderId: randomUUID(),
        userId: dto.userId,
        userEmail: dto.userEmail,
        requestHash,
        reservationHash,
        requestPayload: { items },
        correlationId,
        status: "STARTED",
        nextAttemptAt: new Date(),
      },
    });
  } catch (error) {
    // Concurrent identical requests can race the initial read; unique workflow
    // ID elects one creator, and all other callers re-read that durable record.
    if (!isPrismaUniqueConflict(error)) throw error;
    const winner = await prisma.orderWorkflow.findUnique({ where: { id } });
    if (!winner) throw error;
    if (winner.requestHash !== requestHash) {
      throw new AppError(
        ErrorCode.IDEMPOTENCY_CONFLICT,
        "Idempotency key was already used with a different order request",
        409,
      );
    }
    return winner;
  }
}

async function markTransientFailure(workflowId: string, error: unknown): Promise<void> {
  await prisma.orderWorkflow.updateMany({
    where: { id: workflowId, status: { in: ["STARTED", "RESERVED"] } },
    data: {
      lastError: error instanceof Error ? error.message : String(error),
      nextAttemptAt: new Date(Date.now() + 5_000),
      attempts: { increment: 1 },
    },
  });
}

async function releaseWorkflowReservation(workflow: Workflow): Promise<void> {
  try {
    const result = await productClient.releaseStock(workflow.id, workflow.reservationHash);

    // NOT_FOUND means Product Service has no committed reservation to restore.
    if (result.status === "RELEASED" || result.status === "NOT_FOUND") {
      await prisma.orderWorkflow.updateMany({
        where: { id: workflow.id, status: "COMPENSATION_PENDING" },
        data: { status: "COMPENSATED", lastError: null, nextAttemptAt: new Date() },
      });
      return;
    }

    throw new Error(`Unexpected reservation release state: ${result.status}`);
  } catch (error) {
    await prisma.orderWorkflow.updateMany({
      where: { id: workflow.id, status: "COMPENSATION_PENDING" },
      data: {
        lastError: error instanceof Error ? error.message : String(error),
        nextAttemptAt: new Date(Date.now() + 5_000),
        attempts: { increment: 1 },
      },
    });
    throw new AppError(
      ErrorCode.ORDER_RECOVERY_PENDING,
      "Order failed and stock release is pending recovery",
      503,
    );
  }
}

async function compensateAfterPersistenceFailure(
  workflow: Workflow,
  cause: unknown,
): Promise<void> {
  // A commit error can be ambiguous. Never release inventory before checking
  // whether the order/workflow transaction actually committed.
  const committedOrder = await prisma.order.findUnique({ where: { id: workflow.orderId } });
  const latest = await prisma.orderWorkflow.findUnique({ where: { id: workflow.id } });
  if (committedOrder || latest?.status === "COMPLETED") return;

  await prisma.orderWorkflow.updateMany({
    where: { id: workflow.id, status: { in: ["STARTED", "RESERVED"] } },
    data: {
      status: "COMPENSATION_PENDING",
      lastError: cause instanceof Error ? cause.message : String(cause),
      nextAttemptAt: new Date(),
    },
  });

  const pending = await prisma.orderWorkflow.findUnique({ where: { id: workflow.id } });
  if (pending?.status === "COMPENSATION_PENDING") {
    await releaseWorkflowReservation(pending);
  }
}

async function persistOrderAndOutbox(
  workflow: Workflow,
  reservation: ReservationRpcResponse,
): Promise<OrderResponse> {
  if (reservation.status !== "RESERVED") {
    throw new AppError(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      `Reservation is ${reservation.status}; order cannot be created`,
      409,
    );
  }

  const order = await prisma.$transaction(async (tx) => {
    let persisted = await tx.order.findUnique({
      where: { id: workflow.orderId },
      include: { items: true },
    });

    if (!persisted) {
      persisted = await tx.order.create({
        data: {
          id: workflow.orderId,
          userId: workflow.userId,
          status: "CONFIRMED",
          items: {
            create: reservation.items.map((item) => ({
              productId: item.product_id,
              productName: item.product_name,
              unitPrice: item.unit_price,
              quantity: item.quantity,
            })),
          },
        },
        include: { items: true },
      });
    } else if (persisted.userId !== workflow.userId) {
      throw new Error("Order identity conflict");
    }

    const eventExists = await tx.outboxEvent.findFirst({
      where: { aggregateId: persisted.id, eventType: "ORDER_CONFIRMED" },
    });

    if (!eventExists) {
      await tx.outboxEvent.create({
        data: {
          eventType: "ORDER_CONFIRMED",
          aggregateId: persisted.id,
          correlationId: workflow.correlationId,
          payload: eventPayload(workflow, persisted),
          nextAttemptAt: new Date(),
        },
      });
    }

    await tx.orderWorkflow.update({
      where: { id: workflow.id },
      data: { status: "COMPLETED", lastError: null, nextAttemptAt: new Date() },
    });

    return persisted;
  });

  return toOrderResponse(order);
}

async function advanceWorkflow(workflowId: string): Promise<OrderResponse> {
  let workflow = await prisma.orderWorkflow.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new AppError(ErrorCode.NOT_FOUND, "Order workflow not found", 404);

  const existingOrder = await prisma.order.findUnique({
    where: { id: workflow.orderId },
    include: { items: true },
  });

  if (workflow.status === "COMPLETED" || existingOrder) {
    if (!existingOrder) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, "Completed workflow has no order record", 500);
    }
    if (workflow.status === "COMPLETED") return toOrderResponse(existingOrder);

    const existingReservation = await productClient.getReservation(
      workflow.id,
      workflow.reservationHash,
    );
    if (existingReservation?.status !== "RESERVED") {
      throw new AppError(
        ErrorCode.ORDER_RECOVERY_PENDING,
        "Existing order needs consistency reconciliation",
        503,
      );
    }
    return persistOrderAndOutbox(workflow, existingReservation);
  }

  if (workflow.status === "COMPENSATED" || workflow.status === "FAILED") {
    throw new AppError(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      "This checkout reached a terminal state; start a new checkout with a new idempotency key",
      409,
    );
  }
  if (workflow.status === "COMPENSATION_PENDING") {
    throw new AppError(ErrorCode.ORDER_RECOVERY_PENDING, "Compensation is pending", 503);
  }

  let reservation: ReservationRpcResponse | null;
  try {
    // Reconcile first because a previous ReserveStock call may have committed
    // before its response timed out.
    reservation = await productClient.getReservation(workflow.id, workflow.reservationHash);
  } catch (error) {
    await markTransientFailure(workflow.id, error);
    throw new AppError(
      ErrorCode.SERVICE_UNAVAILABLE,
      "Could not determine reservation status; checkout is being reconciled",
      503,
    );
  }

  if (!reservation) {
    if (workflow.status === "RESERVED") {
      await markTransientFailure(workflow.id, new Error("Reserved workflow has no reservation"));
      throw new AppError(
        ErrorCode.ORDER_RECOVERY_PENDING,
        "Reservation record is missing; workflow requires reconciliation",
        503,
      );
    }

    const items = workflowItems(workflow);
    try {
      reservation = await reserveStockBreaker.fire({
        reservation_id: workflow.id,
        order_id: workflow.orderId,
        request_hash: workflow.reservationHash,
        items: items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
      }) as ReservationRpcResponse;
    } catch (error) {
      try {
        reservation = await productClient.getReservation(workflow.id, workflow.reservationHash);
      } catch (lookupError) {
        await markTransientFailure(workflow.id, lookupError);
        throw new AppError(
          ErrorCode.SERVICE_UNAVAILABLE,
          "Reservation result is unknown; automatic recovery will retry",
          503,
        );
      }

      if (!reservation && isStockRejection(error)) {
        await prisma.orderWorkflow.updateMany({
          where: { id: workflow.id, status: "STARTED" },
          data: { status: "FAILED", lastError: "Insufficient stock", nextAttemptAt: new Date() },
        });
        throw new AppError(ErrorCode.STOCK_INSUFFICIENT, "Insufficient stock", 409);
      }

      if (!reservation) {
        await markTransientFailure(workflow.id, error);
        throw new AppError(
          ErrorCode.SERVICE_UNAVAILABLE,
          "Reservation result is unknown; retry using the same idempotency key",
          503,
        );
      }
    }
  }

  if (reservation.status === "RELEASED") {
    await prisma.orderWorkflow.updateMany({
      where: { id: workflow.id, status: { in: ["STARTED", "RESERVED"] } },
      data: { status: "COMPENSATED", nextAttemptAt: new Date() },
    });
    throw new AppError(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      "The reservation was released; this checkout cannot be resumed",
      409,
    );
  }

  if (reservation.status !== "RESERVED") {
    await markTransientFailure(workflow.id, new Error(`Unexpected reservation state: ${reservation.status}`));
    throw new AppError(ErrorCode.ORDER_RECOVERY_PENDING, "Reservation is not ready", 503);
  }

  workflow = await prisma.orderWorkflow.update({
    where: { id: workflow.id },
    data: { status: "RESERVED", lastError: null },
  });

  try {
    return await persistOrderAndOutbox(workflow, reservation);
  } catch (error) {
    try {
      await compensateAfterPersistenceFailure(workflow, error);
    } catch (compensationError) {
      if (
        compensationError instanceof AppError &&
        compensationError.code === ErrorCode.ORDER_RECOVERY_PENDING
      ) throw compensationError;
    }

    const committed = await prisma.order.findUnique({
      where: { id: workflow.orderId },
      include: { items: true },
    });
    const latestWorkflow = await prisma.orderWorkflow.findUnique({ where: { id: workflow.id } });

    if (committed && latestWorkflow?.status === "COMPLETED") return toOrderResponse(committed);
    if (latestWorkflow?.status === "COMPENSATED") {
      throw new AppError(
        ErrorCode.SERVICE_UNAVAILABLE,
        "Order was not created; stock was released. Start a new checkout attempt",
        503,
      );
    }
    throw new AppError(
      ErrorCode.ORDER_RECOVERY_PENDING,
      "Order persistence failed; workflow is pending reconciliation",
      503,
    );
  }
}

export const OrderService = {
  async create(
    dto: CreateOrderDto,
    correlationId: string,
    idempotencyKey: string,
  ): Promise<OrderResponse> {
    const startedAt = Date.now();
    const items = normalizeItems(dto.items);
    const workflow = await getOrCreateWorkflow(dto, correlationId, idempotencyKey, items);

    // Foreground retries and background recovery use the same persisted lease.
    // This prevents a live request from advancing the Saga while a worker
    // attempts compensation. The operation remains idempotent if a lease expires.
    if (workflow.status !== "STARTED" && workflow.status !== "RESERVED") {
      return advanceWorkflow(workflow.id);
    }

    const leaseOwner = `http-${process.pid}-${randomUUID()}`;
    const now = new Date();
    const claim = await prisma.orderWorkflow.updateMany({
      where: {
        id: workflow.id,
        status: { in: ["STARTED", "RESERVED"] },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { leaseOwner, leaseUntil: new Date(Date.now() + 60_000) },
    });

    if (claim.count !== 1) {
      const latest = await prisma.orderWorkflow.findUnique({ where: { id: workflow.id } });
      if (latest?.status === "COMPLETED") return advanceWorkflow(workflow.id);
      throw new AppError(
        ErrorCode.ORDER_RECOVERY_PENDING,
        "This checkout is already being processed; retry with the same idempotency key",
        503,
      );
    }

    try {
      const result = await advanceWorkflow(workflow.id);
      ordersCreatedCounter.inc({ status: "confirmed" });
      orderCreationDuration.observe((Date.now() - startedAt) / 1000);
      return result;
    } finally {
      await prisma.orderWorkflow.updateMany({
        where: { id: workflow.id, leaseOwner },
        data: { leaseOwner: null, leaseUntil: null },
      });
    }
  },

  /** Used by the recovery worker; it never creates a new workflow or reservation ID. */
  async recoverWorkflowById(workflowId: string): Promise<void> {
    const workflow = await prisma.orderWorkflow.findUnique({ where: { id: workflowId } });
    if (!workflow) return;

    if (workflow.status === "COMPENSATION_PENDING") {
      await releaseWorkflowReservation(workflow);
      return;
    }
    if (
      workflow.status === "COMPLETED" ||
      workflow.status === "COMPENSATED" ||
      workflow.status === "FAILED"
    ) return;

    await advanceWorkflow(workflowId);
  },
};
