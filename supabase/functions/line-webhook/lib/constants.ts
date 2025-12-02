// supabase/functions/line-webhook/lib/constants.ts
// 共通定数

// Discord コミュニティリンク
export const DISCORD_INVITE_URL = "https://discord.gg/hmMz3pHH";

// お問い合わせフォーム
export const CONTACT_FORM_URL = "https://script.google.com/macros/s/AKfycbwDP0d67qtifyms2h67LawjNWJi_Lh44faPC7Z4axfS_Gdmjzcd50rcl_kmTYBTysKirQ/exec";

// サービス詳細LP（GitHub Pages）
export const SERVICES_LP_URL = "https://cursorvers.github.io/cursorvers-edu/services.html";

// 診断キーワード
export const COURSE_KEYWORDS = [
  "病院AIリスク診断",
  "SaMDスタートアップ診断",
  "医療データガバナンス診断",
  "臨床知アセット診断",
  "教育AI導入診断",
  "次世代AI実装診断",
] as const;

export type DiagnosisKeyword = (typeof COURSE_KEYWORDS)[number];

