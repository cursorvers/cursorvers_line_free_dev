/**
 * Google Sheets 共有モジュール
 * JWT認証とSheets API操作を提供
 */
import { createLogger } from "./logger.ts";

const log = createLogger("google-sheets");

/** Google Service Account 認証情報 */
export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

/** シートメタデータ */
export interface SheetMetadata {
  rowCount: number;
  title: string;
}

/** Google Sheets クライアント */
export interface SheetsClient {
  append(tabName: string, values: unknown[][]): Promise<void>;
  update(tabName: string, values: unknown[][]): Promise<void>;
  clearBelowHeader(tabName: string): Promise<void>;
  getMetadata(tabName: string): Promise<SheetMetadata>;
}

/**
 * PEM形式の秘密鍵をUint8Arrayに変換
 */
function pemToUint8Array(pem: string): Uint8Array {
  const cleaned = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(cleaned);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

/**
 * ArrayBufferをBase64文字列に変換
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Google OAuth2 アクセストークンを取得
 */
async function getAccessToken(
  serviceAccount: GoogleServiceAccount,
): Promise<string> {
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
  const keyData = pemToUint8Array(serviceAccount.private_key);
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
  const jwtSignature = arrayBufferToBase64(signature);

  const tokenResponse = await fetch(
    "https://www.googleapis.com/oauth2/v4/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${jwtHeader}.${jwtPayload}.${jwtSignature}`,
      }),
    },
  ).then((res) => res.json());

  if (!tokenResponse.access_token) {
    throw new Error("Failed to obtain Google access token");
  }

  return tokenResponse.access_token;
}

/**
 * Google Sheets クライアントを構築
 * @param serviceAccount - Google Service Account JSON
 * @param sheetId - スプレッドシートID
 */
export async function buildSheetsClient(
  serviceAccount: GoogleServiceAccount,
  sheetId: string,
): Promise<SheetsClient> {
  const accessToken = await getAccessToken(serviceAccount);
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  return {
    async append(tabName: string, values: unknown[][]): Promise<void> {
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabName}!A2:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ values }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        log.error("Sheets append failed", {
          tabName,
          status: res.status,
          errorBody,
        });
        throw new Error(`Sheets append failed: ${res.status}`);
      }
    },

    async update(tabName: string, values: unknown[][]): Promise<void> {
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${tabName}!A2?valueInputOption=USER_ENTERED`;
      const res = await fetch(url, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ values }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        log.error("Sheets update failed", {
          tabName,
          status: res.status,
          errorBody,
        });
        throw new Error(`Sheets update failed: ${res.status}`);
      }
    },

    async clearBelowHeader(tabName: string): Promise<void> {
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchClear`;
      const res = await fetch(url, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ ranges: [`${tabName}!A2:Z`] }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        log.error("Sheets clear failed", {
          tabName,
          status: res.status,
          errorBody,
        });
        throw new Error(`Sheets clear failed: ${res.status}`);
      }
    },

    async getMetadata(tabName: string): Promise<SheetMetadata> {
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(title,gridProperties))`;
      const res = await fetch(url, {
        method: "GET",
        headers: authHeaders,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        log.error("Sheets metadata fetch failed", {
          tabName,
          status: res.status,
          errorBody,
        });
        throw new Error(`Sheets metadata fetch failed: ${res.status}`);
      }

      const data = await res.json();
      const sheets = data.sheets as Array<{
        properties: { title: string; gridProperties: { rowCount: number } };
      }>;
      const sheet = sheets.find((s) => s.properties.title === tabName);

      if (!sheet) {
        throw new Error(`Tab "${tabName}" not found`);
      }

      return {
        title: sheet.properties.title,
        rowCount: sheet.properties.gridProperties.rowCount,
      };
    },
  };
}

/**
 * Service Account JSONをパースしてクライアントを構築
 * @param serviceAccountJson - GOOGLE_SA_JSON環境変数の値
 * @param sheetId - スプレッドシートID
 */
export function createSheetsClientFromEnv(
  serviceAccountJson: string,
  sheetId: string,
): Promise<SheetsClient> {
  const serviceAccount = JSON.parse(serviceAccountJson) as GoogleServiceAccount;
  return buildSheetsClient(serviceAccount, sheetId);
}
