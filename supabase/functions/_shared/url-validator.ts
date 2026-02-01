/**
 * URL検証ライブラリ
 * X/Twitter URLの検出、短縮URL展開、リダイレクト検査を実施
 */

/**
 * URLを正規化（トレーリングスラッシュ削除、URLデコード）
 * @param url - 正規化するURL
 * @returns 正規化されたURL
 */
export function normalizeUrl(url: string): string {
  if (!url) return "";

  try {
    // URLデコード（エンコード回避対策）
    let decoded = decodeURIComponent(url);

    // トレーリングスラッシュを削除
    if (decoded.endsWith("/")) {
      decoded = decoded.slice(0, -1);
    }

    return decoded;
  } catch {
    // デコードエラー時は元のURLを返す
    return url;
  }
}

/**
 * 短縮URL (t.co等) を展開
 * @param url - 短縮URL
 * @returns 展開後のURL（展開できない場合は元のURL）
 */
export async function expandShortUrl(url: string): Promise<string> {
  if (!url || !url.includes("t.co")) return url;

  try {
    // HEAD リクエストでリダイレクト先を取得
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
    });

    return response.url; // リダイレクト後のURL
  } catch {
    // エラー時は元のURLを返す
    return url;
  }
}

/**
 * リダイレクト先のURLを確認
 * @param url - チェック対象のURL
 * @returns リダイレクト先のURL（リダイレクトなしの場合は元のURL）
 */
export async function checkRedirect(url: string): Promise<string> {
  if (!url) return url;

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
    });

    return response.url;
  } catch {
    // エラー時は元のURLを返す（ネットワークエラー、無効なURLなど）
    return url;
  }
}

/**
 * X/Twitter URLかどうかを判定
 * @param url - チェック対象のURL
 * @returns X URLの場合 true、それ以外は false
 */
export async function isXUrl(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;

  try {
    // 1. URL正規化（デコード、トレーリングスラッシュ削除）
    let normalized = normalizeUrl(url);

    // 2. 短縮URL (t.co) の展開
    if (normalized.includes("t.co")) {
      normalized = await expandShortUrl(normalized);
    }

    // 3. リダイレクト先の確認
    const finalUrl = await checkRedirect(normalized);

    // 4. X URL パターンマッチング
    const xUrlPattern = /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//;

    // サブドメイン除外（例: blog.twitter.com は除外）
    const subdomainPattern = /^https?:\/\/[a-z0-9-]+\.(x\.com|twitter\.com)\//;
    const isSubdomain = subdomainPattern.test(finalUrl) &&
      !finalUrl.includes("www.");

    if (isSubdomain) return false;

    return xUrlPattern.test(finalUrl);
  } catch {
    // エラー時は安全側に倒して false を返す
    return false;
  }
}
