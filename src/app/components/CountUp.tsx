import React, { useEffect, useRef } from "react";
import { useMotionValue, animate } from "motion/react";

export function CountUp({ end, decimals = 1, duration = 2, suffix = "" }: { end: number; decimals?: number; duration?: number; suffix?: string }) {
  const count = useMotionValue(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(count, end, {
      duration,
      ease: [0.33, 1, 0.68, 1],
      onUpdate: (latest) => {
        if (ref.current) {
          ref.current.textContent = latest.toFixed(decimals) + suffix;
        }
      }
    });
    return controls.stop;
  }, [end, decimals, duration, suffix, count]);

  return <span ref={ref}>0{suffix}</span>;
}
