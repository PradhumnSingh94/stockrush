import { redis } from "../cache/redis.client";
import { transporter } from "../email/email.mailer";
import { orderConfirmedTemplate } from "../email/email.template";
import { OrderConfirmedEventSchema } from "@stockrush/shared";
import { config } from "../config";

const STREAM_KEY = "events:orders";
const GROUP_NAME = "notification-service";
const CONSUMER_NAME = `consumer-${process.pid}`;
const BLOCK_MS = 5000; // wait 5s for new messages before looping
const BATCH_SIZE = 10; // process 10 messages at a time

async function createConsumerGroup(): Promise<void> {
  try {
    // Create consumer group — start from beginning of stream ("0")
    // "0" means process all existing messages first
    // "$" would mean only new messages from this point
    await redis.xgroup("CREATE", STREAM_KEY, GROUP_NAME, "0", "MKSTREAM");
    console.log(`Consumer group "${GROUP_NAME}" created`);
  } catch (err: any) {
    // BUSYGROUP means group already exists — safe to ignore
    if (err.message?.includes("BUSYGROUP")) {
      console.log(`Consumer group "${GROUP_NAME}" already exists`);
    } else {
      throw err;
    }
  }
}

async function processMessage(messageId: string, data: string): Promise<void> {
  // Parse and validate event
  const parsed = OrderConfirmedEventSchema.safeParse(JSON.parse(data));

  if (!parsed.success) {
    console.error(
      `Invalid event shape for message ${messageId}:`,
      parsed.error,
    );
    // Still acknowledge — malformed messages should not block the stream
    await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
    return;
  }

  const event = parsed.data;
  const { orderId, userEmail, items } = event.payload;

  try {
    const template = orderConfirmedTemplate(event);

    await transporter.sendMail({
      from: `"StockRush" <${config.GMAIL_USER}>`,
      to: userEmail,
      subject: template.subject,
      html: template.html,
    });

    console.log(`Email sent for order ${orderId} to ${userEmail}`);

    // Acknowledge ONLY after successful send
    // If we crash before this line, message stays in pending
    // and will be reprocessed on restart
    await redis.xack(STREAM_KEY, GROUP_NAME, messageId);
  } catch (err) {
    // Don't acknowledge — message stays pending, will be retried
    console.error(`Failed to send email for order ${orderId}:`, err);
  }
}

export async function startConsumer(): Promise<void> {
  await createConsumerGroup();
  console.log(
    `Consumer "${CONSUMER_NAME}" started, listening on "${STREAM_KEY}"`,
  );

  while (true) {
    try {
      // XREADGROUP — read unacknowledged messages for this consumer
      // ">" means read new messages not yet delivered to any consumer
      const results = (await redis.xreadgroup(
        "GROUP",
        GROUP_NAME,
        CONSUMER_NAME,
        "COUNT",
        BATCH_SIZE,
        "BLOCK",
        BLOCK_MS,
        "STREAMS",
        STREAM_KEY,
        ">",
      )) as any;

      if (!results) continue; // timeout, no new messages — loop again

      const [, messages] = results[0];

      for (const [messageId, fields] of messages) {
        // Redis returns fields as flat array: ["data", "{...json...}"]
        const dataIndex = fields.indexOf("data");
        if (dataIndex === -1) continue;
        const data = fields[dataIndex + 1];
        await processMessage(messageId, data);
      }
    } catch (err) {
      console.error("Consumer loop error:", err);
      // Wait before retrying to avoid tight error loop
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
