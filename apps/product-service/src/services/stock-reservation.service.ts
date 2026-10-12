import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.client";

export type ReservationItemInput = {
  productId: string;
  quantity: number;
};

export type ReservationInput = {
  reservationId: string;
  orderId: string;
  requestHash: string;
  items: ReservationItemInput[];
};

export type NormalizedReservationItem = ReservationItemInput;

function normalizeItems(items: ReservationItemInput[]): NormalizedReservationItem[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new Error("INVALID_RESERVATION: expected 1-100 items");
  }

  const totals = new Map<string, number>();

  for (const item of items) {
    if (
      typeof item.productId !== "string" ||
      item.productId.length === 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 2_147_483_647
    ) {
      throw new Error("INVALID_RESERVATION: invalid product ID or quantity");
    }

    const nextQuantity = (totals.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(nextQuantity) || nextQuantity > 2_147_483_647) {
      throw new Error("INVALID_RESERVATION: aggregated quantity is too large");
    }
    totals.set(item.productId, nextQuantity);
  }

  return [...totals.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

/**
 * The Order Service uses the same ordered { productId, quantity } array.
 * Keep normalization and serialization identical across service boundaries.
 */
export function hashReservationItems(items: ReservationItemInput[]): string {
  const normalized = normalizeItems(items);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function toReservationResult(reservation: {
  id: string;
  status: string;
  items: Array<{
    productId: string;
    productName: string;
    unitPrice: { toString(): string } | string | number;
    quantity: number;
  }>;
}) {
  return {
    reservationId: reservation.id,
    status: reservation.status,
    items: reservation.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitPrice: item.unitPrice.toString(),
      quantity: item.quantity,
    })),
  };
}

async function findMatchingReservation(
  reservationId: string,
  orderId: string,
  expectedHash: string,
) {
  const existing = await prisma.stockReservation.findUnique({
    where: { id: reservationId },
    include: { items: true },
  });

  if (!existing) return null;

  if (existing.orderId !== orderId || existing.requestHash !== expectedHash) {
    throw new Error("RESERVATION_CONFLICT: ID reused with different input");
  }

  return toReservationResult(existing);
}

/**
 * Reserves all items in one Product Service PostgreSQL transaction.
 * Conditional updates prevent overselling, and an error on any item rolls
 * back all decrements and the reservation record.
 */
export async function reserveStock(input: ReservationInput) {
  if (!input.reservationId || !input.orderId || !input.requestHash) {
    throw new Error("INVALID_RESERVATION: required fields are missing");
  }

  const items = normalizeItems(input.items);
  const expectedHash = hashReservationItems(items);

  if (input.requestHash !== expectedHash) {
    throw new Error("RESERVATION_HASH_MISMATCH: normalized items differ");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.stockReservation.findUnique({
        where: { id: input.reservationId },
        include: { items: true },
      });

      if (existing) {
        if (
          existing.orderId !== input.orderId ||
          existing.requestHash !== expectedHash
        ) {
          throw new Error("RESERVATION_CONFLICT: ID reused with different input");
        }
        return toReservationResult(existing);
      }

      // A concurrent request using this same reservation ID may race here.
      // The unique constraint decides the winner; the loser is reconciled below.
      await tx.stockReservation.create({
        data: {
          id: input.reservationId,
          orderId: input.orderId,
          requestHash: expectedHash,
          status: "RESERVED",
        },
      });

      const snapshots: Array<{
        reservationId: string;
        productId: string;
        productName: string;
        unitPrice: string;
        quantity: number;
      }> = [];

      for (const item of items) {
        const changed = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });

        if (changed.count !== 1) {
          // Throwing aborts the transaction, including earlier item decrements.
          throw new Error(`INSUFFICIENT_STOCK:${item.productId}`);
        }

        // The conditional UPDATE holds the product row lock until commit.
        // Capture the authoritative name and price in the same transaction.
        const product = await tx.product.findUniqueOrThrow({
          where: { id: item.productId },
          select: { id: true, name: true, price: true },
        });

        snapshots.push({
          reservationId: input.reservationId,
          productId: product.id,
          productName: product.name,
          unitPrice: product.price.toString(),
          quantity: item.quantity,
        });
      }

      await tx.stockReservationItem.createMany({ data: snapshots });

      return {
        reservationId: input.reservationId,
        status: "RESERVED",
        items: snapshots,
      };
    });
  } catch (error) {
    // If another identical request committed the same reservation concurrently,
    // Prisma rolls this transaction back on its unique conflict. Re-read it.
    if (isUniqueConstraintError(error)) {
      const existing = await findMatchingReservation(
        input.reservationId,
        input.orderId,
        expectedHash,
      );
      if (existing) return existing;
    }
    throw error;
  }
}

export async function getReservation(
  reservationId: string,
  requestHash?: string,
) {
  const reservation = await prisma.stockReservation.findUnique({
    where: { id: reservationId },
    include: { items: true },
  });

  if (!reservation) return null;

  if (requestHash && reservation.requestHash !== requestHash) {
    throw new Error("RESERVATION_CONFLICT: request hash does not match");
  }

  return toReservationResult(reservation);
}

/**
 * Idempotently releases a reservation. The conditional RESERVED -> RELEASED
 * update obtains the row lock and only its winner restores stock. The state
 * change and every increment share one transaction, so a partial release rolls
 * back completely.
 */
export async function releaseStock(
  reservationId: string,
  requestHash?: string,
) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.stockReservation.findUnique({
      where: { id: reservationId },
      include: { items: true },
    });

    if (!reservation) return { reservationId, status: "NOT_FOUND" };

    if (requestHash && reservation.requestHash !== requestHash) {
      throw new Error("RESERVATION_CONFLICT: request hash does not match");
    }

    if (reservation.status === "RELEASED") {
      return { reservationId, status: "RELEASED" };
    }

    const claimed = await tx.stockReservation.updateMany({
      where: { id: reservationId, status: "RESERVED" },
      data: { status: "RELEASED" },
    });

    if (claimed.count === 0) {
      const current = await tx.stockReservation.findUnique({
        where: { id: reservationId },
        select: { status: true },
      });

      if (current?.status === "RELEASED") {
        return { reservationId, status: "RELEASED" };
      }

      throw new Error("RESERVATION_STATE_CONFLICT: unable to claim release");
    }

    for (const item of reservation.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }

    return { reservationId, status: "RELEASED" };
  });
}
