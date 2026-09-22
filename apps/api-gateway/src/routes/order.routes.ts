import { Router } from "express";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/auth";
import { CreateOrderDtoSchema } from "@stockrush/shared";
import { OrderClient } from "../services/order.client";
import { CorrelatedRequest } from "../middleware/correlation";
import { limitOrder } from "../middleware/ratelimiter";

export const orderRouter: Router = Router();

orderRouter.post(
  "/",
  authenticate,
  limitOrder,
  validate(CreateOrderDtoSchema),
  async (req: CorrelatedRequest, res) => {
    const product = await OrderClient.create(req.body, req.correlationId!);
    res.status(201).json(product);
  },
);
