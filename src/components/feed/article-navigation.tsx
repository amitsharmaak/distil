"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface ArticleNavigationProps {
  prevId: string | null;
  nextId: string | null;
}

export function ArticleNavigation({ prevId, nextId }: ArticleNavigationProps) {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowLeft" && prevId) {
        router.push(`/feed/${prevId}`);
      } else if (e.key === "ArrowRight" && nextId) {
        router.push(`/feed/${nextId}`);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevId, nextId, router]);

  return null;
}
