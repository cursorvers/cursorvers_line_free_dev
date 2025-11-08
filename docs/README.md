# ドキュメントインデックス

## 📚 主要ドキュメント

### セットアップ
- **[SETUP.md](SETUP.md)** - セットアップ全般（GitHub Secrets、Variables、Front Door）
- **[GPT5_CODEX_USAGE.md](GPT5_CODEX_USAGE.md)** - GPT-5とCodexの使用方法

### アーキテクチャと設計
- **[README.md](../README.md)** - プロジェクト全体の概要
- **[DEVELOPMENT_PRODUCTION.md](DEVELOPMENT_PRODUCTION.md)** - 開発段階と本番環境の運用方針
- **[PRODUCTION_AUTO_RUN.md](PRODUCTION_AUTO_RUN.md)** - 本番環境の自動実行アーキテクチャ
- **[GPT5_MANUS_WORKFLOW.md](GPT5_MANUS_WORKFLOW.md)** - GPT-5で思考し、Manusに実行させるワークフロー

### 機能別ガイド
- **[MIYABI.md](MIYABI.md)** - Miyabiガイド（使用方法、進捗モニタリング）
- **[MANUS_API.md](MANUS_API.md)** - Manus API連動ガイド

### 運用
- **[runbooks/line-actions.md](runbooks/line-actions.md)** - LINE Actions 専用 Runbook（フラグ切替、縮退復旧、ログ/メトリクス運用）
- **[RUNBOOK.md](RUNBOOK.md)** - 旧版 Runbook（緊急停止、復旧、ロールバック）
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - トラブルシューティングガイド

### その他
- **[OPENAI_FLAT_RATE.md](OPENAI_FLAT_RATE.md)** - OpenAI APIの料金体系について

## 📁 アーカイブ

一時的な状況記録や詳細な情報は `docs/_archive/` に移動しました：

- 一時的な実行状況ファイル
- 詳細なセットアップ手順（統合版に統合済み）
- 詳細なトラブルシューティング情報（統合版に統合済み）

## 🔍 クイックリファレンス

### セットアップ
```bash
# GitHub Secrets設定
gh secret set OPENAI_API_KEY --body "sk-..."
gh secret set MANUS_API_KEY --body "..."
gh secret set SUPABASE_KEY --body "..."

# GitHub Variables設定
gh variable set OPENAI_MODEL --body "gpt-5"
gh variable set DEVELOPMENT_MODE --body "false"
```

### 進捗確認
```bash
# Miyabi Status
npx miyabi status --watch

# ワークフロー実行状況
gh run list --workflow="autonomous-agent.yml" --limit 5

# Issue確認
gh issue view 1
```

### 緊急停止
```bash
supabase secrets set FEATURE_BOT_ENABLED=false --project-ref haaxgwyimoqzzxzdaeep
```

## 📝 ドキュメント更新履歴

- 2025-11-01: ドキュメント整理完了
  - 一時的なファイルをアーカイブ
  - 統合ドキュメントを作成
  - ドキュメントインデックスを作成
