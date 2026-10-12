import { Router } from "express";
import { CreateOrderDtoSchema, ErrorCode } from "@stockrush/shared";
import { validate } from "../middleware/validate";
import { OrderService } from "../services/order.service";
import { CorrelatedRequest } from "../middleware/correlation";
import { idempotencyMiddleware } from "../middleware/idempotency";

export const orderRouter: Router = Router();

// The API Gateway posts to /orders; index.ts mounts this router at /orders.
orderRouter.post(
  "/",
  validate(CreateOrderDtoSchema),
  idempotencyMiddleware,
  async (req: CorrelatedRequest, res) => {
    const idempotencyKey = req.header("X-Idempotency-Key");
    if (!idempotencyKey) {
      return res.status(400).json({
        code: ErrorCode.VALIDATION_ERROR,
        message: "X-Idempotency-Key is required",
        correlationId: req.correlationId,
      });
    }

    if (!req.correlationId) {
      return res.status(400).json({
        code: ErrorCode.VALIDATION_ERROR,
        message: "X-Correlation-ID is required",
      });
    }

    req.log?.info({ msg: "Creating/reconciling order workflow" });
    const order = await OrderService.create(req.body, req.correlationId, idempotencyKey);
    req.log?.info({ orderId: order.id, msg: "Order confirmed" });
    res.status(201).json(order);
  },
);
