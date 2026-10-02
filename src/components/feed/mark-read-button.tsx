"use client";

import { useState } from "react";
import { useItemMutation, useItemOverrides } from "@/lib/client-cache/item-mutations";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MarkReadButtonProps {
  itemId: string;
  isRead: boolean;
  onRead?: (read: boolean) => void;
  showLabel?: boolean;
}

export function MarkReadButton({ itemId, isRead, onRead, showLabel = false }: MarkReadButtonProps) {
  const { updateItem } = useItemMutation();
  const overrides = useItemOverrides(itemId);
  const [localRead, setRead] = useState<boolean>();
  const read = localRead ?? overrides?.isRead ?? isRead;
  const [loading, setLoading] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (read || loading) return;

    setRead(true);
    onRead?.(true);
    setLoading(true);
    try {
      await updateItem(itemId, { isRead: true });
      setRead(undefined);
    } catch {
      setRead(false);
      onRead?.(false);
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
        aria-label="Marked as read"
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
      className={
        showLabel
          ? "gap-1.5"
          : "h-11 w-11 md:h-8 md:w-8 shrink-0 text-muted-foreground hover:text-foreground"
      }
      onClick={handleClick}
      disabled={loading}
      title="Mark as read"
      aria-label="Mark as read"
    >
      <Check className="h-3.5 w-3.5" />
      {showLabel && "Mark as read"}
    </Button>
  );
}
