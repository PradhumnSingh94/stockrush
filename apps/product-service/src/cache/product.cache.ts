import { redis } from "./redis.client";
import { ProductResponse } from "@stockrush/shared";

const CACHE_TTL = {
  REGULAR: 60 * 5,
  FLASH_SALE: 30,
} as const;

const KEYS = {
  product: (id: string) => `product:${id}`,
  list: () => `products:list`,
} as const;

function getTTL(product: ProductResponse): number {
  return product.flashSaleEndsAt ? CACHE_TTL.FLASH_SALE : CACHE_TTL.REGULAR;
}

export const ProductCache = {
  async getOne(id: string): Promise<ProductResponse | null> {
    const cached = await redis.get(KEYS.product(id));
    if (!cached) return null;
    return JSON.parse(cached) as ProductResponse;
  },

  async setOne(product: ProductResponse): Promise<void> {
    await redis.set(
      KEYS.product(product.id),
      JSON.stringify(product),
      "EX",
      getTTL(product),
    );
  },

  async getList(): Promise<ProductResponse[] | null> {
    const cached = await redis.get(KEYS.list());
    if (!cached) return null;
    return JSON.parse(cached) as ProductResponse[];
  },

  async setList(products: ProductResponse[]): Promise<void> {
    await redis.set(
      KEYS.list(),
      JSON.stringify(products),
      "EX",
      CACHE_TTL.FLASH_SALE,
    );
  },

  async invalidateOne(id: string): Promise<void> {
    await redis.del(KEYS.product(id));
  },

  async invalidateList(): Promise<void> {
    await redis.del(KEYS.list());
  },
};
