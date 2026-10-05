/**
 * Item detail page — /feed/[id]
 *
 * Unified reader-mode experience. Every content type (article, tweet, video,
 * podcast) gets the same structural layout: header →
 * content body → sticky action bar. Only the content body varies by type.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Headphones } from "lucide-react";
import { ReaderAreaBadge } from "@/components/feed/reader-area-badge";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ReaderExperience, ReaderDisplaySettings } from "@/components/feed/reader-experience";
import { displayTitle, publisherLabel, readTimeLabel, cardExcerpt } from "@/lib/display";
import { formatDate } from "@/lib/format";
import { withTenantRepositories } from "@/lib/database";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { detectStrategy } from "@/lib/content-strategies";
import { VideoDisclosure } from "@/components/feed/video-embed";
import { ArticleNavigation } from "@/components/feed/article-navigation";
import { LazyArticleExtract } from "@/components/feed/lazy-article-extract";
import { AISummary } from "@/components/feed/ai-summary";
import { DetailActionBar } from "@/components/feed/detail-action-bar";
import { ReaderKnowledgeControls } from "@/components/phase2/reader-knowledge-controls";
import { ReaderAnnotations } from "@/components/phase2/reader-annotations";
import { readPhase2FeatureFlags } from "@/lib/phase2/feature-flags";
import { sanitizeArticleHtml } from "@/lib/content-sanitizer";
import { isLongFormXPost } from "@/lib/utils";
import { hasTranscript, linkedYouTubeId } from "@/lib/phase2/video-transcript";
import { VideoTranscriptButton } from "@/components/feed/video-transcript-button";

/**
 * X's video CDN (video.twimg.com) answers 403 to any request that carries a
 * third-party Referer, so the native player for captured X videos never loads
 * under the site-wide `strict-origin-when-cross-origin` header. `referrerpolicy`
 * is not an attribute `<video>` supports; the document policy is the only lever,
 * and the reader page has no outbound request that needs a Referer.
 */
export const metadata: Metadata = { referrer: "no-referrer" };

/** When the server read finished; the client cache dates its seeded reader data from this. */
function currentEpochMilliseconds(): number {
  return Date.now();
}

/** Tokenise tweet text into clickable @mentions, #hashtags, and URLs. */
function renderTweetText(text: string): React.ReactNode[] {
  const tokenPattern = /(https?:\/\/[^\s]+)|(@\w+)|(#\w+)/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(tokenPattern)) {
    const start = match.index!;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const token = match[0];
    const linkClass = "text-primary hover:underline";

    if (token.startsWith("http")) {
      const display = token.length > 40 ? token.slice(0, 40) + "\u2026" : token;
      nodes.push(
        <a
          key={start}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} break-all`}
        >
          {display}
        </a>
      );
    } else if (token.startsWith("@")) {
      nodes.push(
        <a
          key={start}
          href={`https://x.com/${token.slice(1)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {token}
        </a>
      );
    } else {
      nodes.push(
        <a
          key={start}
          href={`https://x.com/hashtag/${token.slice(1)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {token}
        </a>
      );
    }
    lastIndex = start + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/* ── Page ── */

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { id } = await params;
  const { filter } = await searchParams;
  const knowledgeUiEnabled = readPhase2FeatureFlags().knowledgeUi;
  const requestHeaders = await headers();
  const auth = await resolveRequestAuthContext(
    new Request("http://distil.local/feed/reader", { headers: requestHeaders })
  );
  // One tenant transaction for the whole read: the item, its summaries,
  // feedback, reader knowledge, and the keyset neighbours the controls need.
  const loaded = await withTenantRepositories(auth, async (repositories) => {
    const item = await repositories.items.findById(id);
    if (!item) return null;
    const [aiSummaries, existingFeedback, neighbours, note, annotations] = await Promise.all([
      repositories.summaries.findAll(item.id),
      repositories.feedback.findForItem(item.id),
      repositories.items.findNeighbours(item.id, { unreadOnly: filter !== "all" }),
      knowledgeUiEnabled ? repositories.itemNotes.find(item.id) : Promise.resolve(undefined),
      knowledgeUiEnabled ? repositories.annotations.listForItem(item.id) : Promise.resolve([]),
    ]);
    return { item, aiSummaries, existingFeedback, neighbours, note, annotations };
  });

  if (!loaded) {
    return (
      <PageContainer size="reading">
        <PageHeader title="Item not found" />
        <EmptyState
          title="This story is unavailable"
          action={
            <Link
              href="/feed"
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Back to feed
            </Link>
          }
        />
      </PageContainer>
    );
  }

  const { item, aiSummaries, existingFeedback, neighbours, note, annotations } = loaded;
  const readerDataUpdatedAt = currentEpochMilliseconds();
  const baseStrategy = detectStrategy(item.url);
  // X Articles have substantial fullContent extracted from fxtwitter — treat as article.
  const isXArticle =
    baseStrategy.detail.showTweetRenderer && isLongFormXPost(item.url, item.fullContent);
  const strategy = isXArticle
    ? {
        ...baseStrategy,
        detail: { ...baseStrategy.detail, showTweetRenderer: false, showAISummary: true },
      }
    : baseStrategy;
  const title = displayTitle(item);
  const readTime = readTimeLabel(item);
  const description =
    item.contentType === "video" && !cardExcerpt({ ...item, aiSummary: undefined }, 10000)
      ? ""
      : item.summary;
  const twitterVideo = (
    item.detectedMedia as Array<{ type: string; platform?: string; embedUrl?: string }> | undefined
  )?.find((media) => media.type === "video" && media.platform === "twitter");
  const fullContentIsHtml =
    !!item.fullContent && /<[a-z][\s\S]*>/i.test(item.fullContent.slice(0, 500));
  const sanitizedFullContent = item.fullContent ? sanitizeArticleHtml(item.fullContent) : undefined;
  const formattedDate = formatDate(item.createdAt, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const header = (
    <>
      <PageHeader
        display
        title={title}
        className="mb-5"
        eyebrow={
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2">
              <span>{publisherLabel(item)}</span>
              <span aria-hidden="true">·</span>
              <ReaderAreaBadge itemId={item.id} area={item.area} aiArea={item.aiArea} />
            </div>
            <ReaderDisplaySettings />
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.author && (
              <>
                <span>{item.author}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <time dateTime={item.createdAt}>{formattedDate}</time>
            {readTime && (
              <>
                <span aria-hidden="true">·</span>
                <span>{readTime}</span>
              </>
            )}
          </div>
        }
      />
    </>
  );
  const content = (
    <section className="min-h-[30vh]">
      {(strategy.detail.showEmbedPlayer || twitterVideo?.embedUrl) && (
        <VideoDisclosure
          url={item.url}
          contentType={item.contentType}
          duration={item.duration}
          nativeVideoUrl={twitterVideo?.embedUrl}
        />
      )}
      {linkedYouTubeId(item) && !hasTranscript(item) && <VideoTranscriptButton itemId={item.id} />}
      {strategy.detail.showTweetRenderer && (item.contentType !== "video" || description) ? (
        <div className="distil-reader space-y-4">
          {item.summary.split(/\n\n+/).map((para, i) => (
            <p key={i} className="whitespace-pre-line">
              {renderTweetText(para)}
            </p>
          ))}
        </div>
      ) : strategy.detail.showAISummary || item.contentType === "video" ? (
        <LazyArticleExtract
          itemId={item.id}
          url={item.url}
          hasFullContent={!!item.fullContent}
          contentExtractedAt={item.contentExtractedAt}
        >
          <AISummary
            itemId={item.id}
            ogSummary={description}
            fullContent={sanitizedFullContent}
            fullContentIsHtml={fullContentIsHtml}
            initialBriefSummary={aiSummaries.brief ?? null}
            initialDetailedSummary={aiSummaries.detailed ?? null}
            emptyOriginalMessage={
              item.contentType === "video"
                ? "Watch the video, or generate a summary to explore its key ideas."
                : undefined
            }
          />
        </LazyArticleExtract>
      ) : item.contentType === "podcast" && !strategy.detail.showEmbedPlayer ? (
        <EmptyState
          title="Listen to this episode"
          description={item.duration}
          icon={<Headphones className="h-7 w-7" />}
          action={
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-primary hover:underline"
            >
              Open podcast
            </a>
          }
        />
      ) : null}
    </section>
  );

  return (
    <PageContainer size="wide">
      <ReaderExperience key={item.id}>
        <ArticleNavigation
          prevId={neighbours.previousId}
          nextId={neighbours.nextId}
          filter={filter}
        />
        {knowledgeUiEnabled ? (
          <ReaderAnnotations
            itemId={item.id}
            header={header}
            initialAnnotations={annotations}
            initialUpdatedAt={readerDataUpdatedAt}
            notes={
              <ReaderKnowledgeControls
                itemId={item.id}
                initial={{
                  note: note ? { body: note.body } : null,
                  updatedAt: readerDataUpdatedAt,
                }}
              />
            }
          >
            {content}
          </ReaderAnnotations>
        ) : (
          <div className="distil-reader-column mx-auto">
            {header}
            {content}
          </div>
        )}
        <DetailActionBar
          itemId={item.id}
          url={item.url}
          title={item.title}
          isRead={item.isRead}
          prevId={neighbours.previousId}
          nextId={neighbours.nextId}
          filter={filter}
          knowledgeUiEnabled={knowledgeUiEnabled}
          initialReaderState={
            knowledgeUiEnabled
              ? {
                  state: {
                    isRead: item.isRead,
                    archived: Boolean(item.archivedAt),
                    readingProgress: item.readingProgress ?? 0,
                    manualPriority: item.manualPriority ?? null,
                  },
                  updatedAt: readerDataUpdatedAt,
                }
              : undefined
          }
          initialFeedback={
            existingFeedback
              ? { rating: existingFeedback.rating, reason: existingFeedback.reason ?? null }
              : null
          }
        />
      </ReaderExperience>
    </PageContainer>
  );
}
