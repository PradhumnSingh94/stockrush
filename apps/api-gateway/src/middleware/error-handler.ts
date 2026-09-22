import { Request, Response, NextFunction } from "express";
import { AppError, ErrorCode } from "@stockrush/shared";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  console.error("Unhandled error:", err);

  res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: "Internal server error",
  });
};