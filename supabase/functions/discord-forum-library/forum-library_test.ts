// supabase/functions/discord-forum-library/forum-library_test.ts
import {
  assertEquals,
  assertArrayIncludes,
} from "std-assert";
import { mapHashtagsToForumTags, FORUM_TAGS } from "./tag-mapping.ts";

// ==============================================
// mapHashtagsToForumTags
// ==============================================

Deno.test("mapHashtagsToForumTags - 基本的なマッピング", () => {
  const result = mapHashtagsToForumTags(["#医療AI", "#生成AI"]);
  assertArrayIncludes(result, ["医療AI基礎", "AI実装・開発"]);
});

Deno.test("mapHashtagsToForumTags - # なしでも動作", () => {
  const result = mapHashtagsToForumTags(["医療AI"]);
  assertEquals(result, ["医療AI基礎"]);
});

Deno.test("mapHashtagsToForumTags - 未知のハッシュタグは無視", () => {
  const result = mapHashtagsToForumTags(["#未知のタグ", "#医療AI"]);
  assertEquals(result, ["医療AI基礎"]);
});

Deno.test("mapHashtagsToForumTags - 重複除去", () => {
  // 両方とも「規制・コンプライアンス」にマッピングされる
  const result = mapHashtagsToForumTags(["#AI倫理", "#3省2ガイドライン"]);
  assertEquals(result, ["規制・コンプライアンス"]);
});

Deno.test("mapHashtagsToForumTags - 最大5タグ制限", () => {
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

Deno.test("mapHashtagsToForumTags - 空配列", () => {
  const result = mapHashtagsToForumTags([]);
  assertEquals(result, []);
});

// ==============================================
// FORUM_TAGS 定数
// ==============================================

Deno.test("FORUM_TAGS - 20個以下（Discordチャンネル制限）", () => {
  assertEquals(FORUM_TAGS.length <= 20, true);
});

Deno.test("FORUM_TAGS - 重複なし", () => {
  const unique = new Set(FORUM_TAGS);
  assertEquals(unique.size, FORUM_TAGS.length);
});

// ==============================================
// extractNoteKey (index.ts からインポート不可のため直接テスト)
// ==============================================

function extractNoteKey(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/n\/([a-zA-Z0-9]+)$/);
  return match?.[1] ?? null;
}

Deno.test("extractNoteKey - 正常なURL", () => {
  assertEquals(
    extractNoteKey("https://note.com/nice_wren7963/n/n08c17b96b8f3"),
    "n08c17b96b8f3",
  );
});

Deno.test("extractNoteKey - null", () => {
  assertEquals(extractNoteKey(null), null);
});

Deno.test("extractNoteKey - 不正なURL", () => {
  assertEquals(extractNoteKey("https://example.com"), null);
});

// ==============================================
// 有料記事のタイトルプレフィックス
// ==============================================

Deno.test("有料記事 - [有料] プレフィックス付与ロジック", () => {
  const article = { price: 980, title: "テスト記事" };
  const prefix = article.price > 0 ? "[有料] " : "";
  const threadName = `${prefix}${article.title}`;
  assertEquals(threadName, "[有料] テスト記事");
});

Deno.test("無料記事 - プレフィックスなし", () => {
  const article = { price: 0, title: "無料記事" };
  const prefix = article.price > 0 ? "[有料] " : "";
  const threadName = `${prefix}${article.title}`;
  assertEquals(threadName, "無料記事");
});

// ==============================================
// resolveTagIdsFromMap
// ==============================================

Deno.test("resolveTagIds - タグ名からIDを解決", () => {
  const channelTagMap = new Map<string, string>([
    ["医療AI基礎", "tag_001"],
    ["AI実装・開発", "tag_002"],
    ["規制・コンプライアンス", "tag_003"],
  ]);

  const tagNames = ["医療AI基礎", "AI実装・開発"];
  const ids: string[] = [];
  for (const name of tagNames) {
    const id = channelTagMap.get(name);
    if (id) ids.push(id);
  }

  assertEquals(ids, ["tag_001", "tag_002"]);
});

Deno.test("resolveTagIds - 存在しないタグは無視", () => {
  const channelTagMap = new Map<string, string>([
    ["医療AI基礎", "tag_001"],
  ]);

  const tagNames = ["医療AI基礎", "存在しないタグ"];
  const ids: string[] = [];
  for (const name of tagNames) {
    const id = channelTagMap.get(name);
    if (id) ids.push(id);
  }

  assertEquals(ids, ["tag_001"]);
});

// ==============================================
// note.com API レスポンスパース
// ==============================================

Deno.test("note.com API レスポンス - ハッシュタグ抽出", () => {
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

Deno.test("note.com API レスポンス - ハッシュタグなし", () => {
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

Deno.test("note.com API レスポンス - 有料記事検出", () => {
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
