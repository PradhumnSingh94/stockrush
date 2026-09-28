import { Request, Response, NextFunction } from "express";
import { redis } from "../cache/redis.client";

const IDEMPOTENCY_TTL = 60 * 60 * 24; // 24 hours

export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const key = req.headers["x-idempotency-key"] as string;

  if (!key) return next(); // optional — skip if no key

  const cached = await redis.get(`idempotency:${key}`);

  if (cached) {
    const parsed = JSON.parse(cached);
    return res.status(parsed.status).json(parsed.body);
  }

  // Intercept response to cache it
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 500) {
      redis.set(
        `idempotency:${key}`,
        JSON.stringify({ status: res.statusCode, body }),
        "EX",
        IDEMPOTENCY_TTL,
      );
    }
    return originalJson(body);
  };

  next();
};
