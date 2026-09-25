import "express-async-error";
import express from "express";
import { config } from "./config";
import { errorHandler } from "./middleware/error-handler";
import { orderRouter } from "./routes/order.routes";
import { correlationMiddleware } from "./middleware/correlation";
import { registry } from "@stockrush/shared";

const app = express();

app.use(express.json());
app.use(correlationMiddleware);
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "order-service" });
});

app.use("/orders", orderRouter);
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`order-service running on port ${config.PORT}`);
});
