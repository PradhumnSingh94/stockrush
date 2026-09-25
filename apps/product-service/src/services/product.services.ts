import { prisma } from "../db/prisma.client";
import { redis } from "../cache/redis.client";
import { AppError, ErrorCode, CreateProductDto } from "@stockrush/shared";
import {
  stockDecrementCounter,
  cacheHitCounter,
  cacheMissCounter,
} from "../metrics";
import { ProductCache } from "../cache/product.cache";

const STOCK_KEY = (productId: string) => `stock:${productId}`;
const STOCK_TTL = 60 * 60 * 24; // 24 hours

export const ProductService = {
  async create(dto: CreateProductDto) {
    const product = await prisma.product.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        stock: dto.stock,
        flashSaleEndsAt: dto.flashSaleEndsAt
          ? new Date(dto.flashSaleEndsAt)
          : null,
      },
    });
    // Seed Redis with initial stock
    await redis.set(STOCK_KEY(product.id), product.stock, "EX", STOCK_TTL);
    return product;
  },

  async findById(id: string) {
    const cached = await ProductCache.getOne(id);
    if (cached) {
      cacheHitCounter.inc({ operation: "findById" });
      return cached;
    }
    cacheMissCounter.inc({ operation: "findById" });
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new AppError(ErrorCode.NOT_FOUND, `Product ${id} not found`, 404);
    }
    return product;
  },

  async list() {
    const cached = await ProductCache.getList();
    if (cached) {
      cacheHitCounter.inc({ operation: "list" });
      return cached;
    }
    cacheMissCounter.inc({ operation: "list" });
    return prisma.product.findMany({ orderBy: { createdAt: "desc" } });
  },

  async decrementStock(productId: string, quantity: number) {
    // Check flash sale expiry first
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      stockDecrementCounter.inc({ success: "false" });
      throw new AppError(
        ErrorCode.NOT_FOUND,
        `Product ${productId} not found`,
        404,
      );
    }
    if (product.flashSaleEndsAt && new Date() > product.flashSaleEndsAt) {
      stockDecrementCounter.inc({ success: "false" });
      throw new AppError(
        ErrorCode.FLASH_SALE_ENDED,
        "Flash sale has ended",
        400,
      );
    }

    // Atomic decrement in Redis
    // DECRBY returns the value AFTER decrement
    const remaining = await redis.decrby(STOCK_KEY(productId), quantity);
    if (remaining < 0) {
      // Undo the decrement — stock can't go negative
      await redis.incrby(STOCK_KEY(productId), quantity);
      stockDecrementCounter.inc({ success: "false" });
      throw new AppError(
        ErrorCode.STOCK_INSUFFICIENT,
        "Insufficient stock",
        400,
      );
    }

    // Sync decrement to Postgres asynchronously
    await prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: quantity } },
    });
    stockDecrementCounter.inc({ success: "true" });
    return { productId, remaining };
  },

  async syncStockToRedis(productId: string) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) return;
    await redis.set(STOCK_KEY(productId), product.stock, "EX", STOCK_TTL);
  },
};
