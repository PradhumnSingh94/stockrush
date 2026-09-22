import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import createClient from "ioredis";

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const redis = new createClient(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);

async function main() {
  // Clean existing data first
  await prisma.product.deleteMany();

  await prisma.product.createMany({
    data: [
      {
        name: "Nike Air Max 2026",
        description: "Limited edition flash sale sneakers",
        price: 129.99,
        stock: 50,
        flashSaleEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      },
      {
        name: "Sony WH-1000XM6",
        description: "Noise cancelling headphones",
        price: 349.99,
        stock: 30,
        flashSaleEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 12),
      },
      {
        name: "Apple Watch Ultra 3",
        description: "Premium smartwatch",
        price: 799.99,
        stock: 10,
        flashSaleEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 6),
      },
      {
        name: "Samsung 4K Monitor",
        description: "27 inch 4K gaming monitor",
        price: 499.99,
        stock: 0,
        flashSaleEndsAt: null,
      },
    ],
  });

  const products = await prisma.product.findMany();
  console.log("Products seeded:");
  for (const product of products) {
    await redis.set(`stock:${product.id}`, product.stock, "EX", 86400);
    console.log(`Seeded Redis stock for ${product.name}: ${product.stock}`);
    console.log(`  ${product.id} — ${product.name}`);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    await redis.quit();
  });
