import { Router } from "express";
import { CreateOrderDtoSchema } from "@stockrush/shared";
import { validate } from "../middleware/validate";
import { OrderService } from "../services/order.service";
import { CorrelatedRequest } from "../middleware/correlation";
import { idempotencyMiddleware } from "../middleware/idempotency";

export const orderRouter: Router = Router();

orderRouter.post(
  "/",
  idempotencyMiddleware, // ← add before validate
  validate(CreateOrderDtoSchema),
  async (req: CorrelatedRequest, res) => {
    req.log?.info({ msg: "Creating new order" });
    const order = await OrderService.create(req.body, req.correlationId!);
    if (typeof order === "string") {
      req.log?.error({ msg: "Order creation failed", detail: order });
      return res.status(500).json({ error: order });
    }
    req.log?.info({ orderId: order.id, msg: "New order created" });
    res.status(201).json(order);
  },
);
