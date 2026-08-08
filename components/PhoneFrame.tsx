"use client";

import type { ReactNode } from "react";
import type { Screen } from "@/lib/useDemo";

const TABS: { id: Screen; label: string; icon: string }[] = [
  { id: "home", label: "Shield", icon: "🛡" },
  { id: "call", label: "Calls", icon: "☎" },
  { id: "deletion", label: "Privacy", icon: "🧹" },
  { id: "recovery", label: "Recover", icon: "💸" },
];

export function PhoneFrame({
  screen,
  onNavigate,
  children,
}: {
  screen: Screen;
  onNavigate: (s: Screen) => void;
  children: ReactNode;
}) {
  // The call flow spans three screens; keep the Calls tab lit across all of them.
  const activeTab: Screen = ["call", "verdict", "letter"].includes(screen) ? "call" : screen;

  return (
    <div className="relative mx-auto h-[812px] w-[390px] shrink-0 rounded-[3rem] border-[10px] border-zinc-800 bg-black shadow-2xl shadow-black/60">
      {/* Notch */}
      <div className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-zinc-800" />

      <div className="flex h-full flex-col overflow-hidden rounded-[2.3rem] bg-zinc-950">
        {/* Status bar */}
        <div className="flex items-center justify-between px-7 pb-1 pt-3 text-[11px] font-medium text-zinc-400">
          <span>9:41</span>
          <span className="tracking-widest">••••• ⏶ ▮</span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">{children}</div>

        {/* Tab bar */}
        <nav className="flex shrink-0 items-center justify-around border-t border-zinc-800 bg-zinc-900/80 px-2 pb-5 pt-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 transition ${
                activeTab === tab.id ? "text-sky-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
