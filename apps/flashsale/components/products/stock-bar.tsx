import { cn } from "@/lib/utils";

interface StockBarProps {
  stock: number;
  maxStock?: number;
}

export function StockBar({ stock, maxStock = 100 }: StockBarProps) {
  const percentage = Math.min((stock / maxStock) * 100, 100);

  const color =
    percentage > 50
      ? "bg-amber-400"
      : percentage > 20
      ? "bg-orange-500"
      : "bg-red-500";

  const label =
    stock === 0
      ? "SOLD OUT"
      : stock <= 5
      ? `ONLY ${stock} LEFT`
      : `${stock} IN STOCK`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className={cn(
          "text-xs font-mono tracking-widest",
          stock === 0 ? "text-red-500" : stock <= 5 ? "text-orange-400" : "text-[#6b6b6b]"
        )}>
          {label}
        </span>
      </div>
      <div className="h-1 bg-[#2a2a2a] w-full">
        <div
          className={cn("h-full transition-all duration-500", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}