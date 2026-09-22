import { Request, Response, NextFunction } from "express";
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
  const correlationId =
    (req.headers[CORRELATION_ID_HEADER] as string) ?? "no-correlation-id";

  req.correlationId = correlationId;
  req.log = logger.child({ correlationId });

  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  req.log.info({
    method: req.method,
    url: req.url,
    msg: "Incoming request",
  });

  next();
};
