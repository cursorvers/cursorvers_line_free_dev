/**
 * Discord Forum Library Edge Function
 *
 * note.com 記事を Discord Forum チャンネルにスレッドとして投稿・管理する。
 *
 * Actions:
 * - setup:      Forum チャンネル作成 + タグ設定（初回1回）
 * - seed:       note-recommendations.ts から note_articles テーブルへ初期データ投入
 * - sync:       note.com API から全記事を取得して DB に同期
 * - import:     未投稿記事を Forum スレッドとして投稿
 * - status:     投稿状況（total / posted / pending）を返す
 * - fix-embeds: embed なしスレッドのメッセージを再編集して OGP 展開を再トリガー
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLogger, errorToContext } from "../_shared/logger.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { DISCORD_ENDPOINTS } from "../_shared/discord-endpoints.ts";
import {
  COURSE_RECOMMENDATIONS,
  getAllArticles,
} from "../line-webhook/lib/note-recommendations.ts";
import { mapHashtagsToForumTags } from "./tag-mapping.ts";

// ============================================
// Constants
// ============================================

const log = createLogger("discord-forum-library");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_GUILD_ID = Deno.env.get("DISCORD_GUILD_ID") ?? "";
const DISCORD_FORUM_CHANNEL_ID = Deno.env.get("DISCORD_FORUM_CHANNEL_ID") ??
  "";

/** Discord Forum channel type */
const CHANNEL_TYPE_GUILD_FORUM = 15;

/** Discord Forum max available_tags */
const FORUM_MAX_TAGS = 20;

/** Forum thread title max length */
const FORUM_TITLE_MAX_LENGTH = 100;

/** Rate limit: delay between posts (ms) */
const POST_DELAY_MS = 3_000;

/** Default max articles per invocation (fit within Edge Function timeout) */
const DEFAULT_IMPORT_LIMIT = 10;

/** Discord API timeout (ms) */
const DISCORD_TIMEOUT_MS = 10_000;

/** Max retries for rate-limited requests */
const MAX_RETRIES = 3;

const DEFAULT_RETRY_DELAY_MS = 1_000;

/** note.com public API base URL */
const NOTE_API_BASE = "https://note.com/api/v2/creators/nice_wren7963/contents";

/** note.com API items per page */
const NOTE_PAGE_SIZE = 6;

/** Delay between note.com API requests (ms) */
const NOTE_API_DELAY_MS = 500;

// ============================================
// Types
// ============================================

type Action =
  | "setup"
  | "seed"
  | "sync"
  | "import"
  | "status"
  | "fix-embeds";

interface NoteArticleRow {
  id: string;
  article_id: string;
  title: string;
  url: string;
  tags: string[];
  course_keyword: string | null;
  discord_thread_id: string | null;
  posted_at: string | null;
  note_key: string | null;
  hashtags: string[];
  price: number;
}

interface NoteApiArticle {
  key: string;
  name: string;
  hashtags?: Array<{ hashtag: { name: string } }>;
  price: number;
  publishAt: string;
  noteUrl: string;
}

interface NoteApiResponse {
  data: {
    contents: NoteApiArticle[];
    isLastPage: boolean;
  };
}

interface ForumTag {
  id?: string;
  name: string;
}

interface SetupResult {
  action: "setup";
  channelId: string;
  tagsConfigured: number;
}

interface SeedResult {
  action: "seed";
  inserted: number;
  skipped: number;
  total: number;
}

interface ImportResult {
  action: "import";
  posted: number;
  failed: number;
  skipped: number;
}

interface SyncResult {
  action: "sync";
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

interface StatusResult {
  action: "status";
  total: number;
  posted: number;
  pending: number;
  paid: number;
}

interface FixEmbedsResult {
  action: "fix-embeds";
  checked: number;
  fixed: number;
  alreadyOk: number;
  failed: number;
}

type ActionResult =
  | SetupResult
  | SeedResult
  | SyncResult
  | ImportResult
  | StatusResult
  | FixEmbedsResult;

// ============================================
// Discord API helpers (internal rate-limit control)
// ============================================

async function discordFetch(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCORD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (response.status === 429 && retries > 0) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader
        ? parseFloat(retryAfterHeader) * 1000
        : DEFAULT_RETRY_DELAY_MS;

      log.warn("Discord rate limited, retrying", {
        retryAfterMs,
        retriesLeft: retries - 1,
      });

      await delay(retryAfterMs);
      return discordFetch(url, options, retries - 1);
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function discordHeaders(
  json = true,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  };
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateTitle(title: string): string {
  if (title.length <= FORUM_TITLE_MAX_LENGTH) return title;
  return title.slice(0, FORUM_TITLE_MAX_LENGTH - 1) + "\u2026";
}

// ============================================
// Collect all unique tags from articles
// ============================================

function collectAllTags(): string[] {
  const tagSet = new Set<string>();
  for (const course of COURSE_RECOMMENDATIONS) {
    for (const article of course.articles) {
      if (article.tags) {
        for (const tag of article.tags) {
          tagSet.add(tag);
        }
      }
    }
  }
  return [...tagSet].sort();
}

// ============================================
// Action: setup
// ============================================

async function handleSetup(): Promise<SetupResult> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
    throw new Error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required");
  }

  // 1. Create Forum channel
  const createUrl = DISCORD_ENDPOINTS.guildChannel.build(DISCORD_GUILD_ID);
  const allTags = collectAllTags();

  // Discord allows max 20 available_tags per Forum channel
  const limitedTags = allTags.slice(0, FORUM_MAX_TAGS);
  if (allTags.length > FORUM_MAX_TAGS) {
    log.warn("Tags exceed Discord limit, truncating", {
      total: allTags.length,
      limit: FORUM_MAX_TAGS,
      dropped: allTags.slice(FORUM_MAX_TAGS),
    });
  }

  const availableTags = limitedTags.map((tag) => ({
    name: tag,
  }));

  const createResponse = await discordFetch(createUrl, {
    method: DISCORD_ENDPOINTS.guildChannel.method,
    headers: discordHeaders(),
    body: JSON.stringify({
      name: "note-article-library",
      type: CHANNEL_TYPE_GUILD_FORUM,
      topic:
        "note.com 記事ライブラリ - タグで検索してお探しの記事を見つけてください",
      available_tags: availableTags,
    }),
  });

  if (!createResponse.ok) {
    const errorBody = await createResponse.text();
    throw new Error(
      `Failed to create Forum channel: ${createResponse.status} ${errorBody}`,
    );
  }

  const channel = await createResponse.json();
  log.info("Forum channel created", {
    channelId: channel.id,
    name: channel.name,
  });

  return {
    action: "setup",
    channelId: channel.id,
    tagsConfigured: allTags.length,
  };
}

// ============================================
// Action: seed
// ============================================

async function handleSeed(supabase: SupabaseClient): Promise<SeedResult> {
  const articles = getAllArticles();
  let inserted = 0;
  let skipped = 0;

  for (const course of COURSE_RECOMMENDATIONS) {
    for (const article of course.articles) {
      if (!article.url) {
        skipped++;
        continue;
      }

      const { error } = await supabase
        .from("note_articles")
        .upsert(
          {
            article_id: article.id,
            title: article.title,
            url: article.url,
            tags: article.tags ?? [],
            course_keyword: course.keyword,
          },
          { onConflict: "article_id" },
        );

      if (error) {
        log.warn("Failed to upsert article", {
          articleId: article.id,
          error: error.message,
        });
        skipped++;
      } else {
        inserted++;
      }
    }
  }

  log.info("Seed completed", { inserted, skipped, total: articles.length });

  return {
    action: "seed",
    inserted,
    skipped,
    total: articles.length,
  };
}

// ============================================
// Action: sync (note.com API → DB)
// ============================================

async function fetchAllNoteArticles(): Promise<NoteApiArticle[]> {
  const allArticles: NoteApiArticle[] = [];
  let page = 1;

  while (true) {
    const apiUrl = `${NOTE_API_BASE}?kind=note&page=${page}`;
    log.debug("Fetching note.com API", { page });

    const res = await fetch(apiUrl);
    if (!res.ok) {
      throw new Error(`note.com API error: ${res.status} on page ${page}`);
    }

    const json: NoteApiResponse = await res.json();
    const { contents, isLastPage } = json.data;

    allArticles.push(...contents);

    if (isLastPage || contents.length < NOTE_PAGE_SIZE) {
      break;
    }

    page++;
    await delay(NOTE_API_DELAY_MS);
  }

  return allArticles;
}

export function extractNoteKey(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/n\/([a-zA-Z0-9]+)$/);
  return match?.[1] ?? null;
}

async function handleSync(supabase: SupabaseClient): Promise<SyncResult> {
  const allArticles = await fetchAllNoteArticles();
  log.info("Fetched articles from note.com", { count: allArticles.length });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const article of allArticles) {
    const hashtags = (article.hashtags ?? []).map((h) => h.hashtag.name);
    const forumTags = mapHashtagsToForumTags(hashtags);

    // note_key で既存レコードを検索
    const { data: existing } = await supabase
      .from("note_articles")
      .select("id, tags, course_keyword")
      .eq("note_key", article.key)
      .maybeSingle();

    if (existing) {
      // 既存: title, hashtags, price のみ更新（tags, course_keyword は保持）
      const { error } = await supabase
        .from("note_articles")
        .update({
          title: article.name,
          hashtags,
          price: article.price,
          url: article.noteUrl,
          publish_at: article.publishAt,
        })
        .eq("id", existing.id);

      if (error) {
        log.warn("Update failed", {
          noteKey: article.key,
          error: error.message,
        });
        skipped++;
      } else {
        updated++;
      }
    } else {
      // 新規: article_id = note_key, tags = マッピング結果
      const { error } = await supabase
        .from("note_articles")
        .insert({
          article_id: article.key,
          note_key: article.key,
          title: article.name,
          url: article.noteUrl,
          tags: forumTags,
          hashtags,
          price: article.price,
          publish_at: article.publishAt,
        });

      if (error) {
        log.warn("Insert failed", {
          noteKey: article.key,
          error: error.message,
        });
        skipped++;
      } else {
        inserted++;
      }
    }
  }

  return {
    action: "sync",
    fetched: allArticles.length,
    inserted,
    updated,
    skipped,
  };
}

// ============================================
// Action: import
// ============================================

async function handleImport(
  supabase: SupabaseClient,
  limit: number = DEFAULT_IMPORT_LIMIT,
): Promise<ImportResult> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_FORUM_CHANNEL_ID) {
    throw new Error(
      "DISCORD_BOT_TOKEN and DISCORD_FORUM_CHANNEL_ID are required",
    );
  }

  // 1. Fetch available tags from the Forum channel to get tag IDs
  const channelUrl = DISCORD_ENDPOINTS.channelTags.build(
    DISCORD_FORUM_CHANNEL_ID,
  );
  const channelResponse = await discordFetch(channelUrl, {
    method: "GET",
    headers: discordHeaders(false),
  });

  if (!channelResponse.ok) {
    throw new Error(`Failed to fetch channel info: ${channelResponse.status}`);
  }

  const channelData = await channelResponse.json();
  const forumTags: ForumTag[] = channelData.available_tags ?? [];

  // Build tag name → ID map
  const tagIdMap = new Map<string, string>();
  for (const tag of forumTags) {
    if (tag.id) {
      tagIdMap.set(tag.name, tag.id);
    }
  }

  // 2. Get unposted articles
  const { data: pendingArticles, error: fetchError } = await supabase
    .from("note_articles")
    .select("*")
    .is("discord_thread_id", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (fetchError) {
    throw new Error(`Failed to fetch pending articles: ${fetchError.message}`);
  }

  const articles = (pendingArticles ?? []) as NoteArticleRow[];

  if (articles.length === 0) {
    log.info("No pending articles to import");
    return { action: "import", posted: 0, failed: 0, skipped: 0 };
  }

  log.info("Starting import", { pendingCount: articles.length });

  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    if (!article) {
      skipped++;
      continue;
    }

    // Rate limit: pause between posts
    if (i > 0) {
      await delay(POST_DELAY_MS);
    }

    try {
      // Map article tags to Forum tag IDs
      const appliedTagIds: string[] = [];
      for (const tag of article.tags) {
        const tagId = tagIdMap.get(tag);
        if (tagId) {
          appliedTagIds.push(tagId);
        }
      }

      // Build message content
      const courseInfo = article.course_keyword
        ? `\n**コース:** ${article.course_keyword}`
        : "";
      const priceInfo = article.price > 0
        ? `\n**価格:** ¥${article.price.toLocaleString()}`
        : "";
      const tagsInfo = article.tags.length > 0
        ? `\n**タグ:** ${article.tags.join(", ")}`
        : "";

      const messageContent =
        `${article.url}${courseInfo}${priceInfo}${tagsInfo}`;

      // Paid article prefix
      const titlePrefix = article.price > 0 ? "[有料] " : "";
      const threadTitle = truncateTitle(
        `${titlePrefix}${article.title}`,
      );

      // Create Forum thread
      const threadUrl = DISCORD_ENDPOINTS.forumThread.build(
        DISCORD_FORUM_CHANNEL_ID,
      );
      const threadResponse = await discordFetch(threadUrl, {
        method: DISCORD_ENDPOINTS.forumThread.method,
        headers: discordHeaders(),
        body: JSON.stringify({
          name: threadTitle,
          message: {
            content: messageContent,
          },
          applied_tags: appliedTagIds.slice(0, 5), // Discord max 5 tags
        }),
      });

      if (!threadResponse.ok) {
        const errorBody = await threadResponse.text();
        log.error("Failed to create forum thread", {
          articleId: article.article_id,
          status: threadResponse.status,
          error: errorBody,
        });
        failed++;
        continue;
      }

      const threadData = await threadResponse.json();

      // Update DB with thread ID
      const { error: updateError } = await supabase
        .from("note_articles")
        .update({
          discord_thread_id: threadData.id,
          posted_at: new Date().toISOString(),
        })
        .eq("article_id", article.article_id);

      if (updateError) {
        log.error("Failed to update article after posting", {
          articleId: article.article_id,
          error: updateError.message,
        });
        failed++;
        continue;
      }

      posted++;
      log.info("Forum thread created", {
        articleId: article.article_id,
        threadId: threadData.id,
        progress: `${i + 1}/${articles.length}`,
      });
    } catch (err) {
      log.error("Error posting article", {
        articleId: article.article_id,
        ...errorToContext(err),
      });
      failed++;
    }
  }

  log.info("Import completed", { posted, failed, skipped });
  return { action: "import", posted, failed, skipped };
}

// ============================================
// Action: status
// ============================================

async function handleStatus(supabase: SupabaseClient): Promise<StatusResult> {
  const { count: totalCount, error: totalError } = await supabase
    .from("note_articles")
    .select("*", { count: "exact", head: true });

  if (totalError) {
    throw new Error(`Failed to count articles: ${totalError.message}`);
  }

  const { count: postedCount, error: postedError } = await supabase
    .from("note_articles")
    .select("*", { count: "exact", head: true })
    .not("discord_thread_id", "is", null);

  if (postedError) {
    throw new Error(`Failed to count posted: ${postedError.message}`);
  }

  const { count: paidCount, error: paidError } = await supabase
    .from("note_articles")
    .select("*", { count: "exact", head: true })
    .gt("price", 0);

  if (paidError) {
    throw new Error(`Failed to count paid: ${paidError.message}`);
  }

  const total = totalCount ?? 0;
  const posted = postedCount ?? 0;

  return {
    action: "status",
    total,
    posted,
    pending: total - posted,
    paid: paidCount ?? 0,
  };
}

// ============================================
// Action: fix-embeds
// ============================================

/** Delay between embed fix edits (ms) — slower to let Discord unfurl */
const EMBED_FIX_DELAY_MS = 5_000;

/** Default batch size for fix-embeds (fits within Edge Function timeout) */
const DEFAULT_FIX_EMBEDS_LIMIT = 20;

async function handleFixEmbeds(
  supabase: SupabaseClient,
  limit: number = DEFAULT_FIX_EMBEDS_LIMIT,
  offset: number = 0,
): Promise<FixEmbedsResult> {
  if (!DISCORD_BOT_TOKEN) {
    throw new Error("DISCORD_BOT_TOKEN is required");
  }

  // 1. Get posted articles batch (those with discord_thread_id)
  const { data: postedArticles, error: fetchError } = await supabase
    .from("note_articles")
    .select("article_id, title, discord_thread_id")
    .not("discord_thread_id", "is", null)
    .order("posted_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (fetchError) {
    throw new Error(`Failed to fetch posted articles: ${fetchError.message}`);
  }

  const articles = (postedArticles ?? []) as Array<{
    article_id: string;
    title: string;
    discord_thread_id: string;
  }>;

  if (articles.length === 0) {
    return { action: "fix-embeds", checked: 0, fixed: 0, alreadyOk: 0, failed: 0 };
  }

  log.info("Checking embeds", { threadCount: articles.length });

  let checked = 0;
  let fixed = 0;
  let alreadyOk = 0;
  let failed = 0;

  for (const article of articles) {
    const threadId = article.discord_thread_id;

    try {
      // 2. Fetch the first message in the thread
      const messagesUrl =
        `${DISCORD_ENDPOINTS.channelMessages.build(threadId)}?limit=1`;
      const messagesRes = await discordFetch(messagesUrl, {
        method: DISCORD_ENDPOINTS.channelMessages.method,
        headers: discordHeaders(false),
      });

      if (!messagesRes.ok) {
        log.warn("Failed to fetch thread messages", {
          threadId,
          status: messagesRes.status,
        });
        failed++;
        checked++;
        continue;
      }

      const messages = await messagesRes.json();
      if (!Array.isArray(messages) || messages.length === 0) {
        log.warn("No messages in thread", { threadId });
        failed++;
        checked++;
        continue;
      }

      const firstMessage = messages[0];
      checked++;

      // 3. Check if embeds are present
      if (
        Array.isArray(firstMessage.embeds) &&
        firstMessage.embeds.length > 0
      ) {
        alreadyOk++;
        continue;
      }

      // 4. Edit the message with same content to re-trigger unfurling
      const editUrl = DISCORD_ENDPOINTS.editMessage.build(
        threadId,
        firstMessage.id,
      );
      const editRes = await discordFetch(editUrl, {
        method: DISCORD_ENDPOINTS.editMessage.method,
        headers: discordHeaders(),
        body: JSON.stringify({ content: firstMessage.content }),
      });

      if (!editRes.ok) {
        const errorBody = await editRes.text();
        log.warn("Failed to edit message for embed fix", {
          threadId,
          messageId: firstMessage.id,
          status: editRes.status,
          error: errorBody,
        });
        failed++;
      } else {
        fixed++;
        log.info("Embed fix triggered", {
          threadId,
          articleId: article.article_id,
        });
      }

      // 5. Delay to avoid rate limiting
      await delay(EMBED_FIX_DELAY_MS);
    } catch (err) {
      log.error("Error fixing embed", {
        threadId,
        ...errorToContext(err),
      });
      failed++;
      checked++;
    }
  }

  log.info("Fix-embeds completed", { checked, fixed, alreadyOk, failed });
  return { action: "fix-embeds", checked, fixed, alreadyOk, failed };
}

// ============================================
// Main handler
// ============================================

Deno.serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse action, limit, offset from query param or body
    let action: Action = "status";
    let importLimit = DEFAULT_IMPORT_LIMIT;
    let offset = 0;
    const url = new URL(req.url);
    const queryAction = url.searchParams.get("action");
    const queryLimit = url.searchParams.get("limit");
    const queryOffset = url.searchParams.get("offset");

    if (queryAction) {
      action = queryAction as Action;
    }
    if (queryLimit) {
      importLimit = Math.max(
        1,
        Math.min(50, parseInt(queryLimit, 10) || DEFAULT_IMPORT_LIMIT),
      );
    }
    if (queryOffset) {
      offset = Math.max(0, parseInt(queryOffset, 10) || 0);
    }

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.action) {
          action = body.action as Action;
        }
        if (body.limit) {
          importLimit = Math.max(
            1,
            Math.min(50, Number(body.limit) || DEFAULT_IMPORT_LIMIT),
          );
        }
        if (body.offset !== undefined) {
          offset = Math.max(0, Number(body.offset) || 0);
        }
      } catch {
        // No body or invalid JSON — use defaults
      }
    }

    const validActions: Action[] = [
      "setup",
      "seed",
      "sync",
      "import",
      "status",
      "fix-embeds",
    ];
    if (!validActions.includes(action)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Invalid action: ${action}. Valid: ${validActions.join(", ")}`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    log.info("Action started", { action });

    let result: ActionResult;

    switch (action) {
      case "setup":
        result = await handleSetup();
        break;
      case "seed":
        result = await handleSeed(supabase);
        break;
      case "sync":
        result = await handleSync(supabase);
        break;
      case "import":
        result = await handleImport(supabase, importLimit);
        break;
      case "status":
        result = await handleStatus(supabase);
        break;
      case "fix-embeds":
        result = await handleFixEmbeds(supabase, importLimit, offset);
        break;
    }

    log.info("Action completed", {
      action,
      durationMs: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ ok: true, ...result }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errorMessage = extractErrorMessage(err);
    log.error("Action failed", {
      ...errorToContext(err),
      durationMs: Date.now() - startTime,
    });

    return new Response(
      JSON.stringify({ ok: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
