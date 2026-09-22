import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.string().default("3000"),
  PRODUCT_SERVICE_URL: z.string().url(),
  ORDER_SERVICE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PASETO_PUBLIC_KEY: z.string().min(1, "PASETO_PUBLIC_KEY is required"),
  AUTH_SERVICE_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3030"),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
