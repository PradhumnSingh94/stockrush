import { createHash } from "node:crypto";
import { prisma } from "../db/prisma.client";

type ReservationInput = {
  reservationId: string;
  orderId: string;
  requestHash: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
};

function normalizeItems(items: ReservationInput["items"]) {
  const totals = new Map<string, number>();

  for (const item of items) {
    if (
      !item.productId ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new Error("Invalid reservation item");
    }

    totals.set(
      item.productId,
      (totals.get(item.productId) ?? 0) + item.quantity,
    );
  }

  return [...totals.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export function hashReservationItems(items: ReservationInput["items"]) {
  const normalized = normalizeItems(items);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export async function reserveStock(input: ReservationInput) {
  const items = normalizeItems(input.items);

  if (!input.reservationId || !input.orderId || items.length === 0) {
    throw new Error("Invalid reservation request");
  }

  const expectedHash = hashReservationItems(items);

  if (input.requestHash !== expectedHash) {
    throw new Error("Reservation request hash mismatch");
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.stockReservation.findUnique({
      where: { id: input.reservationId },
      include: { items: true },
    });

    if (existing) {
      if (
        existing.orderId !== input.orderId ||
        existing.requestHash !== expectedHash
      ) {
        throw new Error("Reservation ID reused with different input");
      }

      return {
        reservationId: existing.id,
        status: existing.status,
        items: existing.items,
      };
    }

    await tx.stockReservation.create({
      data: {
        id: input.reservationId,
        orderId: input.orderId,
        requestHash: expectedHash,
        status: "RESERVED",
      },
    });

    const snapshots = [];

    for (const item of items) {
      const result = await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: item.quantity },
        },
        data: {
          stock: { decrement: item.quantity },
        },
      });

      if (result.count !== 1) {
        throw new Error(`INSUFFICIENT_STOCK:${item.productId}`);
      }

      // The update has acquired the row lock; the price read and
      // inventory change remain within this transaction.
      const product = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
      });

      snapshots.push({
        reservationId: input.reservationId,
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
      });
    }

    await tx.stockReservationItem.createMany({
      data: snapshots,
    });

    return {
      reservationId: input.reservationId,
      status: "RESERVED" as const,
      items: snapshots,
    };
  });
}

export async function getReservation(reservationId: string) {
  return prisma.stockReservation.findUnique({
    where: { id: reservationId },
    include: { items: true },
  });
}

export async function releaseStock(reservationId: string) {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.stockReservation.findUnique({
      where: { id: reservationId },
      include: { items: true },
    });

    if (!reservation) {
      return { reservationId, status: "NOT_FOUND" };
    }

    if (reservation.status === "RELEASED") {
      return { reservationId, status: "RELEASED" };
    }

    // Restore every item and mark the reservation released
    // in the same transaction. A repeated release won't increment twice.
    for (const item of reservation.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
    }

    await tx.stockReservation.update({
      where: { id: reservationId },
      data: { status: "RELEASED" },
    });

    return { reservationId, status: "RELEASED" };
  });
}
