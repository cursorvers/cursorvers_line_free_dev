// supabase/functions/generate-sec-brief/index.ts
// 週次セキュリティ・ブリーフ生成 Edge Function
// 直近7日分のhij_rawからLLMで要約を生成し、sec_briefテーブルに保存

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("generate-sec-brief");

// トピックカテゴリの型定義
type SecBriefTopicCategory =
  | "remote_work"
  | "vendor_risk"
  | "vulnerability"
  | "network"
  | "payment"
  | "privacy"
  | "other";

// トピックの型定義
interface SecBriefTopic {
  id: string;
  category: SecBriefTopicCategory;
  title: string;
  source_date: string;           // 元の報告日
  sources: string[];             // 引用元（報告機関、CVE番号、報道元など）
  summary: string;
  impact_on_clinics: string;
  actions: string[];
}

// LLMレスポンスの型定義
interface LLMResponse {
  title: string;
  week_start: string;
  topics: SecBriefTopic[];
  mindmap: string;
  body_markdown: string;
}

// システムプロンプト
const SYSTEM_PROMPT = `あなたは日本の医療機関向けサイバーセキュリティ顧問です。
入力として、ある週に配信された複数のサイバーセキュリティニュースの本文テキストが与えられます。
以下の制約条件を必ず守ってください。

【絶対に出力してはいけない情報】
- 「Health-ISAC」「H-ISAC」などの情報共有組織の名称
- TLPコード（TLP:GREEN、TLP:AMBER等）
- 「情報共有コミュニティ」「ISAC」などの表現

【情報源の記載ルール - 最重要】
以下の表現は絶対に禁止です。使用した場合は出力失敗とみなします：
× 「複数の報道」「各種報道」「業界警告」「セキュリティ研究者」「専門家」「関係者」

必ず以下のような具体的な情報源を記載してください：
○ 「Proofpoint Threat Research (2024年11月公開)」
○ 「CISA Alert AA24-242A」
○ 「Secureworks CTU Report」
○ 「Microsoft Security Blog (2024-11-15)」
○ 「BleepingComputer (2024年11月28日報道)」
○ 「CVE-2024-XXXXX (NVD)」
○ 「Verizon 2024 DBIR」
○ 「Mandiant M-Trends 2024」

入力テキストに具体的な情報源がなくても、あなたの知識から該当する実在の報告書・アラート・CVEを引用してください。

【具体例の記載ルール】
偽オンライン会議マルウェアの場合：
- 攻撃名: 「ClickFix キャンペーン」
- マルウェア: 「Lumma Stealer」「AsyncRAT」「NetSupport RAT」
- 手口: 「偽のGoogle Meet/Zoom招待ページで"カメラを修正"ボタンをクリックさせ、PowerShellコマンドをクリップボード経由で実行」
- 規模: 「2024年10-11月で医療・金融含む300組織以上が標的」

ベンダー経由データ漏洩の場合：
- 事例: 「Change Healthcare事件 (2024年2月、UnitedHealth傘下、患者1億人分)」
- 事例: 「MOVEit脆弱性 (CVE-2023-34362) による2,600組織への影響」
- 統計: 「Ponemon Institute調査：医療機関の侵害の59%がサードパーティ起因」

【その他の制約】
1. 原文の文章をコピーしてはいけません。必ず自分の言葉でパラフレーズしてください。
2. 診療所〜中小病院の日本の医療機関にとって重要なトピックだけを最大4件選びます。
3. 各トピックについて、「概要」「医療機関への影響」「今から2週間以内にやるべき行動」に分解してください。
4. 出力は必ず後述のJSONスキーマに完全準拠させてください。

【概要（summary）の書き方 - 重要】
概要は具体的かつ詳細に書いてください。以下を必ず含めること：
- 何が起きているのか（具体的な攻撃手法、マルウェア名、脆弱性の種類）
- 誰が/何が狙われているのか（標的となるシステム、ソフトウェア、業界）
- どのように攻撃されるのか（攻撃の流れ、侵入経路）
- 被害の規模や影響（データ漏洩件数、被害額、影響を受けた組織数など）

悪い例: 「偽のオンライン会議ページを通じてマルウェアが配布されています」
良い例: 「ZoomやTeamsを装った偽の会議招待ページが確認されています。ユーザーが参加ボタンをクリックすると、PowerShellスクリプトが実行され、情報窃取型マルウェア"Lumma Stealer"がダウンロードされます。11月だけで医療機関を含む500以上の組織が標的になりました。」

【アクション（actions）の書き方 - 最重要】
各アクションは「誰が」「何を」「どうやって」を明確に書いてください。
役職別に分けると分かりやすいです：

悪い例:
- 「ベンダーのセキュリティ対策を確認する」
- 「職員教育を実施する」

良い例:
- 「【院長・事務長】来週中に主要ベンダー（電子カルテ、PACS等）へ"データ暗号化の有無"を文書で問い合わせる」
- 「【IT担当】今週中にWin+Rショートカットの無効化をグループポリシーで設定（手順: gpedit.msc → ユーザー構成 → 管理用テンプレート → システム）」
- 「【看護師長・部門長】次の朝礼で"会議URLは公式カレンダーからのみ参加"とアナウンス」
- 「【全職員】不審な会議招待を受けたらIT担当に転送（メールアドレス: it-support@example.com）」

アクションは2〜4項目で、それぞれ異なる役職や担当者向けに分けると実行しやすくなります。

5. body_markdownは以下の構成で、1つのまとまった文書として出力してください：

【body_markdownの構成】
- 最初に「📋 **本ブリーフは、公開されているサイバーセキュリティ情報をもとに、医療機関向けに編集したものです。**」
- 次に「---」で区切り
- 各トピックを「## 1. タイトル」「## 2. タイトル」のように番号付きで記載
- 各トピック内は「📅 公開日」「📰 情報源」「概要」「影響」「アクション」の順
- トピック間は「---」で区切る

重要: 
- トピックは重複させないこと（同じ内容を2回書かない）
- 番号付きで順序立てて記載
- 全体で1つのまとまった文書にする`;

// ユーザープロンプトテンプレート
function buildUserPrompt(combinedText: string, weekStart: string): string {
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

// 週の開始日（月曜日）を計算
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 月曜日に調整
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

// GitHub Actions cron用のAPIキー検証
const GENERATE_API_KEY = Deno.env.get("GENERATE_SEC_BRIEF_API_KEY");

// Discord設定
const DISCORD_BOT_TOKEN = Deno.env.get("DISCORD_BOT_TOKEN");
const SEC_BRIEF_CHANNEL_ID = Deno.env.get("SEC_BRIEF_CHANNEL_ID");

// Discordメッセージ分割（2000文字制限対応）
function splitMessage(text: string, maxLength: number): string[] {
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

// Discordに自動投稿
async function postToDiscord(bodyMarkdown: string): Promise<boolean> {
  if (!DISCORD_BOT_TOKEN || !SEC_BRIEF_CHANNEL_ID) {
    log.info("Discord credentials not set, skipping auto-publish");
    return false;
  }

  const chunks = splitMessage(bodyMarkdown, 1900);

  for (const chunk of chunks) {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${SEC_BRIEF_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: chunk }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      log.error("Discord post failed", { errorText });
      return false;
    }
  }

  return true;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORSプリフライト対応
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
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

  // APIキー検証（設定されている場合のみ）
  if (GENERATE_API_KEY) {
    const apiKey = req.headers.get("X-API-Key");
    if (apiKey !== GENERATE_API_KEY) {
      log.warn("Invalid API key attempt");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 直近7日分のhij_rawを取得（TLP:GREEN or null のみ）
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);

    const { data: rows, error: fetchError } = await supabase
      .from("hij_raw")
      .select("*")
      .gte("sent_at", weekAgo.toISOString())
      .lte("sent_at", now.toISOString())
      .or("tlp.eq.GREEN,tlp.is.null")
      .order("sent_at", { ascending: true });

    if (fetchError) {
      log.error("DB Fetch Error", { errorMessage: fetchError.message });
      return new Response(
        JSON.stringify({ error: "Database Error", details: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!rows || rows.length === 0) {
      log.info("No data for this week");
      return new Response(
        JSON.stringify({ status: "no_data", message: "No hij_raw records for this week" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    log.info("Found records for the past 7 days", { count: rows.length });

    // 週の開始日を計算
    const weekStart = getWeekStart(now);

    // 同じ週のブリーフが既に存在するかチェック
    const { data: existingBrief } = await supabase
      .from("sec_brief")
      .select("id, status")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existingBrief) {
      log.info("Brief already exists for week", { weekStart, existingId: existingBrief.id, existingStatus: existingBrief.status });
      return new Response(
        JSON.stringify({
          status: "skipped",
          message: `Brief already exists for week ${weekStart}`,
          existing_id: existingBrief.id,
          existing_status: existingBrief.status,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 本文を結合（メール日付も含める）
    const combinedText = rows
      .map((r) => `【${r.subject || "No Subject"}】(受信日: ${new Date(r.sent_at).toLocaleDateString("ja-JP")})\n${r.raw_text}`)
      .join("\n\n----\n\n");

    // OpenAI API呼び出し
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      log.error("OPENAI_API_KEY not set");
      return new Response(
        JSON.stringify({ error: "Configuration Error", details: "OPENAI_API_KEY not set" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // タイムアウト付きでOpenAI API呼び出し（60秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let openaiRes: Response;
    try {
      openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(combinedText, weekStart) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 4000,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!openaiRes.ok) {
      const errorText = await openaiRes.text();
      log.error("OpenAI API Error", { errorText });
      return new Response(
        JSON.stringify({ error: "LLM Error", details: errorText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiJson = await openaiRes.json();
    const brief: LLMResponse = JSON.parse(openaiJson.choices[0].message.content);

    log.info("Generated brief", { title: brief.title, topicsCount: brief.topics.length });

    // sec_briefテーブルに挿入
    const sourceIds = rows.map((r) => r.id);

    const { data: insertedBrief, error: insertError } = await supabase
      .from("sec_brief")
      .insert({
        week_start: brief.week_start,
        title: brief.title,
        topics: brief.topics,
        mindmap: brief.mindmap,
        body_markdown: brief.body_markdown,
        source_ids: sourceIds,
        status: "draft",
      })
      .select("id")
      .single();

    if (insertError) {
      log.error("DB Insert Error", { errorMessage: insertError.message });
      return new Response(
        JSON.stringify({ error: "Database Error", details: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    log.info("Inserted sec_brief", { briefId: insertedBrief.id });

    // 自動でDiscordに投稿
    let published = false;
    const discordSuccess = await postToDiscord(brief.body_markdown);
    
    if (discordSuccess) {
      // ステータスをpublishedに更新
      const { error: updateError } = await supabase
        .from("sec_brief")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", insertedBrief.id);

      if (updateError) {
        log.error("Status update error", { errorMessage: updateError.message });
      } else {
        published = true;
        log.info("Auto-published to Discord", { title: brief.title });
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        id: insertedBrief.id,
        title: brief.title,
        week_start: brief.week_start,
        topics_count: brief.topics.length,
        source_count: sourceIds.length,
        published: published,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    log.error("Request processing error", { errorMessage: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

