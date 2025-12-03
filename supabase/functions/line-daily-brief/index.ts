// supabase/functions/line-daily-brief/index.ts
// 毎日1回、LINE公式アカウントからカードを一斉配信する Edge Function

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================
// 型定義
// ============================================

type LineCardTheme =
  | "ai_gov"
  | "tax"
  | "law"
  | "biz"
  | "career"
  | "asset"
  | "general";

interface LineCard {
  id: string;
  body: string;
  theme: LineCardTheme;
  source_path: string;
  source_line: number;
  status: string;
  times_used: number;
  last_used_at: string | null;
}

interface ThemeStats {
  theme: LineCardTheme;
  total_used: number;
  card_count: number;
}

// ============================================
// 環境変数
// ============================================

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const CRON_SECRET = Deno.env.get("LINE_DAILY_BRIEF_CRON_SECRET");

// ============================================
// カード選択ロジック
// ============================================

/**
 * テーマ別の配信統計を取得
 */
async function getThemeStats(supabase: SupabaseClient): Promise<ThemeStats[]> {
  const { data, error } = await supabase
    .from("line_cards")
    .select("theme, times_used")
    .eq("status", "ready");

  if (error) {
    console.error("テーマ統計の取得エラー:", error);
    throw error;
  }

  // テーマ別に集計
  const statsMap = new Map<LineCardTheme, { total_used: number; card_count: number }>();

  for (const row of data || []) {
    const theme = row.theme as LineCardTheme;
    const current = statsMap.get(theme) || { total_used: 0, card_count: 0 };
    current.total_used += row.times_used;
    current.card_count += 1;
    statsMap.set(theme, current);
  }

  return Array.from(statsMap.entries()).map(([theme, stats]) => ({
    theme,
    ...stats,
  }));
}

/**
 * 配信するカードを1件選択
 * - テーマの偏りが少なくなるように選ぶ
 * - 同じテーマ内では times_used が最小のものを優先
 */
async function selectCardForBroadcast(
  supabase: SupabaseClient
): Promise<LineCard | null> {
  // テーマ別統計を取得
  const themeStats = await getThemeStats(supabase);

  if (themeStats.length === 0) {
    console.log("配信可能なカードがありません");
    return null;
  }

  // total_used / card_count が最小のテーマを選ぶ（平均配信回数が少ないテーマ）
  // card_count が 0 の場合は考慮しない（上で除外済み）
  themeStats.sort((a, b) => {
    const avgA = a.card_count > 0 ? a.total_used / a.card_count : Infinity;
    const avgB = b.card_count > 0 ? b.total_used / b.card_count : Infinity;
    return avgA - avgB;
  });

  // 最も配信回数が少ないテーマのトップ3から選ぶ（バリエーションのため）
  const candidateThemes = themeStats.slice(0, Math.min(3, themeStats.length));
  const selectedTheme =
    candidateThemes[Math.floor(Math.random() * candidateThemes.length)].theme;

  console.log(`選択されたテーマ: ${selectedTheme}`);

  // そのテーマの中で times_used が最小のカードを取得
  const { data: cards, error } = await supabase
    .from("line_cards")
    .select("*")
    .eq("status", "ready")
    .eq("theme", selectedTheme)
    .order("times_used", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    console.error("カード取得エラー:", error);
    throw error;
  }

  if (!cards || cards.length === 0) {
    console.log(`テーマ ${selectedTheme} に配信可能なカードがありません`);
    return null;
  }

  // 最小 times_used のカードの中からランダムに選択
  const minTimesUsed = cards[0].times_used;
  const candidateCards = cards.filter((c) => c.times_used === minTimesUsed);
  const selectedCard =
    candidateCards[Math.floor(Math.random() * candidateCards.length)];

  console.log(
    `選択されたカード: ${selectedCard.id} (times_used: ${selectedCard.times_used})`
  );

  return selectedCard as LineCard;
}

// ============================================
// LINE配信ロジック
// ============================================

/**
 * カード本文をLINE用に整形
 */
function formatCardForLine(card: LineCard): string {
  const lines = card.body.split("\n").filter((l) => l.trim().length > 0);

  // 行数が多すぎる場合は最初の5行に制限
  const limitedLines = lines.slice(0, 5);

  // テーマに応じた絵文字プレフィックス
  const themeEmoji: Record<LineCardTheme, string> = {
    ai_gov: "🤖",
    tax: "💰",
    law: "⚖️",
    biz: "📈",
    career: "👨‍⚕️",
    asset: "💎",
    general: "💡",
  };

  const emoji = themeEmoji[card.theme] || "💡";

  // メッセージを組み立て
  let message = `${emoji} 今日の一言\n\n`;
  message += limitedLines.join("\n");

  // 文字数制限（LINEは5000文字まで、余裕を持って4000文字に）
  if (message.length > 4000) {
    message = message.substring(0, 3997) + "...";
  }

  return message;
}

/**
 * LINE Messaging API でブロードキャスト配信
 */
async function broadcastMessage(message: string): Promise<boolean> {
  if (!LINE_CHANNEL_ACCESS_TOKEN) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
    return false;
  }

  const response = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messages: [
        {
          type: "text",
          text: message,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LINE API エラー:", response.status, errorText);
    return false;
  }

  console.log("LINE 配信成功");
  return true;
}

// ============================================
// 配信後の更新
// ============================================

/**
 * カードの配信状態を更新
 */
async function updateCardAfterBroadcast(
  supabase: SupabaseClient,
  cardId: string
): Promise<void> {
  const now = new Date().toISOString();

  // カードを更新
  const { error: updateError } = await supabase
    .from("line_cards")
    .update({
      times_used: supabase.rpc("increment_times_used", { card_id: cardId }),
      last_used_at: now,
      status: "used",
    })
    .eq("id", cardId);

  // times_used のインクリメントは RPC がなければ直接 SQL で
  if (updateError) {
    // RPC がない場合のフォールバック
    const { data: card } = await supabase
      .from("line_cards")
      .select("times_used")
      .eq("id", cardId)
      .single();

    if (card) {
      await supabase
        .from("line_cards")
        .update({
          times_used: card.times_used + 1,
          last_used_at: now,
          status: "used",
        })
        .eq("id", cardId);
    }
  }

  // 配信履歴を記録
  await supabase.from("line_card_broadcasts").insert({
    card_id: cardId,
    sent_at: now,
    success: true,
  });

  console.log(`カード ${cardId} を更新しました`);
}

// ============================================
// メインハンドラ
// ============================================

serve(async (req: Request): Promise<Response> => {
  // CORSプリフライト対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
      },
    });
  }

  // POSTのみ許可
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 認証: X-Cron-Secret ヘッダーをチェック
  if (CRON_SECRET) {
    const providedSecret = req.headers.get("X-Cron-Secret");
    if (providedSecret !== CRON_SECRET) {
      console.error("認証エラー: 無効な X-Cron-Secret");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  console.log("═══════════════════════════════════════════");
  console.log("  LINE Daily Brief - 配信開始");
  console.log("═══════════════════════════════════════════");

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. カードを選択
    const card = await selectCardForBroadcast(supabase);

    if (!card) {
      console.log("配信するカードがありません");
      return new Response(
        JSON.stringify({
          status: "no_card",
          message: "配信可能なカードがありません",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. メッセージを整形
    const message = formatCardForLine(card);
    console.log(`配信メッセージ (${message.length}文字):\n${message.substring(0, 100)}...`);

    // 3. LINE配信
    const success = await broadcastMessage(message);

    if (!success) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "LINE配信に失敗しました",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. カードの状態を更新
    await updateCardAfterBroadcast(supabase, card.id);

    console.log("═══════════════════════════════════════════");
    console.log("  配信完了！");
    console.log("═══════════════════════════════════════════");

    return new Response(
      JSON.stringify({
        status: "success",
        card_id: card.id,
        theme: card.theme,
        message_length: message.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("配信エラー:", err);
    return new Response(
      JSON.stringify({
        status: "error",
        message: String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

