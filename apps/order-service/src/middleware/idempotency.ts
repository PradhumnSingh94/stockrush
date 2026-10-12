import { createHash } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { redis } from "../cache/redis.client";

const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24;

function normalizeItems(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  const totals = new Map<string, number>();

  for (const entry of items) {
    if (
      typeof entry !== "object" || entry === null ||
      typeof (entry as { productId?: unknown }).productId !== "string" ||
      !Number.isInteger((entry as { quantity?: unknown }).quantity)
    ) return items;

    const item = entry as { productId: string; quantity: number };
    totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
  }

  return [...totals.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

function requestFingerprint(body: unknown): string {
  const value = body as Record<string, unknown>;
  // Match the durable workflow's identity: authenticated user + normalized items.
  return createHash("sha256").update(JSON.stringify({
    userId: value?.userId,
    items: normalizeItems(value?.items),
  })).digest("hex");
}

function cacheKey(userId: string, route: string, idempotencyKey: string): string {
  const scope = createHash("sha256")
    .update(JSON.stringify({ userId, route, idempotencyKey }))
    .digest("hex");
  return `idempotency:orders:${scope}`;
}

/**
 * Redis provides a best-effort successful-response cache. PostgreSQL workflow
 * uniqueness remains the source of truth for concurrent requests and retries.
 */
export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const idempotencyKey = req.header("X-Idempotency-Key");
  const body = req.body as Record<string, unknown> | undefined;
  const userId = typeof body?.userId === "string" ? body.userId : "";

  if (!idempotencyKey || idempotencyKey.length > 200 || !userId) {
    res.status(400).json({
      error: "A valid X-Idempotency-Key and authenticated user context are required",
    });
    return;
  }

  const fingerprint = requestFingerprint(req.body);
  const key = cacheKey(userId, req.baseUrl + req.path, idempotencyKey);

  try {
    const cached = await redis.get(key);
    if (cached) {
      const entry = JSON.parse(cached) as {
        requestHash: string;
        status: number;
        body: unknown;
      };

      if (entry.requestHash !== fingerprint) {
        res.status(409).json({ error: "Idempotency key reused with a different request" });
        return;
      }
      res.status(entry.status).json(entry.body);
      return;
    }
  } catch (error) {
    // Fail open on cache errors; durable database idempotency protects correctness.
    console.error("Idempotency response cache unavailable; continuing", error);
  }

  const originalJson = res.json.bind(res);
  res.json = ((responseBody: unknown) => {
    // Cache only successful responses. A racing 409 must never overwrite a
    // successful response for the same idempotency key.
    if (res.statusCode >= 200 && res.statusCode < 300) {
      void redis.set(
        key,
        JSON.stringify({
          requestHash: fingerprint,
          status: res.statusCode,
          body: responseBody,
        }),
        "EX",
        IDEMPOTENCY_TTL_SECONDS,
      ).catch((error) => console.error("Could not cache idempotent response", error));
    }
    return originalJson(responseBody);
  }) as Response["json"];

  next();
};
