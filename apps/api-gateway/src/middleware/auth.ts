import { Request, Response, NextFunction } from "express";
import { V4 } from "paseto";
import { config } from "../config";
import { ErrorCode } from "@stockrush/shared";

export interface AuthRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      code: ErrorCode.VALIDATION_ERROR,
      message: "Missing token",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = (await V4.verify(
      token,
      config.PASETO_PUBLIC_KEY,
    )) as unknown as {
      userId: string;
      email: string;
    };

    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({
      code: ErrorCode.VALIDATION_ERROR,
      message: "Invalid or expired token",
    });
  }
};
