/**
 * Stats Exporter Edge Function
 * LINE イベントデータを Google Sheets にエクスポート
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1?target=deno";

/** LINE イベントレコード */
interface LineEvent {
  created_at: string | null;
  line_user_id: string | null;
  message_text: string | null;
  normalized_keyword: string | null;
  risk_level: string | null;
  contains_phi: boolean | null;
  membership_email: string | null;
  membership_tier: string | null;
  subscription_status: string | null;
  billing_cycle_anchor: string | null;
  tuition_credit_yen: number | null;
  stripe_customer_email: string | null;
  reply_success: boolean | null;
  error_code: string | null;
  metadata: {
    discord_notify_id?: string;
    replyTemplate?: string;
    processingMs?: number;
  } | null;
}

/** 会員情報レコード */
interface LibraryMember {
  line_user_id: string | null;
  membership_tier: string | null;
  subscription_status: string | null;
  active_months: number | null;
  next_billing_at: string | null;
  last_payment_at: string | null;
  stripe_customer_email: string | null;
  last_interaction_at: string | null;
}

/** 日次サマリー中間データ */
interface DailySummaryAccumulator {
  date: string;
  totalEvents: number;
  uniqueUserSet: Set<string>;
  riskSafe: number;
  riskWarning: number;
  riskDanger: number;
  phiAlerts: number;
  tierMatsu: number;
  tierTake: number;
  tierUme: number;
  totalProcessingMs: number;
  processingCount: number;
}

/** 日次サマリー出力データ */
interface DailySummary {
  date: string;
  totalEvents: number;
  uniqueUsers: number;
  riskSafe: number;
  riskWarning: number;
  riskDanger: number;
  phiAlerts: number;
  tierMatsu: number;
  tierTake: number;
  tierUme: number;
  avgProcessingMs: number | null;
  generatedAt: string;
}

/** Google Service Account 認証情報 */
interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

/** Google Sheets クライアント */
interface SheetsClient {
  append(tabName: string, values: unknown[][]): Promise<void>;
  update(tabName: string, values: unknown[][]): Promise<void>;
  clearBelowHeader(tabName: string): Promise<void>;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SHEET_ID = Deno.env.get("LINE_LOG_SHEET_ID");
const RAW_TAB = Deno.env.get("LINE_LOG_RAW_TAB") ?? "raw_events";
const SUMMARY_TAB = Deno.env.get("LINE_LOG_SUMMARY_TAB") ?? "daily_summary";
const MEMBERSHIP_TAB = Deno.env.get("LINE_LOG_MEMBERSHIP_TAB") ?? "membership_status";
const ALERT_TAB = Deno.env.get("LINE_LOG_ALERT_TAB") ?? "alerts";
const GOOGLE_SA_JSON = Deno.env.get("GOOGLE_SA_JSON");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase configuration");
}
if (!SHEET_ID || !GOOGLE_SA_JSON) {
  throw new Error("Missing Google Sheets configuration");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "full";

  const now = new Date();
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const { data: events, error: eventsError } = await supabase
    .from("line_events")
    .select("*")
    .gte("created_at", twelveHoursAgo.toISOString())
    .order("created_at", { ascending: true });

  if (eventsError) {
    console.error("Failed to fetch line_events", eventsError);
    return new Response("Failed to fetch events", { status: 500 });
  }

  const rawRows = (events as LineEvent[]).map((event) => [
    event.created_at ?? "",
    event.line_user_id ?? "",
    event.message_text ?? "",
    event.normalized_keyword ?? "",
    event.risk_level ?? "",
    event.contains_phi ?? false,
    event.membership_email ?? "",
    event.membership_tier ?? "",
    event.subscription_status ?? "",
    event.billing_cycle_anchor ?? "",
    event.tuition_credit_yen ?? 0,
    event.stripe_customer_email ?? "",
    event.reply_success ?? true,
    event.error_code ?? "",
    event.metadata?.discord_notify_id ?? "",
    event.metadata?.replyTemplate ?? "",
    JSON.stringify(event.metadata ?? {}),
  ]);

  const summaryByDay = buildDailySummary(events as LineEvent[]);
  const summaryRows = summaryByDay.map((summary) => [
    summary.date,
    summary.totalEvents,
    summary.uniqueUsers,
    summary.riskSafe,
    summary.riskWarning,
    summary.riskDanger,
    summary.phiAlerts,
    summary.tierMatsu,
    summary.tierTake,
    summary.tierUme,
    summary.avgProcessingMs ?? "",
    summary.generatedAt,
  ]);

  const { data: members, error: membersError } = await supabase
    .from("library_members")
    .select(
      "line_user_id,membership_tier,subscription_status,active_months,next_billing_at,last_payment_at,stripe_customer_email,last_interaction_at",
    );

  if (membersError) {
    console.error("Failed to fetch library_members", membersError);
  }

  const membershipRows = ((members ?? []) as LibraryMember[]).map((member) => [
    member.stripe_customer_email ?? "",
    member.line_user_id ?? "",
    member.membership_tier ?? "",
    member.subscription_status ?? "",
    member.active_months ?? 0,
    (member.active_months ?? 0) * 2980,
    member.next_billing_at ?? "",
    member.last_payment_at ?? "",
    member.stripe_customer_email ?? "",
    member.last_interaction_at ?? "",
  ]);

  const alertsRows = (events as LineEvent[])
    .filter((event) =>
      event.contains_phi || event.subscription_status === "past_due"
    )
    .map((event) => [
      event.created_at ?? "",
      event.line_user_id ?? "",
      event.contains_phi ? "PHI" : "payment_overdue",
      event.contains_phi
        ? "PHIキーワード検知"
        : "支払い遅延",
      event.membership_tier ?? "",
      event.subscription_status ?? "",
      event.contains_phi ?? false,
      event.subscription_status === "past_due",
      "",
      "",
      "",
    ]);

  const sheetsClient = await buildSheetsClient(JSON.parse(GOOGLE_SA_JSON));
  if (rawRows.length > 0) {
    await appendRows(sheetsClient, RAW_TAB, rawRows);
  }
  if (summaryRows.length > 0) {
    await appendRows(sheetsClient, SUMMARY_TAB, summaryRows);
  }
  if (mode === "full" && membershipRows.length > 0) {
    await overwriteRows(sheetsClient, MEMBERSHIP_TAB, membershipRows);
  }
  if (alertsRows.length > 0) {
    await appendRows(sheetsClient, ALERT_TAB, alertsRows);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

function buildDailySummary(events: LineEvent[]): DailySummary[] {
  const summaryMap = new Map<string, DailySummaryAccumulator>();

  for (const event of events) {
    const dateKey = (event.created_at ?? "").slice(0, 10);
    if (!summaryMap.has(dateKey)) {
      summaryMap.set(dateKey, {
        date: dateKey,
        totalEvents: 0,
        uniqueUserSet: new Set<string>(),
        riskSafe: 0,
        riskWarning: 0,
        riskDanger: 0,
        phiAlerts: 0,
        tierMatsu: 0,
        tierTake: 0,
        tierUme: 0,
        totalProcessingMs: 0,
        processingCount: 0,
      });
    }
    const summary = summaryMap.get(dateKey)!;
    summary.totalEvents += 1;
    summary.uniqueUserSet.add(event.line_user_id ?? "unknown");
    if (event.risk_level === "safe") summary.riskSafe += 1;
    if (event.risk_level === "warning") summary.riskWarning += 1;
    if (event.risk_level === "danger") summary.riskDanger += 1;
    if (event.contains_phi) summary.phiAlerts += 1;
    if (event.membership_tier === "松") summary.tierMatsu += 1;
    if (event.membership_tier === "竹") summary.tierTake += 1;
    if (event.membership_tier === "梅") summary.tierUme += 1;
    if (event.metadata?.processingMs) {
      summary.totalProcessingMs += event.metadata.processingMs;
      summary.processingCount += 1;
    }
  }

  return Array.from(summaryMap.values()).map((summary) => ({
    date: summary.date,
    totalEvents: summary.totalEvents,
    uniqueUsers: summary.uniqueUserSet.size,
    riskSafe: summary.riskSafe,
    riskWarning: summary.riskWarning,
    riskDanger: summary.riskDanger,
    phiAlerts: summary.phiAlerts,
    tierMatsu: summary.tierMatsu,
    tierTake: summary.tierTake,
    tierUme: summary.tierUme,
    avgProcessingMs: summary.processingCount > 0
      ? Math.round(summary.totalProcessingMs / summary.processingCount)
      : null,
    generatedAt: new Date().toISOString(),
  }));
}

async function buildSheetsClient(serviceAccount: GoogleServiceAccount): Promise<SheetsClient> {
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtPayload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://www.googleapis.com/oauth2/v4/token",
    exp: now + 3600,
    iat: now,
  }));
  const encoder = new TextEncoder();
  const keyData = strToUint8Array(serviceAccount.private_key);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${jwtHeader}.${jwtPayload}`),
  );
  const jwtSignature = uint8ToBase64(signature);

  const tokenResponse = await fetch("https://www.googleapis.com/oauth2/v4/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${jwtHeader}.${jwtPayload}.${jwtSignature}`,
    }),
  }).then((res) => res.json());

  if (!tokenResponse.access_token) {
    throw new Error("Failed to obtain Google access token");
  }

  const authHeaders = {
    Authorization: `Bearer ${tokenResponse.access_token}`,
    "Content-Type": "application/json",
  };

  return {
    async append(tabName: string, values: unknown[][]) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${tabName}!A2:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ values }),
        },
      );
    },
    async update(tabName: string, values: unknown[][]) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${tabName}!A2?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: authHeaders,
          body: JSON.stringify({ values }),
        },
      );
    },
    async clearBelowHeader(tabName: string) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchClear`,
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            ranges: [`${tabName}!A2:Z`],
          }),
        },
      );
    },
  };
}

async function appendRows(client: SheetsClient, tabName: string, rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  await client.append(tabName, rows);
}

async function overwriteRows(client: SheetsClient, tabName: string, rows: unknown[][]): Promise<void> {
  await client.clearBelowHeader(tabName);
  if (rows.length === 0) return;
  await client.update(tabName, rows);
}

function strToUint8Array(pem: string): Uint8Array {
  const cleaned = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function uint8ToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

