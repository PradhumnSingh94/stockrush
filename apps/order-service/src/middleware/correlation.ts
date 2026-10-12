import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
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
): void => {
  const provided = req.headers[CORRELATION_ID_HEADER];
  // Event contracts require UUID correlation IDs. Replace malformed external IDs.
  const correlationId =
    typeof provided === "string" && z.string().uuid().safeParse(provided).success
      ? provided
      : randomUUID();

  req.correlationId = correlationId;
  req.log = logger.child({ correlationId });
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  req.log.info({ method: req.method, url: req.url, msg: "Incoming request" });
  next();
};
