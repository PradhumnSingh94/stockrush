import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.client";
import { productClient } from "../clients/product.grpc.client";
import { reserveStockBreaker } from "../clients/circuit-breaker";
import { CreateOrderDto } from "@stockrush/shared";

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const OrderService = {
  async create(dto: CreateOrderDto, correlationId: string, key: string) {
    const items = [...dto.items]
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId));

    const reservationId = sha256({ idempotencyKey: key });
    const requestHash = sha256({
      items: items.reduce(
        (acc, item) => {
          const found = acc.find((x) => x.productId === item.productId);
          if (found) found.quantity += item.quantity;
          else acc.push({ ...item });
          return acc;
        },
        [] as Array<{ productId: string; quantity: number }>,
      ),
    });

    const workflowHash = sha256({
      userId: dto.userId,
      items: requestHash,
    });

    const existingWorkflow = await prisma.orderWorkflow.findUnique({
      where: { id: reservationId },
    });

    if (existingWorkflow) {
      if (existingWorkflow.requestHash !== workflowHash) {
        throw new Error("Idempotency key reused with different request");
      }

      const existingOrder = await prisma.order.findUnique({
        where: { id: reservationId },
        include: { items: true },
      });

      if (existingOrder) return existingOrder;

      if (existingWorkflow.status === "COMPENSATION_PENDING") {
        throw new Error("Order recovery is pending");
      }
    } else {
      await prisma.orderWorkflow.create({
        data: {
          id: reservationId,
          userId: dto.userId,
          requestHash: workflowHash,
          status: "STARTED",
        },
      });
    }

    // If this times out, do not generate a new reservation ID.
    // Query/retry using the same ID during recovery.
    const reservation = await reserveStockBreaker.fire({
      reservation_id: reservationId,
      order_id: reservationId,
      request_hash: requestHash,
      items: items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    });

    await prisma.orderWorkflow.update({
      where: { id: reservationId },
      data: { status: "RESERVED" },
    });

    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            id: reservationId,
            status: "CONFIRMED",
            userId: dto.userId,
            items: {
              create: reservation.items.map((item: any) => ({
                productId: item.product_id,
                productName: item.product_name,
                unitPrice: item.unit_price,
                quantity: item.quantity,
              })),
            },
          },
          include: { items: true },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: "ORDER_CONFIRMED",
            aggregateId: order.id,
            payload: {
              orderId: order.id,
              userId: dto.userId,
              userEmail: dto.userEmail,
              items: reservation.items.map((item: any) => ({
                productId: item.product_id,
                productName: item.product_name,
                unitPrice: item.unit_price,
                quantity: item.quantity,
              })),
              correlationId,
            },
          },
        });

        await tx.orderWorkflow.update({
          where: { id: reservationId },
          data: { status: "COMPLETED" },
        });

        return order;
      });
    } catch (error) {
      // Persist compensation intent before making the remote call.
      await prisma.orderWorkflow.update({
        where: { id: reservationId },
        data: {
          status: "COMPENSATION_PENDING",
          lastError: String(error),
        },
      });

      // Best effort. A durable worker must retry this if it fails.
      try {
        const release = await productClient.releaseStock(reservationId);

        if (release.status === "RELEASED") {
          await prisma.orderWorkflow.update({
            where: { id: reservationId },
            data: { status: "COMPENSATED" },
          });
        }
      } catch {
        // Leave COMPENSATION_PENDING for the recovery worker.
      }

      throw error;
    }
  },
  async recoverWorkflow(workflow) {
  const reservation = await queryProductReservation(
    workflow.id,
    /* requestHash must be stored or reconstructed */
  );

  if (workflow.status === "COMPENSATION_PENDING") {
    // Retry release with the same reservation ID.
    const result = await productClient.releaseStock(workflow.id);

    if (result.status === "RELEASED") {
      await markWorkflowCompensated(workflow.id);
    }

    return;
  }

  if (!reservation) {
    // Product Service has no committed reservation.
    // A retry may use the same ID and same request hash.
    // If the original request is no longer available, mark failed
    // or require a controlled reconciliation decision.
    return;
  }

  if (reservation.status === "RELEASED") {
    await markWorkflowCompensated(workflow.id);
    return;
  }

  if (reservation.status === "RESERVED") {
    const order = await findOrder(workflow.id);

    if (order) {
      // The order exists; ensure its outbox event is pending/published.
      await ensureOrderOutboxEvent(order);
    } else {
      // No order exists. Persist compensation intent, then release.
      await markCompensationPending(workflow.id);
      await retryRelease(workflow.id);
    }
  }
};
