/**
 * note-recommendations テスト
 */
import { assertEquals } from "std-assert";
import {
  COURSE_RECOMMENDATIONS,
  getAllArticles,
  getArticleById,
  getArticlesByIds,
  getArticlesByTag,
  getFirstArticle,
  getRecommendationsForKeyword,
} from "./note-recommendations.ts";

Deno.test("note-recommendations - COURSE_RECOMMENDATIONS structure", async (t) => {
  await t.step("has 6 courses", () => {
    assertEquals(COURSE_RECOMMENDATIONS.length, 6);
  });

  await t.step("all courses have required fields", () => {
    for (const course of COURSE_RECOMMENDATIONS) {
      assertEquals(typeof course.keyword, "string");
      assertEquals(course.keyword.length > 0, true);
      assertEquals(Array.isArray(course.articles), true);
      assertEquals(course.articles.length > 0, true);
    }
  });

  await t.step("all articles have required fields", () => {
    for (const course of COURSE_RECOMMENDATIONS) {
      for (const article of course.articles) {
        assertEquals(typeof article.id, "string");
        assertEquals(article.id.length > 0, true);
        assertEquals(typeof article.title, "string");
        assertEquals(article.title.length > 0, true);
        assertEquals(typeof article.url, "string");
        assertEquals(article.url.startsWith("https://"), true);
      }
    }
  });

  await t.step("all articles have tags array", () => {
    for (const course of COURSE_RECOMMENDATIONS) {
      for (const article of course.articles) {
        assertEquals(Array.isArray(article.tags), true);
        assertEquals(article.tags!.length > 0, true);
      }
    }
  });
});

Deno.test("note-recommendations - getRecommendationsForKeyword", async (t) => {
  await t.step("returns course for 病院AIリスク診断", () => {
    const result = getRecommendationsForKeyword("病院AIリスク診断");
    assertEquals(result !== null, true);
    assertEquals(result!.keyword, "病院AIリスク診断");
  });

  await t.step("returns course for SaMDスタートアップ診断", () => {
    const result = getRecommendationsForKeyword("SaMDスタートアップ診断");
    assertEquals(result !== null, true);
    assertEquals(result!.keyword, "SaMDスタートアップ診断");
  });

  await t.step("returns course for 医療データガバナンス診断", () => {
    const result = getRecommendationsForKeyword("医療データガバナンス診断");
    assertEquals(result !== null, true);
    assertEquals(result!.keyword, "医療データガバナンス診断");
  });

  await t.step("returns null for unknown keyword", () => {
    const result = getRecommendationsForKeyword("存在しないキーワード");
    assertEquals(result, null);
  });

  await t.step("returns null for empty string", () => {
    const result = getRecommendationsForKeyword("");
    assertEquals(result, null);
  });
});

Deno.test("note-recommendations - getFirstArticle", async (t) => {
  await t.step("returns first article for valid keyword", () => {
    const article = getFirstArticle("病院AIリスク診断");
    assertEquals(article !== null, true);
    assertEquals(article!.id, "clinic_roi_2025");
  });

  await t.step("returns first article for SaMD", () => {
    const article = getFirstArticle("SaMDスタートアップ診断");
    assertEquals(article !== null, true);
    assertEquals(article!.id, "samd_guide");
  });

  await t.step("returns null for unknown keyword", () => {
    const article = getFirstArticle("存在しない");
    assertEquals(article, null);
  });
});

Deno.test("note-recommendations - getArticleById", async (t) => {
  await t.step("returns article for valid ID", () => {
    const article = getArticleById("clinic_roi_2025");
    assertEquals(article !== null, true);
    assertEquals(article!.title.includes("診療所"), true);
  });

  await t.step("returns article for samd_guide", () => {
    const article = getArticleById("samd_guide");
    assertEquals(article !== null, true);
    assertEquals(article!.title.includes("SaMD"), true);
  });

  await t.step("returns null for unknown ID", () => {
    const article = getArticleById("non_existent_id");
    assertEquals(article, null);
  });

  await t.step("returns null for empty string", () => {
    const article = getArticleById("");
    assertEquals(article, null);
  });
});

Deno.test("note-recommendations - getArticlesByIds", async (t) => {
  await t.step("returns multiple articles", () => {
    const articles = getArticlesByIds(["clinic_roi_2025", "samd_guide"]);
    assertEquals(articles.length, 2);
  });

  await t.step("skips non-existent IDs", () => {
    const articles = getArticlesByIds([
      "clinic_roi_2025",
      "non_existent",
      "samd_guide",
    ]);
    assertEquals(articles.length, 2);
  });

  await t.step("returns empty array for empty input", () => {
    const articles = getArticlesByIds([]);
    assertEquals(articles.length, 0);
  });

  await t.step("returns empty array for all invalid IDs", () => {
    const articles = getArticlesByIds(["invalid1", "invalid2"]);
    assertEquals(articles.length, 0);
  });
});

Deno.test("note-recommendations - getArticlesByTag", async (t) => {
  await t.step("returns articles matching tag", () => {
    const articles = getArticlesByTag("コスト・投資対効果");
    assertEquals(articles.length > 0, true);
    // All returned articles should have the tag
    for (const article of articles) {
      assertEquals(article.tags!.includes("コスト・投資対効果"), true);
    }
  });

  await t.step("respects limit parameter", () => {
    const articles = getArticlesByTag("コスト・投資対効果", 2);
    assertEquals(articles.length <= 2, true);
  });

  await t.step("returns empty array for non-existent tag", () => {
    const articles = getArticlesByTag("存在しないタグ");
    assertEquals(articles.length, 0);
  });

  await t.step("returns empty array for empty tag", () => {
    const articles = getArticlesByTag("");
    assertEquals(articles.length, 0);
  });

  await t.step("returns empty array for whitespace tag", () => {
    const articles = getArticlesByTag("   ");
    assertEquals(articles.length, 0);
  });

  await t.step("returns empty array for invalid limit", () => {
    const articles = getArticlesByTag("コスト・投資対効果", 0);
    assertEquals(articles.length, 0);
  });

  await t.step("returns empty array for negative limit", () => {
    const articles = getArticlesByTag("コスト・投資対効果", -1);
    assertEquals(articles.length, 0);
  });

  await t.step("default limit is 3", () => {
    // Find a tag with many articles
    const articles = getArticlesByTag("業務効率化・省力化");
    assertEquals(articles.length <= 3, true);
  });
});

Deno.test("note-recommendations - getAllArticles", async (t) => {
  await t.step("returns all articles", () => {
    const articles = getAllArticles();
    assertEquals(articles.length > 0, true);
  });

  await t.step("removes duplicates", () => {
    const articles = getAllArticles();
    const ids = articles.map((a) => a.id);
    const uniqueIds = [...new Set(ids)];
    assertEquals(ids.length, uniqueIds.length);
  });

  await t.step("all articles have valid structure", () => {
    const articles = getAllArticles();
    for (const article of articles) {
      assertEquals(typeof article.id, "string");
      assertEquals(typeof article.title, "string");
      assertEquals(typeof article.url, "string");
      assertEquals(article.url.startsWith("https://note.com/"), true);
    }
  });
});
