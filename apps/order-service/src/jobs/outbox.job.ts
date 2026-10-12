import { randomUUID } from "node:crypto";
import { OrderConfirmedEvent } from "@stockrush/shared";
import { prisma } from "../db/prisma.client";
import { OrderStream } from "../streams/order.stream";

const BATCH_SIZE = 100;
const LEASE_MS = 30_000;
const POLL_MS = 2_000;
const WORKER_ID = `outbox-${process.pid}-${randomUUID()}`;

function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.min(attempts, 8));
}

/** Database leases coordinate multiple publisher replicas. Delivery is at-least-once. */
export async function publishPendingOutboxEvents(): Promise<void> {
  const now = new Date();
  const candidates = await prisma.outboxEvent.findMany({
    where: {
      publishedAt: null,
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const candidate of candidates) {
    const claimed = await prisma.outboxEvent.updateMany({
      where: {
        id: candidate.id,
        publishedAt: null,
        nextAttemptAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseOwner: WORKER_ID, leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
    if (claimed.count !== 1) continue;

    try {
      if (candidate.eventType !== "ORDER_CONFIRMED") {
        throw new Error(`Unsupported outbox event type: ${candidate.eventType}`);
      }
      const payload = candidate.payload as OrderConfirmedEvent["payload"];
      await OrderStream.publishConfirmed(payload, candidate.correlationId, candidate.id);

      await prisma.outboxEvent.updateMany({
        where: { id: candidate.id, leaseOwner: WORKER_ID, publishedAt: null },
        data: {
          publishedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
          leaseOwner: null,
          leaseUntil: null,
        },
      });
    } catch (error) {
      const attempts = candidate.attempts + 1;
      await prisma.outboxEvent.updateMany({
        where: { id: candidate.id, leaseOwner: WORKER_ID, publishedAt: null },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
          leaseOwner: null,
          leaseUntil: null,
        },
      });
      console.error("Outbox publication failed; event remains retryable", {
        eventId: candidate.id, error,
      });
    }
  }
}

export function startOutboxWorker(): () => void {
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (!running) {
      running = true;
      try {
        await publishPendingOutboxEvents();
      } catch (error) {
        console.error("Outbox worker batch failed", error);
      } finally {
        running = false;
      }
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), POLL_MS);
      timer.unref?.();
    }
  };

  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
