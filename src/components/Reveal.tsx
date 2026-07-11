"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 元素进入视口时轻柔淡入。用 IntersectionObserver,不监听 scroll。
 * index 用于列表的错峰出现。
 */
export function Reveal({
  children,
  index = 0,
  as: Tag = "div",
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  as?: "div" | "li" | "section" | "article";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${shown ? "reveal-in" : ""} ${className}`}
      style={{ ["--reveal-index" as string]: index }}
    >
      {children}
    </Tag>
  );
}
