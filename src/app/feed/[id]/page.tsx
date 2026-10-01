/**
 * Item detail page — /feed/[id]
 *
 * Unified reader-mode experience. Every content type (article, tweet, video,
 * podcast) gets the same structural layout: header →
 * content body → sticky action bar. Only the content body varies by type.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Headphones } from "lucide-react";
import { ReaderAreaBadge } from "@/components/feed/reader-area-badge";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ReaderExperience,
  ReaderDisplaySettings,
  ReaderHero,
} from "@/components/feed/reader-experience";
import { displayTitle, publisherLabel, readTimeLabel, cardExcerpt } from "@/lib/display";
import { formatDate } from "@/lib/format";
import { withTenantRepositories } from "@/lib/database";
import { resolveRequestAuthContext } from "@/lib/auth/account-service";
import { detectStrategy } from "@/lib/content-strategies";
import { VideoEmbed, VideoHero } from "@/components/feed/video-embed";
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
  // One tenant transaction for the whole read: the item, its summaries and
  // feedback, and the keyset neighbours the prev/next controls need.
  const loaded = await withTenantRepositories(auth, async (repositories) => {
    const item = await repositories.items.findById(id);
    if (!item) return null;
    const [aiSummaries, existingFeedback, neighbours] = await Promise.all([
      repositories.summaries.findAll(item.id),
      repositories.feedback.findForItem(item.id),
      repositories.items.findNeighbours(item.id, { unreadOnly: filter !== "all" }),
    ]);
    return { item, aiSummaries, existingFeedback, neighbours };
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

  const { item, aiSummaries, existingFeedback, neighbours } = loaded;
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
  const videoInHeader = Boolean(
    item.thumbnailUrl && (strategy.detail.showEmbedPlayer || twitterVideo?.embedUrl)
  );
  const header = (
    <>
      <Link
        href={`/feed${filter ? `?filter=${filter}` : ""}`}
        className="mb-4 hidden min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
        aria-label="Back to feed"
        aria-keyshortcuts="u Escape"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to feed
      </Link>
      <PageHeader
        display
        title={title}
        className="mb-7"
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
      {item.thumbnailUrl &&
        (videoInHeader ? (
          <VideoHero
            thumbnailUrl={item.thumbnailUrl}
            title={title}
            url={item.url}
            contentType={item.contentType}
            duration={item.duration}
            nativeVideoUrl={twitterVideo?.embedUrl}
          />
        ) : (
          <ReaderHero src={item.thumbnailUrl} title={title} />
        ))}
    </>
  );
  const content = (
    <section className="min-h-[30vh]">
      {strategy.detail.showEmbedPlayer && !videoInHeader && (
        <div className="mb-6">
          <VideoEmbed url={item.url} contentType={item.contentType} duration={item.duration} />
        </div>
      )}
      {twitterVideo?.embedUrl && !videoInHeader && (
        <video
          src={twitterVideo.embedUrl}
          poster={item.thumbnailUrl ?? undefined}
          controls
          preload="metadata"
          className="mb-6 max-h-[30rem] w-full rounded-xl border border-border bg-muted"
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
            rail={<ReaderKnowledgeControls itemId={item.id} />}
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
