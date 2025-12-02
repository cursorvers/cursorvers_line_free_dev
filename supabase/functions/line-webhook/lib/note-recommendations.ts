// supabase/functions/line-webhook/lib/note-recommendations.ts
// 診断キーワードごとの note 記事推薦（静的設定）

import type { CourseRecommendation, NoteArticle } from "./types.ts";

// =======================
// 1. 病院AIリスク診断
// =======================
const hospitalCourse: CourseRecommendation = {
  keyword: "病院AIリスク診断",
  articles: [
    // タグを追加することで、新しい記事が自動的に診断結果に反映される
    // tags の値は diagnosis-flow.ts の layer2 選択肢と一致させる
    { id: "clinic_roi_2025", title: "【2025年最新版】診療所の医療AI導入—コスト、便益、ROIを徹底分析する経営者ガイド", url: "https://note.com/nice_wren7963/n/n04503e233d66", tags: ["コスト・投資対効果"] },
    { id: "why_ai_fails", title: "【なぜ医療AIの導入は失敗するのか？】 「抵抗」を「推進力」に変える10の原則", url: "https://note.com/nice_wren7963/n/nc0d61899b04d", tags: ["コスト・投資対効果", "業務効率化・省力化"] },
    { id: "ehr_3sho2", title: "【オールインワンAI電子カルテと3省2ガイドライン】 Medlay AI Cloudを事例に読み解く安全導入の要点", url: "https://note.com/nice_wren7963/n/n292021a47632", tags: ["規制・コンプライアンス", "セキュリティ・個人情報"] },
    { id: "ai_economics", title: "【医療AIの経済性評価】 その投資は本当に「価値」があるのか？", url: "https://note.com/nice_wren7963/n/n806443fb0964", tags: ["コスト・投資対効果"] },
    { id: "regional_ai", title: "【AIは地域医療に何をもたらすか】 診療所・病院・在宅医療を繋ぐ「地域医療AI」の設計図", url: "https://note.com/nice_wren7963/n/nc39351e10d56", tags: ["業務効率化・省力化", "医療の質・患者体験"] },
    { id: "japan_reboot_2040", title: "【日本の医療、再生への大設計図】 2040年への計画と、AIが拓く新地平", url: "https://note.com/nice_wren7963/n/nd0a5e3b7dcb7", tags: ["規制・コンプライアンス"] },
    { id: "outreach", title: "【病院を受診する「前」から拾いにいく医療AI】 プライマリケアの未来を変える「予防的アウトリーチ」", url: "https://note.com/nice_wren7963/n/n6585b693b335", tags: ["業務効率化・省力化", "医療の質・患者体験"] },
    { id: "automation_n8n", title: "【診療所の業務自動化：n8nだけでは足りない理由】 Diff/SimAIで実現する「デジタル・フロントドア」戦略の設計図", url: "https://note.com/nice_wren7963/n/n437f83983fa7", tags: ["業務効率化・省力化"] },
    { id: "ai_psy_therapy", title: "【AIセラピーの医療的価値とガバナンスフレームワーク】 臨床的有効性と倫理的課題の統合的検討", url: "https://note.com/nice_wren7963/n/n34b5abf063f4", tags: ["医療の質・患者体験"] },
    { id: "hospital_perfect_answer", title: "【病院・診療所・在宅医療におけるAI導入の「正解」】 組織文化と技術の統合", url: "https://note.com/nice_wren7963/n/nc39351e10d56", tags: ["セキュリティ・個人情報", "業務効率化・省力化"] },
    { id: "state_of_ai_2025", title: "【マッキンゼー「State of AI 2025」の新規性を抉る】 「AIエージェント」はなぜスケールしないのか？", url: "https://note.com/nice_wren7963/n/naa570ded3bae", tags: ["規制・コンプライアンス"] },
    { id: "japan_ai_frontier", title: "【日本の医療AI、その最前線と未来図】 2024年の総括と2025年への展望", url: "https://note.com/nice_wren7963/n/n9623a4b0ca36", tags: ["規制・コンプライアンス", "医療の質・患者体験"] },
  ],
};

// =======================
// 2. SaMDスタートアップ診断
// =======================
const samdCourse: CourseRecommendation = {
  keyword: "SaMDスタートアップ診断",
  articles: [
    // tags: layer2「現在のフェーズは？」の選択肢に対応
    { id: "samd_guide", title: "【実務家のためのAI搭載SaMDガイド】 FDA承認から日本での実装まで", url: "https://note.com/nice_wren7963/n/n6e959ecdbbaa", tags: ["アイデア・企画段階", "薬事申請・承認取得"] },
    { id: "evals_kpi", title: "【医療AIの「Evals × KPI」】 なぜ二重の評価ループ設計が実装の成否を分けるのか", url: "https://note.com/nice_wren7963/n/nff0c3a33bd2c", tags: ["プロトタイプ開発中"] },
    { id: "pm_checklist", title: "【プロダクトマネージャー必見】 現役医師が明かす、医療AI開発で絶対に見落としてはいけない「臨床ニーズ」の本質", url: "https://note.com/nice_wren7963/n/n8ec3358fc4cd", tags: ["アイデア・企画段階"] },
    { id: "pccp_fda", title: "【2025年、医療AIは「学習」を始める？】 FDAのPCCP最終ガイダンスを読み解く", url: "https://note.com/nice_wren7963/n/ne14ce4cb14da", tags: ["臨床試験・治験準備", "薬事申請・承認取得"] },
    { id: "xai_framework", title: "【医療AIの「ブラックボックス」に光を】 説明可能性と倫理を両立させる新・開発フレームワーク", url: "https://note.com/nice_wren7963/n/neb0ecb620a70", tags: ["アイデア・企画段階", "プロトタイプ開発中"] },
    { id: "agent_or_device", title: "【業務効率化か、医療機器か】 AIエージェントの医療現場への「正しい」導入設計", url: "https://note.com/nice_wren7963/n/n870b231db466", tags: ["臨床試験・治験準備"] },
    { id: "optimal_vs_satisfactory", title: "AIの「最適解」を疑え！現場の「納得解」を実装する医療AI開発の新フレームワーク", url: "https://note.com/nice_wren7963/n/n98baf19b65f6", tags: ["プロトタイプ開発中"] },
    { id: "paradigm_integration", title: "【医療AIの次なるパラダイム】 『二者択一』から『統合』へ", url: "https://note.com/nice_wren7963/n/nb6552ea2b614", tags: ["市販後・スケール段階"] },
    { id: "eu_ai_act", title: "【EU AI Actという設計図】 医療AIは『規制』を『競争力』に変えられるか", url: "https://note.com/nice_wren7963/n/na37ff5135e78", tags: ["薬事申請・承認取得", "市販後・スケール段階"] },
    { id: "xhaim", title: "【xHAIM：カルテの海から診断の宝石を掘り出す】 医療AIの新しい設計図", url: "https://note.com/nice_wren7963/n/na6c1afdbdf18", tags: ["プロトタイプ開発中"] },
    { id: "10sec_trap", title: "「10秒」の罠：外傷AIは「診断の速さ」ではなく「思考の質」で評価されるべき", url: "https://note.com/nice_wren7963/n/n6e7e00c114a7", tags: ["臨床試験・治験準備"] },
    { id: "ai_inventor", title: "【AIは「発明者」たり得るか？】 知的財産と医療AIの新しい関係", url: "https://note.com/nice_wren7963/n/n1fef186dba06", tags: ["市販後・スケール段階"] },
  ],
};

// =======================
// 3. 医療データガバナンス診断
// =======================
const dataGovCourse: CourseRecommendation = {
  keyword: "医療データガバナンス診断",
  articles: [
    // tags: layer2「データ活用の目的は？」の選択肢に対応
    { id: "enicia_aibtrust", title: "【エニシア vs AIBTRUST】 最新の患者情報技術で読み解く「医療AIリファラル型」の未来地図", url: "https://note.com/nice_wren7963/n/n61e0a3f476a5", tags: ["院内業務の効率化", "外部連携・共有"] },
    { id: "referral_gennai", title: "【医療AIリファラル型の全貌】 デジタル庁ガバメントAI「源内」に学ぶ、連携の設計図", url: "https://note.com/nice_wren7963/n/nbb7b6fc2128c", tags: ["院内業務の効率化", "外部連携・共有"] },
    { id: "double_helix", title: "【医療AIの「二重螺旋」】 厚労省DXの「標準化」とSIPの「日本語LLM」が織りなす未来", url: "https://note.com/nice_wren7963/n/n7c4d83ca0966", tags: ["院内業務の効率化"] },
    { id: "referral_ethics", title: "【リファラル型AI医療の革新】 セーフティネットという幻想と、実装現場で顕在化する5つの倫理的断層", url: "https://note.com/nice_wren7963/n/n2277aa49e630", tags: ["研究・二次利用"] },
    { id: "ai_security_subcommittee", title: "【政府が描く「安全なAI」は医療を救えるか？】 「AIセキュリティ分科会」の議論から紐解く、医療AIリファラルの倫理的・社会的課題", url: "https://note.com/nice_wren7963/n/n2d16a1295c7b", tags: ["外部連携・共有"] },
    { id: "patient_data_revolution", title: "【患者主権の医療データ革命】 ブロックチェーンとAIで実現する『信頼のインフラ』", url: "https://note.com/nice_wren7963/n/nc48a5f57a7a7", tags: ["研究・二次利用", "AI開発・学習"] },
    { id: "jdla_contract", title: "『安全な医療AI実装へ向けて』 JDLA生成AI契約ガイドラインを基盤とした安全な社会実装への道筋", url: "https://note.com/nice_wren7963/n/n3f579313f6fc", tags: ["研究・二次利用", "AI開発・学習"] },
    { id: "state_ai_policy", title: "【AIは国家をどう変えるか】 デジタル庁の「AI戦略」から読み解く、医療AIの未来図", url: "https://note.com/nice_wren7963/n/n39a2a19bf491", tags: ["外部連携・共有"] },
    { id: "gafam_battlefield", title: "【GAFAMの最終戦場は『命』である】―プラットフォーマーが医療を支配する日", url: "https://note.com/nice_wren7963/n/nd39086dc0807", tags: ["AI開発・学習"] },
  ],
};

// =======================
// 4. 臨床知アセット診断
// =======================
const clinicalAssetCourse: CourseRecommendation = {
  keyword: "臨床知アセット診断",
  articles: [
    // tags: layer2「AIに期待することは？」の選択肢に対応
    { id: "ai_clinical_soul", title: "『AIに、臨床の魂を』 なぜ私は、集中治療専門医として「医療×AI」の未来を描き続けるのか（2025-11-30更新）", url: "https://note.com/nice_wren7963/n/n08c17b96b8f3", tags: ["学習・教育"] },
    { id: "ocr_memory", title: "【AIは「記憶」をどう変えるか？】 DeepSeek-OCRの「光学的圧縮」と学習科学の交差点", url: "https://note.com/nice_wren7963/n/n23214a874097", tags: ["文書作成・記録", "学習・教育"] },
    { id: "too_smart_ai", title: "『賢すぎるAI、人間らしすぎる医師』 ― テクノロジーと倫理が交わる、新しい協働のかたち", url: "https://note.com/nice_wren7963/n/ndec7b92b9e5c", tags: ["文書作成・記録", "患者コミュニケーション"] },
    { id: "heterogeneity_by_design", title: "医療AIは『思考の均質化』を乗り越えられるか ―Heterogeneity-by-Design による新・開発フレームワーク", url: "https://note.com/nice_wren7963/n/n54cb476f7543", tags: ["診断・判断支援"] },
    { id: "sinking_expertise", title: "『沈みゆく専門知』 医療AIがもたらす、臨床医の「思考の危機」", url: "https://note.com/nice_wren7963/n/n189afd44578a", tags: ["診断・判断支援", "学習・教育"] },
    { id: "g_amie", title: "g-AMIEの一次情報に学ぶ、AIとの「協働」を実装する医療現場の設計", url: "https://note.com/nice_wren7963/n/ne7c234de3eda", tags: ["診断・判断支援"] },
    { id: "nextgen_psychiatry", title: "【次世代精神医療への羅針盤】 AIと「心」の関係性を問い直す", url: "https://note.com/nice_wren7963/n/n96c6ff19f0ee", tags: ["患者コミュニケーション"] },
    { id: "voice_chart", title: "医療の未来を左右する「声のカルテ」―AI音声認識が医療現場にもたらす可能性と課題", url: "https://note.com/nice_wren7963/n/n337eae4fa87d", tags: ["文書作成・記録"] },
  ],
};

// =======================
// 5. 教育AI導入診断
// =======================
const eduCourse: CourseRecommendation = {
  keyword: "教育AI導入診断",
  articles: [
    // tags: layer2「教育AIの活用目的は？」の選択肢に対応
    { id: "edu_ai_v2", title: "教育AI導入『バージョン2.0』 理念から実装へのロードマップ", url: "https://note.com/nice_wren7963/n/n13736fb9c84a", tags: ["カリキュラム設計", "評価・フィードバック"] },
    { id: "genai_med_education", title: "【生成AIは医学生、そして臨床医の思考をどう変えるのか】 医学教育の「第二の転換点」", url: "https://note.com/nice_wren7963/n/n761b986966b0", tags: ["個別学習支援", "シミュレーション"] },
  ],
};

// =======================
// 6. 次世代AI実装診断
// =======================
const nextgenCourse: CourseRecommendation = {
  keyword: "次世代AI実装診断",
  articles: [
    // tags: layer2「関心のある応用分野は？」の選択肢に対応
    { id: "nano_banana", title: "Google「Nano Banana Pro」が医療現場にもたらす「視覚的対話」の革命 — デザインの聖域崩壊が意味する、インフォームド・コンセントの未来", url: "https://note.com/nice_wren7963/n/n493da21d3d49", tags: ["診断・画像解析", "ヘルスケア・予防"] },
    { id: "physical_ai", title: "【安全に「動く知性」を設計する】 医療分野におけるフィジカルAI、次なるフロンティアへのロードマップ", url: "https://note.com/nice_wren7963/n/nf07282e49111", tags: ["手術・治療支援"] },
    { id: "gc_modern_infra", title: "【Google Cloud Modern Infra & App Summit 25 Fallレポート】 医療AIより先に「AIを作るAI」と「Platform Engineering」が必要な理由", url: "https://note.com/nice_wren7963/n/nf8a747ffab7f", tags: ["創薬・研究"] },
    { id: "incurable_disease", title: "【AIは「不治の病」を終わらせるのか？】 脊髄損傷治療のゲームチェンジャー、NeuralinkとSynchron", url: "https://note.com/nice_wren7963/n/nf0e58f499fcd", tags: ["手術・治療支援"] },
    { id: "wh_pediatric_cancer", title: "【米国ホワイトハウスの小児がんAI革命】 医療の未来を変える国家戦略の全貌", url: "https://note.com/nice_wren7963/n/n46e6f71ba147", tags: ["手術・治療支援"] },
    { id: "sora2", title: "『Sora 2』騒動から読み解く — 医療AIに不可欠な「生成の制御」と「生成の説明責任」", url: "https://note.com/nice_wren7963/n/n9310a58d9fdd", tags: ["ヘルスケア・予防"] },
    { id: "env_cost", title: "【AIは地球に優しい医療をつくれるか】 医療AIの「環境コスト」を考える", url: "https://note.com/nice_wren7963/n/n2d550a5bdbe5", tags: ["創薬・研究"] },
    { id: "google_new_dimension", title: "【Googleが描く医療AIの新次元】 世界の医療AIトレンドから日本が学ぶべきこと", url: "https://note.com/nice_wren7963/n/nce5dbb35f0a8", tags: ["診断・画像解析"] },
    { id: "ms_multi_ai", title: "【MicrosoftのマルチAI戦略は医療の未来をどう変えるか】 OpenAI存続からの読み解き", url: "https://note.com/nice_wren7963/n/n25a57da5a197", tags: ["診断・画像解析", "創薬・研究"] },
  ],
};

// =======================
// エクスポート
// =======================
export const COURSE_RECOMMENDATIONS: CourseRecommendation[] = [
  hospitalCourse,
  samdCourse,
  dataGovCourse,
  clinicalAssetCourse,
  eduCourse,
  nextgenCourse,
];

/**
 * 診断キーワードから推奨記事リストを取得
 */
export function getRecommendationsForKeyword(
  keyword: string
): CourseRecommendation | null {
  return (
    COURSE_RECOMMENDATIONS.find((c) => c.keyword === keyword) ?? null
  );
}

/**
 * 診断キーワードから「まず読むべき1本」を取得
 */
export function getFirstArticle(keyword: string): NoteArticle | null {
  const course = getRecommendationsForKeyword(keyword);
  if (!course || course.articles.length === 0) return null;
  return course.articles[0];
}

/**
 * 記事IDから記事オブジェクトを取得
 */
export function getArticleById(articleId: string): NoteArticle | null {
  for (const course of COURSE_RECOMMENDATIONS) {
    const article = course.articles.find((a) => a.id === articleId);
    if (article) return article;
  }
  return null;
}

/**
 * 記事ID配列から記事オブジェクト配列を取得
 */
export function getArticlesByIds(articleIds: string[]): NoteArticle[] {
  const articles: NoteArticle[] = [];
  for (const id of articleIds) {
    const article = getArticleById(id);
    if (article) {
      articles.push(article);
    }
  }
  return articles;
}

/**
 * タグに一致する記事を取得（新しい記事を追加するだけで自動反映）
 * @param tag - 検索するタグ（例: "コスト・投資対効果"）
 * @param limit - 最大取得件数（デフォルト: 3）
 * @returns タグに一致する記事の配列
 */
export function getArticlesByTag(tag: string, limit: number = 3): NoteArticle[] {
  if (!tag || typeof tag !== "string" || tag.trim().length === 0) {
    console.warn("[note-recommendations] Invalid tag provided:", tag);
    return [];
  }
  
  if (limit < 1) {
    console.warn("[note-recommendations] Invalid limit:", limit);
    return [];
  }
  
  const matchingArticles: NoteArticle[] = [];
  
  for (const course of COURSE_RECOMMENDATIONS) {
    for (const article of course.articles) {
      // タグが存在し、指定されたタグを含む場合
      if (article.tags && article.tags.length > 0 && article.tags.includes(tag)) {
        matchingArticles.push(article);
      }
    }
  }
  
  // 重複を除去（同じ記事が複数コースに含まれる場合）
  const uniqueArticles = matchingArticles.filter(
    (article, index, self) => self.findIndex((a) => a.id === article.id) === index
  );
  
  return uniqueArticles.slice(0, limit);
}

/**
 * 全記事を取得
 */
export function getAllArticles(): NoteArticle[] {
  const allArticles: NoteArticle[] = [];
  
  for (const course of COURSE_RECOMMENDATIONS) {
    allArticles.push(...course.articles);
  }
  
  // 重複を除去
  return allArticles.filter(
    (article, index, self) => self.findIndex((a) => a.id === article.id) === index
  );
}
