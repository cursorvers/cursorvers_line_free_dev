/**
 * ログ出力用マスキングユーティリティ
 * 個人情報をログに安全に記録するための関数群
 */

/**
 * メールアドレスをマスク（最初の5文字 + ***）
 * @param email - マスクするメールアドレス
 * @returns マスクされた文字列、nullの場合は null を返す
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.slice(0, 5) + "***";
}

/**
 * LINE User IDをマスク（最後の4文字のみ表示）
 * @param lineUserId - マスクするLINE User ID
 * @returns マスクされた文字列、nullの場合は null を返す
 */
export function maskLineUserId(
  lineUserId: string | null | undefined,
): string | null {
  if (!lineUserId) return null;
  return lineUserId.slice(-4);
}

/**
 * Discord User IDをマスク（最後の4文字のみ表示）
 * @param discordUserId - マスクするDiscord User ID
 * @returns マスクされた文字列、nullの場合は null を返す
 */
export function maskDiscordUserId(
  discordUserId: string | null | undefined,
): string | null {
  if (!discordUserId) return null;
  return discordUserId.slice(-4);
}

/**
 * 認証コードをマスク（最初の2文字 + ****）
 * @param code - マスクする認証コード
 * @returns マスクされた文字列、nullの場合は null を返す
 */
export function maskVerificationCode(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return code.slice(0, 2) + "****";
}
