/**
 * LINE Webhook イベントハンドラー
 * handleEventから抽出した各種イベント処理
 */

import { createClient } from "@supabase/supabase-js";
import { anonymizeUserId, createLogger } from "../../_shared/logger.ts";
import {
  CONTACT_FORM_URL,
  DISCORD_INVITE_URL,
  SERVICES_LP_URL,
} from "./constants.ts";
import { replyText } from "./line-api.ts";
import {
  buildBackButtonQuickReply,
  buildDiagnosisQuickReply,
  buildMyMenuQuickReply,
  buildServicesQuickReply,
} from "./quick-reply.ts";
import { clearUserState, getToolMode, setToolMode } from "./user-state.ts";
import { notifyLineEvent } from "../../_shared/n8n-notify.ts";
import { extractErrorMessage } from "../../_shared/error-utils.ts";

const log = createLogger("event-handlers");

// Supabase client
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// =======================
// Follow イベントハンドラー
// =======================

export async function handleFollowEvent(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  log.info("Follow event", { userId: anonymizeUserId(lineUserId) });

  // n8n経由でDiscord通知（非同期・失敗しても続行）
  notifyLineEvent("follow", lineUserId).catch((err) => {
    log.warn("n8n notification failed", {
      error: extractErrorMessage(err),
    });
  });

  // 有料決済済み（認証コード保留中）かどうかを確認
  const { data: pendingPaidMember } = await supabase
    .from("members")
    .select("email, tier, verification_code")
    .not("verification_code", "is", null)
    .in("tier", ["library", "master"])
    .is("line_user_id", null)
    .limit(1);

  const hasPendingPaidMembers = pendingPaidMember &&
    pendingPaidMember.length > 0;

  if (!replyToken) return;

  if (hasPendingPaidMembers) {
    // 有料会員向けメッセージ
    await replyText(
      replyToken,
      [
        "友だち追加ありがとうございます！",
        "",
        "━━━━━━━━━━━━━━━",
        "有料会員の方",
        "━━━━━━━━━━━━━━━",
        "",
        "決済完了メールに記載された",
        "【6桁の認証コード】を入力してください",
        "",
        "例: ABC123",
        "",
        "━━━━━━━━━━━━━━━",
        "無料特典の方",
        "━━━━━━━━━━━━━━━",
        "",
        "メールアドレスを入力してください",
        "例: your@email.com",
      ].join("\n"),
    );
  } else {
    // 通常の無料会員向けメッセージ
    await replyText(
      replyToken,
      [
        "友だち追加ありがとうございます！",
        "",
        "━━━━━━━━━━━━━━━",
        "無料特典（メール登録で即GET）",
        "━━━━━━━━━━━━━━━",
        "",
        "Discordコミュニティ参加",
        "注目のAI記事要約（毎日更新）",
        "医療向けセキュリティレポート",
        "Q&A・相談チャンネル",
        "開発効率化Tips",
        "資料・リンク集",
        "",
        "━━━━━━━━━━━━━━━",
        "",
        "▼ メールアドレスを入力して特典GET",
        "左下のキーボードアイコンをタップ",
        "例: your@email.com",
      ].join("\n"),
    );
  }
}

// =======================
// ツールモードハンドラー
// =======================

export interface ToolModeResult {
  handled: boolean;
  mode?: "polish" | "risk_check" | null;
}

export async function checkToolMode(
  lineUserId: string,
): Promise<"polish" | "risk_check" | null> {
  return await getToolMode(lineUserId);
}

export async function handleToolModeCancel(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  await clearUserState(lineUserId);
  if (replyToken) {
    await replyText(
      replyToken,
      "モードを終了しました。\n\n下のボタンから選んでください。",
      buildServicesQuickReply(),
    );
  }
}

// =======================
// メニューコマンドハンドラー
// =======================

export async function handleTokuten(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  // 既にメール登録済みか確認
  const { data: existingMember } = await supabase
    .from("members")
    .select("email")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (!replyToken) return;

  if (existingMember?.email) {
    // 登録済み → Discord URLを再送 + 特典内容リマインド
    await replyText(
      replyToken,
      [
        "✅ 登録済みです！特典をご活用ください",
        "",
        "━━━━━━━━━━━━━━━",
        "あなたの特典",
        "━━━━━━━━━━━━━━━",
        "",
        "Discordコミュニティ",
        "注目のAI記事要約（毎日更新）",
        "医療向けセキュリティレポート",
        "Q&A・相談チャンネル",
        "開発効率化Tips",
        "資料・リンク集",
        "",
        "▼ Discord参加はこちら",
        DISCORD_INVITE_URL,
      ].join("\n"),
    );
  } else {
    // 未登録 → メール入力を促す
    await replyText(
      replyToken,
      [
        "━━━━━━━━━━━━━━━",
        "無料特典（メール登録で即GET）",
        "━━━━━━━━━━━━━━━",
        "",
        "Discordコミュニティ参加",
        "注目のAI記事要約（毎日更新）",
        "医療向けセキュリティレポート",
        "Q&A・相談チャンネル",
        "開発効率化Tips",
        "資料・リンク集",
        "",
        "━━━━━━━━━━━━━━━",
        "",
        "▼ メールアドレスを入力して特典GET",
        "左下のキーボードアイコンをタップ",
        "例: your@email.com",
      ].join("\n"),
    );
  }
}

export async function handleCommunity(replyToken?: string): Promise<void> {
  if (!replyToken) return;
  await replyText(
    replyToken,
    [
      "Discord コミュニティへの参加は、",
      "メールアドレス登録が必要です。",
      "",
      "「特典」と入力するか、",
      "リッチメニューの「特典GET」をタップしてください。",
    ].join("\n"),
  );
}

export async function handleContact(replyToken?: string): Promise<void> {
  if (!replyToken) return;
  await replyText(
    replyToken,
    [
      "お問い合わせ",
      "",
      "ご質問・ご相談は以下のフォームからお願いします。",
      "",
      "▼ お問い合わせフォーム",
      CONTACT_FORM_URL,
    ].join("\n"),
  );
}

export async function handleServiceList(replyToken?: string): Promise<void> {
  if (!replyToken) return;
  await replyText(
    replyToken,
    [
      "✨ Cursorvers Edu サービス",
      "",
      "【無料】LINE上で使えるツール",
      "・プロンプト整形",
      "・リスクチェック",
      "・AI導入診断",
      "",
      "【有料】Library Member ¥2,980/月",
      "・有料記事の全文閲覧",
      "・検証済みプロンプト集",
      "・Master Class への充当可能",
      "",
      "▼ 詳細・お申込みはこちら",
      SERVICES_LP_URL,
      "",
      "▼ または下のボタンから選択",
    ].join("\n"),
    buildServicesQuickReply(),
  );
}

export async function handleServiceDetail(replyToken?: string): Promise<void> {
  if (!replyToken) return;
  await replyText(
    replyToken,
    [
      "サービス詳細ページ",
      "",
      "各プランの詳細・料金はこちらでご確認いただけます。",
      "",
      "▼ サービス一覧（Web）",
      SERVICES_LP_URL,
    ].join("\n"),
  );
}

export async function handlePromptPolishGuide(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  // プロンプト整形モードを設定
  await setToolMode(lineUserId, "polish");

  if (!replyToken) return;
  await replyText(
    replyToken,
    [
      "プロンプト整形モード",
      "",
      "整形したい文章をそのまま入力してください。",
      "普通にAIに聞くより高品質な回答を引き出せる",
      "構造化プロンプトに変換します。",
      "",
      "左下の「キーボード」アイコンをタップ",
      "",
      "【入力例】",
      "糖尿病患者の食事指導について教えて",
    ].join("\n"),
    buildBackButtonQuickReply(),
  );
}

export async function handleRiskCheckGuide(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  // リスクチェックモードを設定
  await setToolMode(lineUserId, "risk_check");

  if (!replyToken) return;
  await replyText(
    replyToken,
    [
      "リスクチェックモード",
      "",
      "チェックしたい文章をそのまま入力してください。",
      "医療広告・個人情報・医学的妥当性などの",
      "リスクを分析します。",
      "",
      "左下の「キーボード」アイコンをタップ",
      "",
      "【入力例】",
      "この治療法で必ず治ります",
    ].join("\n"),
    buildBackButtonQuickReply(),
  );
}

export async function handleMyPage(replyToken?: string): Promise<void> {
  if (!replyToken) return;
  await replyText(
    replyToken,
    [
      "📱 マイメニュー",
      "",
      "ご希望の操作を選んでください ↓",
    ].join("\n"),
    buildMyMenuQuickReply(),
  );
}

export async function handleHelp(replyToken?: string): Promise<void> {
  if (!replyToken) return;
  const helpMessage = [
    "Pocket Defense Tool",
    "",
    "■ プロンプト整形",
    "「洗練:」の後に文章を入力",
    "",
    "■ リスクチェック",
    "「check:」の後に文章を入力",
    "",
    "■ AI導入情報・お問い合わせ",
    "下のボタンから選んでください ↓",
  ].join("\n");

  await replyText(replyToken, helpMessage, buildDiagnosisQuickReply());
}

// =======================
// コマンドマッチャー
// =======================

export type MenuCommand =
  | "tokuten"
  | "community"
  | "contact"
  | "service_list"
  | "service_detail"
  | "prompt_polish_guide"
  | "risk_check_guide"
  | "my_page"
  | null;

export function matchMenuCommand(text: string): MenuCommand {
  const trimmed = text.trim();

  if (trimmed === "特典" || trimmed === "特典GET") return "tokuten";
  if (trimmed === "コミュニティ") return "community";
  if (trimmed === "お問い合わせ" || trimmed === "問い合わせ") return "contact";
  if (trimmed === "サービス一覧") return "service_list";
  if (trimmed === "サービス詳細を見る") return "service_detail";
  if (trimmed === "プロンプト整形の使い方") return "prompt_polish_guide";
  if (trimmed === "リスクチェックの使い方") return "risk_check_guide";
  if (
    trimmed === "マイページ" || trimmed === "メニュー" ||
    trimmed === "マイメニュー"
  ) return "my_page";

  return null;
}

export async function dispatchMenuCommand(
  command: MenuCommand,
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  switch (command) {
    case "tokuten":
      await handleTokuten(lineUserId, replyToken);
      break;
    case "community":
      await handleCommunity(replyToken);
      break;
    case "contact":
      await handleContact(replyToken);
      break;
    case "service_list":
      await handleServiceList(replyToken);
      break;
    case "service_detail":
      await handleServiceDetail(replyToken);
      break;
    case "prompt_polish_guide":
      await handlePromptPolishGuide(lineUserId, replyToken);
      break;
    case "risk_check_guide":
      await handleRiskCheckGuide(lineUserId, replyToken);
      break;
    case "my_page":
      await handleMyPage(replyToken);
      break;
  }
}
