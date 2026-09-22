import { ProductGrid } from "@/components/products/product-grid";

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <div className="border-b border-[#2a2a2a] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-display font-800 text-2xl uppercase tracking-widest text-white">
            StockRush
          </h1>
          <p className="text-xs font-mono text-[#6b6b6b] mt-0.5">
            Limited time. Limited stock. Move fast.
          </p>
        </div>
        <nav className="flex items-center gap-6">
          <a
            href="/orders"
            className="text-xs font-mono uppercase tracking-widest text-[#6b6b6b] hover:text-white transition-colors"
          >
            My Orders
          </a>
          <a
            href="/login"
            className="text-xs font-mono uppercase tracking-widest text-[#6b6b6b] hover:text-amber-400 transition-colors"
          >
            Sign Out
          </a>
        </nav>
      </div>

      {/* Flash sale banner */}
      <div className="bg-amber-400 px-6 py-2 flex items-center gap-3">
        <span className="text-xs font-mono font-bold text-black uppercase tracking-widest animate-pulse">
          ⚡ Flash Sale Live
        </span>
        <span className="text-xs font-mono text-black opacity-70">
          Prices drop. Stock drains. First come, first served.
        </span>
      </div>

      {/* Products */}
      <div className="px-6 py-8">
        <ProductGrid />
      </div>
    </main>
  );
}