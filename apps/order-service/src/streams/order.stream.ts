import { OrderConfirmedEvent, OrderConfirmedEventSchema } from "@stockrush/shared";
import { redis } from "../cache/redis.client";

const STREAM_KEY = "events:orders";
const MAX_STREAM_LENGTH = 10000;

/** Publish with the durable outbox ID; Redis can redeliver, consumers dedupe eventId. */
export const OrderStream = {
  async publishConfirmed(
    payload: OrderConfirmedEvent["payload"],
    correlationId: string,
    eventId: string,
  ): Promise<void> {
    const event = OrderConfirmedEventSchema.parse({
      eventType: "ORDER_CONFIRMED",
      payload,
      metadata: { eventId, timestamp: new Date().toISOString(), correlationId },
    });

    await redis.xadd(
      STREAM_KEY, "MAXLEN", "~", MAX_STREAM_LENGTH, "*", "data", JSON.stringify(event),
    );
  },
};
