import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { CORRELATION_ID_HEADER } from "@stockrush/shared";
import { logger } from "../logger";

export interface CorrelatedRequest extends Request {
  correlationId?: string;
  log?: ReturnType<typeof logger.child>;
}

export const correlationMiddleware = (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) => {
  // Use incoming ID if present — allows tracing across external systems
  // Generate new one if not present
  const correlationId =
    (req.headers[CORRELATION_ID_HEADER] as string) ?? randomUUID();

  req.correlationId = correlationId;

  // Attach child logger with correlationId to request
  req.log = logger.child({ correlationId });

  // Always return correlationId in response headers
  // Client can use this to report issues
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  req.log.info({
    method: req.method,
    url: req.url,
    msg: "Incoming request",
  });

  next();
};
