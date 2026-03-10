"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface ArticleNavigationProps {
  prevId: string | null;
  nextId: string | null;
  filter?: string;
}

export function ArticleNavigation({ prevId, nextId, filter }: ArticleNavigationProps) {
  const router = useRouter();

  useEffect(() => {
    const suffix = filter ? `?filter=${filter}` : "";

    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft" && prevId) {
        router.push(`/feed/${prevId}${suffix}`);
      } else if (e.key === "ArrowRight" && nextId) {
        router.push(`/feed/${nextId}${suffix}`);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevId, nextId, router]);

  return null;
}
