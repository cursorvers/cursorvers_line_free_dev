// supabase/functions/discord-forum-library/index.ts
// Discord Forum × note.com 全記事同期 Edge Function
// Actions: sync | import | status | seed

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "../_shared/logger.ts";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { FORUM_TAGS, mapHashtagsToForumTags } from "./tag-mapping.ts";

const log = createLogger("discord-forum-library");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const DISCORD_FORUM_CHANNEL_ID = Deno.env.get("DISCORD_FORUM_CHANNEL_ID") ??
  "";

const NOTE_API_BASE =
  "https://note.com/api/v2/creators/nice_wren7963/contents";
const NOTE_PAGE_SIZE = 6;
const DISCORD_API_BASE = "https://discord.com/api/v10";
const DISCORD_API_TIMEOUT = 8000;
const DISCORD_RATE_LIMIT_PAUSE = 2000;

// --- 型定義 ---
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

interface SyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

interface ImportResult {
  posted: number;
  skipped: number;
  errors: number;
}

interface StatusResult {
  total: number;
  posted: number;
  pending: number;
  paid: number;
}

type ActionResult = SyncResult | ImportResult | StatusResult | { seeded: number };

// --- メインハンドラ ---
Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return errorResponse("Missing Supabase configuration", 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { action } = await req.json();
    log.info("Action received", { action });

    let result: ActionResult;

    switch (action) {
      case "sync":
        result = await handleSync(supabase);
        break;
      case "import":
        if (!DISCORD_BOT_TOKEN || !DISCORD_FORUM_CHANNEL_ID) {
          return errorResponse("Missing Discord configuration", 500);
        }
        result = await handleImport(supabase);
        break;
      case "status":
        result = await handleStatus(supabase);
        break;
      case "seed":
        result = await handleSeed(supabase);
        break;
      default:
        return errorResponse(`Unknown action: ${action}`, 400);
    }

    log.info("Action completed", { action, result });
    return jsonResponse({ success: true, action, ...result });
  } catch (err) {
    log.error("Action failed", { errorMessage: extractErrorMessage(err) });
    return errorResponse(extractErrorMessage(err), 500);
  }
});

// ==============================================
// sync: note.com API → DB
// ==============================================
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
        log.warn("Update failed", { noteKey: article.key, error: error.message });
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
        log.warn("Insert failed", { noteKey: article.key, error: error.message });
        skipped++;
      } else {
        inserted++;
      }
    }
  }

  return { fetched: allArticles.length, inserted, updated, skipped };
}

// ==============================================
// import: DB → Discord Forum スレッド作成
// ==============================================
async function handleImport(supabase: SupabaseClient): Promise<ImportResult> {
  // 未投稿記事を取得（publish_at 降順）
  const { data: articles, error } = await supabase
    .from("note_articles")
    .select("*")
    .is("discord_thread_id", null)
    .order("publish_at", { ascending: true });

  if (error) {
    throw new Error(`DB query failed: ${error.message}`);
  }

  if (!articles || articles.length === 0) {
    log.info("No pending articles to import");
    return { posted: 0, skipped: 0, errors: 0 };
  }

  // Forum チャンネルのタグ一覧を取得
  const channelTagMap = await fetchForumChannelTags();

  let posted = 0;
  const skipped = 0;
  let errors = 0;

  for (const article of articles) {
    try {
      const titlePrefix = article.price > 0 ? "[有料] " : "";
      const threadName = `${titlePrefix}${article.title}`.slice(0, 100);

      const priceNote = article.price > 0
        ? `\n**価格:** ¥${article.price.toLocaleString()}`
        : "";

      const tagsLine = (article.tags as string[]).length > 0
        ? `\n**タグ:** ${(article.tags as string[]).join(", ")}`
        : "";

      const messageContent = [
        `📝 **${article.title}**`,
        "",
        article.url ?? "",
        priceNote,
        tagsLine,
      ].filter(Boolean).join("\n");

      // タグIDを解決
      const appliedTagIds = resolveTagIdsFromMap(
        article.tags as string[],
        channelTagMap,
      );

      // Discord Forum スレッド作成
      const threadId = await createForumThread(
        threadName,
        messageContent,
        appliedTagIds,
      );

      if (!threadId) {
        errors++;
        continue;
      }

      // DB 更新
      await supabase
        .from("note_articles")
        .update({
          discord_thread_id: threadId,
          posted_at: new Date().toISOString(),
        })
        .eq("id", article.id);

      posted++;

      // Discord Rate Limit 対策: スレッド作成間に pause
      await sleep(DISCORD_RATE_LIMIT_PAUSE);
    } catch (err) {
      log.error("Import error for article", {
        articleId: article.article_id,
        errorMessage: extractErrorMessage(err),
      });
      errors++;
    }
  }

  return { posted, skipped, errors };
}

// ==============================================
// status: 投稿状況レポート
// ==============================================
async function handleStatus(supabase: SupabaseClient): Promise<StatusResult> {
  const { count: total } = await supabase
    .from("note_articles")
    .select("*", { count: "exact", head: true });

  const { count: posted } = await supabase
    .from("note_articles")
    .select("*", { count: "exact", head: true })
    .not("discord_thread_id", "is", null);

  const { count: paid } = await supabase
    .from("note_articles")
    .select("*", { count: "exact", head: true })
    .gt("price", 0);

  return {
    total: total ?? 0,
    posted: posted ?? 0,
    pending: (total ?? 0) - (posted ?? 0),
    paid: paid ?? 0,
  };
}

// ==============================================
// seed: note-recommendations.ts の既存52件を DB に投入
// (初回セットアップ用、冪等)
// ==============================================
async function handleSeed(
  supabase: SupabaseClient,
): Promise<{ seeded: number }> {
  // note-recommendations.ts の静的データは直接インポートせず
  // note.com API で全件取得する sync を使うことを推奨
  // seed は article_id と url から note_key を逆算して既存レコードの紐付けに使用

  const { data: existing } = await supabase
    .from("note_articles")
    .select("id")
    .limit(1);

  if (existing && existing.length > 0) {
    log.info("Table already has data, running backfill for note_key");

    // URL から note_key をバックフィル
    const { data: needsKey } = await supabase
      .from("note_articles")
      .select("id, url")
      .is("note_key", null);

    let backfilled = 0;
    for (const row of needsKey ?? []) {
      const noteKey = extractNoteKey(row.url);
      if (noteKey) {
        await supabase
          .from("note_articles")
          .update({ note_key: noteKey })
          .eq("id", row.id);
        backfilled++;
      }
    }

    return { seeded: backfilled };
  }

  log.info("Empty table — run 'sync' action to populate from note.com API");
  return { seeded: 0 };
}

// ==============================================
// note.com API ヘルパー
// ==============================================
async function fetchAllNoteArticles(): Promise<NoteApiArticle[]> {
  const allArticles: NoteApiArticle[] = [];
  let page = 1;

  while (true) {
    const url = `${NOTE_API_BASE}?kind=note&page=${page}`;
    log.debug("Fetching note.com API", { page, url });

    const res = await fetch(url);
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
    // note.com API に優しく
    await sleep(500);
  }

  return allArticles;
}

// ==============================================
// Discord API ヘルパー
// ==============================================
async function fetchForumChannelTags(): Promise<Map<string, string>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCORD_API_TIMEOUT);

  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/channels/${DISCORD_FORUM_CHANNEL_ID}`,
      {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      log.error("Failed to fetch forum channel", { status: res.status });
      return new Map();
    }

    const channel = await res.json();
    const tagMap = new Map<string, string>();

    for (const tag of channel.available_tags ?? []) {
      tagMap.set(tag.name, tag.id);
    }

    log.info("Fetched forum tags", { count: tagMap.size });
    return tagMap;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createForumThread(
  name: string,
  content: string,
  appliedTagIds: string[],
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCORD_API_TIMEOUT);

  try {
    const res = await fetch(
      `${DISCORD_API_BASE}/channels/${DISCORD_FORUM_CHANNEL_ID}/threads`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          message: { content },
          applied_tags: appliedTagIds.slice(0, 5),
        }),
        signal: controller.signal,
      },
    );

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 5000;
      log.warn("Discord rate limited, waiting", { waitMs });
      await sleep(waitMs);
      // Retry once
      return createForumThread(name, content, appliedTagIds);
    }

    if (!res.ok) {
      const errorText = await res.text();
      log.error("Failed to create forum thread", {
        status: res.status,
        errorText,
        threadName: name,
      });
      return null;
    }

    const thread = await res.json();
    log.info("Forum thread created", { threadId: thread.id, name });
    return thread.id;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ==============================================
// ユーティリティ
// ==============================================
function resolveTagIdsFromMap(
  tagNames: readonly string[],
  channelTagMap: Map<string, string>,
): string[] {
  const ids: string[] = [];
  for (const name of tagNames) {
    const id = channelTagMap.get(name);
    if (id) {
      ids.push(id);
    }
  }
  return ids;
}

function extractNoteKey(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/n\/([a-zA-Z0-9]+)$/);
  return match?.[1] ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ success: false, error: message }, status);
}

// エクスポート（テスト用）
export {
  type ActionResult,
  createForumThread,
  extractNoteKey,
  fetchAllNoteArticles,
  FORUM_TAGS,
  handleImport,
  handleSeed,
  handleStatus,
  handleSync,
  type ImportResult,
  mapHashtagsToForumTags,
  type NoteApiArticle,
  resolveTagIdsFromMap,
  type StatusResult,
  type SyncResult,
};
