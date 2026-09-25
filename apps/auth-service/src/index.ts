import "express-async-errors";
import express from "express";
import { config } from "./config";
import { errorHandler } from "./middleware/error-handler";
import { authRouter } from "./routes/auth.route";
import { correlationMiddleware } from "./middleware/correlation";
import { registry } from "@stockrush/shared";

const app = express();

app.use(express.json());
app.use(correlationMiddleware);
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "auth-service" });
});

app.use("/auth", authRouter);
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", registry.contentType);
  res.send(await registry.metrics());
});
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`auth-service running on port ${config.PORT}`);
});
