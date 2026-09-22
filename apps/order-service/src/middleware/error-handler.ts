// apps/product-service/src/middleware/error-handler.ts
import { Request, Response, NextFunction } from "express";
import { AppError, ErrorCode } from "@stockrush/shared";
import { CorrelatedRequest } from "./correlation";

export const errorHandler = (
  err: Error,
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof AppError) {
    req.log?.error({
      code: err.code,
      message: err.message,
      msg: "Handled application error",
    });

    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      correlationId: req.correlationId, // ← include in error response
    });

    return;
  }

  req.log?.error({ err, msg: "Unhandled error" });

  res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: "Internal server error",
    correlationId: req.correlationId,
  });
};
