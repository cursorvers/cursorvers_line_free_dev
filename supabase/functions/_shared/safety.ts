const FOOTER_TEXT =
  "※本メッセージは一般的な情報提供であり、診断・治療ではありません。緊急時は必ず医療機関や消防（119）へ連絡してください。";

export function withSafetyFooter(text: string): string {
  if (!text) return FOOTER_TEXT;
  if (text.includes(FOOTER_TEXT)) return text;
  return `${text}\n\n${FOOTER_TEXT}`;
}

export { FOOTER_TEXT as SAFETY_FOOTER };
