import express from "express";
import { startConsumer } from "./streams/streams.consumer";
import { config } from "./config";
import { registry } from "@stockrush/shared";

const app = express();

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "notification-service" });
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});

app.listen(3004, () => {
  console.log("notification-service HTTP server running on port 3004");
});

startConsumer().catch((err) => {
  console.error("Consumer failed to start:", err);
  process.exit(1);
});
