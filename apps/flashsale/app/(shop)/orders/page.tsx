"use client";

import { useOrders } from "@/hooks/useOrders";
import { Order } from "@/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

const STATUS_STYLES = {
  CONFIRMED: "text-amber-400 border-amber-400",
  PENDING: "text-blue-400 border-blue-400",
  CANCELLED: "text-red-400 border-red-400",
  FULFILLED: "text-green-400 border-green-400",
};

function OrderCard({ order }: { order: Order }) {
  const total = order.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  return (
    <div className="bg-[#111] border border-[#2a2a2a] p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs font-mono text-[#6b6b6b]">Order ID</p>
          <p className="font-mono text-sm text-white mt-0.5">
            #{order.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <span className={cn(
          "text-xs font-mono uppercase tracking-widest border px-2 py-1",
          STATUS_STYLES[order.status]
        )}>
          {order.status}
        </span>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between items-center">
            <span className="text-sm font-mono text-[#6b6b6b]">
              {item.productName} × {item.quantity}
            </span>
            <span className="text-sm font-mono text-white">
              ${(item.unitPrice * item.quantity).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="border-t border-[#2a2a2a] pt-4 flex justify-between">
        <span className="text-xs font-mono text-[#6b6b6b] uppercase tracking-widest">
          Total
        </span>
        <span className="font-mono font-bold text-amber-400">
          ${total.toFixed(2)}
        </span>
      </div>

      <p className="text-xs font-mono text-[#444] mt-3">
        {new Date(order.createdAt).toLocaleString()}
      </p>
    </div>
  );
}

export default function OrdersPage() {
  const { data: orders, isLoading, error } = useOrders();

  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <div className="border-b border-[#2a2a2a] px-6 py-4 flex items-center justify-between">
        <h1 className="font-display font-800 text-2xl uppercase tracking-widest text-white">
          My Orders
        </h1>
        <Link
          href="/products"
          className="text-xs font-mono uppercase tracking-widest text-[#6b6b6b] hover:text-amber-400 transition-colors"
        >
          ← Back to Sale
        </Link>
      </div>

      <div className="px-6 py-8 max-w-2xl">
        {isLoading && (
          <div className="flex flex-col gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#111] border border-[#2a2a2a] h-40 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <p className="text-red-400 font-mono text-sm">
            Failed to load orders.
          </p>
        )}

        {orders?.length === 0 && (
          <div className="text-center py-20">
            <p className="text-[#6b6b6b] font-mono text-sm">No orders yet.</p>
            <Link
              href="/products"
              className="text-amber-400 font-mono text-sm mt-2 inline-block hover:text-amber-300"
            >
              Browse flash sales →
            </Link>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {orders?.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </div>
    </main>
  );
}