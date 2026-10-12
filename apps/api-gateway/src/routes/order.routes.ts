import { Router } from "express";
import {
  CreateOrderDtoSchema,
  CreateOrderRequestSchema,
  ErrorCode,
} from "@stockrush/shared";
import { validate } from "../middleware/validate";
import { authenticate, AuthRequest } from "../middleware/auth";
import { OrderClient } from "../services/order.client";
import { CorrelatedRequest } from "../middleware/correlation";
import { limitOrder } from "../middleware/ratelimiter";

type AuthenticatedCorrelatedRequest = AuthRequest & CorrelatedRequest;

export const orderRouter: Router = Router();

orderRouter.post(
  "/",
  authenticate,
  limitOrder,
  validate(CreateOrderRequestSchema),
  async (req: AuthenticatedCorrelatedRequest, res) => {
    const idempotencyKey = req.header("X-Idempotency-Key");

    if (!idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({
        code: ErrorCode.VALIDATION_ERROR,
        message: "A valid X-Idempotency-Key header is required",
        correlationId: req.correlationId,
      });
    }

    if (!req.userId || !req.userEmail || !req.correlationId) {
      return res.status(401).json({
        code: ErrorCode.VALIDATION_ERROR,
        message: "Authenticated user context is missing",
        correlationId: req.correlationId,
      });
    }

    // Re-parse the external contract, then add identity only from verified auth.
    const request = CreateOrderRequestSchema.parse(req.body);
    const command = CreateOrderDtoSchema.parse({
      ...request,
      userId: req.userId,
      userEmail: req.userEmail,
    });

    const order = await OrderClient.create(
      command,
      req.correlationId,
      idempotencyKey,
    );

    res.status(201).json(order);
  },
);
