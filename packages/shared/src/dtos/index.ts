import { z } from "zod";

// --- Product DTOs ---
export const CreateProductDtoSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  price: z.number().positive(),
  stock: z.number().int().nonnegative(),
  flashSaleEndsAt: z.string().datetime().optional(),
});

export const ProductResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number(),
  stock: z.number(),
  flashSaleEndsAt: z.string().datetime().nullish(),
  createdAt: z.string().datetime(),
});

// --- Order DTOs ---
export const CreateOrderDtoSchema = z.object({
  // TODO - In a real app, we would get userId and userEmail from auth context, not the request body
  userId: z.string(),
  userEmail: z.string().email(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const OrderResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "FULFILLED"]),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      productName: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().positive(),
    }),
  ),
  createdAt: z.string().datetime(),
});

export const OrderConfirmedEventSchema = z.object({
  eventType: z.literal("ORDER_CONFIRMED"),
  payload: z.object({
    orderId: z.string().uuid(),
    userId: z.string(),
    userEmail: z.string().email(),
    items: z.array(
      z.object({
        productId: z.string(),
        productName: z.string(),
        quantity: z.number(),
        unitPrice: z.number(),
      }),
    ),
  }),
  metadata: z.object({
    timestamp: z.string().datetime(),
    correlationId: z.string().uuid(),
  }),
});

export const RegisterDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1),
});

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  }),
});

// --- Inferred Types ---
export type CreateProductDto = z.infer<typeof CreateProductDtoSchema>;
export type ProductResponse = z.infer<typeof ProductResponseSchema>;
export type CreateOrderDto = z.infer<typeof CreateOrderDtoSchema>;
export type OrderResponse = z.infer<typeof OrderResponseSchema>;
export type OrderConfirmedEvent = z.infer<typeof OrderConfirmedEventSchema>;
export type RegisterDto = z.infer<typeof RegisterDtoSchema>;
export type LoginDto = z.infer<typeof LoginDtoSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
