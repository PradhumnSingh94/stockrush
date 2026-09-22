import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Replace with actual IDs printed by product seed above
const PRODUCT_IDS = {
  nikeAirMax: "c9787201-0eff-4dd7-9765-053eaafba2c8",
  sonyHeadphones: "6dfed867-7bb1-4cc9-8e72-2d6c7ad4954a",
  appleWatch: "9b36d73e-4617-4de5-aa3b-db62dd3d6524",
};

async function main() {
  // Clean existing data first — order matters due to foreign key
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();

  // Order 1 — single item, confirmed
  await prisma.order.create({
    data: {
      userId: "user-001",
      status: "CONFIRMED",
      items: {
        create: [
          {
            productId: PRODUCT_IDS.nikeAirMax,
            quantity: 1,
            unitPrice: 129.99,
          },
        ],
      },
    },
  });

  // Order 2 — multiple items, pending
  await prisma.order.create({
    data: {
      userId: "user-002",
      status: "PENDING",
      items: {
        create: [
          {
            productId: PRODUCT_IDS.sonyHeadphones,
            quantity: 2,
            unitPrice: 349.99,
          },
          {
            productId: PRODUCT_IDS.appleWatch,
            quantity: 1,
            unitPrice: 799.99,
          },
        ],
      },
    },
  });

  // Order 3 — cancelled
  await prisma.order.create({
    data: {
      userId: "user-001",
      status: "CANCELLED",
      items: {
        create: [
          {
            productId: PRODUCT_IDS.appleWatch,
            quantity: 1,
            unitPrice: 799.99,
          },
        ],
      },
    },
  });

  console.log("Orders seeded successfully");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });