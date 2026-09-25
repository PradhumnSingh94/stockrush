import { RateLimiterRedis } from "rate-limiter-flexible";
import { Request, Response, NextFunction } from "express";
import createClient from "ioredis";
import { config } from "../config";
import { ErrorCode } from "@stockrush/shared";
import { logger } from "../logger";
import { CorrelatedRequest } from "./correlation";

const redisClient = new createClient(config.REDIS_URL);

// --- Limiters ---

// Auth endpoints — strict, per IP
const registerLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:register",
  points: 5, // 5 requests
  duration: 60 * 15, // per 15 minutes
  blockDuration: 60 * 15,
});

const loginLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:login",
  points: 10, // 10 requests
  duration: 60 * 15, // per 15 minutes
  blockDuration: 60 * 15,
});

// Order endpoint — per authenticated user
const orderLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:order",
  points: parseInt(process.env.RATE_LIMIT_ORDERS || "5"),
  duration: 60,
  blockDuration: 60,
});

const productReadLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:product:read",
  points: parseInt(process.env.RATE_LIMIT_PRODUCT_READ || "100"),
  duration: 60,
  blockDuration: 30,
});

// Product write — per authenticated user
const productWriteLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:product:write",
  points: 20, // 20 requests
  duration: 60, // per minute
  blockDuration: 60,
});

// --- Helper ---

function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0] ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

function rateLimitResponse(res: Response, retryAfter: number) {
  res.set("Retry-After", String(retryAfter));
  res.status(429).json({
    code: ErrorCode.VALIDATION_ERROR,
    message: "Too many requests. Please try again later.",
    retryAfter,
  });
}

// --- Middleware factories ---

export const limitRegister = async (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await registerLimiter.consume(getIp(req));
    next();
  } catch (err: any) {
    req.log?.warn({
      ip: getIp(req),
      msg: "Rate limit exceeded: register",
    });
    rateLimitResponse(res, Math.ceil(err.msBeforeNext / 1000));
  }
};

export const limitLogin = async (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await loginLimiter.consume(getIp(req));
    next();
  } catch (err: any) {
    req.log?.warn({
      ip: getIp(req),
      msg: "Rate limit exceeded: login",
    });
    rateLimitResponse(res, Math.ceil(err.msBeforeNext / 1000));
  }
};

export const limitOrder = async (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) => {
  // Use userId if authenticated, fall back to IP
  const key = (req as any).userId ?? getIp(req);

  try {
    await orderLimiter.consume(key);
    next();
  } catch (err: any) {
    req.log?.warn({
      key,
      msg: "Rate limit exceeded: order",
    });
    rateLimitResponse(res, Math.ceil(err.msBeforeNext / 1000));
  }
};

export const limitProductRead = async (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await productReadLimiter.consume(getIp(req));
    next();
  } catch (err: any) {
    req.log?.warn({
      ip: getIp(req),
      msg: "Rate limit exceeded: product read",
    });
    rateLimitResponse(res, Math.ceil(err.msBeforeNext / 1000));
  }
};

export const limitProductWrite = async (
  req: CorrelatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const key = (req as any).userId ?? getIp(req);

  try {
    await productWriteLimiter.consume(key);
    next();
  } catch (err: any) {
    req.log?.warn({
      key,
      msg: "Rate limit exceeded: product write",
    });
    rateLimitResponse(res, Math.ceil(err.msBeforeNext / 1000));
  }
};
