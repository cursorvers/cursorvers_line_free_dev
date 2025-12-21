-- Discord User IDカラムを追加
-- /joinコマンドでのRole付与時にDiscordユーザーIDを保存
-- 解約時のRole削除に使用

ALTER TABLE members ADD COLUMN IF NOT EXISTS discord_user_id TEXT;

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_members_discord_user_id
  ON members (discord_user_id)
  WHERE discord_user_id IS NOT NULL;

COMMENT ON COLUMN members.discord_user_id IS 'Discord User ID（/joinコマンドで紐付け）';
