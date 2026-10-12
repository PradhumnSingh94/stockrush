import { prisma } from "../db/prisma.client";
import { OrderStream } from "../streams/order.stream";

export async function publishPendingOutboxEvents() {
  const events = await prisma.outboxEvent.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  for (const event of events) {
    try {
      if (event.eventType !== "ORDER_CONFIRMED") {
        throw new Error(`Unsupported event type: ${event.eventType}`);
      }

      const payload = event.payload as {
        orderId: string;
        userId: string;
        userEmail: string;
        items: Array<{
          productId: string;
          productName: string;
          quantity: number;
          unitPrice: string;
        }>;
        correlationId: string;
      };

      await OrderStream.publishConfirmed(payload, payload.correlationId);

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          publishedAt: new Date(),
          attempts: { increment: 1 },
          lastError: null,
        },
      });
    } catch (error) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts: { increment: 1 },
          lastError: String(error),
        },
      });
    }
  }
}
