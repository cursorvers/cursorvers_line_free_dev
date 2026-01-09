/**
 * generate-sec-brief ユーティリティ関数
 */

/**
 * 週の開始日（月曜日）を計算
 */
export function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 月曜日に調整
  d.setDate(diff);
  const [datePart] = d.toISOString().split("T");
  return datePart ?? "";
}

/**
 * Discordメッセージ分割（2000文字制限対応）
 */
export function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitIndex = remaining.lastIndexOf("\n", maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * ユーザープロンプトを構築
 */
export function buildUserPrompt(
  combinedText: string,
  weekStart: string,
): string {
  return `次のテキストは、ある週に収集されたサイバーセキュリティニュースの日本語本文です。
これらをまとめて読み、以下のJSONスキーマに従って出力してください。

【最重要ルール】
- 「複数の報道」「各種報道」「セキュリティ研究者」等の曖昧な表現は絶対禁止
- 必ず「Proofpoint (2024-11)」「CISA AA24-242A」「CVE-2024-XXXXX」のような具体的ソースを記載
- 入力に情報源がなくても、あなたの知識から該当する実在の報告を引用すること

【JSONスキーマ】
{
  "title": string,              // Discord投稿のタイトル（例: "医療セキュリティ・ブリーフ｜2025-12-02週"）
  "week_start": "${weekStart}", // 週の開始日（この値を使ってください）
  "topics": [                   // 最大4件
    {
      "id": string,             // "t1", "t2" など
      "category": string,       // "remote_work" | "vendor_risk" | "vulnerability" | "network" | "payment" | "privacy" | "other"
      "title": string,          // トピックの見出し
      "source_date": string,    // 元の公開日（例: "2025-11-28"）
      "sources": string[],      // 情報源の配列（例: ["CISA Alert AA25-001", "CVE-2025-1234", "BleepingComputer報道"]）
      "summary": string,        // 具体的な概要（3〜5文）: 攻撃手法、標的、侵入経路、被害規模を含む
      "impact_on_clinics": string, // 診療所・中小病院への影響
      "actions": string[]       // 今から2週間以内にやるべき具体的アクション（2〜4項目）
    }
  ],
  "mindmap": string,            // テキスト形式のマインドマップ（インデントで階層表現）
  "body_markdown": string       // Discordに投稿する完成済みMarkdown（見やすく整形、情報源を明記）
}

【この週のニュース本文】
<<<
${combinedText}
>>>`;
}
