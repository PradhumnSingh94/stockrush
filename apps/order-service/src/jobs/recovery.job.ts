import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.client";
import { OrderService } from "../services/order.service";

const BATCH_SIZE = 50;
const LEASE_MS = 30_000;
const POLL_MS = 3_000;
const WORKER_ID = `recovery-${process.pid}-${randomUUID()}`;

function retryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 1_000 * 2 ** Math.min(attempts, 8));
}

/** Reconciles incomplete Saga steps after HTTP timeout or process restart. */
export async function recoverIncompleteWorkflows(): Promise<void> {
  const now = new Date();
  const candidates = await prisma.orderWorkflow.findMany({
    where: {
      status: { in: ["STARTED", "RESERVED", "COMPENSATION_PENDING"] },
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH_SIZE,
  });

  for (const candidate of candidates) {
    const claimed = await prisma.orderWorkflow.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        nextAttemptAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        leaseOwner: WORKER_ID,
        leaseUntil: new Date(Date.now() + LEASE_MS),
      },
    });
    if (claimed.count !== 1) continue;

    try {
      await OrderService.recoverWorkflowById(candidate.id);
    } catch (error) {
      const attempts = candidate.attempts + 1;
      await prisma.orderWorkflow.updateMany({
        where: { id: candidate.id, leaseOwner: WORKER_ID },
        data: {
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
        },
      });
      console.error("Workflow recovery attempt failed", {
        workflowId: candidate.id, status: candidate.status, error,
      });
    } finally {
      await prisma.orderWorkflow.updateMany({
        where: { id: candidate.id, leaseOwner: WORKER_ID },
        data: { leaseOwner: null, leaseUntil: null },
      });
    }
  }
}

export function startRecoveryWorker(): () => void {
  let running = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (!running) {
      running = true;
      try {
        await recoverIncompleteWorkflows();
      } catch (error) {
        console.error("Recovery worker batch failed", error);
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
