import "express-async-errors";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { productRouter } from "./routes/product.routes";
import { errorHandler } from "./middleware/error-handler";
import { orderRouter } from "./routes/order.routes";
import { authRouter } from "./routes/auth.routes";
import { correlationMiddleware } from "./middleware/correlation";
import { registry } from "@stockrush/shared";
import { metricsMiddleware } from "./middleware/metrics";

const app = express();

// CORS — must be before all routes
app.use(
  cors({
    origin: config.ALLOWED_ORIGINS.split(","),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-correlation-id"],
  }),
);

app.use(express.json());
app.use(metricsMiddleware);
app.use(correlationMiddleware);
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

console.log("API call is in internet gateway, will forward according to url");
app.use("/api/auth", authRouter);
app.use("/api/products", productRouter);
app.use("/api/orders", orderRouter);
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`api-gateway running on port ${config.PORT}`);
});
