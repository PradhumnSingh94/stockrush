import { redis } from "../cache/redis.client";
import { OrderConfirmedEvent } from "@stockrush/shared";
import { randomUUID } from "crypto";

const STREAM_KEY = "events:orders";
const MAX_STREAM_LENGTH = 10000;

export const OrderStream = {
  async publishConfirmed(
    dto: OrderConfirmedEvent["payload"],
    correlationId: string,
  ): Promise<void> {
    const event: OrderConfirmedEvent = {
      eventType: "ORDER_CONFIRMED",
      payload: {
        orderId: dto.orderId,
        userId: dto.userId,
        userEmail: dto.userEmail,
        items: dto.items,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        correlationId: correlationId,
      },
    };

    // XADD — append to stream
    // MAXLEN ~ 10000 — trim stream to avoid unbounded growth
    await redis.xadd(
      STREAM_KEY,
      "MAXLEN",
      "~",
      MAX_STREAM_LENGTH,
      "*", // auto-generate message ID
      "data",
      JSON.stringify(event), // field: value
    );

    console.log(
      `Stream event published: ORDER_CONFIRMED for order ${dto.orderId}`,
    );
  },
};
