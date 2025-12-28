# システム点検機能の改善 - 2025-12-27

このドキュメントでは、Cursorversシステムの自動点検機能に加えられた改善内容を説明します。

---

## 🎯 改善の目的

今後の点検で同様のエラーが出ないように、以下の問題を解決しました:

1. **Discord Webhook URL未設定エラー**
2. **n8n API認証エラー**
3. **Supabase認証情報の不足**
4. **点検スクリプトのエラーハンドリング不足**

---

## 📝 変更内容

### 1. 新規ドキュメント

#### `docs/REQUIRED_SECRETS.md`
- 必須GitHub Secretsの一覧と設定方法を記載
- Discord Webhook、Supabase、n8n、Manus、Google、GitHubの全てのSecretsを網羅
- コマンドラインでの設定方法も含む
- トラブルシューティングガイド付き

### 2. 改善版点検スクリプト

#### `scripts/daily-check-improved.sh` (v4.0)

**主な改善点:**

1. **フォールバック機能**
   - Discord Webhook URLの環境変数名を複数サポート
   - `DISCORD_WEBHOOK_URL` → `DISCORD_ADMIN_WEBHOOK_URL` → `DISCORD_SYSTEM_WEBHOOK`
   - 設定がない場合でもスクリプトを続行（警告のみ）

2. **認証エラー対応**
   - 401エラーを正常な応答として扱う（LINE Bot）
   - n8n API認証エラーを警告として処理（エラーではなく）
   - タイムアウトエラーを適切にハンドリング

3. **詳細なステータス分類**
   - ✅ OK: 正常
   - ⚠️ WARN: 警告（続行可能）
   - ⚠️ SKIP: スキップ（設定不足）
   - ❌ ERROR: エラー（要対応）

4. **エラーカウンター**
   - エラー数と警告数を個別にカウント
   - エラーがある場合のみ終了コード1を返す

5. **推奨アクション**
   - 検出された問題に応じた具体的な対応方法を提示
   - 関連ドキュメントへのリンクを含む

### 3. GitHub Actionsワークフロー

#### `.github/workflows/daily-system-check.yml`

**特徴:**

1. **環境変数の統合設定**
   - 複数の環境変数名に対応（Discord Webhook等）
   - 全ての必要なSecretsを明示的に設定

2. **スクリプトのフォールバック**
   - 改善版スクリプトが存在しない場合、従来版を実行
   - 後方互換性を維持

3. **Gitプッシュの改善**
   - プッシュ前にリモートの変更を取得（rebase）
   - プッシュ失敗時もワークフローを継続
   - 重複レポートの問題を解決

4. **失敗時の通知**
   - ワークフロー失敗時にDiscordに通知
   - 実行ログへのリンクを含む

5. **ログのアーティファクト保存**
   - 点検ログを30日間保存
   - GitHub Actions UIから直接ダウンロード可能

---

## 🔧 設定手順

### ステップ1: GitHub Secretsの設定

`docs/REQUIRED_SECRETS.md`を参照して、以下のSecretsを設定してください:

**最優先:**
- `DISCORD_ADMIN_WEBHOOK_URL`: Discord通知用
- `SUPABASE_URL`: Supabase接続用
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase認証用

**推奨:**
- `N8N_API_KEY`: n8nワークフロー監視用
- `SUPABASE_ANON_KEY`: 公開API用
- `MANUS_AUDIT_API_KEY`: Manus監査用

### ステップ2: ワークフローの有効化

新しいワークフローは自動的に有効化されます。手動実行も可能です:

```bash
# 手動実行
gh workflow run daily-system-check.yml

# 実行状況確認
gh run list --workflow=daily-system-check.yml --limit 5
```

### ステップ3: 動作確認

1. ワークフローを手動実行
2. 実行ログで各コンポーネントの状態を確認
3. Discordに通知が届くことを確認
4. `docs/logs/daily-check-YYYY-MM-DD.md`が生成されることを確認

---

## 📊 期待される効果

### Before (改善前)
- Discord Webhook URLが見つからずエラー
- n8n API認証エラーでスクリプトが停止
- 401エラーを異常として扱う
- エラーと警告の区別がない
- 重複レポートでGitプッシュが失敗

### After (改善後)
- ✅ Discord Webhook URLを複数の環境変数から自動検出
- ✅ n8n API認証エラーを警告として処理、スクリプト続行
- ✅ 401エラーを正常な応答として扱う
- ✅ エラーと警告を明確に分類
- ✅ 重複レポート時もワークフローが正常終了

---

## 🔍 トラブルシューティング

### Discord通知が届かない

**原因:** `DISCORD_ADMIN_WEBHOOK_URL`が設定されていない

**対応:**
```bash
gh secret set DISCORD_ADMIN_WEBHOOK_URL --body "https://discord.com/api/webhooks/..."
```

### n8nが常に警告になる

**原因:** `N8N_API_KEY`が無効または未設定

**対応:**
1. n8n管理画面でAPIキーを再生成
2. GitHub Secretsを更新:
   ```bash
   gh secret set N8N_API_KEY --body "your-new-api-key"
   ```

### Gitプッシュが失敗する

**原因:** リモートに既存のレポートがある

**対応:** 改善版ワークフローでは自動的にrebaseして再試行します。それでも失敗する場合は、ローカルで手動マージが必要です。

---

## 📚 関連ドキュメント

- [必須Secrets設定ガイド](./REQUIRED_SECRETS.md)
- [監査設定](../config/audit-config.yaml)
- [リカバリー手順](./runbook/failure-recovery.md)
- [デプロイガイド](./DEPLOY_SEC_BRIEF.md)

---

## 🚀 今後の改善予定

1. **Supabase Edge Functionsのログ確認**
   - Supabase CLIを使用したログ取得
   - エラーログの自動分析

2. **Google Sheets同期状態の確認**
   - Google Sheets APIを使用した最終更新時刻の確認
   - データ整合性チェック

3. **メトリクス収集**
   - 点検結果の履歴をデータベースに保存
   - ダッシュボードでの可視化

4. **自動修繕機能の拡張**
   - 検出されたエラーに応じた自動修正
   - Edge Functionsの自動再デプロイ

---

*このドキュメントは2025-12-27に作成されました*
