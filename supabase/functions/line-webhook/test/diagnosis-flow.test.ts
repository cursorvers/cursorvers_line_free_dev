// supabase/functions/line-webhook/test/diagnosis-flow.test.ts
// Tests for diagnosis-flow.ts - Pure function tests (Phase 1)

import { assert, assertEquals, assertExists } from "std-assert";
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
} from "../lib/diagnosis-flow.ts";

// =======================
// Test: getFlowForKeyword
// =======================

Deno.test("diagnosis-flow: getFlowForKeyword returns QUICK_FLOW", () => {
  const flow = getFlowForKeyword("クイック診断");
  assertExists(flow);
  assertEquals(flow?.totalQuestions, 3);
  assertEquals(flow?.layer1.text, "関心の領域を選んでください");
});

Deno.test("diagnosis-flow: getFlowForKeyword returns HOSPITAL_FLOW", () => {
  const flow = getFlowForKeyword("病院AIリスク診断");
  assertExists(flow);
  assertEquals(flow?.totalQuestions, 3);
  assertEquals(flow?.layer1.text, "あなたの立場を教えてください");
});

Deno.test("diagnosis-flow: getFlowForKeyword returns null for invalid keyword", () => {
  const flow = getFlowForKeyword("存在しない診断" as any);
  assertEquals(flow, null);
});

// =======================
// Test: getTotalQuestions
// =======================

Deno.test("diagnosis-flow: getTotalQuestions returns 3 for all flows", () => {
  assertEquals(getTotalQuestions("クイック診断"), 3);
  assertEquals(getTotalQuestions("病院AIリスク診断"), 3);
  assertEquals(getTotalQuestions("SaMDスタートアップ診断"), 3);
  assertEquals(getTotalQuestions("医療データガバナンス診断"), 3);
  assertEquals(getTotalQuestions("臨床知アセット診断"), 3);
  assertEquals(getTotalQuestions("教育AI導入診断"), 3);
  assertEquals(getTotalQuestions("次世代AI実装診断"), 3);
});

Deno.test("diagnosis-flow: getTotalQuestions returns 3 for invalid keyword", () => {
  assertEquals(getTotalQuestions("存在しない診断" as any), 3);
});

// =======================
// Test: getNextQuestion
// =======================

Deno.test("diagnosis-flow: getNextQuestion returns layer1 question", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 1,
    answers: [],
  };
  const question = getNextQuestion(state);
  assertExists(question);
  assertEquals(question?.text, "関心の領域を選んでください");
  assertEquals(question?.options.length, 3);
});

Deno.test("diagnosis-flow: getNextQuestion returns layer2 question", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 2,
    answers: ["現場運営・効率化"],
  };
  const question = getNextQuestion(state);
  assertExists(question);
  assertEquals(question?.text, "特に知りたいテーマは？");
});

Deno.test("diagnosis-flow: getNextQuestion returns layer3 question based on layer2 answer", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 3,
    answers: ["現場運営・効率化", "コスト・投資対効果"],
  };
  const question = getNextQuestion(state);
  assertExists(question);
  assertEquals(question?.text, "知りたいポイントは？");
  assertEquals(question?.options, [
    "初期費用/ROI",
    "補助金・助成金",
    "全体像を知りたい",
  ]);
});

Deno.test("diagnosis-flow: getNextQuestion handles branching layer3 for HOSPITAL_FLOW", () => {
  const state: DiagnosisState = {
    keyword: "病院AIリスク診断",
    layer: 3,
    answers: ["病院経営者・管理職", "セキュリティ・個人情報"],
  };
  const question = getNextQuestion(state);
  assertExists(question);
  assertEquals(question?.text, "セキュリティ面で特に気になることは？");
  assertEquals(question?.options.length, 3);
});

Deno.test("diagnosis-flow: getNextQuestion returns null for invalid layer", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 4,
    answers: ["現場運営・効率化", "コスト・投資対効果", "初期費用/ROI"],
  };
  const question = getNextQuestion(state);
  assertEquals(question, null);
});

// =======================
// Test: getCurrentOptions
// =======================

Deno.test("diagnosis-flow: getCurrentOptions returns layer1 options", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 1,
    answers: [],
  };
  const options = getCurrentOptions(state);
  assertExists(options);
  assertEquals(options?.length, 3);
  assert(options?.includes("現場運営・効率化"));
});

// =======================
// Test: isValidAnswer
// =======================

Deno.test("diagnosis-flow: isValidAnswer returns true for valid answer", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 1,
    answers: [],
  };
  assert(isValidAnswer(state, "現場運営・効率化"));
});

Deno.test("diagnosis-flow: isValidAnswer returns false for invalid answer", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 1,
    answers: [],
  };
  assertEquals(isValidAnswer(state, "存在しない選択肢"), false);
});

// =======================
// Test: getConclusion
// =======================

Deno.test("diagnosis-flow: getConclusion returns article IDs for completed diagnosis", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 3,
    answers: ["現場運営・効率化", "コスト・投資対効果", "初期費用/ROI"],
  };
  const conclusion = getConclusion(state);
  assertExists(conclusion);
  assertEquals(conclusion?.length, 3);
  assert(conclusion?.includes("clinic_roi_2025"));
  assert(conclusion?.includes("ai_economics"));
});

Deno.test("diagnosis-flow: getConclusion returns null for incomplete diagnosis", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 2,
    answers: ["現場運営・効率化"],
  };
  const conclusion = getConclusion(state);
  assertEquals(conclusion, null);
});

Deno.test("diagnosis-flow: getConclusion handles HOSPITAL_FLOW correctly", () => {
  const state: DiagnosisState = {
    keyword: "病院AIリスク診断",
    layer: 3,
    answers: [
      "病院経営者・管理職",
      "業務効率化・省力化",
      "文書作成（紹介状等）",
    ],
  };
  const conclusion = getConclusion(state);
  assertExists(conclusion);
  assertEquals(conclusion?.length, 3);
  assert(conclusion?.includes("automation_n8n"));
});

// =======================
// Test: buildQuestionMessage
// =======================

Deno.test("diagnosis-flow: buildQuestionMessage creates correct format", () => {
  const question = {
    text: "テスト質問",
    options: ["選択肢1", "選択肢2"],
  };
  const result = buildQuestionMessage(question, 1, 3);

  assertEquals(result.text, "【質問 1/3】\n\nテスト質問");
  assertExists(result.quickReply);
  assertEquals((result.quickReply as any).items.length, 3); // 2 options + 1 cancel
});

Deno.test("diagnosis-flow: buildQuestionMessage truncates long labels", () => {
  const question = {
    text: "テスト質問",
    options: ["これは20文字を超える非常に長い選択肢テキストです"],
  };
  const result = buildQuestionMessage(question, 2, 3);

  const firstOption = (result.quickReply as any).items[0];
  assertEquals(firstOption.action.label.length, 20); // Truncated to "これは20文字を超える非常に..."
  assert(firstOption.action.label.endsWith("..."));
});

// =======================
// Test: buildConclusionMessage
// =======================

Deno.test("diagnosis-flow: buildConclusionMessage creates correct format", () => {
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 3,
    answers: ["現場運営・効率化", "コスト・投資対効果", "初期費用/ROI"],
  };
  const articles = [
    { title: "記事1", url: "https://example.com/1" },
    { title: "記事2", url: "https://example.com/2" },
  ];

  const message = buildConclusionMessage(state, articles);

  assert(message.includes("🎯【クイック診断】"));
  assert(message.includes("コスト・投資対効果"));
  assert(message.includes("初期費用/ROI"));
  assert(message.includes("記事1"));
  assert(message.includes("https://example.com/1"));
  assert(message.includes("Discord コミュニティへ！"));
});

Deno.test("diagnosis-flow: buildConclusionMessage handles null URLs", () => {
  const state: DiagnosisState = {
    keyword: "病院AIリスク診断",
    layer: 3,
    answers: [
      "病院経営者・管理職",
      "規制・コンプライアンス",
      "医療機器該当性（SaMD）",
    ],
  };
  const articles = [
    { title: "記事1", url: null },
  ];

  const message = buildConclusionMessage(state, articles);

  assert(message.includes("記事1"));
  assertEquals(message.includes("null"), false); // Should not include "null" string
});

// =======================
// Test: buildDiagnosisStartMessage
// =======================

Deno.test("diagnosis-flow: buildDiagnosisStartMessage creates correct format", () => {
  const result = buildDiagnosisStartMessage("クイック診断");

  assertExists(result);
  assert(result?.text.includes("🔍【クイック診断】"));
  assert(result?.text.includes("3つの質問に答えると"));
  assert(result?.text.includes("【質問 1/3】"));
  assert(result?.text.includes("関心の領域を選んでください"));

  assertExists(result?.quickReply);
  assertEquals((result?.quickReply as any).items.length, 4); // 3 options + 1 cancel
});

Deno.test("diagnosis-flow: buildDiagnosisStartMessage returns null for invalid keyword", () => {
  const result = buildDiagnosisStartMessage("存在しない診断" as any);
  assertEquals(result, null);
});

// =======================
// Test: All 7 Diagnosis Flows
// =======================

Deno.test("diagnosis-flow: All 7 flows are accessible", () => {
  const keywords = [
    "クイック診断",
    "病院AIリスク診断",
    "SaMDスタートアップ診断",
    "医療データガバナンス診断",
    "臨床知アセット診断",
    "教育AI導入診断",
    "次世代AI実装診断",
  ];

  for (const keyword of keywords) {
    const flow = getFlowForKeyword(keyword as any);
    assertExists(flow, `Flow should exist for keyword: ${keyword}`);
    assertEquals(flow?.totalQuestions, 3);
    assertExists(flow?.layer1);
    assertExists(flow?.layer2);
    assertExists(flow?.layer3);
    assertExists(flow?.conclusionsByInterest);
  }
});

// =======================
// Test: Complete Flow Walkthrough
// =======================

Deno.test("diagnosis-flow: Complete QUICK_FLOW walkthrough", () => {
  // Start
  const startMsg = buildDiagnosisStartMessage("クイック診断");
  assertExists(startMsg);

  // Layer 1
  const state: DiagnosisState = {
    keyword: "クイック診断",
    layer: 1,
    answers: [],
  };

  assert(isValidAnswer(state, "現場運営・効率化"));
  state.answers.push("現場運営・効率化");
  state.layer = 2;

  // Layer 2
  const q2 = getNextQuestion(state);
  assertExists(q2);
  assert(isValidAnswer(state, "コスト・投資対効果"));
  state.answers.push("コスト・投資対効果");
  state.layer = 3;

  // Layer 3
  const q3 = getNextQuestion(state);
  assertExists(q3);
  assert(isValidAnswer(state, "初期費用/ROI"));
  state.answers.push("初期費用/ROI");

  // Conclusion
  const conclusion = getConclusion(state);
  assertExists(conclusion);
  assertEquals(conclusion.length, 3);
});
