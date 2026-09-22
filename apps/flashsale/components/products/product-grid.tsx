"use client";

import { useProducts } from "@/hooks/useProducts";
import { ProductCard } from "./product-card";

export function ProductGrid() {
  const { data: products, isLoading, error } = useProducts();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="bg-[#111] border border-[#2a2a2a] h-64 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 font-mono text-sm">
        Failed to load products. Please try again.
      </div>
    );
  }

  if (!products?.length) {
    return (
      <div className="text-[#6b6b6b] font-mono text-sm">
        No products available.
      </div>
    );
  }

  // Flash sale products first
  const sorted = [...products].sort((a, b) => {
    if (a.flashSaleEndsAt && !b.flashSaleEndsAt) return -1;
    if (!a.flashSaleEndsAt && b.flashSaleEndsAt) return 1;
    return 0;
  });

  return (
    <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "1rem",
  }}>
      {sorted.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}