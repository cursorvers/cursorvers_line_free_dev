// supabase/functions/line-webhook/lib/course-router.ts
// 診断キーワードごとのコース案内ロジック

import type { DiagnosisKeyword, NoteArticle } from "./types.ts";
import { getFirstArticle, getRecommendationsForKeyword } from "./note-recommendations.ts";

/**
 * 診断キーワードに対する初回メッセージを生成
 */
export function buildCourseEntryMessage(keyword: DiagnosisKeyword): string {
  const firstArticle = getFirstArticle(keyword);
  const course = getRecommendationsForKeyword(keyword);
  
  const header = `【${keyword}】へようこそ！\n\n`;
  
  // キーワードごとの説明文
  const descriptions: Record<DiagnosisKeyword, string> = {
    "病院AIリスク診断": 
      "病院・診療所におけるAI導入のリスクと機会を診断します。\n経営者・CIO向けの実践的なガイダンスをお届けします。",
    "SaMDスタートアップ診断":
      "医療AI/SaMD開発における規制対応と市場参入戦略を診断します。\nスタートアップ・プロダクトマネージャー向けの実践ガイドです。",
    "医療データガバナンス診断":
      "医療データの利活用とガバナンス体制を診断します。\nPHR事業者・医療情報システム会社向けの設計指針をお届けします。",
    "臨床知アセット診断":
      "臨床医としての知識・経験をどうAI時代に活かすかを診断します。\n個人のキャリアと思考を守るためのフレームワークです。",
    "教育AI導入診断":
      "医学教育・学校教育におけるAI活用の現状と課題を診断します。\n教育者向けの導入ロードマップをお届けします。",
    "次世代AI実装診断":
      "生成動画AI・フィジカルAI・環境KPIなど、次世代技術への対応を診断します。\n先進派向けの実装戦略ガイドです。",
  };

  const description = descriptions[keyword] ?? "";
  
  let body = description + "\n\n";
  
  // まず読むべき1本を案内
  if (firstArticle) {
    body += "📚 まず読むべき1本：\n";
    body += `「${firstArticle.title}」\n`;
    if (firstArticle.url) {
      body += `${firstArticle.url}\n`;
    }
    body += "\n";
  }
  
  // 関連記事数を案内
  if (course && course.articles.length > 1) {
    body += `📖 関連記事：全${course.articles.length}本\n`;
    body += "詳しくは note.com/nice_wren7963 をご覧ください。\n\n";
  }
  
  const footer = [
    "---",
    "💡 今後、このキーワードに関連する情報をお届けします。",
    "",
    "▼ 他の診断も試してみてください：",
    "・病院AIリスク診断",
    "・SaMDスタートアップ診断",
    "・医療データガバナンス診断",
    "・臨床知アセット診断",
    "・教育AI導入診断",
    "・次世代AI実装診断",
  ].join("\n");
  
  return header + body + footer;
}

/**
 * 診断キーワードに関連する記事一覧メッセージを生成（将来用）
 */
export function buildArticleListMessage(keyword: DiagnosisKeyword): string | null {
  const course = getRecommendationsForKeyword(keyword);
  if (!course) return null;
  
  let message = `【${keyword}】関連記事一覧：\n\n`;
  
  for (let i = 0; i < Math.min(course.articles.length, 5); i++) {
    const article = course.articles[i];
    message += `${i + 1}. ${article.title}\n`;
    if (article.url) {
      message += `   ${article.url}\n`;
    }
    message += "\n";
  }
  
  if (course.articles.length > 5) {
    message += `...他${course.articles.length - 5}本\n`;
  }
  
  message += "\n詳しくは note.com/nice_wren7963 をご覧ください。";
  
  return message;
}

