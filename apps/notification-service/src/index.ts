import { startConsumer } from "./streams/streams.consumer";
import { config } from "./config";

console.log("Notification service starting...");
console.log(`Environment: ${config.NODE_ENV}`);

startConsumer().catch((err) => {
  console.error("Consumer failed to start:", err);
  process.exit(1);
});
