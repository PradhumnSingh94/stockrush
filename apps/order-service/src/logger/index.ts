import pino from "pino";
import { config } from "../config";

export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  transport:
    config.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  base: {
    service: "order-service",
  },
});

// Child logger with correlation ID — call this per request
export function requestLogger(correlationId: string) {
  return logger.child({ correlationId });
}
