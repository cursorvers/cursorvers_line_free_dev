// supabase/functions/line-webhook/lib/constants.ts
// 共通定数
// 環境変数で上書き可能（未設定時はフォールバック値を使用）

// Discord コミュニティリンク
export const DISCORD_INVITE_URL = Deno.env.get("DISCORD_INVITE_URL") ??
  "https://discord.gg/TkmmX5Z4vx";

// お問い合わせフォーム
export const CONTACT_FORM_URL = Deno.env.get("CONTACT_FORM_URL") ??
  "https://script.google.com/macros/s/AKfycbwDP0d67qtifyms2h67LawjNWJi_Lh44faPC7Z4axfS_Gdmjzcd50rcl_kmTYBTysKirQ/exec";

// サービス詳細LP（GitHub Pages）
export const SERVICES_LP_URL = Deno.env.get("SERVICES_LP_URL") ??
  "https://cursorvers.github.io/cursorvers-edu/services.html";

// 診断キーワード
export const COURSE_KEYWORDS = [
  "病院AIリスク診断",
  "SaMDスタートアップ診断",
  "医療データガバナンス診断",
  "臨床知アセット診断",
  "教育AI導入診断",
  "次世代AI実装診断",
  "クイック診断",
] as const;

export type DiagnosisKeyword = (typeof COURSE_KEYWORDS)[number];
