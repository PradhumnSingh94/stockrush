import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ErrorCode } from "@stockrush/shared";

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log("Validating request body:", req.body);
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        code: ErrorCode.VALIDATION_ERROR,
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    req.body = result.data;
    next();
  };
};
