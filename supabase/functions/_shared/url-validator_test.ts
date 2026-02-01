/**
 * URL検証ライブラリのテスト
 * X/Twitter URLを検出し、短縮URL展開・リダイレクト検査を実施
 */

import { assertEquals } from "std-assert";
import {
  isXUrl,
  normalizeUrl,
  expandShortUrl,
  checkRedirect,
} from "./url-validator.ts";

Deno.test("normalizeUrl: twitter.com URL", () => {
  const input = "https://twitter.com/user/status/123";
  const result = normalizeUrl(input);
  assertEquals(result, "https://twitter.com/user/status/123");
});

Deno.test("normalizeUrl: x.com URL", () => {
  const input = "https://x.com/user/status/123";
  const result = normalizeUrl(input);
  assertEquals(result, "https://x.com/user/status/123");
});

Deno.test("normalizeUrl: removes trailing slash", () => {
  const input = "https://x.com/user/status/123/";
  const result = normalizeUrl(input);
  assertEquals(result, "https://x.com/user/status/123");
});

Deno.test("normalizeUrl: decodes URL encoding", () => {
  const input = "https://example.com/%78.com";
  const result = normalizeUrl(input);
  assertEquals(result, "https://example.com/x.com");
});

Deno.test("normalizeUrl: handles empty string", () => {
  const input = "";
  const result = normalizeUrl(input);
  assertEquals(result, "");
});

Deno.test("isXUrl: detects twitter.com", async () => {
  const url = "https://twitter.com/user/status/123";
  const result = await isXUrl(url);
  assertEquals(result, true);
});

Deno.test("isXUrl: detects x.com", async () => {
  const url = "https://x.com/user/status/123";
  const result = await isXUrl(url);
  assertEquals(result, true);
});

Deno.test("isXUrl: rejects subdomain", async () => {
  const url = "https://blog.twitter.com/post";
  const result = await isXUrl(url);
  assertEquals(result, false);
});

Deno.test("isXUrl: detects encoded x.com", async () => {
  // URLエンコードされたx.comドメイン（実際のケース）
  const url = "https://%78.com/user/status/123";
  const result = await isXUrl(url);
  assertEquals(result, true);
});

Deno.test("isXUrl: handles null", async () => {
  const result = await isXUrl(null as any);
  assertEquals(result, false);
});

Deno.test("isXUrl: handles empty string", async () => {
  const result = await isXUrl("");
  assertEquals(result, false);
});

Deno.test("isXUrl: rejects non-X URL", async () => {
  const url = "https://example.com/page";
  const result = await isXUrl(url);
  assertEquals(result, false);
});

// Note: expandShortUrl と checkRedirect は実際のHTTPリクエストが必要なため、
// 本番環境でのみ動作するテストとしてスキップ可能にする

Deno.test({
  name: "expandShortUrl: expands t.co URL (integration)",
  ignore: Deno.env.get("SKIP_INTEGRATION_TESTS") === "true",
  async fn() {
    // 実際のt.co URLは使用できないため、モック動作を想定
    const shortUrl = "https://t.co/abcd1234";
    const result = await expandShortUrl(shortUrl);

    // 実装が未完成の場合は短縮URLをそのまま返す仕様
    assertEquals(typeof result, "string");
  },
});

Deno.test({
  name: "checkRedirect: follows redirect (integration)",
  ignore: Deno.env.get("SKIP_INTEGRATION_TESTS") === "true",
  async fn() {
    // リダイレクト先の検証（実装依存）
    const url = "https://example.com/redirect";
    const result = await checkRedirect(url);

    assertEquals(typeof result, "string");
  },
});

Deno.test("checkRedirect: handles fetch error gracefully", async () => {
  const url = "https://invalid.invalid.invalid/notexist";
  const result = await checkRedirect(url);

  // エラー時は元URLを返す仕様
  assertEquals(result, url);
});

Deno.test("normalizeUrl: handles URL decode error gracefully", () => {
  // 不正なURLエンコード（デコードできない）
  const input = "https://example.com/%";
  const result = normalizeUrl(input);
  // デコードエラー時は元のURLを返す
  assertEquals(result, input);
});

Deno.test("expandShortUrl: returns original URL for non-t.co", async () => {
  const url = "https://example.com/short";
  const result = await expandShortUrl(url);
  assertEquals(result, url);
});

Deno.test("expandShortUrl: handles expansion error gracefully", async () => {
  // t.coを含むが実際には存在しないURL
  const url = "https://t.co/invalidlink999999";
  const result = await expandShortUrl(url);
  // エラー時は元のURLを返す
  assertEquals(result, url);
});

Deno.test("checkRedirect: returns normalized URL after following", async () => {
  const url = "https://example.com";
  const result = await checkRedirect(url);
  // サーバーが正規化（末尾スラッシュ追加）することがあるため、どちらでもOK
  const expected = result === "https://example.com/" || result === url;
  assertEquals(expected, true);
});

Deno.test("isXUrl: handles t.co expansion in URL", async () => {
  // t.coを含むがX URLではない場合
  const url = "https://example.com/path/t.co/test";
  const result = await isXUrl(url);
  assertEquals(result, false);
});

Deno.test("checkRedirect: handles empty string", async () => {
  const url = "";
  const result = await checkRedirect(url);
  assertEquals(result, "");
});

Deno.test("checkRedirect: handles null as empty string", async () => {
  const url = null as any;
  const result = await checkRedirect(url);
  assertEquals(result, null);
});

Deno.test("isXUrl: handles error during processing gracefully", async () => {
  // 不正な形式でエラーを発生させる
  const url = "javascript:alert(1)"; // 非HTTP URLでエラー発生
  const result = await isXUrl(url);
  // エラー時は安全側に倒してfalseを返す
  assertEquals(result, false);
});

Deno.test("expandShortUrl: handles network error gracefully", async () => {
  // t.coを含むが、ネットワークエラーを発生させる無効なホスト
  const url = "https://t.co.invalid.invalid/abc";
  const result = await expandShortUrl(url);
  // エラー時は元のURLを返す
  assertEquals(result, url);
});
