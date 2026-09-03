"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";

interface MarkReadButtonProps {
  itemId: string;
  isRead: boolean;
  onRead?: () => void;
  showLabel?: boolean;
}

export function MarkReadButton({
  itemId,
  isRead,
  onRead,
  showLabel = false,
}: MarkReadButtonProps) {
  const router = useRouter();
  const [read, setRead] = useState(isRead);
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (read || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`${config.apiBaseUrl}/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
      if (res.ok) {
        setRead(true);
        onRead?.();
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (read) {
    if (!showLabel) return null;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground pointer-events-none"
        disabled
      >
        <Check className="h-3.5 w-3.5" />
        Read
      </Button>
    );
  }

  return (
    <Button
      variant={showLabel ? "outline" : "ghost"}
      size={showLabel ? "sm" : "icon"}
      className={showLabel ? "gap-1.5" : "h-11 w-11 md:h-8 md:w-8 shrink-0 text-muted-foreground hover:text-foreground"}
      onClick={handleClick}
      disabled={loading}
      title="Mark as read"
    >
      <Check className="h-3.5 w-3.5" />
      {showLabel && "Mark as read"}
    </Button>
  );
}
