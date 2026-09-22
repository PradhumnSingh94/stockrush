import { Router } from "express";
import { AuthService } from "../services/auth.service";
import { validate } from "../middleware/validate";
import { RegisterDtoSchema, LoginDtoSchema } from "@stockrush/shared";
import { PasetoToken } from "../tokens/paseto";
import { AppError, ErrorCode } from "@stockrush/shared";
import { CorrelatedRequest } from "../middleware/correlation";

export const authRouter: Router = Router();

authRouter.post(
  "/register",
  validate(RegisterDtoSchema),
  async (req: CorrelatedRequest, res) => {
    req.log?.info({ msg: "Received user registration request" });
    const result = await AuthService.register(req.body);
    req.log?.info({ userId: result.user.id, msg: "User registered" });
    res.status(201).json(result);
  },
);

authRouter.post(
  "/login",
  validate(LoginDtoSchema),
  async (req: CorrelatedRequest, res) => {
    req.log?.info({ msg: "Received user login request" });
    const result = await AuthService.login(req.body);
    req.log?.info({ userId: result.user.id, msg: "User logged in" });
    res.json(result);
  },
);

authRouter.get("/me", async (req: CorrelatedRequest, res) => {
  req.log?.info({ msg: "Received user info request" });
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Missing token", 401);
  }

  const token = authHeader.split(" ")[1];
  const payload = await PasetoToken.verify(token);
  const user = await AuthService.me(payload.userId);
  req.log?.info({ userId: user.id, msg: "User info retrieved" });
  res.json(user);
});
