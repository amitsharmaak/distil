export const TOPIC_DOMAINS: Record<string, string[]> = {
  Technology: [
    "ai",
    "machine-learning",
    "developer-tools",
    "cybersecurity",
    "cloud",
    "open-source",
    "hardware",
    "mobile",
    "web3",
    "data",
  ],
  Product: ["product-management", "ux-design", "no-code", "saas", "growth"],
  Business: [
    "startups",
    "venture-capital",
    "marketing",
    "sales",
    "finance",
    "leadership",
    "operations",
    "strategy",
  ],
  Science: ["research", "climate", "biotech", "health", "space", "energy", "physics"],
  Society: ["politics", "policy", "regulation", "education", "culture", "media", "privacy"],
  Personal: ["productivity", "career", "learning", "writing", "mental-health"],
  Industry: ["fintech", "healthcare", "e-commerce", "gaming", "real-estate"],
};

export const CANONICAL_TOPICS: string[] = Object.values(TOPIC_DOMAINS).flat();
