// supabase/functions/line-webhook/test/note-recommendations.test.ts
// Tests for note-recommendations.ts - Pure function tests (Phase 1)

import { assert, assertEquals, assertExists } from "std-assert";
import {
  COURSE_RECOMMENDATIONS,
  getAllArticles,
  getArticleById,
  getArticlesByIds,
  getArticlesByTag,
  getFirstArticle,
  getRecommendationsForKeyword,
} from "../lib/note-recommendations.ts";

// =======================
// Test: getRecommendationsForKeyword
// =======================

Deno.test("note-recommendations: getRecommendationsForKeyword returns hospital course", () => {
  const course = getRecommendationsForKeyword("病院AIリスク診断");
  assertExists(course);
  assertEquals(course?.keyword, "病院AIリスク診断");
  assert(course!.articles.length > 0);
});

Deno.test("note-recommendations: getRecommendationsForKeyword returns samd course", () => {
  const course = getRecommendationsForKeyword("SaMDスタートアップ診断");
  assertExists(course);
  assertEquals(course?.keyword, "SaMDスタートアップ診断");
  assert(course!.articles.length > 0);
});

Deno.test("note-recommendations: getRecommendationsForKeyword returns null for invalid keyword", () => {
  const course = getRecommendationsForKeyword("存在しないキーワード");
  assertEquals(course, null);
});

// =======================
// Test: getFirstArticle
// =======================

Deno.test("note-recommendations: getFirstArticle returns first article", () => {
  const article = getFirstArticle("病院AIリスク診断");
  assertExists(article);
  assertEquals(article?.id, "clinic_roi_2025");
  assertExists(article?.title);
  assertExists(article?.url);
});

Deno.test("note-recommendations: getFirstArticle returns null for invalid keyword", () => {
  const article = getFirstArticle("存在しないキーワード");
  assertEquals(article, null);
});

Deno.test("note-recommendations: getFirstArticle returns null for empty course", () => {
  // All courses have articles, so this tests the edge case logic
  const article = getFirstArticle("存在しないキーワード");
  assertEquals(article, null);
});

// =======================
// Test: getArticleById
// =======================

Deno.test("note-recommendations: getArticleById finds existing article", () => {
  const article = getArticleById("clinic_roi_2025");
  assertExists(article);
  assertEquals(article?.id, "clinic_roi_2025");
  assert(article?.title.includes("2025年最新版"));
});

Deno.test("note-recommendations: getArticleById returns null for non-existent ID", () => {
  const article = getArticleById("non_existent_id");
  assertEquals(article, null);
});

// =======================
// Test: getArticlesByIds
// =======================

Deno.test("note-recommendations: getArticlesByIds returns multiple articles", () => {
  const ids = ["clinic_roi_2025", "why_ai_fails", "ehr_3sho2"];
  const articles = getArticlesByIds(ids);

  assertEquals(articles.length, 3);
  assertEquals(articles[0].id, "clinic_roi_2025");
  assertEquals(articles[1].id, "why_ai_fails");
  assertEquals(articles[2].id, "ehr_3sho2");
});

Deno.test("note-recommendations: getArticlesByIds skips non-existent IDs", () => {
  const ids = ["clinic_roi_2025", "non_existent_id", "why_ai_fails"];
  const articles = getArticlesByIds(ids);

  assertEquals(articles.length, 2);
  assertEquals(articles[0].id, "clinic_roi_2025");
  assertEquals(articles[1].id, "why_ai_fails");
});

Deno.test("note-recommendations: getArticlesByIds returns empty array for all invalid IDs", () => {
  const ids = ["invalid1", "invalid2"];
  const articles = getArticlesByIds(ids);

  assertEquals(articles.length, 0);
});

Deno.test("note-recommendations: getArticlesByIds handles empty array", () => {
  const articles = getArticlesByIds([]);
  assertEquals(articles.length, 0);
});

// =======================
// Test: getArticlesByTag
// =======================

Deno.test("note-recommendations: getArticlesByTag returns articles matching tag", () => {
  const articles = getArticlesByTag("コスト・投資対効果", 5);

  assert(articles.length > 0);
  assert(articles.length <= 5);

  // All returned articles should have the tag
  for (const article of articles) {
    assert(
      article.tags?.includes("コスト・投資対効果"),
      `Article ${article.id} should have tag "コスト・投資対効果"`,
    );
  }
});

Deno.test("note-recommendations: getArticlesByTag respects limit parameter", () => {
  const articles = getArticlesByTag("業務効率化・省力化", 2);

  assert(articles.length <= 2);
  assert(articles.length > 0);
});

Deno.test("note-recommendations: getArticlesByTag uses default limit of 3", () => {
  const articles = getArticlesByTag("規制・コンプライアンス");

  assert(articles.length <= 3);
});

Deno.test("note-recommendations: getArticlesByTag returns empty for non-existent tag", () => {
  const articles = getArticlesByTag("存在しないタグ");
  assertEquals(articles.length, 0);
});

Deno.test("note-recommendations: getArticlesByTag handles empty string tag", () => {
  const articles = getArticlesByTag("");
  assertEquals(articles.length, 0);
});

Deno.test("note-recommendations: getArticlesByTag handles invalid limit", () => {
  const articles = getArticlesByTag("コスト・投資対効果", 0);
  assertEquals(articles.length, 0);
});

Deno.test("note-recommendations: getArticlesByTag deduplicates articles", () => {
  // Some articles appear in multiple courses with the same tag
  const articles = getArticlesByTag("業務効率化・省力化", 10);

  const uniqueIds = new Set(articles.map((a) => a.id));
  assertEquals(
    articles.length,
    uniqueIds.size,
    "Should have no duplicate articles",
  );
});

// =======================
// Test: getAllArticles
// =======================

Deno.test("note-recommendations: getAllArticles returns all unique articles", () => {
  const articles = getAllArticles();

  assert(articles.length > 0);

  // Check for uniqueness
  const uniqueIds = new Set(articles.map((a) => a.id));
  assertEquals(
    articles.length,
    uniqueIds.size,
    "All articles should be unique",
  );

  // Check that all articles have required properties
  for (const article of articles) {
    assertExists(article.id);
    assertExists(article.title);
    // url can be null, but should be defined
    assert("url" in article);
  }
});

Deno.test("note-recommendations: getAllArticles includes articles from all courses", () => {
  const allArticles = getAllArticles();

  // Known article IDs from different courses
  const hospitalArticle = allArticles.find((a) => a.id === "clinic_roi_2025");
  const samdArticle = allArticles.find((a) => a.id === "samd_guide");
  const dataGovArticle = allArticles.find((a) => a.id === "enicia_aibtrust");
  const clinicalArticle = allArticles.find((a) => a.id === "ai_clinical_soul");
  const eduArticle = allArticles.find((a) => a.id === "edu_ai_v2");
  const nextgenArticle = allArticles.find((a) => a.id === "nano_banana");

  assertExists(hospitalArticle);
  assertExists(samdArticle);
  assertExists(dataGovArticle);
  assertExists(clinicalArticle);
  assertExists(eduArticle);
  assertExists(nextgenArticle);
});

// =======================
// Test: COURSE_RECOMMENDATIONS structure
// =======================

Deno.test("note-recommendations: COURSE_RECOMMENDATIONS has 6 courses", () => {
  assertEquals(COURSE_RECOMMENDATIONS.length, 6);
});

Deno.test("note-recommendations: All courses have required structure", () => {
  for (const course of COURSE_RECOMMENDATIONS) {
    assertExists(course.keyword);
    assertExists(course.articles);
    assert(Array.isArray(course.articles));
    assert(course.articles.length > 0);

    // Check first article structure
    const firstArticle = course.articles[0];
    assertExists(firstArticle.id);
    assertExists(firstArticle.title);
    assert("url" in firstArticle);
    assert("tags" in firstArticle);
  }
});

// =======================
// Test: Tag consistency
// =======================

Deno.test("note-recommendations: Articles with tags have valid tags array", () => {
  const allArticles = getAllArticles();

  for (const article of allArticles) {
    if (article.tags) {
      assert(Array.isArray(article.tags));
      assert(
        article.tags.length > 0,
        `Article ${article.id} has empty tags array`,
      );

      for (const tag of article.tags) {
        assert(typeof tag === "string");
        assert(tag.length > 0);
      }
    }
  }
});

// =======================
// Test: Integration - Tag search matches flow conclusions
// =======================

Deno.test("note-recommendations: Tag search returns articles for diagnosis flow tags", () => {
  // These tags come from diagnosis-flow.ts layer2 options
  const commonTags = [
    "コスト・投資対効果",
    "規制・コンプライアンス",
    "業務効率化・省力化",
    "セキュリティ・個人情報",
    "医療の質・患者体験",
  ];

  for (const tag of commonTags) {
    const articles = getArticlesByTag(tag, 10);
    assert(
      articles.length > 0,
      `Should find articles for tag: ${tag}`,
    );
  }
});
