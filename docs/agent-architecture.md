# Distil AI Agent System — Technical Architecture Document

> **Note:** This is a design document from an earlier development phase. Some sections may not reflect the current implementation. See [ARCHITECTURE.md](ARCHITECTURE.md) for up-to-date design notes, and the source code for ground truth.

---

## 1. Orchestrator Agent

**Purpose:** Main LLM-powered agent loop. Interprets user messages, selects and executes tools, manages approval workflows.

**Prompts:**
> *"You are Distil, a personal information assistant. Your goal is to help the user stay informed without being overwhelmed. Never fabricate information; cite sources with item IDs. Never delete items or modify without explicit approval. Respect user preferences. Be concise. Tool calls formatted as ` ```tool_call\n{JSON}\n``` `."*

**Memory Management:**
- Conversation history passed as context array per turn
- PII filtered before any message is sent to LLM
- No persistent chat state in agent itself — stored in `chat_conversations` + `chat_messages` DB tables

**Evaluation Criteria:**
- Tool selection accuracy (right tool for intent)
- Approval gate correctness (no unauthorized destructive ops)
- Iteration efficiency (minimize loops to answer)
- Hallucination rate on citations

**Potential Improvements:**
- Replace naive markdown-block tool parsing with structured function calling (Gemini/OpenAI native tool use API)
- Add conversation memory summarization — current approach passes full history, which will hit token limits in long sessions
- Add planning step before tool execution (ReAct-style reasoning trace)
- Expose `MAX_ITERATIONS` (currently hardcoded at 10) as user-tunable config

---

## 2. RAG Agent (Chat)

**Purpose:** Retrieval-augmented generation for `/api/agent/chat`. Classifies user intent, retrieves relevant context, generates grounded answers with citations.

**Prompts:**

| Intent | Prompt Summary |
|--------|---------------|
| Specific query | Answer using ONLY provided context. If context insufficient, say so. Cite with `[N]` notation. |
| General/digest | Curated unread/priority items. Group by theme. Cite sources. |
| Conversational | Respond naturally. Be brief. No retrieval needed. |

**Memory Management:**
- Stateless per call — context loaded from DB at query time
- Top 10 chunks selected via position-weighted scoring from hybrid search
- PII filtered on each chunk before inclusion

**Evaluation Criteria:**
- Citation accuracy (cited items actually support the answer)
- Intent classification accuracy (3-class: specific / general / conversational)
- Answer relevance score (ground truth vs. returned content)
- Chunk recall — are the most relevant chunks being selected?

**Potential Improvements:**
- Intent classification is regex-based — migrate to embedding-based classifier or LLM call for better accuracy on ambiguous queries
- Chunk scoring ignores semantic relevance to query — add query-chunk cosine score to ranking
- No query rewriting/expansion — add HyDE (Hypothetical Document Embedding) for sparse queries
- Missing multi-turn context: user follow-ups lose conversation thread entirely

---

## 3. Triage Agent (Workflow)

**Purpose:** Fully autonomous pipeline triggered on every new item. Runs summarization → embedding → reprioritization in sequence.

**Prompts:** Delegates entirely to Summarization module (see Agent 4 below). No independent prompts.

**Memory Management:**
- Job state persisted in `job_queue` SQLite table (pending → running → completed/failed)
- Results written to `ai_summaries` and `item_embeddings` tables
- Error state captured per-job; no retry logic currently

**Evaluation Criteria:**
- Pipeline completion rate (% of items fully triaged without error)
- End-to-end latency from item insert to `processingStatus: "ready"`
- Embedding coverage (% of items with embeddings)

**Potential Improvements:**
- Add retry with exponential backoff for transient failures (no retry today)
- Parallelize summarization + embedding (currently sequential)
- Add a quality gate: if AI summary confidence is low, flag item for manual review
- Consider making triage incremental (re-run only changed fields on update)

---

## 4. Summarization Agent

**Purpose:** Content-aware summarization with map-reduce for long documents.

**Prompts:**

| Mode | Prompt Pattern |
|------|---------------|
| Short (<2k tokens) | Title + metadata + content → `overview`, `keyPoints` |
| Medium (2k–8k) | Same, plus `whyItMatters`, `notableQuotes` |
| Long (>8k) | Chunk summarize → synthesize: `"Summarize chunk N of M"` → `"Combine chunk summaries into one"` |

Output schema enforced via JSON: `{ overview, keyPoints[], whyItMatters?, notableQuotes? }`

**Memory Management:**
- Summaries cached in `ai_summaries` table; subsequent calls return cache
- `force=true` bypasses cache

**Evaluation Criteria:**
- Compression ratio (output length vs. input)
- Key point faithfulness (do key points appear in source?)
- User engagement: do users expand summaries? Do they click through to source?

**Potential Improvements:**
- Map-reduce chunk boundary is naive (token count) — use semantic paragraph splitting
- No feedback loop: user corrections to summaries not used to improve future summaries
- Add source-type-aware prompting (tweet vs. long-form article deserve different styles)

---

## 5. Prioritization Agent

**Purpose:** Scores and ranks content using hybrid heuristic + optional AI scoring. Updates `ai_priority_score` and `priority` fields.

**Prompts:**
- `prioritizePrompt(items, preferences)` — "Rank these items by likely interest given user preferences. Return `[{id, score, reason}]`."
- `preferenceAnalysisPrompt(feedbackItems)` — "Output `{topicWeights, sourceWeights, authorWeights, contentTypeWeights, recentFeedbackSummary}` based on feedback history."

**Memory Management:**
- Preference profile stored in `user_settings["agent_preferences"]` as JSON
- Loaded on-demand, no in-memory cache — parsed per scoring run
- Profile rebuilt from scratch on each `updatePreferencesFromFeedback()` call

**Evaluation Criteria:**
- NDCG (Normalized Discounted Cumulative Gain) vs. user engagement order
- Preference stability: does profile converge with consistent feedback?
- Heuristic vs. AI score agreement rate

**Potential Improvements:**
- Preference rebuild is full-scan — add incremental update (delta from last feedback)
- Heuristic decay function (exp decay over 10 days) is fixed — make it user-configurable
- AI ranking is optional and batched at top 20 items only — extend to full feed
- Add collaborative-filtering signals (what do similar users engage with?)

---

## 6. Research Agent

**Purpose:** Autonomous multi-step deep research using live web search. Async execution with polling.

**Prompts:**

| Stage | Prompt Pattern |
|-------|---------------|
| Planning | "Decompose '{query}' into 3–5 sub-questions covering background, current state, key players, implications, outlook." |
| Research | Per sub-question via `generateTextWithSearch()` (Gemini Search grounding) |
| Gap Detection | "What aspects of '{query}' remain unanswered given these findings?" |
| Synthesis | "Write a structured markdown report: Executive Summary, Key Findings, Analysis, Conclusion." |

**Memory Management:**
- Report state tracked in `research_reports` table: status, progress JSON, report markdown, sources
- Progress updates in-place (JSON column) for streaming UI
- No cross-report memory — each research task is independent

**Evaluation Criteria:**
- Citation validity (are cited URLs real and relevant?)
- Coverage completeness (do findings address all sub-questions?)
- Time to completion
- User actions post-research (did they save/share the report?)

**Potential Improvements:**
- Gap deepening is single-round — could iterate until confidence threshold met
- No deduplication of findings across sub-questions — synthesizer may repeat itself
- Parallelism capped at 3 (p-limit) but no dynamic adjustment based on API rate limits
- Add source credibility scoring (domain authority, recency of indexed content)

---

## 7. Proactive Research Agent

**Purpose:** Autonomous topic clustering + research trigger. Runs periodically to surface emerging themes without user prompt.

**Prompts:**
- `shouldResearch(topic, items)` — "Analyze {N} items about '{topic}'. Is there a significant development worth researching? Return `{should, reason, suggestedQuery}`."

**Memory Management:**
- No persistent state — re-scans last 100 items each run
- Significance score computed in-memory (itemCount × sourceCount weight)
- Triggered research stored via Research Agent (see above)

**Evaluation Criteria:**
- False positive rate (researched topics the user didn't find valuable)
- Cluster quality (are grouped items actually about the same topic?)
- User engagement with proactively triggered reports

**Potential Improvements:**
- Topic clustering is by exact string match (normalized) — switch to embedding-based clustering
- No deduplication across runs — same topic can trigger research repeatedly
- Significance threshold (≥3 items) is hardcoded — should adapt to feed volume
- No user opt-in/opt-out per topic — add suppression list

---

## 8. Insight Detection Agent

**Purpose:** Cross-source connection detection. Finds semantically related items across different sources (Slack, Gmail, manual).

**Prompts:** None — purely embedding-based cosine similarity (threshold: 0.75).

**Memory Management:**
- Embeddings stored in `item_embeddings` table per item
- Lookback window: 14 days for cross-source comparison
- Notifications written to `notifications` table

**Evaluation Criteria:**
- Precision at K (are top-K related items actually related?)
- Cross-source hit rate (how often do connections span sources?)
- User click-through on insight notifications

**Potential Improvements:**
- Similarity threshold (0.75) is fixed — needs calibration per content type (tweets vs. articles differ in density)
- No re-ranking of insights by novelty — user sees repeated connections
- Missing LLM validation step: "Are these items truly related or coincidentally similar?"
- Insight notifications not batched — can spam user with many individual alerts

---

## Cross-Cutting Observations

### What's Working Well
- **Multi-provider routing** with cost tracking is solid architecture — enables model swapping without code changes
- **Approval-gated tools** for destructive operations is the right pattern
- **Fire-and-forget async** for triage/embedding doesn't block content ingestion

### Systemic Gaps

| Gap | Impact | Fix |
|-----|--------|-----|
| No agent memory across sessions | Orchestrator re-discovers context every session | Persistent episodic memory store |
| Regex intent classification | Fragile, misclassifies ambiguous queries | Embedding-based classifier |
| No eval harness | Can't measure regression between prompt changes | Build golden set + automated scoring |
| Single-model per task in ai-config | Model IDs like `gemini-3-flash-preview` don't exist yet | Align with actual Gemini model IDs |
| No retry in job worker | Silent failures leave items un-summarized | Exponential backoff + dead-letter queue |
| Preference rebuild from scratch | Slow and wasteful as feedback grows | Incremental preference updates |

### Making Agents More Autonomous

1. **Add planning before acting** — have Orchestrator emit a plan before tool calls (ReAct pattern), reduces wasted iterations
2. **Give Research Agent memory** — track what's been researched to avoid repeating topics
3. **Self-evaluation loop** — after Triage, have a quality agent score the summary and retry if confidence < threshold
4. **Event-driven triggers** — replace polling job worker with event hooks (on item insert → trigger triage immediately)
5. **Preference-aware routing** — let AI Router consider user preferences when selecting models (e.g., faster/cheaper model for low-priority content)
