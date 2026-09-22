import "express-async-error";
import express from "express";
import { config } from "./config";
import { errorHandler } from "./middleware/error-handler";
import { orderRouter } from "./routes/order.routes";
import { correlationMiddleware } from "./middleware/correlation";

const app = express();

app.use(express.json());
app.use(correlationMiddleware);
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "order-service" });
});

app.use("/orders", orderRouter);
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`order-service running on port ${config.PORT}`);
});
