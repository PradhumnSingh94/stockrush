import { randomUUID } from "node:crypto";
import { redis } from "../cache/redis.client";
import { transporter } from "../email/email.mailer";
import { orderConfirmedTemplate } from "../email/email.template";
import { OrderConfirmedEventSchema } from "@stockrush/shared";
import { config } from "../config";

const STREAM_KEY = "events:orders";
const DEAD_LETTER_STREAM = "events:orders:dead-letter";
const GROUP_NAME = "notification-service";
const CONSUMER_NAME = `consumer-${process.pid}-${randomUUID()}`;
const BLOCK_MS = 5_000;
const BATCH_SIZE = 10;
const CLAIM_IDLE_MS = 60_000;
const LOCK_TTL_MS = 120_000;
const SENT_TTL_SECONDS = 60 * 60 * 24 * 30;
const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

async function createConsumerGroup(): Promise<void> {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, GROUP_NAME, "0", "MKSTREAM");
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("BUSYGROUP")) {
      throw error;
    }
  }
}

type StreamMessage = [string, string[]];

async function deadLetter(messageId: string, data: string, reason: string): Promise<void> {
  await redis.xadd(
    DEAD_LETTER_STREAM,
    "MAXLEN", "~", 10_000,
    "*",
    "sourceStream", STREAM_KEY,
    "sourceMessageId", messageId,
    "reason", reason,
    "data", data,
    "failedAt", new Date().toISOString(),
  );
  await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
}

async function processMessage(messageId: string, data: string): Promise<void> {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    await deadLetter(messageId, data, "Invalid JSON");
    return;
  }

  const parsed = OrderConfirmedEventSchema.safeParse(value);
  if (!parsed.success) {
    await deadLetter(messageId, data, "Event schema validation failed");
    return;
  }

  const event = parsed.data;
  const eventId = event.metadata.eventId ?? `legacy-${messageId}`;
  const sentKey = `notification:order-confirmed:${eventId}:sent`;
  const lockKey = `notification:order-confirmed:${eventId}:lock`;

  if (await redis.get(sentKey)) {
    await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
    return;
  }

  const lockToken = `${CONSUMER_NAME}:${randomUUID()}`;
  const locked = await redis.set(lockKey, lockToken, "PX", LOCK_TTL_MS, "NX");
  if (locked !== "OK") {
    // Keep the message pending. XAUTOCLAIM will retry it after the lock/idle period.
    return;
  }

  try {
    // Re-check after acquiring the lock in case another consumer finished first.
    if (await redis.get(sentKey)) {
      await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
      return;
    }

    const template = orderConfirmedTemplate(event);
    await transporter.sendMail({
      from: `"StockRush" <${config.GMAIL_USER}>`,
      to: event.payload.userEmail,
      subject: template.subject,
      html: template.html,
    });

    // SMTP cannot provide a database transaction with Redis. A crash between
    // sendMail and this marker can still duplicate an email; use a provider API
    // with idempotency support for a strict external-side-effect guarantee.
    await redis.set(sentKey, "1", "EX", SENT_TTL_SECONDS);
    await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
    console.log(`Order-confirmation email processed: eventId=${eventId}`);
  } catch (error) {
    // Leave unacknowledged; another pass can reclaim and retry it.
    console.error("Order-confirmation email failed", { eventId, orderId: event.payload.orderId, error });
  } finally {
    await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockToken);
  }
}

function parseStreamMessages(input: unknown): StreamMessage[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is StreamMessage =>
      Array.isArray(entry) &&
      typeof entry[0] === "string" &&
      Array.isArray(entry[1]),
  );
}

async function processStreamMessage(message: StreamMessage): Promise<void> {
  const [messageId, fields] = message;
  const dataIndex = fields.indexOf("data");
  if (dataIndex < 0 || typeof fields[dataIndex + 1] !== "string") {
    await deadLetter(messageId, JSON.stringify(fields), "Missing data field");
    return;
  }
  await processMessage(messageId, fields[dataIndex + 1]);
}

export async function startConsumer(): Promise<void> {
  await createConsumerGroup();
  console.log(`Consumer ${CONSUMER_NAME} started for ${STREAM_KEY}`);

  while (true) {
    try {
      // First reclaim abandoned pending messages. ">" below only reads new messages;
      // without XAUTOCLAIM, messages assigned to a crashed consumer can remain pending.
      const reclaimed = (await redis.xautoclaim(
        STREAM_KEY,
        GROUP_NAME,
        CONSUMER_NAME,
        CLAIM_IDLE_MS,
        "0-0",
        "COUNT",
        BATCH_SIZE,
      )) as unknown[];

      const pendingMessages = parseStreamMessages(reclaimed?.[1]);
      for (const message of pendingMessages) {
        await processStreamMessage(message);
      }

      const result = (await redis.xreadgroup(
        "GROUP", GROUP_NAME, CONSUMER_NAME,
        "COUNT", BATCH_SIZE, "BLOCK", BLOCK_MS,
        "STREAMS", STREAM_KEY, ">",
      )) as unknown;

      if (!Array.isArray(result) || !Array.isArray(result[0])) continue;
      const messages = parseStreamMessages(result[0][1]);
      for (const message of messages) {
        await processStreamMessage(message);
      }
    } catch (error) {
      console.error("Notification consumer loop failed", error);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}
