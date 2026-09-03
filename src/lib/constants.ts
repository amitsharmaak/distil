import { Mail, Hash, Globe, Link as LinkIcon, BookOpen } from "lucide-react";
import type { SourceType } from "@/lib/types";

export const sourceIcons: Record<SourceType, React.ElementType> = {
  gmail: Mail,
  slack: Hash,
  "browser-extension": Globe,
  manual: LinkIcon,
  publisher: BookOpen,
};

export const sourceLabels: Record<SourceType, string> = {
  gmail: "Gmail",
  slack: "Slack",
  "browser-extension": "Extension",
  manual: "Manual",
  publisher: "Publisher",
};

export const sourceColors: Record<SourceType, string> = {
  gmail: "text-red-500",
  slack: "text-purple-500",
  "browser-extension": "text-orange-500",
  manual: "text-muted-foreground",
  publisher: "text-blue-500",
};

export const priorityColors: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-600/30",
  medium: "bg-amber-500/10 text-amber-600 border-amber-600/30",
  low: "bg-green-500/10 text-green-600 border-green-600/30",
};

export const TOPIC_DOMAINS: Record<string, string[]> = {
  Technology: ["ai", "machine-learning", "developer-tools", "cybersecurity", "cloud", "open-source", "hardware", "mobile", "web3", "data"],
  Product: ["product-management", "ux-design", "no-code", "saas", "growth"],
  Business: ["startups", "venture-capital", "marketing", "sales", "finance", "leadership", "operations", "strategy"],
  Science: ["research", "climate", "biotech", "health", "space", "energy", "physics"],
  Society: ["politics", "policy", "regulation", "education", "culture", "media", "privacy"],
  Personal: ["productivity", "career", "learning", "writing", "mental-health"],
  Industry: ["fintech", "healthcare", "e-commerce", "gaming", "real-estate"],
};

export const CANONICAL_TOPICS: string[] = Object.values(TOPIC_DOMAINS).flat();
