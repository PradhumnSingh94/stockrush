import { Router } from "express";
import { validate } from "../middleware/validate";
import { RegisterDtoSchema, LoginDtoSchema } from "@stockrush/shared";
import { AuthClient } from "../services/auth.client";
import { CorrelatedRequest } from "../middleware/correlation";
import { limitLogin, limitRegister } from "../middleware/ratelimiter";

export const authRouter: Router = Router();

authRouter.post(
  "/register",
  limitRegister,
  validate(RegisterDtoSchema),
  async (req: CorrelatedRequest, res) => {
    const result = await AuthClient.register(req.body, req.correlationId!);
    res.status(201).json(result);
  },
);

authRouter.post(
  "/login",
  limitLogin,
  validate(LoginDtoSchema),
  async (req: CorrelatedRequest, res) => {
    const result = await AuthClient.login(req.body, req.correlationId!);
    res.json(result);
  },
);
