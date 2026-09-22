import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.string().default("3003"),
  DATABASE_URL: z.string().min(1),
  PASETO_SECRET_KEY: z.string().min(1, "PASETO_SECRET_KEY is required"),
  PASETO_PUBLIC_KEY: z.string().min(1, "PASETO_PUBLIC_KEY is required"),
  TOKEN_EXPIRY: z.string().default("24h"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
