import { Mail, Hash, Globe, Link as LinkIcon } from "lucide-react";
import type { SourceType } from "@/lib/types";

export const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  "browser-extension": Globe,
  manual: LinkIcon,
};

export const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  "browser-extension": "Extension",
  manual: "Manual",
};

export const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500",
  slack: "text-purple-500",
  "browser-extension": "text-orange-500",
  manual: "text-muted-foreground",
};

export const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-200",
  medium: "bg-amber-500/10 text-amber-600 border-amber-200",
  low: "bg-green-500/10 text-green-600 border-green-200",
};
