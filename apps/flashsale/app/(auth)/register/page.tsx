"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRegister } from "@/hooks/useAuth";
import Link from "next/link";

export default function RegisterPage() {
  const register = useRegister();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    try {
      await register.mutateAsync(form);
    } catch (err: any) {
      setError(
        err.response?.data?.message ?? "Registration failed"
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="font-display font-800 text-3xl uppercase tracking-widest text-white">
            StockRush
          </h1>
          <p className="text-xs font-mono text-[#6b6b6b] mt-1">
            Create your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Name"
            type="text"
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
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
            placeholder="Min 8 characters"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />

          {error && (
            <p className="text-xs text-red-400 font-mono">{error}</p>
          )}

          <Button
            type="submit"
            size="lg"
            loading={register.isPending}
            className="w-full mt-2"
          >
            Create Account
          </Button>
        </form>

        <p className="text-xs font-mono text-[#6b6b6b] mt-6 text-center">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-amber-400 hover:text-amber-300 transition-colors"
          >
            Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}