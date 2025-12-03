// supabase/functions/ingest-hij/index.ts
// Health-ISAC Japan メール取り込み Edge Function
// Google Apps Script or 手動転送からのJSON POSTを受け取り、hij_rawテーブルに保存

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 入力ペイロードの型定義
interface IngestPayload {
  message_id: string;
  sent_at: string;
  subject: string;
  body: string;
}

// TLP抽出関数
function extractTLP(text: string): string | null {
  // TLP:GREEN, TLP:AMBER, TLP:RED, TLP:CLEAR をマッチ
  const match = text.match(/TLP:\s*(GREEN|AMBER|RED|CLEAR)/i);
  return match ? match[1].toUpperCase() : null;
}

// APIキー検証用（簡易認証）
const INGEST_API_KEY = Deno.env.get("INGEST_HIJ_API_KEY");

serve(async (req: Request): Promise<Response> => {
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
  if (INGEST_API_KEY) {
    const apiKey = req.headers.get("X-API-Key");
    if (apiKey !== INGEST_API_KEY) {
      console.error("Invalid API key");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    // ペイロードをパース
    const payload = (await req.json()) as IngestPayload;

    // 必須フィールドの検証
    if (!payload.message_id || !payload.sent_at || !payload.body) {
      return new Response(
        JSON.stringify({
          error: "Bad Request",
          details: "message_id, sent_at, body are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // TLPを本文または件名から抽出
    const tlp = extractTLP(payload.body) || extractTLP(payload.subject || "");

    // Supabaseクライアント初期化
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // hij_rawテーブルに挿入
    const { data, error } = await supabase.from("hij_raw").insert({
      message_id: payload.message_id,
      sent_at: payload.sent_at,
      subject: payload.subject || null,
      tlp,
      raw_text: payload.body,
    }).select("id").single();

    if (error) {
      // 重複エラー（UNIQUE制約違反）の場合は200を返す（冪等性）
      if (error.code === "23505") {
        console.log(`Duplicate message_id: ${payload.message_id}`);
        return new Response(
          JSON.stringify({
            status: "duplicate",
            message: "Message already exists",
            message_id: payload.message_id,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      console.error("DB Insert Error:", error);
      return new Response(
        JSON.stringify({ error: "Database Error", details: error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Ingested: ${payload.message_id}, TLP: ${tlp || "none"}, ID: ${data.id}`);

    return new Response(
      JSON.stringify({
        status: "success",
        id: data.id,
        message_id: payload.message_id,
        tlp,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Request processing error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

