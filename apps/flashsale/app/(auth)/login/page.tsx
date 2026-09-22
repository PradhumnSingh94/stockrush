"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLogin } from "@/hooks/useAuth";
import Link from "next/link";

export default function LoginPage() {
  const login = useLogin();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await login.mutateAsync(form);
    } catch (err: any) {
      setError(
        err.response?.data?.message ?? "Invalid credentials"
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10">
          <h1 className="font-display font-800 text-3xl uppercase tracking-widest text-white">
            StockRush
          </h1>
          <p className="text-xs font-mono text-[#6b6b6b] mt-1">
            Sign in to access flash sales
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          {error && (
            <p className="text-xs text-red-400 font-mono">{error}</p>
          )}

          <Button
            type="submit"
            size="lg"
            loading={login.isPending}
            className="w-full mt-2"
          >
            Sign In
          </Button>
        </form>

        <p className="text-xs font-mono text-[#6b6b6b] mt-6 text-center">
          No account?{" "}
          <Link
            href="/register"
            className="text-amber-400 hover:text-amber-300 transition-colors"
          >
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}