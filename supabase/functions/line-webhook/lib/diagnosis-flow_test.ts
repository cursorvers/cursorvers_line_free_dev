/**
 * 診断フローテスト
 */
import { assertEquals, assertExists } from "std-assert";
import {
  buildConclusionMessage,
  buildDiagnosisStartMessage,
  buildQuestionMessage,
  type DiagnosisState,
  getConclusion,
  getCurrentOptions,
  getFlowForKeyword,
  getNextQuestion,
  getTotalQuestions,
  isValidAnswer,
} from "./diagnosis-flow.ts";
import { COURSE_KEYWORDS } from "./constants.ts";
import type { DiagnosisKeyword } from "./types.ts";

Deno.test("diagnosis-flow - getFlowForKeyword", async (t) => {
  await t.step("returns flow for all course keywords", () => {
    for (const keyword of COURSE_KEYWORDS) {
      const flow = getFlowForKeyword(keyword);
      assertEquals(flow !== null, true, `Flow should exist for ${keyword}`);
    }
  });

  await t.step("returns null for unknown keyword", () => {
    const flow = getFlowForKeyword("存在しないキーワード" as DiagnosisKeyword);
    assertEquals(flow, null);
  });

  await t.step("each flow has required structure", () => {
    for (const keyword of COURSE_KEYWORDS) {
      const flow = getFlowForKeyword(keyword);
      assertEquals(typeof flow?.totalQuestions, "number");
      assertEquals(flow?.layer1 !== undefined, true);
      assertEquals(flow?.layer2 !== undefined, true);
      assertEquals(flow?.layer3 !== undefined, true);
    }
  });
});

Deno.test("diagnosis-flow - getTotalQuestions", async (t) => {
  await t.step("returns 3 for クイック診断", () => {
    assertEquals(getTotalQuestions("クイック診断"), 3);
  });

  await t.step("returns 3 for 病院AIリスク診断", () => {
    assertEquals(getTotalQuestions("病院AIリスク診断"), 3);
  });

  await t.step("returns 3 for unknown keyword (default)", () => {
    assertEquals(
      getTotalQuestions("存在しない" as DiagnosisKeyword),
      3,
    );
  });
});

Deno.test("diagnosis-flow - getNextQuestion", async (t) => {
  await t.step("returns layer1 question for layer 1", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 1,
      answers: [],
    };
    const question = getNextQuestion(state);
    assertEquals(question !== null, true);
    assertEquals(question?.text, "関心の領域を選んでください");
    assertEquals(Array.isArray(question?.options), true);
  });

  await t.step("returns layer2 question for layer 2", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 2,
      answers: ["現場運営・効率化"],
    };
    const question = getNextQuestion(state);
    assertEquals(question !== null, true);
    assertEquals(question?.text, "特に知りたいテーマは？");
  });

  await t.step("returns layer3 question based on layer2 answer", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 3,
      answers: ["現場運営・効率化", "コスト・投資対効果"],
    };
    const question = getNextQuestion(state);
    assertEquals(question !== null, true);
    assertEquals(question?.text, "知りたいポイントは？");
  });

  await t.step("returns null for invalid keyword", () => {
    const state: DiagnosisState = {
      keyword: "存在しない" as DiagnosisKeyword,
      layer: 1,
      answers: [],
    };
    const question = getNextQuestion(state);
    assertEquals(question, null);
  });

  await t.step("returns null for layer > 3", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 4,
      answers: ["a", "b", "c"],
    };
    const question = getNextQuestion(state);
    assertEquals(question, null);
  });
});

Deno.test("diagnosis-flow - getCurrentOptions", async (t) => {
  await t.step("returns options for valid state", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 1,
      answers: [],
    };
    const options = getCurrentOptions(state);
    assertEquals(Array.isArray(options), true);
    assertEquals(options!.length > 0, true);
  });

  await t.step("returns null for invalid state", () => {
    const state: DiagnosisState = {
      keyword: "存在しない" as DiagnosisKeyword,
      layer: 1,
      answers: [],
    };
    const options = getCurrentOptions(state);
    assertEquals(options, null);
  });
});

Deno.test("diagnosis-flow - isValidAnswer", async (t) => {
  await t.step("returns true for valid answer", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 1,
      answers: [],
    };
    assertEquals(isValidAnswer(state, "現場運営・効率化"), true);
  });

  await t.step("returns false for invalid answer", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 1,
      answers: [],
    };
    assertEquals(isValidAnswer(state, "存在しない選択肢"), false);
  });

  await t.step("returns false for invalid state", () => {
    const state: DiagnosisState = {
      keyword: "存在しない" as DiagnosisKeyword,
      layer: 1,
      answers: [],
    };
    assertEquals(isValidAnswer(state, "anything"), false);
  });
});

Deno.test("diagnosis-flow - getConclusion", async (t) => {
  await t.step("returns article IDs for completed diagnosis", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 4, // After all questions
      answers: [
        "現場運営・効率化",
        "コスト・投資対効果",
        "初期費用/ROI",
      ],
    };
    const conclusion = getConclusion(state);
    assertEquals(Array.isArray(conclusion), true);
    assertEquals(conclusion!.length > 0, true);
  });

  await t.step("returns null for incomplete diagnosis", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 2,
      answers: ["現場運営・効率化"],
    };
    const conclusion = getConclusion(state);
    assertEquals(conclusion, null);
  });

  await t.step("returns null for invalid keyword", () => {
    const state: DiagnosisState = {
      keyword: "存在しない" as DiagnosisKeyword,
      layer: 4,
      answers: ["a", "b", "c"],
    };
    const conclusion = getConclusion(state);
    assertEquals(conclusion, null);
  });
});

Deno.test("diagnosis-flow - buildQuestionMessage", async (t) => {
  await t.step("creates message with correct format", () => {
    const question = { text: "テスト質問", options: ["選択肢1", "選択肢2"] };
    const result = buildQuestionMessage(question, 1, 3);

    assertEquals(result.text.includes("【質問 1/3】"), true);
    assertEquals(result.text.includes("テスト質問"), true);
    assertEquals(typeof result.quickReply, "object");
  });

  await t.step("includes cancel button in quickReply", () => {
    const question = { text: "テスト", options: ["A", "B"] };
    const result = buildQuestionMessage(question, 1);
    const items = (result.quickReply as { items: unknown[] }).items;

    // Options + cancel button
    assertEquals(items.length, 3);
  });

  await t.step("truncates long option labels", () => {
    const longOption = "これは20文字を超える非常に長い選択肢のテキストです";
    const question = { text: "テスト", options: [longOption] };
    const result = buildQuestionMessage(question, 1);
    const items = (
      result.quickReply as { items: Array<{ action: { label: string } }> }
    ).items;

    const firstItem = items[0];
    assertExists(firstItem);
    assertEquals(firstItem.action.label.length <= 20, true);
    assertEquals(firstItem.action.label.endsWith("..."), true);
  });
});

Deno.test("diagnosis-flow - buildConclusionMessage", async (t) => {
  await t.step("includes keyword in message", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 4,
      answers: ["領域", "関心", "詳細"],
    };
    const articles = [{ title: "記事1", url: "https://example.com/1" }];
    const message = buildConclusionMessage(state, articles);

    assertEquals(message.includes("クイック診断"), true);
  });

  await t.step("includes articles", () => {
    const state: DiagnosisState = {
      keyword: "病院AIリスク診断",
      layer: 4,
      answers: ["立場", "関心領域", "課題"],
    };
    const articles = [
      { title: "記事タイトル1", url: "https://example.com/1" },
      { title: "記事タイトル2", url: "https://example.com/2" },
    ];
    const message = buildConclusionMessage(state, articles);

    assertEquals(message.includes("記事タイトル1"), true);
    assertEquals(message.includes("記事タイトル2"), true);
    assertEquals(message.includes("https://example.com/1"), true);
  });

  await t.step("includes Discord invite", () => {
    const state: DiagnosisState = {
      keyword: "クイック診断",
      layer: 4,
      answers: ["a", "b", "c"],
    };
    const message = buildConclusionMessage(state, []);

    assertEquals(message.includes("Discord"), true);
  });
});

Deno.test("diagnosis-flow - buildDiagnosisStartMessage", async (t) => {
  await t.step("returns start message for valid keyword", () => {
    const result = buildDiagnosisStartMessage("クイック診断");
    assertEquals(result !== null, true);
    assertEquals(result!.text.includes("クイック診断"), true);
    assertEquals(result!.text.includes("質問 1/"), true);
  });

  await t.step("includes quickReply with options", () => {
    const result = buildDiagnosisStartMessage("病院AIリスク診断");
    const items = (result!.quickReply as { items: unknown[] }).items;
    assertEquals(items.length > 1, true); // Options + cancel
  });

  await t.step("returns null for invalid keyword", () => {
    const result = buildDiagnosisStartMessage(
      "存在しない" as DiagnosisKeyword,
    );
    assertEquals(result, null);
  });

  await t.step("includes cancel button", () => {
    const result = buildDiagnosisStartMessage("クイック診断");
    const items = (
      result!.quickReply as { items: Array<{ action: { label: string } }> }
    ).items;
    const hasCancel = items.some((item) => item.action.label === "キャンセル");
    assertEquals(hasCancel, true);
  });
});
