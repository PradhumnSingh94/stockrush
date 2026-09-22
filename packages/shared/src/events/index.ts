import { z } from "zod";

// --- Product Events ---
export const ProductCreatedEventSchema = z.object({
  eventType: z.literal("PRODUCT_CREATED"),
  payload: z.object({
    productId: z.string().uuid(),
    name: z.string().min(1),
    stock: z.number().int().nonnegative(),
    price: z.number().positive(),
    flashSaleEndsAt: z.string().datetime().optional(),
  }),
  metadata: z.object({
    timestamp: z.string().datetime(),
    correlationId: z.string().uuid(),
  }),
});

export const StockReservedEventSchema = z.object({
  eventType: z.literal("STOCK_RESERVED"),
  payload: z.object({
    productId: z.string().uuid(),
    orderId: z.string().uuid(),
    quantity: z.number().int().positive(),
  }),
  metadata: z.object({
    timestamp: z.string().datetime(),
    correlationId: z.string().uuid(),
  }),
});

export const StockDepletedEventSchema = z.object({
  eventType: z.literal("STOCK_DEPLETED"),
  payload: z.object({
    productId: z.string().uuid(),
    depletedAt: z.string().datetime(),
  }),
  metadata: z.object({
    timestamp: z.string().datetime(),
    correlationId: z.string().uuid(),
  }),
});

// --- Inferred Types ---
export type ProductCreatedEvent = z.infer<typeof ProductCreatedEventSchema>;
export type StockReservedEvent = z.infer<typeof StockReservedEventSchema>;
export type StockDepletedEvent = z.infer<typeof StockDepletedEventSchema>;