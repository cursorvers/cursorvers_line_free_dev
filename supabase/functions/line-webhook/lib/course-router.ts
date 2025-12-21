// supabase/functions/line-webhook/lib/course-router.ts
// 診断キーワードごとのコース案内ロジック

import type { DiagnosisKeyword } from "./types.ts";
import { DISCORD_INVITE_URL } from "./constants.ts";
import { getRecommendationsForKeyword } from "./note-recommendations.ts";

/**
 * 診断キーワードに対する初回メッセージを生成
 * 関連記事を最大5本表示
 */
export function buildCourseEntryMessage(keyword: DiagnosisKeyword): string {
  const course = getRecommendationsForKeyword(keyword);
  
  const header = `【${keyword}】\n\n`;
  
  // キーワードごとの説明文
  const descriptions: Record<DiagnosisKeyword, string> = {
    "病院AIリスク診断":
      "病院・診療所におけるAI導入のリスクと機会についての情報です。",
    "SaMDスタートアップ診断":
      "医療AI/SaMD開発における規制対応と市場参入戦略についての情報です。",
    "医療データガバナンス診断":
      "医療データの利活用とガバナンス体制についての情報です。",
    "臨床知アセット診断":
      "臨床医としての知識・経験をAI時代にどう活かすかについての情報です。",
    "教育AI導入診断":
      "医学教育・学校教育におけるAI活用についての情報です。",
    "次世代AI実装診断":
      "生成動画AI・フィジカルAI・環境KPIなど、次世代技術についての情報です。",
    "クイック診断":
      "簡易診断で、あなたに最適なAI活用の方向性をお伝えします。",
  };

  const description = descriptions[keyword] ?? "";
  
  let body = description + "\n\n";
  
  // 関連記事を最大5本表示
  if (course && course.articles.length > 0) {
    body += "📚 おすすめ記事：\n\n";
    const maxArticles = Math.min(course.articles.length, 5);
    for (let i = 0; i < maxArticles; i++) {
      const article = course.articles[i];
      body += `${i + 1}. ${article.title}\n`;
      if (article.url) {
        body += `${article.url}\n`;
      }
      if (i < maxArticles - 1) {
        body += "\n";
      }
    }
  }
  
  // Discord 導線
  body += "\n\n---\n💬 さらに深く学ぶなら Discord へ\n" + DISCORD_INVITE_URL;
  
  return header + body;
}

