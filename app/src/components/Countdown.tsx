"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0:00:00";
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Countdown({ target, label }: { target: Date; label: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = target.getTime() - now;
  const passed = remaining <= 0;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs uppercase tracking-wider text-zinc-500">
        {passed ? `${label} passed` : label}
      </span>
      <span
        className={`font-mono text-3xl font-semibold tabular-nums sm:text-4xl ${
          passed ? "text-zinc-600" : "text-accent"
        }`}
      >
        {formatRemaining(remaining)}
      </span>
    </div>
  );
}
