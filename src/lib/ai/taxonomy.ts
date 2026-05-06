import { CANONICAL_TOPICS, TOPIC_DOMAINS } from "@/lib/constants";

export { CANONICAL_TOPICS, TOPIC_DOMAINS };

// Maps known aliases / overly-specific tags → canonical equivalents.
const ALIAS_MAP: Record<string, string> = {
  // AI / ML
  "artificial intelligence": "ai",
  "large language model": "ai",
  "large language models": "ai",
  llm: "ai",
  llms: "ai",
  "generative ai": "ai",
  "gen ai": "ai",
  gpt: "ai",
  "gpt-4": "ai",
  "gpt-3": "ai",
  chatgpt: "ai",
  openai: "ai",
  anthropic: "ai",
  gemini: "ai",
  claude: "ai",
  "deep learning": "machine-learning",
  "neural network": "machine-learning",
  "neural networks": "machine-learning",
  "natural language processing": "machine-learning",
  nlp: "machine-learning",
  "computer vision": "machine-learning",
  // Technology
  javascript: "developer-tools",
  typescript: "developer-tools",
  python: "developer-tools",
  rust: "developer-tools",
  react: "developer-tools",
  nextjs: "developer-tools",
  "next.js": "developer-tools",
  programming: "developer-tools",
  software: "developer-tools",
  engineering: "developer-tools",
  devops: "cloud",
  kubernetes: "cloud",
  aws: "cloud",
  gcp: "cloud",
  azure: "cloud",
  blockchain: "web3",
  crypto: "web3",
  bitcoin: "web3",
  ethereum: "web3",
  nft: "web3",
  defi: "web3",
  database: "data",
  databases: "data",
  analytics: "data",
  "data science": "data",
  "big data": "data",
  // Business
  "startup": "startups",
  "vc": "venture-capital",
  "fundraising": "venture-capital",
  "seed funding": "venture-capital",
  "series a": "venture-capital",
  "series b": "venture-capital",
  investing: "venture-capital",
  investment: "venture-capital",
  "content marketing": "marketing",
  seo: "marketing",
  advertising: "marketing",
  branding: "marketing",
  "b2b": "sales",
  "go-to-market": "strategy",
  gtm: "strategy",
  "business strategy": "strategy",
  management: "leadership",
  ceo: "leadership",
  executive: "leadership",
  // Science & Health
  "climate change": "climate",
  "global warming": "climate",
  sustainability: "climate",
  "clean energy": "energy",
  "renewable energy": "energy",
  biology: "biotech",
  genetics: "biotech",
  medicine: "health",
  "mental health": "mental-health",
  wellness: "health",
  fitness: "health",
  // Society
  law: "policy",
  legislation: "policy",
  government: "politics",
  democracy: "politics",
  // Industry
  "financial technology": "fintech",
  banking: "fintech",
  payments: "fintech",
  "video games": "gaming",
  "game development": "gaming",
  // Cybersecurity
  security: "cybersecurity",
  "information security": "cybersecurity",
  "appsec": "cybersecurity",
  infosec: "cybersecurity",
  "supply chain attack": "cybersecurity",
  vulnerability: "cybersecurity",
  // Developer tools & cloud
  automation: "developer-tools",
  "workflow automation": "developer-tools",
  devtools: "developer-tools",
  "ci/cd": "developer-tools",
  cicd: "developer-tools",
  sdk: "developer-tools",
  api: "developer-tools",
  cli: "developer-tools",
  mcp: "developer-tools",
  "model context protocol": "developer-tools",
  bash: "developer-tools",
  "software development": "developer-tools",
  "software engineering": "developer-tools",
  coding: "developer-tools",
  golang: "developer-tools",
  // SaaS / Business (additional)
  "open beta": "saas",
  "subscription model": "saas",
  enterprise: "saas",
  "venture capital": "venture-capital",
  "startup careers": "career",
  hiring: "career",
  "job market": "career",
  "personal development": "career",
  "self improvement": "career",
  "time management": "productivity",
  "work optimization": "productivity",
  "ai productivity": "productivity",
  "digital marketing": "marketing",
  "google ads": "marketing",
  "outbound sales": "sales",
  "email marketing": "sales",
  "organization design": "leadership",
  "company culture": "culture",
  "employee engagement": "culture",
  "team collaboration": "culture",
  // Privacy
  "data privacy": "privacy",
  "user privacy": "privacy",
  "data breach": "privacy",
  "knowledge management": "learning",
  "personal knowledge management": "learning",
  notetaking: "learning",
  rag: "ai",
  "prompt engineering": "ai",
  "agent orchestration": "ai",
  "multi-agent systems": "ai",
  "ai agents": "ai",
  "ai automation": "ai",
  "multimodal ai": "ai",
  "text-to-video": "ai",
  "voice ai": "ai",
  "conversational model": "ai",
  "foundation models": "ai",
  "ai models": "ai",
  "llm applications": "ai",
  "ai engineering": "ai",
  "autonomous agents": "ai",
  "autonomous coding": "ai",
  "ai coding": "ai",
  "ai agent": "ai",
  "ai tools": "ai",
  "ai product management": "ai",
  "ai in tech": "ai",
  "ai adoption": "ai",
  "agentic ai": "ai",
  agents: "ai",
  subagents: "ai",
  figma: "ux-design",
  "design tools": "ux-design",
  "design systems": "ux-design",
  "ui design": "ux-design",
  "web design": "ux-design",
  "ui ux": "ux-design",
  uiux: "ux-design",
  "user experience": "ux-design",
  "frontend design": "ux-design",
  "user interface": "ux-design",
};

export function normalizeTag(raw: string): string {
  const lower = raw.toLowerCase().trim();

  // Direct canonical match
  if (CANONICAL_TOPICS.includes(lower)) return lower;

  // Normalize spaces to hyphens and check again (e.g. "open source" → "open-source")
  const hyphenated = lower.replace(/\s+/g, "-");
  if (CANONICAL_TOPICS.includes(hyphenated)) return hyphenated;

  // Alias lookup (try both original and hyphenated form)
  const alias = ALIAS_MAP[lower] ?? ALIAS_MAP[hyphenated];
  if (alias) return alias;

  // Partial alias match (e.g. "openai gpt-4" → "ai")
  for (const [key, canonical] of Object.entries(ALIAS_MAP)) {
    if (lower.includes(key)) return canonical;
  }

  // Already a canonical base word inside a longer tag (e.g. "ai tools" → "ai")
  for (const canonical of CANONICAL_TOPICS) {
    if (lower.startsWith(canonical + " ") || lower.endsWith(" " + canonical)) {
      return canonical;
    }
    // Also check hyphenated form embedded in tag
    const canonicalSpaced = canonical.replace(/-/g, " ");
    if (lower === canonicalSpaced) return canonical;
  }

  return lower;
}

export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of raw) {
    const normalized = normalizeTag(tag);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export function buildTaxonomyPromptSection(): string {
  return Object.entries(TOPIC_DOMAINS)
    .map(([domain, tags]) => `  ${domain}: ${tags.join(", ")}`)
    .join("\n");
}
