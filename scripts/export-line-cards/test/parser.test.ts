// scripts/export-line-cards/test/parser.test.ts
// パーサーのユニットテスト

import { describe, it, expect } from "vitest";
import {
  extractTags,
  determineTheme,
  cleanLineContent,
  generateContentHash,
} from "../src/parser.js";

describe("extractTags", () => {
  it("タグを正しく抽出する", () => {
    const text = "これはテストです #cv_line #ai_gov";
    const tags = extractTags(text);
    expect(tags).toEqual(["#cv_line", "#ai_gov"]);
  });

  it("タグがない場合は空配列を返す", () => {
    const text = "タグのないテキスト";
    const tags = extractTags(text);
    expect(tags).toEqual([]);
  });

  it("アンダースコア付きタグも抽出する", () => {
    const text = "#ai_gov #cv_line #career";
    const tags = extractTags(text);
    expect(tags).toEqual(["#ai_gov", "#cv_line", "#career"]);
  });
});

describe("determineTheme", () => {
  it("ai_gov タグを正しく判定する", () => {
    const theme = determineTheme(["#cv_line", "#ai_gov"]);
    expect(theme).toBe("ai_gov");
  });

  it("tax タグを正しく判定する", () => {
    const theme = determineTheme(["#cv_line", "#tax"]);
    expect(theme).toBe("tax");
  });

  it("複数テーマタグがある場合は最初のものを使う", () => {
    const theme = determineTheme(["#cv_line", "#law", "#biz"]);
    expect(theme).toBe("law");
  });

  it("テーマタグがない場合は general を返す", () => {
    const theme = determineTheme(["#cv_line"]);
    expect(theme).toBe("general");
  });

  it("空配列の場合は general を返す", () => {
    const theme = determineTheme([]);
    expect(theme).toBe("general");
  });
});

describe("cleanLineContent", () => {
  it("タグを削除する", () => {
    const result = cleanLineContent("これはテストです #cv_line #ai_gov");
    expect(result).toBe("これはテストです");
  });

  it("リストマーカーを削除する", () => {
    const result = cleanLineContent("- これはリストです #cv_line");
    expect(result).toBe("これはリストです");
  });

  it("番号付きリストも削除する", () => {
    const result = cleanLineContent("1. 番号付きリスト #cv_line");
    expect(result).toBe("番号付きリスト");
  });

  it("余分な空白を整理する", () => {
    const result = cleanLineContent("  テスト   テスト  #cv_line  ");
    expect(result).toBe("テスト テスト");
  });

  it("アスタリスクマーカーも削除する", () => {
    const result = cleanLineContent("* アスタリスク #cv_line");
    expect(result).toBe("アスタリスク");
  });
});

describe("generateContentHash", () => {
  it("同じ入力で同じハッシュを生成する", () => {
    const hash1 = generateContentHash("path/to/file.md", 10, "テスト本文");
    const hash2 = generateContentHash("path/to/file.md", 10, "テスト本文");
    expect(hash1).toBe(hash2);
  });

  it("異なる入力で異なるハッシュを生成する", () => {
    const hash1 = generateContentHash("path/to/file.md", 10, "テスト本文");
    const hash2 = generateContentHash("path/to/file.md", 11, "テスト本文");
    expect(hash1).not.toBe(hash2);
  });

  it("32文字のハッシュを生成する", () => {
    const hash = generateContentHash("path/to/file.md", 10, "テスト本文");
    expect(hash.length).toBe(32);
  });
});

