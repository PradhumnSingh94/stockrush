import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Replace with actual IDs printed by product seed above
const PRODUCT_IDS = {
  nikeAirMax: "affc46bd-5257-49d5-84b8-bb3025700027",
  sonyHeadphones: "0434c96f-89fb-49da-ab6b-3281cfa7f385",
  appleWatch: "89cdb168-33b6-47b0-9fc8-53c34893d3b2",
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
            productName: "Nike Air Max 2026",
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
            productName: "Sony WH-1000XM4",
            quantity: 2,
            unitPrice: 349.99,
          },
          {
            productId: PRODUCT_IDS.appleWatch,
            productName: "Apple Watch Series 8",
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
            productName: "Apple Watch Series 8",
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
