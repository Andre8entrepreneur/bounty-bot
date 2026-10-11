"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";

const GLOW_SIZE = 320;

/** A card with a soft accent glow that follows the pointer. Mouse and trackpad
 * only (gated in CSS); the glow moves by transform so nothing re-renders. */
export function Spotlight({
  as: Tag = "div",
  className = "",
  children,
}: {
  as?: "div" | "li";
  className?: string;
  children: ReactNode;
}) {
  const glow = useRef<HTMLSpanElement>(null);

  function follow(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== "mouse" || !glow.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    glow.current.style.transform = `translate(${e.clientX - box.left - GLOW_SIZE / 2}px, ${e.clientY - box.top - GLOW_SIZE / 2}px)`;
  }

  return (
    <Tag className={`spotlight relative isolate overflow-hidden ${className}`} onPointerMove={follow}>
      <span
        ref={glow}
        aria-hidden
        className="spotlight-glow pointer-events-none absolute left-0 top-0 -z-10 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_30%,transparent),transparent)]"
        style={{ width: GLOW_SIZE, height: GLOW_SIZE }}
      />
      {children}
    </Tag>
  );
}
