// supabase/functions/line-webhook/lib/diagnosis-flow.ts
// 診断フローの定義（3階層の質問ツリー）

import type { DiagnosisKeyword } from "./types.ts";
import { DISCORD_INVITE_URL } from "./constants.ts";

// 診断状態の型定義
export interface DiagnosisState {
  keyword: DiagnosisKeyword;
  layer: number;
  answers: string[];
}

// 質問の型定義
export interface DiagnosisQuestion {
  text: string;
  options: string[];
}

// フロー定義の型
interface DiagnosisFlow {
  totalQuestions: number;
  layer1: DiagnosisQuestion;
  layer2: DiagnosisQuestion | Record<string, DiagnosisQuestion>;
  layer3: DiagnosisQuestion | Record<string, DiagnosisQuestion>;
  conclusionsByInterest: Record<string, string[]>;
}

// =======================
// 病院AIリスク診断フロー（3問）
// =======================

const HOSPITAL_FLOW: DiagnosisFlow = {
  totalQuestions: 3,
  
  // レイヤー1: 立場（パーソナライズ）
  layer1: {
    text: "あなたの立場を教えてください",
    options: [
      "病院経営者・管理職",
      "臨床医・医療従事者",
      "IT・システム担当",
      "事務・総務担当",
    ],
  },

  // レイヤー2: 関心領域（★結論を決定する主軸）
  layer2: {
    text: "AI導入で最も気になる点は？",
    options: [
      "コスト・投資対効果",
      "規制・コンプライアンス",
      "セキュリティ・個人情報",
      "業務効率化・省力化",
      "医療の質・患者体験",
    ],
  },

  // レイヤー3: 具体的な課題（layer2に応じて分岐）
  layer3: {
    "コスト・投資対効果": {
      text: "コスト面で特に知りたいことは？",
      options: [
        "初期費用の相場感",
        "ROI・費用対効果の計算",
        "補助金・助成金の活用",
      ],
    },
    "規制・コンプライアンス": {
      text: "規制面で特に気になることは？",
      options: [
        "医療機器該当性（SaMD）",
        "個人情報保護法の対応",
        "AI事業者ガイドライン",
      ],
    },
    "セキュリティ・個人情報": {
      text: "セキュリティ面で特に気になることは？",
      options: [
        "患者データの取り扱い",
        "クラウド利用のリスク",
        "ベンダー選定の基準",
      ],
    },
    "業務効率化・省力化": {
      text: "効率化したい業務は？",
      options: [
        "文書作成（紹介状等）",
        "画像診断支援",
        "問診・トリアージ",
      ],
    },
    "医療の質・患者体験": {
      text: "向上させたい領域は？",
      options: [
        "診断精度・見落とし防止",
        "患者説明・IC",
        "待ち時間・予約管理",
      ],
    },
  } as Record<string, DiagnosisQuestion>,

  // 結論マッピング（layer2の関心領域 → 実際の記事ID）
  conclusionsByInterest: {
    "コスト・投資対効果": [
      "clinic_roi_2025",
      "ai_economics",
      "why_ai_fails",
    ],
    "規制・コンプライアンス": [
      "ehr_3sho2",
      "state_of_ai_2025",
      "japan_ai_frontier",
    ],
    "セキュリティ・個人情報": [
      "ehr_3sho2",
      "hospital_perfect_answer",
      "why_ai_fails",
    ],
    "業務効率化・省力化": [
      "automation_n8n",
      "outreach",
      "clinic_roi_2025",
    ],
    "医療の質・患者体験": [
      "ai_psy_therapy",
      "outreach",
      "japan_ai_frontier",
    ],
  },
};

// =======================
// SaMDスタートアップ診断フロー（3問）
// =======================

const SAMD_FLOW: DiagnosisFlow = {
  totalQuestions: 3,
  
  layer1: {
    text: "あなたの役割を教えてください",
    options: [
      "経営者・創業者",
      "プロダクトマネージャー",
      "エンジニア・開発者",
      "薬事・QA担当",
    ],
  },

  layer2: {
    text: "現在のフェーズは？",
    options: [
      "アイデア・企画段階",
      "プロトタイプ開発中",
      "臨床試験・治験準備",
      "薬事申請・承認取得",
      "市販後・スケール段階",
    ],
  },

  layer3: {
    "アイデア・企画段階": {
      text: "最も知りたいことは？",
      options: ["市場性・ニーズ検証", "規制の全体像", "資金調達・補助金"],
    },
    "プロトタイプ開発中": {
      text: "課題となっていることは？",
      options: ["技術的な実装", "臨床データの収集", "ユーザビリティ検証"],
    },
    "臨床試験・治験準備": {
      text: "準備状況は？",
      options: ["治験デザイン検討中", "IRB申請準備中", "データ収集中"],
    },
    "薬事申請・承認取得": {
      text: "申請先は？",
      options: ["PMDA（日本）", "FDA（米国）", "CE（欧州）"],
    },
    "市販後・スケール段階": {
      text: "課題は？",
      options: ["販路拡大", "保険適用", "グローバル展開"],
    },
  } as Record<string, DiagnosisQuestion>,

  conclusionsByInterest: {
    "アイデア・企画段階": ["samd_guide", "pm_checklist", "xai_framework"],
    "プロトタイプ開発中": ["evals_kpi", "optimal_vs_satisfactory", "xhaim"],
    "臨床試験・治験準備": ["pccp_fda", "10sec_trap", "agent_or_device"],
    "薬事申請・承認取得": ["samd_guide", "pccp_fda", "eu_ai_act"],
    "市販後・スケール段階": ["paradigm_integration", "ai_inventor", "eu_ai_act"],
  },
};

// =======================
// 医療データガバナンス診断フロー（3問）
// =======================

const DATA_GOV_FLOW: DiagnosisFlow = {
  totalQuestions: 3,
  
  layer1: {
    text: "あなたの組織は？",
    options: [
      "医療機関",
      "製薬・ヘルスケア企業",
      "IT・SIer",
      "行政・研究機関",
    ],
  },

  layer2: {
    text: "データ活用の目的は？",
    options: [
      "院内業務の効率化",
      "研究・二次利用",
      "外部連携・共有",
      "AI開発・学習",
    ],
  },

  layer3: {
    "院内業務の効率化": {
      text: "課題は？",
      options: ["データの一元管理", "部門間連携", "セキュリティ強化"],
    },
    "研究・二次利用": {
      text: "懸念点は？",
      options: ["倫理審査・同意取得", "匿名化・仮名化", "データ品質"],
    },
    "外部連携・共有": {
      text: "連携先は？",
      options: ["他医療機関", "自治体・行政", "民間企業"],
    },
    "AI開発・学習": {
      text: "課題は？",
      options: ["学習データの確保", "バイアス・公平性", "説明可能性"],
    },
  } as Record<string, DiagnosisQuestion>,

  conclusionsByInterest: {
    "院内業務の効率化": ["double_helix", "referral_gennai", "enicia_aibtrust"],
    "研究・二次利用": ["patient_data_revolution", "jdla_contract", "referral_ethics"],
    "外部連携・共有": ["referral_gennai", "ai_security_subcommittee", "state_ai_policy"],
    "AI開発・学習": ["jdla_contract", "gafam_battlefield", "patient_data_revolution"],
  },
};

// =======================
// 臨床知アセット診断フロー（3問）
// =======================

const CLINICAL_ASSET_FLOW: DiagnosisFlow = {
  totalQuestions: 3,
  
  layer1: {
    text: "あなたの専門は？",
    options: [
      "内科系",
      "外科系",
      "精神科・心療内科",
      "その他・複数",
    ],
  },

  layer2: {
    text: "AIに期待することは？",
    options: [
      "診断・判断支援",
      "文書作成・記録",
      "患者コミュニケーション",
      "学習・教育",
    ],
  },

  layer3: {
    "診断・判断支援": {
      text: "具体的には？",
      options: ["鑑別診断の支援", "画像読影の効率化", "リスク予測"],
    },
    "文書作成・記録": {
      text: "効率化したい文書は？",
      options: ["カルテ記載", "紹介状・診断書", "サマリー作成"],
    },
    "患者コミュニケーション": {
      text: "課題は？",
      options: ["IC・説明の質向上", "患者教育・指導", "メンタルケア"],
    },
    "学習・教育": {
      text: "対象は？",
      options: ["自己学習", "後進の指導", "患者・一般向け発信"],
    },
  } as Record<string, DiagnosisQuestion>,

  conclusionsByInterest: {
    "診断・判断支援": ["g_amie", "heterogeneity_by_design", "sinking_expertise"],
    "文書作成・記録": ["voice_chart", "ocr_memory", "too_smart_ai"],
    "患者コミュニケーション": ["ai_psy_therapy", "nextgen_psychiatry", "too_smart_ai"],
    "学習・教育": ["ai_clinical_soul", "ocr_memory", "sinking_expertise"],
  },
};

// =======================
// 教育AI導入診断フロー（3問）
// =======================

const EDU_FLOW: DiagnosisFlow = {
  totalQuestions: 3,
  
  layer1: {
    text: "あなたの立場は？",
    options: [
      "教育機関の管理者",
      "教員・指導者",
      "学生・研修医",
      "企業の研修担当",
    ],
  },

  layer2: {
    text: "教育AIの活用目的は？",
    options: [
      "カリキュラム設計",
      "個別学習支援",
      "評価・フィードバック",
      "シミュレーション",
    ],
  },

  layer3: {
    "カリキュラム設計": {
      text: "課題は？",
      options: ["コンテンツ作成", "進度管理", "到達度評価"],
    },
    "個別学習支援": {
      text: "重視するのは？",
      options: ["適応型学習", "復習・定着", "モチベーション"],
    },
    "評価・フィードバック": {
      text: "対象は？",
      options: ["知識テスト", "実技・手技", "コミュニケーション"],
    },
    "シミュレーション": {
      text: "内容は？",
      options: ["症例シミュレーション", "手技トレーニング", "チーム医療"],
    },
  } as Record<string, DiagnosisQuestion>,

  conclusionsByInterest: {
    "カリキュラム設計": ["edu_ai_v2", "genai_med_education"],
    "個別学習支援": ["genai_med_education", "edu_ai_v2"],
    "評価・フィードバック": ["edu_ai_v2", "genai_med_education"],
    "シミュレーション": ["genai_med_education", "edu_ai_v2"],
  },
};

// =======================
// 次世代AI実装診断フロー（3問）
// =======================

const NEXTGEN_FLOW: DiagnosisFlow = {
  totalQuestions: 3,
  
  layer1: {
    text: "興味のある技術領域は？",
    options: [
      "マルチモーダルAI",
      "フィジカルAI・ロボット",
      "生成AI・LLM",
      "エッジAI・IoT",
    ],
  },

  layer2: {
    text: "関心のある応用分野は？",
    options: [
      "診断・画像解析",
      "手術・治療支援",
      "創薬・研究",
      "ヘルスケア・予防",
    ],
  },

  layer3: {
    "診断・画像解析": {
      text: "具体的には？",
      options: ["放射線画像", "病理画像", "内視鏡・動画"],
    },
    "手術・治療支援": {
      text: "関心は？",
      options: ["手術ロボット", "ナビゲーション", "リハビリ支援"],
    },
    "創薬・研究": {
      text: "フェーズは？",
      options: ["ターゲット探索", "化合物設計", "臨床試験最適化"],
    },
    "ヘルスケア・予防": {
      text: "対象は？",
      options: ["生活習慣病", "メンタルヘルス", "高齢者ケア"],
    },
  } as Record<string, DiagnosisQuestion>,

  conclusionsByInterest: {
    "診断・画像解析": ["nano_banana", "google_new_dimension", "ms_multi_ai"],
    "手術・治療支援": ["physical_ai", "incurable_disease", "wh_pediatric_cancer"],
    "創薬・研究": ["gc_modern_infra", "env_cost", "ms_multi_ai"],
    "ヘルスケア・予防": ["sora2", "nano_banana", "google_new_dimension"],
  },
};

// =======================
// フロー取得関数
// =======================

// 全フローのマッピング
const FLOW_MAP: Record<DiagnosisKeyword, DiagnosisFlow> = {
  "病院AIリスク診断": HOSPITAL_FLOW,
  "SaMDスタートアップ診断": SAMD_FLOW,
  "医療データガバナンス診断": DATA_GOV_FLOW,
  "臨床知アセット診断": CLINICAL_ASSET_FLOW,
  "教育AI導入診断": EDU_FLOW,
  "次世代AI実装診断": NEXTGEN_FLOW,
};

export function getFlowForKeyword(keyword: DiagnosisKeyword): DiagnosisFlow | null {
  return FLOW_MAP[keyword] ?? null;
}

/**
 * 次の質問を取得
 */
export function getNextQuestion(
  state: DiagnosisState
): DiagnosisQuestion | null {
  const flow = getFlowForKeyword(state.keyword);
  if (!flow) return null;

  const { layer, answers } = state;

  if (layer === 1) {
    return flow.layer1;
  }
  if (layer === 2) {
    // layer2 が分岐型かどうかチェック
    if ("text" in flow.layer2) {
      return flow.layer2 as DiagnosisQuestion;
    }
    // 分岐型の場合（現在の実装では使用していない）
    return null;
  }
  if (layer === 3) {
    // layer3 は layer2 の回答に基づいて分岐
    const interest = answers[1]; // layer2 の回答
    if ("text" in flow.layer3) {
      return flow.layer3 as DiagnosisQuestion;
    }
    const layer3Questions = flow.layer3 as Record<string, DiagnosisQuestion>;
    return layer3Questions[interest] ?? null;
  }

  return null;
}

/**
 * 結論を取得（layer2 の関心領域に基づく）
 */
export function getConclusion(state: DiagnosisState): string[] | null {
  const flow = getFlowForKeyword(state.keyword);
  if (!flow) return null;

  // 3問すべて回答済みか確認
  if (state.answers.length < flow.totalQuestions) {
    return null;
  }

  // layer2 の回答（関心領域）で結論を決定
  const interest = state.answers[1];
  return flow.conclusionsByInterest[interest] ?? null;
}

/**
 * 現在の質問の選択肢を取得
 */
export function getCurrentOptions(state: DiagnosisState): string[] | null {
  const question = getNextQuestion(state);
  return question?.options ?? null;
}

/**
 * 回答が有効か確認（選択肢に含まれているか）
 */
export function isValidAnswer(state: DiagnosisState, answer: string): boolean {
  const options = getCurrentOptions(state);
  if (!options) return false;
  return options.includes(answer);
}

/**
 * フローの総質問数を取得
 */
export function getTotalQuestions(keyword: DiagnosisKeyword): number {
  const flow = getFlowForKeyword(keyword);
  return flow?.totalQuestions ?? 3;
}

/**
 * 質問メッセージを生成（Quick Reply 用）
 */
export function buildQuestionMessage(
  question: DiagnosisQuestion,
  layer: number,
  totalQuestions: number = 3
): { text: string; quickReply: object } {
  const text = `【質問 ${layer}/${totalQuestions}】\n\n${question.text}`;

  const quickReply = {
    items: [
      // 選択肢
      ...question.options.map((opt) => ({
        type: "action",
        action: {
          type: "message",
          label: opt.length > 20 ? opt.substring(0, 17) + "..." : opt,
          text: opt,
        },
      })),
      // キャンセルボタン
      {
        type: "action",
        action: {
          type: "message",
          label: "キャンセル",
          text: "キャンセル",
        },
      },
    ],
  };

  return { text, quickReply };
}

/**
 * 結論メッセージを生成
 */
export function buildConclusionMessage(
  state: DiagnosisState,
  articles: Array<{ title: string; url: string | null }>
): string {
  // 回答のサマリーを作成（関心領域を強調）
  const interest = state.answers[1]; // layer2の回答が主軸
  
  const lines: string[] = [
    `🎯【${state.keyword}】診断完了！`,
    "",
    `あなたの関心：「${interest}」`,
    "",
    "━━━━━━━━━━━━━━━━",
    "📚 あなたにおすすめの記事",
    "━━━━━━━━━━━━━━━━",
    "",
  ];

  articles.forEach((article, i) => {
    lines.push(`▶ ${article.title}`);
    if (article.url) {
      lines.push(article.url);
    }
    lines.push("");
  });

  lines.push("---");
  lines.push("💬 もっと詳しく知りたい方は");
  lines.push("Discord コミュニティへ！");
  lines.push(DISCORD_INVITE_URL);

  return lines.join("\n");
}

/**
 * 診断開始メッセージを生成
 */
export function buildDiagnosisStartMessage(keyword: DiagnosisKeyword): {
  text: string;
  quickReply: object;
} | null {
  const flow = getFlowForKeyword(keyword);
  if (!flow) return null;

  const question = flow.layer1;
  const totalQ = flow.totalQuestions;
  
  const text = [
    `🔍【${keyword}】`,
    "",
    `${totalQ}つの質問に答えると、`,
    "あなたに最適な記事をご案内します。",
    "",
    `【質問 1/${totalQ}】`,
    question.text,
  ].join("\n");

  const quickReply = {
    items: [
      ...question.options.map((opt) => ({
        type: "action",
        action: {
          type: "message",
          label: opt.length > 20 ? opt.substring(0, 17) + "..." : opt,
          text: opt,
        },
      })),
      // キャンセルボタン
      {
        type: "action",
        action: {
          type: "message",
          label: "キャンセル",
          text: "キャンセル",
        },
      },
    ],
  };

  return { text, quickReply };
}

