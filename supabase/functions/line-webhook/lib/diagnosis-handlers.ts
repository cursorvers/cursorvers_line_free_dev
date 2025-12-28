/**
 * 診断フロー ハンドラー
 * 3層診断フローの処理を担当
 */

import { extractErrorMessage } from "../../_shared/error-utils.ts";
import { anonymizeUserId, createLogger } from "../../_shared/logger.ts";
import {
  COURSE_KEYWORDS,
  type DiagnosisKeyword,
  DISCORD_INVITE_URL,
} from "./constants.ts";
import { type QuickReply, replyText } from "./line-api.ts";
import { buildDiagnosisQuickReply } from "./quick-reply.ts";
import {
  clearDiagnosisState,
  getDiagnosisState,
  updateDiagnosisState,
} from "./user-state.ts";
import {
  buildConclusionMessage,
  buildDiagnosisStartMessage,
  buildQuestionMessage,
  type DiagnosisState,
  getConclusion,
  getFlowForKeyword,
  getNextQuestion,
  getTotalQuestions,
  isValidAnswer,
} from "./diagnosis-flow.ts";
import { getArticlesByIds, getArticlesByTag } from "./note-recommendations.ts";
import { buildCourseEntryMessage } from "./course-router.ts";

const log = createLogger("diagnosis-handlers");

// =======================
// ユーティリティ
// =======================

function normalizeKeyword(raw: string): string {
  return raw.replace(/　/g, " ").trim();
}

export function detectCourseKeyword(text: string): DiagnosisKeyword | null {
  const normalized = normalizeKeyword(text);
  const match = COURSE_KEYWORDS.find((kw) => kw === normalized);
  return match ?? null;
}

// =======================
// 診断フロー状態チェック
// =======================

export async function getDiagnosisStateForUser(
  lineUserId: string,
): Promise<DiagnosisState | null> {
  return await getDiagnosisState(lineUserId);
}

// =======================
// 診断キャンセル
// =======================

export async function handleDiagnosisCancel(
  lineUserId: string,
  replyToken?: string,
): Promise<void> {
  await clearDiagnosisState(lineUserId);
  if (replyToken) {
    await replyText(
      replyToken,
      "診断を中断しました。\n\n下のボタンから再度お試しください。",
      buildDiagnosisQuickReply(),
    );
  }
}

// =======================
// 診断回答処理
// =======================

export interface DiagnosisResult {
  completed: boolean;
  newState?: DiagnosisState;
}

export async function handleDiagnosisAnswer(
  lineUserId: string,
  userId: string,
  currentState: DiagnosisState,
  answer: string,
  replyToken?: string,
  logInteractionFn?: (opts: {
    userId: string;
    interactionType: "course_entry";
    courseKeyword: DiagnosisKeyword;
    inputLength: number;
  }) => Promise<void>,
): Promise<DiagnosisResult> {
  const trimmed = answer.trim();

  // 回答が有効かチェック
  if (!isValidAnswer(currentState, trimmed)) {
    if (replyToken) {
      const question = getNextQuestion(currentState);
      if (question) {
        const { text: questionText, quickReply } = buildQuestionMessage(
          question,
          currentState.layer,
        );
        await replyText(
          replyToken,
          "選択肢から選んでください。\n\n" + questionText,
          quickReply as QuickReply,
        );
      }
    }
    return { completed: false };
  }

  // 回答を記録し、次のレイヤーへ
  const newState: DiagnosisState = {
    ...currentState,
    layer: currentState.layer + 1,
    answers: [...currentState.answers, trimmed],
  };

  // 総質問数を取得
  const totalQ = getTotalQuestions(newState.keyword);

  // 全問回答完了 → 結論を表示
  if (newState.answers.length >= totalQ) {
    const articleIds = getConclusion(newState);
    let articles = articleIds ? getArticlesByIds(articleIds) : [];

    // タグベースのフォールバック（記事IDが見つからない場合）
    if (articles.length === 0) {
      const interest = newState.answers[1]; // layer2の回答
      if (interest) {
        articles = getArticlesByTag(interest, 3);
        log.debug("Using tag-based fallback", {
          interest,
          articleCount: articles.length,
        });
      } else {
        log.warn("No interest found in answers", {
          answers: newState.answers,
        });
      }
    }

    if (articles.length > 0) {
      const conclusionMessage = buildConclusionMessage(newState, articles);
      if (replyToken) {
        await replyText(replyToken, conclusionMessage);
      }
    } else {
      // 記事が見つからない場合のフォールバック
      if (replyToken) {
        await replyText(
          replyToken,
          [
            `【${newState.keyword}】診断完了`,
            "",
            "ご回答ありがとうございました。",
            "関連記事の準備中です。",
            "",
            "---",
            "詳しくは Discord でご相談ください",
            DISCORD_INVITE_URL,
          ].join("\n"),
        );
      }
    }

    await clearDiagnosisState(lineUserId);

    if (logInteractionFn) {
      await logInteractionFn({
        userId,
        interactionType: "course_entry",
        courseKeyword: newState.keyword,
        inputLength: trimmed.length,
      });
    }

    return { completed: true, newState };
  }

  // 次の質問を表示
  await updateDiagnosisState(lineUserId, newState);
  const nextQuestion = getNextQuestion(newState);
  if (nextQuestion && replyToken) {
    const { text: questionText, quickReply } = buildQuestionMessage(
      nextQuestion,
      newState.layer,
      totalQ,
    );
    await replyText(replyToken, questionText, quickReply as QuickReply);
  }

  return { completed: false, newState };
}

// =======================
// クイック診断開始
// =======================

export async function handleQuickDiagnosisStart(
  lineUserId: string,
  replyToken?: string,
): Promise<boolean> {
  log.info("Start quick diagnosis", { userId: anonymizeUserId(lineUserId) });

  const flow = getFlowForKeyword("クイック診断");
  const startMessage = flow ? buildDiagnosisStartMessage("クイック診断") : null;

  if (!flow || !startMessage) {
    log.warn("Quick diagnosis flow or startMessage missing");
    return false;
  }

  if (!replyToken) return false;

  const initialState: DiagnosisState = {
    keyword: "クイック診断",
    layer: 1,
    answers: [],
  };

  try {
    await updateDiagnosisState(lineUserId, initialState);
    log.debug("Diagnosis state initialized", {
      userId: anonymizeUserId(lineUserId),
    });
  } catch (err) {
    log.error("updateDiagnosisState error (start quick diagnosis)", {
      errorMessage: extractErrorMessage(err),
      userId: anonymizeUserId(lineUserId),
    });
    return false;
  }

  await replyText(
    replyToken,
    startMessage.text,
    startMessage.quickReply as QuickReply,
  );

  return true;
}

// =======================
// コースキーワード診断開始
// =======================

export async function handleCourseKeywordStart(
  lineUserId: string,
  userId: string,
  courseKeyword: DiagnosisKeyword,
  replyToken?: string,
  logInteractionFn?: (opts: {
    userId: string;
    interactionType: "course_entry";
    courseKeyword: DiagnosisKeyword;
    inputLength: number;
  }) => Promise<void>,
): Promise<boolean> {
  const flow = getFlowForKeyword(courseKeyword);

  if (flow) {
    const startMessage = buildDiagnosisStartMessage(courseKeyword);
    if (startMessage && replyToken) {
      // 診断状態を初期化
      const initialState: DiagnosisState = {
        keyword: courseKeyword,
        layer: 1,
        answers: [],
      };
      await updateDiagnosisState(lineUserId, initialState);
      await replyText(
        replyToken,
        startMessage.text,
        startMessage.quickReply as QuickReply,
      );
    }
    return true;
  }

  // フローが定義されていない場合のフォールバック（通常は発生しない）
  const courseMessage = buildCourseEntryMessage(courseKeyword);
  if (replyToken) {
    await replyText(replyToken, courseMessage);
  }

  if (logInteractionFn) {
    await logInteractionFn({
      userId,
      interactionType: "course_entry",
      courseKeyword,
      inputLength: courseKeyword.length,
    });
  }

  return true;
}
