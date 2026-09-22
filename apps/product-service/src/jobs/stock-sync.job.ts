import { prisma } from "../db/prisma.client";
import { redis } from "../cache/redis.client";
import { logger } from "../logger";

const STOCK_KEY = (productId: string) => `stock:${productId}`;
const STOCK_TTL = 60 * 60 * 24; // 24 hours
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastSyncAt: string | null = null;
let lastSyncStatus: "success" | "failed" | null = null;

export const StockSyncJob = {
  async run(): Promise<void> {
    logger.info({ msg: "Stock sync job started" });

    try {
      const products = await prisma.product.findMany({
        select: {
          id: true,
          name: true,
          stock: true,
        },
      });

      let reseeded = 0;
      let drifted = 0;
      let healthy = 0;

      for (const product of products) {
        const redisKey = STOCK_KEY(product.id);
        const redisStock = await redis.get(redisKey);

        // Key missing — Redis restarted or key expired
        if (redisStock === null) {
          await redis.set(redisKey, product.stock, "EX", STOCK_TTL);
          reseeded++;
          logger.warn({
            productId: product.id,
            productName: product.name,
            postgresStock: product.stock,
            msg: "Stock key missing in Redis — reseeded from Postgres",
          });
          continue;
        }

        const redisStockInt = parseInt(redisStock, 10);

        // Drift detected
        if (redisStockInt !== product.stock) {
          drifted++;
          logger.warn({
            productId: product.id,
            productName: product.name,
            redisStock: redisStockInt,
            postgresStock: product.stock,
            drift: redisStockInt - product.stock,
            msg: "Stock drift detected — reseeding from Postgres",
          });

          // Postgres is source of truth — always reseed from it
          await redis.set(redisKey, product.stock, "EX", STOCK_TTL);
          continue;
        }

        healthy++;
      }

      lastSyncAt = new Date().toISOString();
      lastSyncStatus = "success";

      logger.info({
        total: products.length,
        healthy,
        reseeded,
        drifted,
        msg: "Stock sync job completed",
      });
    } catch (err) {
      lastSyncAt = new Date().toISOString();
      lastSyncStatus = "failed";
      logger.error({ err, msg: "Stock sync job failed" });
    }
  },

  getStatus() {
    return { lastSyncAt, lastSyncStatus };
  },
  // Run on startup then every 5 minutes
  start(): void {
    logger.info({ msg: "Stock sync job scheduled" });

    // Run immediately on startup
    this.run();

    // Then every 5 minutes
    setInterval(() => {
      this.run();
    }, SYNC_INTERVAL_MS);
  },
};
