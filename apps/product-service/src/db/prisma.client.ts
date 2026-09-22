import { PrismaClient } from '../generated/prisma/client'; // or your custom output path
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from '../config'; // Assuming your config helper is here

// 1. Set up the physical database connection (the "Adapter")
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 2. Pass the adapter here
    adapter, 
    log: config.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (config.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}