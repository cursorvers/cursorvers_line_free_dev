// supabase/functions/line-webhook/lib/types.ts
// Pocket Defense Tool 共通型定義

// DiagnosisKeyword は constants.ts から再エクスポート
export type { DiagnosisKeyword } from "./constants.ts";

export type InteractionType = "prompt_polisher" | "risk_checker" | "course_entry";

export type RiskCategory =
  | "adv_advertising"      // 医療広告・誇大表現
  | "pii_leakage"          // 個人情報・再識別リスク
  | "clinical_quality"     // 医学的な妥当性
  | "contract_tax"         // 契約・税務
  | "ai_governance";       // ガバナンス・コンプライアンス一般

export type RiskLevel = "safe" | "caution" | "danger";

export interface RiskCheckResult {
  category: RiskCategory;
  level: RiskLevel;
  suggestion: string;  // 1行の修正案
}

export interface NoteArticle {
  id: string;              // 内部ID（slug が分からない場合は任意の英数字）
  title: string;
  url?: string;            // slug が分かったら https://note.com/nice_wren7963/n/xxx を入れる
  tags?: string[];         // タグ（診断フローの関心領域に対応）
}

export interface CourseRecommendation {
  keyword: DiagnosisKeyword;
  articles: NoteArticle[];
}

