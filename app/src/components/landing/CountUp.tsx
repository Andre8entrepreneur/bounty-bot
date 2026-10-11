"use client";

import { useEffect, useRef } from "react";

const DURATION_MS = 1100;

/** A number that counts up the first time it scrolls into view. The real value
 * is server-rendered, so without JS, with reduced motion, or when it's already
 * on screen at load, it simply shows the number. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    const format = (n: number) => n.toLocaleString("en-US");
    el.textContent = format(0);
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / DURATION_MS);
          el.textContent = format(Math.round(value * (1 - Math.pow(1 - progress, 4))));
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = format(value);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString("en-US")}
    </span>
  );
}
