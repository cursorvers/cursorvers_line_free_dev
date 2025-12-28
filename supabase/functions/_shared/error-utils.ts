/**
 * エラーハンドリングユーティリティ
 */

/**
 * unknown型のエラーからメッセージを抽出する
 * @param err - キャッチしたエラー（unknown型）
 * @returns エラーメッセージ文字列
 */
export function extractErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
