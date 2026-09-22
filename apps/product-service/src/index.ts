import "express-async-error";
import express from "express";
import { config } from "./config";
import { productRouter } from "./routes/product.routes";
import { errorHandler } from "./middleware/error-handler";
import "./grpc/product.grpc.server"; // starts gRPC server on boot
import { correlationMiddleware } from "./middleware/correlation";
import { StockSyncJob } from "./jobs/stock-sync.job";

const app = express();

app.use(express.json());
app.use(correlationMiddleware);
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "product-service",
    stockSync: StockSyncJob.getStatus(),
  });
});

app.use("/products", productRouter);
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`product-service running on port ${config.PORT}`);
  StockSyncJob.start();
});
