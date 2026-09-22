import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-xs uppercase tracking-widest text-[#6b6b6b] font-mono">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "bg-[#111] border border-[#2a2a2a] text-white px-4 py-3",
            "font-mono text-sm placeholder:text-[#444]",
            "focus:outline-none focus:border-amber-400 transition-colors",
            error && "border-red-500",
            className
          )}
          {...props}
        />
        {error && (
          <span className="text-xs text-red-400 font-mono">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";