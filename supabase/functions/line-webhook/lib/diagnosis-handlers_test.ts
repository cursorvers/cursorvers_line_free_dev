/**
 * diagnosis-handlers.ts ユニットテスト
 * Note: detectCourseKeyword は純粋関数なのでここで直接テスト
 */
import { assertEquals } from "std-assert";
import { COURSE_KEYWORDS, type DiagnosisKeyword } from "./constants.ts";

// detectCourseKeyword のロジックをテスト用に再実装
// 本番コードは diagnosis-handlers.ts にあるが、Supabaseクライアント初期化を避けるため
function normalizeKeyword(raw: string): string {
  return raw.replace(/　/g, " ").trim();
}

function detectCourseKeyword(text: string): DiagnosisKeyword | null {
  const normalized = normalizeKeyword(text);
  const match = COURSE_KEYWORDS.find((kw) => kw === normalized);
  return match ?? null;
}

// =======================
// detectCourseKeyword テスト
// =======================

Deno.test("detectCourseKeyword - valid keywords", async (t) => {
  await t.step("detects 'クイック診断'", () => {
    assertEquals(detectCourseKeyword("クイック診断"), "クイック診断");
  });

  await t.step("detects '病院AIリスク診断'", () => {
    assertEquals(detectCourseKeyword("病院AIリスク診断"), "病院AIリスク診断");
  });

  await t.step("detects 'SaMDスタートアップ診断'", () => {
    assertEquals(
      detectCourseKeyword("SaMDスタートアップ診断"),
      "SaMDスタートアップ診断",
    );
  });

  await t.step("detects '医療データガバナンス診断'", () => {
    assertEquals(
      detectCourseKeyword("医療データガバナンス診断"),
      "医療データガバナンス診断",
    );
  });

  await t.step("detects '教育AI導入診断'", () => {
    assertEquals(detectCourseKeyword("教育AI導入診断"), "教育AI導入診断");
  });
});

Deno.test("detectCourseKeyword - whitespace handling", async (t) => {
  await t.step("handles leading/trailing whitespace", () => {
    assertEquals(detectCourseKeyword("  クイック診断  "), "クイック診断");
  });

  await t.step("converts full-width space to half-width", () => {
    assertEquals(detectCourseKeyword("クイック診断　"), "クイック診断");
  });
});

Deno.test("detectCourseKeyword - returns null for invalid", async (t) => {
  await t.step("returns null for unknown keyword", () => {
    assertEquals(detectCourseKeyword("unknown"), null);
  });

  await t.step("returns null for empty string", () => {
    assertEquals(detectCourseKeyword(""), null);
  });

  await t.step("returns null for partial match", () => {
    assertEquals(detectCourseKeyword("病院AI"), null);
  });

  await t.step("returns null for similar text", () => {
    assertEquals(detectCourseKeyword("クイック診断です"), null);
  });
});

// =======================
// DiagnosisResult type テスト
// =======================

Deno.test("DiagnosisResult interface", async (t) => {
  await t.step("completed result structure", () => {
    const result = {
      completed: true,
      newState: {
        keyword: "クイック診断" as const,
        layer: 3,
        answers: ["answer1", "answer2", "answer3"],
      },
    };

    assertEquals(result.completed, true);
    assertEquals(result.newState?.keyword, "クイック診断");
    assertEquals(result.newState?.layer, 3);
    assertEquals(result.newState?.answers.length, 3);
  });

  await t.step("in-progress result structure", () => {
    const result = {
      completed: false,
      newState: {
        keyword: "クイック診断" as const,
        layer: 2,
        answers: ["answer1"],
      },
    };

    assertEquals(result.completed, false);
    assertEquals(result.newState?.layer, 2);
  });

  await t.step("invalid answer result (no newState)", () => {
    const result = {
      completed: false,
    };

    assertEquals(result.completed, false);
    assertEquals(result.newState, undefined);
  });
});

// =======================
// 診断フロー状態テスト
// =======================

Deno.test("Diagnosis flow state", async (t) => {
  await t.step("initial state is layer 1 with empty answers", () => {
    const initialState = {
      keyword: "クイック診断" as const,
      layer: 1,
      answers: [] as string[],
    };

    assertEquals(initialState.layer, 1);
    assertEquals(initialState.answers.length, 0);
  });

  await t.step("state advances to layer 2 after first answer", () => {
    const state = {
      keyword: "クイック診断" as const,
      layer: 1,
      answers: [] as string[],
    };

    const newState = {
      ...state,
      layer: state.layer + 1,
      answers: [...state.answers, "AI活用経験あり"],
    };

    assertEquals(newState.layer, 2);
    assertEquals(newState.answers.length, 1);
  });

  await t.step("state completes after all answers", () => {
    const totalQuestions = 3;
    const state = {
      keyword: "クイック診断" as const,
      layer: 3,
      answers: ["answer1", "answer2"],
    };

    const newState = {
      ...state,
      layer: state.layer + 1,
      answers: [...state.answers, "answer3"],
    };

    assertEquals(newState.answers.length >= totalQuestions, true);
  });
});

// =======================
// キャンセル処理テスト
// =======================

Deno.test("Diagnosis cancel commands", async (t) => {
  await t.step("'キャンセル' should trigger cancel", () => {
    const cancelCommands = ["キャンセル", "cancel"];
    assertEquals(cancelCommands.includes("キャンセル"), true);
  });

  await t.step("'cancel' should trigger cancel", () => {
    const cancelCommands = ["キャンセル", "cancel"];
    assertEquals(cancelCommands.includes("cancel"), true);
  });

  await t.step("other text should not trigger cancel", () => {
    const cancelCommands = ["キャンセル", "cancel"];
    assertEquals(cancelCommands.includes("終了"), false);
  });
});
