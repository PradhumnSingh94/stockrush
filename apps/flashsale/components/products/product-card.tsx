"use client";

import { Product } from "@/types";
import { StockBar } from "./stock-bar";
import { Button } from "@/components/ui/button";
import { useCreateOrder } from "@/hooks/useOrders";
import { AuthStorage } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const createOrder = useCreateOrder();
  const router = useRouter();
  const [ordering, setOrdering] = useState(false);

  const isFlashSale = !!product.flashSaleEndsAt;
  const isSoldOut = product.stock === 0;

  const timeLeft = product.flashSaleEndsAt
    ? Math.max(0, new Date(product.flashSaleEndsAt).getTime() - Date.now())
    : null;

  const hoursLeft = timeLeft ? Math.floor(timeLeft / (1000 * 60 * 60)) : 0;
  const minutesLeft = timeLeft
    ? Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
    : 0;

  async function handleBuy() {
    const user = AuthStorage.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    setOrdering(true);
    try {
      await createOrder.mutateAsync({
        items: [{ productId: product.id, quantity: 1 }],
      });
      router.push("/orders");
    } catch (err) {
      console.error(err);
    } finally {
      setOrdering(false);
    }
  }

  return (
    <div className={cn(
      "bg-[#111] border border-[#2a2a2a] p-6 flex flex-col gap-4",
      "hover:border-[#3a3a3a] transition-colors duration-200",
      isFlashSale && "border-l-2 border-l-amber-400"
    )}>
      {/* Flash sale badge */}
      {isFlashSale && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono tracking-widest text-amber-400 uppercase">
            ⚡ Flash Sale
          </span>
          {timeLeft !== null && timeLeft > 0 && (
            <span className="text-xs font-mono text-[#6b6b6b]">
              {hoursLeft}h {minutesLeft}m left
            </span>
          )}
        </div>
      )}

      {/* Product name */}
      <div>
        <h3 className="font-display font-700 text-xl uppercase tracking-tight text-white">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-sm text-[#6b6b6b] mt-1 font-mono">
            {product.description}
          </p>
        )}
      </div>

      {/* Price */}
      <div className="font-mono text-2xl font-bold text-amber-400">
        ${product.price}
      </div>

      {/* Stock bar */}
      <StockBar stock={product.stock} />

      {/* Buy button */}
      <Button
        onClick={handleBuy}
        disabled={isSoldOut}
        loading={ordering}
        size="md"
        className="w-full mt-auto"
      >
        {isSoldOut ? "Sold Out" : "Buy Now"}
      </Button>
    </div>
  );
}