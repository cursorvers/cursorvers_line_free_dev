/**
 * LINE/LIFF用: 無料登録でメール任意取得し members にUPSERT
 * フロー1: メールアドレスのみ保存（line_user_idなし）
 * フロー2: LINEログイン後、メールアドレスとline_user_idを紐付け
 * - line_user_id: 任意（LIFFのuserId、紐付け時に必要）
 * - email: 任意（メールアドレス登録時）
 * - opt_in_email: デフォルト true（明示的に false 指定可）
 * セキュリティ: line_user_idがある場合はLINEのプロフィール取得で検証
 */
import { createClient } from "@supabase/supabase-js";
import { extractErrorMessage } from "../_shared/error-utils.ts";
import { createSheetsClientFromEnv } from "../_shared/google-sheets.ts";
import { createLogger } from "../_shared/logger.ts";
import { maskEmail, maskLineUserId } from "../_shared/masking-utils.ts";
import {
  createCorsHeaders,
  createCorsPreflightResponse,
} from "../_shared/http-utils.ts";
import { notifyLineEvent } from "../_shared/n8n-notify.ts";

const log = createLogger("line-register");

// ボット対策: 登録レート制限（1時間あたりの登録上限）
const RATE_LIMIT = {
  MAX_REGISTRATIONS_PER_HOUR: 5,
  ACTION: "line_register",
} as const;

// 日本時間（JST, UTC+9）を返すヘルパー関数
function getJSTTimestamp(): string {
  const now = new Date();
  const jstOffset = 9 * 60; // JST is UTC+9
  const jstTime = new Date(now.getTime() + jstOffset * 60 * 1000);
  return jstTime.toISOString().replace("Z", "+09:00");
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
// V2 を優先、無ければ従来キー
const LINE_CHANNEL_ACCESS_TOKEN =
  Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN_V2") ??
    Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ??
    "";
// Google Sheets 連携（任意）
const MEMBERS_SHEET_ID = Deno.env.get("MEMBERS_SHEET_ID") ?? "";
const MEMBERS_SHEET_TAB = Deno.env.get("MEMBERS_SHEET_TAB") ?? "members";
const GOOGLE_SA_JSON = Deno.env.get("GOOGLE_SA_JSON") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// リクエストごとのCORSヘッダーを保持
let currentCorsHeaders: Record<string, string> = {};

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

// IPアドレス取得（Cloudflare/プロキシ対応）
function getClientIP(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown"
  );
}

// レート制限チェック（ボット対策）
async function checkRegistrationRateLimit(
  identifier: string,
): Promise<{ allowed: boolean; count: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("action", RATE_LIMIT.ACTION)
    .gte("attempted_at", oneHourAgo);

  if (error) {
    log.warn("Rate limit check failed, allowing request", {
      errorMessage: error.message,
    });
    return { allowed: true, count: 0 };
  }

  const attempts = count ?? 0;
  return {
    allowed: attempts < RATE_LIMIT.MAX_REGISTRATIONS_PER_HOUR,
    count: attempts,
  };
}

// レート制限記録
async function recordRegistrationAttempt(
  identifier: string,
  success: boolean,
): Promise<void> {
  try {
    await supabase.from("rate_limits").insert({
      identifier,
      action: RATE_LIMIT.ACTION,
      success,
    });
  } catch (err) {
    log.warn("Failed to record rate limit", {
      errorMessage: extractErrorMessage(err),
    });
  }
}

async function appendMemberRow(row: unknown[]) {
  if (!MEMBERS_SHEET_ID || !GOOGLE_SA_JSON) {
    return;
  }
  try {
    const client = await createSheetsClientFromEnv(
      GOOGLE_SA_JSON,
      MEMBERS_SHEET_ID,
    );
    await client.append(MEMBERS_SHEET_TAB, [row]);
    log.info("Appended member to sheet", { tab: MEMBERS_SHEET_TAB });
  } catch (err) {
    log.warn("Failed to append to sheet", {
      errorMessage: extractErrorMessage(err),
    });
  }
}

Deno.serve(async (req) => {
  // リクエストごとにCORSヘッダーを設定
  currentCorsHeaders = createCorsHeaders(req);
  const headers = { ...currentCorsHeaders, "Content-Type": "application/json" };

  try {
    // 環境変数チェック
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      log.error("Missing required environment variables", {
        hasSupabaseUrl: !!SUPABASE_URL,
        hasServiceRoleKey: !!SUPABASE_SERVICE_ROLE_KEY,
      });
      return badRequest("Server configuration error", 500);
    }

    log.info("Request received", { method: req.method });

    if (req.method === "OPTIONS") {
      return createCorsPreflightResponse(req);
    }

    if (req.method !== "POST") {
      log.warn("Method not allowed", { method: req.method });
      return badRequest("Method not allowed", 405);
    }

    // ボット対策: IPベースのレート制限チェック
    const clientIP = getClientIP(req);
    const rateCheck = await checkRegistrationRateLimit(clientIP);
    if (!rateCheck.allowed) {
      log.warn("Registration rate limit exceeded", {
        clientIP,
        attempts: rateCheck.count,
        limit: RATE_LIMIT.MAX_REGISTRATIONS_PER_HOUR,
      });
      return new Response(
        JSON.stringify({
          error: "Too many registration attempts. Please try again later.",
          retryAfter: 3600,
        }),
        {
          status: 429,
          headers: { ...currentCorsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const smokeMode = Deno.env.get("LINE_REGISTER_SMOKE_MODE") === "true";
    const isSmokeRequest = smokeMode &&
      req.headers.get("x-smoke-test") === "true";
    if (isSmokeRequest) {
      log.info("LINE register smoke mode", { method: req.method });
      return new Response(
        JSON.stringify({ ok: true, smoke: true }),
        { status: 200, headers },
      );
    }

    let body: {
      line_user_id?: string;
      email?: string | null;
      opt_in_email?: boolean;
    };

    try {
      body = await req.json();
      log.info("Request body parsed", {
        hasEmail: !!body.email,
        hasLineUserId: !!body.line_user_id,
        emailPrefix: maskEmail(body.email),
      });
    } catch (err) {
      log.error("Failed to parse JSON", {
        errorMessage: extractErrorMessage(err),
      });
      return badRequest("Invalid JSON");
    }

    const lineUserId = body.line_user_id?.trim() || null;
    const email = normalizeEmail(body.email ?? null);
    const optInEmail = typeof body.opt_in_email === "boolean"
      ? body.opt_in_email
      : true;

    // line_user_idまたはemailのいずれかが必須
    if (!lineUserId && !email) {
      log.warn("Both line_user_id and email are missing");
      return badRequest("line_user_id or email is required");
    }

    // line_user_idがある場合は検証（オプション）
    if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
      // Verify line_user_id by calling LINE profile API (optional)
      try {
        const res = await fetch(
          `https://api.line.me/v2/bot/profile/${lineUserId}`,
          {
            headers: {
              Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
            },
          },
        );
        if (!res.ok) {
          log.warn("LINE profile fetch failed (user may not be a friend)", {
            lineUserId: maskLineUserId(lineUserId) ?? "null",
            status: res.status,
          });
          // 401または404エラーの場合は友だちでない可能性があるため、検証をスキップ
          if (res.status !== 401 && res.status !== 404) {
            return badRequest("LINE verification failed", res.status);
          }
        } else {
          log.info("LINE profile verified", {
            lineUserId: maskLineUserId(lineUserId) ?? "null",
          });
        }
      } catch (err) {
        log.error("LINE profile verification error", {
          lineUserId: maskLineUserId(lineUserId) ?? "null",
          errorMessage: extractErrorMessage(err),
        });
        // エラーが発生しても処理を継続
      }
    }

    // 既存レコードの型定義
    type MemberRecord = {
      id: string;
      email: string | null;
      line_user_id: string | null;
      tier: string | null;
    };

    // 既存レコードを確認（emailまたはline_user_idで）
    let existingRecord: MemberRecord | null = null;
    if (email) {
      const { data: emailRecord } = await supabase
        .from("members")
        .select("id,email,line_user_id,tier")
        .eq("email", email)
        .maybeSingle();
      existingRecord = emailRecord as MemberRecord | null;
    }

    if (lineUserId && !existingRecord) {
      const { data: lineRecord } = await supabase
        .from("members")
        .select("id,email,line_user_id,tier")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      existingRecord = lineRecord as MemberRecord | null;
    }

    // 有料会員を無料で上書きしない
    const paidTiers = ["library", "master"];
    const isPaid = existingRecord?.tier
      ? paidTiers.includes(existingRecord.tier)
      : false;

    // 無料用のpayloadを作成（デフォルトでtier=free）
    const payload: Record<string, unknown> = {
      tier: existingRecord?.tier ?? "free",
      status: "active",
      opt_in_email: optInEmail,
      updated_at: getJSTTimestamp(),
    };

    if (email) payload["email"] = email;
    if (lineUserId) payload["line_user_id"] = lineUserId;

    let error;

    if (existingRecord) {
      if (isPaid) {
        // 有料の場合は原則上書きしないが、line_user_id が未設定なら紐付けのみ許可
        if (lineUserId && !existingRecord.line_user_id) {
          const { error: updatePaid } = await supabase
            .from("members")
            .update({
              line_user_id: lineUserId,
              updated_at: getJSTTimestamp(),
            })
            .eq("id", existingRecord.id);
          if (updatePaid) {
            error = updatePaid;
          } else {
            // 有料会員にLINE紐付け成功後、同じline_user_idの孤児レコードを削除
            const { data: orphans } = await supabase
              .from("members")
              .select("id")
              .eq("line_user_id", lineUserId)
              .neq("id", existingRecord.id);

            const orphanList = orphans as { id: string }[] | null;
            if (orphanList && orphanList.length > 0) {
              for (const orphan of orphanList) {
                await supabase.from("members").delete().eq("id", orphan.id);
                log.info("Deleted orphan record after LINE linking", {
                  orphanId: orphan.id,
                  lineUserId: maskLineUserId(lineUserId),
                });
              }
            }
          }
        }
      } else {
        // 既存が無料の場合のみ更新（tierはfreeを維持）
        payload["tier"] = "free";

        if (existingRecord.email && existingRecord.email === email) {
          const { error: updateError } = await supabase
            .from("members")
            .update(payload)
            .eq("email", email);
          error = updateError;
        } else if (
          existingRecord.line_user_id &&
          existingRecord.line_user_id === lineUserId
        ) {
          const { error: updateError } = await supabase
            .from("members")
            .update(payload)
            .eq("line_user_id", lineUserId);
          error = updateError;
        } else {
          const { error: updateError } = await supabase
            .from("members")
            .update(payload)
            .eq("id", existingRecord.id);
          error = updateError;
        }
      }
    } else {
      // 新規作成（無料として）
      payload["tier"] = "free";
      const { error: insertError } = await supabase
        .from("members")
        .insert(payload);
      error = insertError;
    }

    if (error) {
      log.error("Database upsert error", {
        email: maskEmail(email),
        lineUserId: maskLineUserId(lineUserId),
        errorMessage: error.message,
        isUpdate: !!existingRecord,
      });
      return badRequest("Database error", 500);
    }

    // ログをデータベースに保存
    try {
      const logPayload: {
        log_level: string;
        source: string;
        message: string;
        details: Record<string, unknown>;
      } = {
        log_level: existingRecord ? "info" : "info",
        source: "line-register",
        message: existingRecord ? "Member updated" : "Member created",
        details: {
          hasEmail: !!email,
          hasLineUserId: !!lineUserId,
          optInEmail: optInEmail,
          isUpdate: !!existingRecord,
          emailPrefix: maskEmail(email),
          lineUserIdSuffix: maskLineUserId(lineUserId),
        },
      };

      const { error: logError } = await supabase.from("logs").insert(
        logPayload,
      );
      if (logError) {
        log.warn("Failed to save log to database", {
          errorMessage: logError.message,
        });
      } else {
        log.debug("Log saved to database");
      }
    } catch (logErr) {
      log.warn("Error saving log", {
        errorMessage: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }

    // Google Sheets へ追記（設定されている場合のみ）
    await appendMemberRow([
      email ?? "",
      (payload["tier"] as string) ?? "",
      (payload["status"] as string) ?? "",
      "", // period_end（未管理）
      optInEmail,
      (payload["updated_at"] as string) ?? getJSTTimestamp(),
      lineUserId ?? "",
      "", // stripe_customer_id（未設定）
      "", // stripe_subscription_id（未設定）
      "", // subscription_status（未設定）
    ]);

    log.info("Registration completed", {
      email: maskEmail(email),
      lineUserId: maskLineUserId(lineUserId),
      optInEmail: optInEmail,
      isUpdate: !!existingRecord,
    });

    // レート制限記録（成功）
    await recordRegistrationAttempt(clientIP, true);

    // 新規登録時のみn8n経由でDiscord通知（非同期・失敗しても続行）
    if (!existingRecord && lineUserId) {
      notifyLineEvent(
        "new_registration",
        lineUserId,
        undefined, // displayNameはLIFF側で取得していないためundefined
        undefined, // pictureUrl
      ).catch((err) => {
        log.warn("n8n notification failed", {
          error: extractErrorMessage(err),
        });
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        line_user_id: lineUserId,
        email,
        opt_in_email: optInEmail,
      }),
      { status: 200, headers },
    );
  } catch (err) {
    log.error("Unhandled error in serve", {
      errorMessage: extractErrorMessage(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: extractErrorMessage(err),
      }),
      { status: 500, headers },
    );
  }
});
