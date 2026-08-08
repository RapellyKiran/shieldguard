"use client";

import type { ReactNode } from "react";

/** Shared primitives. Deliberately small — this is a demo, not a design system. */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
}) {
  const tones = {
    neutral: "bg-zinc-700/60 text-zinc-200 ring-zinc-500/40",
    good: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/40",
    warn: "bg-amber-500/15 text-amber-300 ring-amber-400/40",
    bad: "bg-rose-500/15 text-rose-300 ring-rose-400/40",
    info: "bg-sky-500/15 text-sky-300 ring-sky-400/40",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "success";
  disabled?: boolean;
  full?: boolean;
}) {
  const variants = {
    primary: "bg-sky-500 hover:bg-sky-400 text-white",
    ghost: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 ring-1 ring-inset ring-zinc-700",
    danger: "bg-rose-600 hover:bg-rose-500 text-white",
    success: "bg-emerald-600 hover:bg-emerald-500 text-white",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${full ? "w-full" : ""}`}
    >
      {children}
    </button>
  );
}

export function Card({
  title,
  action,
  children,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold text-zinc-200">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-200">{value}</span>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-sky-300">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
      {label}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-wrap">{message}</p>
        {onDismiss && (
          <button onClick={onDismiss} className="shrink-0 text-rose-300/70 hover:text-rose-200">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function tierTone(tier: string): "neutral" | "good" | "warn" | "bad" | "info" {
  if (tier === "confirmed") return "bad";
  if (tier === "corroborated") return "warn";
  return "neutral";
}

export function verdictTone(label: string): "good" | "warn" | "bad" {
  if (label === "scam") return "bad";
  if (label === "suspicious") return "warn";
  return "good";
}
