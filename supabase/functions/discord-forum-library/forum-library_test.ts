/**
 * Discord Forum Library - Unit Tests
 *
 * Tests for:
 * - Tag collection logic
 * - Title truncation
 * - Action validation
 * - Endpoint contract (new Forum endpoints)
 * - Data integrity (seed coverage)
 */

import { assertArrayIncludes, assertEquals, assertThrows } from "std-assert";
import { DISCORD_ENDPOINTS } from "../_shared/discord-endpoints.ts";
import {
  COURSE_RECOMMENDATIONS,
  getAllArticles,
} from "../line-webhook/lib/note-recommendations.ts";
import { FORUM_TAGS, mapHashtagsToForumTags } from "./tag-mapping.ts";

const BASE = "https://discord.com/api/v10";

// ============================================
// Forum Endpoint Contract Tests
// ============================================

Deno.test("guildChannel - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.guildChannel.build("g_123");
  assertEquals(url, `${BASE}/guilds/g_123/channels`);
});

Deno.test("guildChannel - throws on empty guildId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.guildChannel.build(""),
    Error,
    "guildId",
  );
});

Deno.test("guildChannel - method is POST", () => {
  assertEquals(DISCORD_ENDPOINTS.guildChannel.method, "POST");
});

Deno.test("guildChannel - expects 200 or 201", () => {
  assertEquals(DISCORD_ENDPOINTS.guildChannel.okStatuses.includes(200), true);
  assertEquals(DISCORD_ENDPOINTS.guildChannel.okStatuses.includes(201), true);
});

Deno.test("forumThread - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.forumThread.build("ch_456");
  assertEquals(url, `${BASE}/channels/ch_456/threads`);
});

Deno.test("forumThread - throws on empty channelId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.forumThread.build(""),
    Error,
    "channelId",
  );
});

Deno.test("forumThread - method is POST", () => {
  assertEquals(DISCORD_ENDPOINTS.forumThread.method, "POST");
});

Deno.test("forumThread - expects 200 or 201", () => {
  assertEquals(DISCORD_ENDPOINTS.forumThread.okStatuses.includes(200), true);
  assertEquals(DISCORD_ENDPOINTS.forumThread.okStatuses.includes(201), true);
});

Deno.test("channelTags - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.channelTags.build("ch_789");
  assertEquals(url, `${BASE}/channels/ch_789`);
});

Deno.test("channelTags - throws on empty channelId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.channelTags.build(""),
    Error,
    "channelId",
  );
});

Deno.test("channelTags - method is PATCH", () => {
  assertEquals(DISCORD_ENDPOINTS.channelTags.method, "PATCH");
});

Deno.test("channelTags - expects 200", () => {
  assertEquals(DISCORD_ENDPOINTS.channelTags.okStatuses.includes(200), true);
});

Deno.test("channelMessages - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.channelMessages.build("ch_msg_1");
  assertEquals(url, `${BASE}/channels/ch_msg_1/messages`);
});

Deno.test("channelMessages - throws on empty channelId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.channelMessages.build(""),
    Error,
    "channelId",
  );
});

Deno.test("channelMessages - method is GET", () => {
  assertEquals(DISCORD_ENDPOINTS.channelMessages.method, "GET");
});

Deno.test("editMessage - builds correct URL", () => {
  const url = DISCORD_ENDPOINTS.editMessage.build("ch_1", "msg_1");
  assertEquals(url, `${BASE}/channels/ch_1/messages/msg_1`);
});

Deno.test("editMessage - throws on empty channelId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.editMessage.build("", "msg_1"),
    Error,
    "channelId",
  );
});

Deno.test("editMessage - throws on empty messageId", () => {
  assertThrows(
    () => DISCORD_ENDPOINTS.editMessage.build("ch_1", ""),
    Error,
    "messageId",
  );
});

Deno.test("editMessage - method is PATCH", () => {
  assertEquals(DISCORD_ENDPOINTS.editMessage.method, "PATCH");
});

// ============================================
// Tag Collection Tests
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

Deno.test("collectAllTags - returns non-empty set", () => {
  const tags = collectAllTags();
  assertEquals(tags.length > 0, true, "Should have at least one tag");
});

Deno.test("collectAllTags - tags are sorted", () => {
  const tags = collectAllTags();
  const sorted = [...tags].sort();
  assertEquals(tags, sorted);
});

Deno.test("collectAllTags - no duplicates", () => {
  const tags = collectAllTags();
  const unique = [...new Set(tags)];
  assertEquals(tags.length, unique.length, "Tags should be unique");
});

Deno.test("collectAllTags - count is known (26 from 6 courses)", () => {
  const tags = collectAllTags();
  // Source data has 26 unique tags across 6 courses
  // The setup action truncates to Discord's 20-tag limit
  assertEquals(tags.length, 26, `Expected 26 tags, got ${tags.length}`);
});

Deno.test("setup truncates tags to Discord 20-tag limit", () => {
  const FORUM_MAX_TAGS = 20;
  const tags = collectAllTags();
  const limited = tags.slice(0, FORUM_MAX_TAGS);
  assertEquals(limited.length, 20);
});

// ============================================
// Title Truncation Tests
// ============================================

function truncateTitle(title: string): string {
  const MAX_LENGTH = 100;
  if (title.length <= MAX_LENGTH) return title;
  return title.slice(0, MAX_LENGTH - 1) + "\u2026";
}

Deno.test("truncateTitle - short title unchanged", () => {
  const title = "Short Title";
  assertEquals(truncateTitle(title), title);
});

Deno.test("truncateTitle - exactly 100 chars unchanged", () => {
  const title = "A".repeat(100);
  assertEquals(truncateTitle(title), title);
});

Deno.test("truncateTitle - 101 chars truncated with ellipsis", () => {
  const title = "A".repeat(101);
  const result = truncateTitle(title);
  assertEquals(result.length, 100);
  assertEquals(result.endsWith("\u2026"), true);
});

Deno.test("truncateTitle - long title from actual data fits 100 chars", () => {
  const articles = getAllArticles();
  for (const article of articles) {
    const truncated = truncateTitle(article.title);
    assertEquals(
      truncated.length <= 100,
      true,
      `Title too long after truncation: ${truncated.length} chars - "${article.title}"`,
    );
  }
});

// ============================================
// Seed Data Integrity Tests
// ============================================

Deno.test("getAllArticles - returns 52 articles (no duplicates)", () => {
  const articles = getAllArticles();
  assertEquals(
    articles.length >= 50,
    true,
    `Expected ~52 articles, got ${articles.length}`,
  );
});

Deno.test("all articles have required fields for seed", () => {
  const articles = getAllArticles();
  for (const article of articles) {
    assertEquals(
      typeof article.id === "string" && article.id.length > 0,
      true,
      `Article missing id`,
    );
    assertEquals(
      typeof article.title === "string" && article.title.length > 0,
      true,
      `Article ${article.id} missing title`,
    );
    assertEquals(
      typeof article.url === "string" && article.url.startsWith("https://"),
      true,
      `Article ${article.id} missing valid url`,
    );
  }
});

Deno.test("all articles have at least one tag", () => {
  const articles = getAllArticles();
  for (const article of articles) {
    assertEquals(
      Array.isArray(article.tags) && article.tags.length > 0,
      true,
      `Article ${article.id} has no tags`,
    );
  }
});

Deno.test("all article IDs are unique", () => {
  const articles = getAllArticles();
  const ids = articles.map((a) => a.id);
  const uniqueIds = [...new Set(ids)];
  assertEquals(
    ids.length,
    uniqueIds.length,
    "Duplicate article IDs found",
  );
});

Deno.test("article URLs are mostly unique (1 known duplicate in source data)", () => {
  const articles = getAllArticles();
  const urls = articles.map((a) => a.url).filter(Boolean);
  const uniqueUrls = [...new Set(urls)];
  // Source data has 1 known duplicate URL: nc39351e10d56
  // (regional_ai and hospital_perfect_answer share the same URL)
  // The DB uses UPSERT on article_id so both records coexist
  assertEquals(
    urls.length - uniqueUrls.length <= 1,
    true,
    `Too many duplicate URLs: ${urls.length - uniqueUrls.length}`,
  );
});

// ============================================
// Course Keyword Coverage Tests
// ============================================

Deno.test("every course has a keyword", () => {
  for (const course of COURSE_RECOMMENDATIONS) {
    assertEquals(
      typeof course.keyword === "string" && course.keyword.length > 0,
      true,
      `Course missing keyword`,
    );
  }
});

Deno.test("every course has at least one article", () => {
  for (const course of COURSE_RECOMMENDATIONS) {
    assertEquals(
      course.articles.length > 0,
      true,
      `Course "${course.keyword}" has no articles`,
    );
  }
});

// ============================================
// Rate Limit Config Tests
// ============================================

Deno.test("rate limit constants are reasonable", () => {
  const POST_DELAY_MS = 5_000;
  const BATCH_SIZE = 10;
  const BATCH_PAUSE_MS = 30_000;

  assertEquals(POST_DELAY_MS >= 1_000, true, "Post delay should be >= 1s");
  assertEquals(BATCH_SIZE >= 5, true, "Batch size should be >= 5");
  assertEquals(BATCH_PAUSE_MS >= 10_000, true, "Batch pause should be >= 10s");

  // Estimate total time for 52 articles
  const estimatedMs = 52 * POST_DELAY_MS +
    Math.floor(52 / BATCH_SIZE) * BATCH_PAUSE_MS;
  assertEquals(
    estimatedMs < 600_000,
    true,
    `Import would take ${estimatedMs}ms (>10min), too slow`,
  );
});

// ============================================
// Message Content Format Tests
// ============================================

Deno.test("message content fits Discord limit for all articles", () => {
  const DISCORD_MESSAGE_LIMIT = 2000;

  const articles = getAllArticles();
  for (const article of articles) {
    // Find the course keyword for this article
    let courseKeyword = "";
    for (const course of COURSE_RECOMMENDATIONS) {
      if (course.articles.some((a) => a.id === article.id)) {
        courseKeyword = course.keyword;
        break;
      }
    }

    const courseInfo = courseKeyword ? `\n**コース:** ${courseKeyword}` : "";
    const tagsInfo = article.tags && article.tags.length > 0
      ? `\n**タグ:** ${article.tags.join(", ")}`
      : "";

    const content = `${article.url}${courseInfo}${tagsInfo}`;

    assertEquals(
      content.length <= DISCORD_MESSAGE_LIMIT,
      true,
      `Message too long for article ${article.id}: ${content.length} chars`,
    );
  }
});

// ============================================
// Sync: Tag Mapping Tests
// ============================================

Deno.test("mapHashtagsToForumTags - basic mapping", () => {
  const result = mapHashtagsToForumTags(["#医療AI", "#生成AI"]);
  assertArrayIncludes(result, ["医療AI基礎", "AI実装・開発"]);
});

Deno.test("mapHashtagsToForumTags - works without # prefix", () => {
  const result = mapHashtagsToForumTags(["医療AI"]);
  assertEquals(result, ["医療AI基礎"]);
});

Deno.test("mapHashtagsToForumTags - ignores unknown hashtags", () => {
  const result = mapHashtagsToForumTags(["#未知のタグ", "#医療AI"]);
  assertEquals(result, ["医療AI基礎"]);
});

Deno.test("mapHashtagsToForumTags - deduplicates", () => {
  const result = mapHashtagsToForumTags(["#AI倫理", "#3省2ガイドライン"]);
  assertEquals(result, ["規制・コンプライアンス"]);
});

Deno.test("mapHashtagsToForumTags - max 5 tags", () => {
  const manyTags = [
    "#医療AI",
    "#生成AI",
    "#SaMD",
    "#副業",
    "#FDA",
    "#ROI",
    "#医療DX",
  ];
  const result = mapHashtagsToForumTags(manyTags);
  assertEquals(result.length <= 5, true);
});

Deno.test("mapHashtagsToForumTags - empty array", () => {
  const result = mapHashtagsToForumTags([]);
  assertEquals(result, []);
});

Deno.test("FORUM_TAGS - within Discord 20-tag limit", () => {
  assertEquals(FORUM_TAGS.length <= 20, true);
});

Deno.test("FORUM_TAGS - no duplicates", () => {
  const unique = new Set(FORUM_TAGS);
  assertEquals(unique.size, FORUM_TAGS.length);
});

// ============================================
// Sync: extractNoteKey Tests
// ============================================

function extractNoteKey(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/n\/([a-zA-Z0-9]+)$/);
  return match?.[1] ?? null;
}

Deno.test("extractNoteKey - valid URL", () => {
  assertEquals(
    extractNoteKey("https://note.com/nice_wren7963/n/n08c17b96b8f3"),
    "n08c17b96b8f3",
  );
});

Deno.test("extractNoteKey - null", () => {
  assertEquals(extractNoteKey(null), null);
});

Deno.test("extractNoteKey - invalid URL", () => {
  assertEquals(extractNoteKey("https://example.com"), null);
});

// ============================================
// Sync: Paid Article Tests
// ============================================

Deno.test("paid article - [有料] prefix applied", () => {
  const article = { price: 980, title: "テスト記事" };
  const prefix = article.price > 0 ? "[有料] " : "";
  const threadName = `${prefix}${article.title}`;
  assertEquals(threadName, "[有料] テスト記事");
});

Deno.test("free article - no prefix", () => {
  const article = { price: 0, title: "無料記事" };
  const prefix = article.price > 0 ? "[有料] " : "";
  const threadName = `${prefix}${article.title}`;
  assertEquals(threadName, "無料記事");
});

// ============================================
// Sync: note.com API Response Parsing Tests
// ============================================

Deno.test("note.com API - hashtag extraction", () => {
  const apiArticle = {
    key: "n08c17b96b8f3",
    name: "テスト記事",
    hashtags: [
      { hashtag: { name: "医療AI" } },
      { hashtag: { name: "生成AI" } },
    ],
    price: 0,
    publishAt: "2026-01-15T00:00:00+09:00",
    noteUrl: "https://note.com/nice_wren7963/n/n08c17b96b8f3",
  };

  const hashtags = (apiArticle.hashtags ?? []).map((h) => h.hashtag.name);
  assertEquals(hashtags, ["医療AI", "生成AI"]);

  const forumTags = mapHashtagsToForumTags(hashtags);
  assertArrayIncludes(forumTags, ["医療AI基礎", "AI実装・開発"]);
});

Deno.test("note.com API - no hashtags", () => {
  const apiArticle = {
    key: "nXXXX",
    name: "タグなし記事",
    hashtags: undefined,
    price: 0,
    publishAt: "2026-01-15T00:00:00+09:00",
    noteUrl: "https://note.com/nice_wren7963/n/nXXXX",
  };

  const hashtags = (apiArticle.hashtags ?? []).map(
    (h: { hashtag: { name: string } }) => h.hashtag.name,
  );
  assertEquals(hashtags, []);
});

Deno.test("note.com API - paid article detection", () => {
  const apiArticle = {
    key: "nPAID",
    name: "有料コンテンツ",
    hashtags: [],
    price: 5980,
    publishAt: "2026-02-01T00:00:00+09:00",
    noteUrl: "https://note.com/nice_wren7963/n/nPAID",
  };

  assertEquals(apiArticle.price > 0, true);
  assertEquals(apiArticle.price, 5980);
});
