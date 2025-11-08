# 運用チームへの周知テンプレート

## Slack通知用テンプレート

```
【リリース通知】Line Actions Hardening - 本番環境デプロイ完了

Manus API問い合わせワークフローの実装と動作確認が完了し、Ops/Complianceのサインオフを取得しました。

✅ **承認完了**
- Ops Lead: @cursorvers (2025-11-06T09:23:18Z)
- Compliance: @cursorvers (2025-11-06T09:23:18Z)

📋 **実装内容**
- Manus API問い合わせワークフロー（manus-api-inquiry.yml）を追加
- 両エンドポイント（api.manus.ai / api.manus.im）で認証テストが成功
- Artifactは90日間保持（Compliance要件に適合）

🔗 **参考リンク**
- Issue #8: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482
- リリースノート: docs/releases/line-actions-hardening.md
- Runbook: docs/RUNBOOK.md

📝 **次のステップ**
- 本番環境での最終検証を実施
- 運用開始後、24時間以内に動作確認を実施

ご不明な点がございましたら、このIssueにコメントをお願いいたします。
```

## メール通知用テンプレート

**件名**: [リリース通知] Line Actions Hardening - Manus API問い合わせワークフロー本番環境デプロイ完了

**本文**:

```
運用チーム各位

Manus API問い合わせワークフローの実装と動作確認が完了し、Ops/Complianceのサインオフを取得いたしました。

【承認完了】
- Ops Lead: @cursorvers (2025-11-06T09:23:18Z)
- Compliance: @cursorvers (2025-11-06T09:23:18Z)

【実装内容】
- Manus API問い合わせワークフロー（manus-api-inquiry.yml）を追加
- 両エンドポイント（api.manus.ai / api.manus.im）で認証テストが成功
- Artifactは90日間保持（Compliance要件に適合）

【参考リンク】
- Issue #8: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482
- リリースノート: docs/releases/line-actions-hardening.md
- Runbook: docs/RUNBOOK.md

【次のステップ】
- 本番環境での最終検証を実施
- 運用開始後、24時間以内に動作確認を実施

ご不明な点がございましたら、Issue #8にコメントをお願いいたします。

Tech Lead
@mo666-med
```

## GitHub Issue通知用テンプレート

```markdown
## 🚀 リリース通知 - Line Actions Hardening

Manus API問い合わせワークフローの実装と動作確認が完了し、Ops/Complianceのサインオフを取得しました。

### ✅ 承認完了

- **Ops Lead**: @cursorvers (2025-11-06T09:23:18Z)
- **Compliance**: @cursorvers (2025-11-06T09:23:18Z)

### 📋 実装内容

- Manus API問い合わせワークフロー（`manus-api-inquiry.yml`）を追加
- 両エンドポイント（`api.manus.ai` / `api.manus.im`）で認証テストが成功
- Artifactは90日間保持（Compliance要件に適合）

### 🔗 参考リンク

- Issue #8: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482
- リリースノート: `docs/releases/line-actions-hardening.md`
- Runbook: `docs/RUNBOOK.md`

### 📝 次のステップ

- [ ] 本番環境での最終検証を実施
- [ ] 運用開始後、24時間以内に動作確認を実施

ご不明な点がございましたら、このIssueにコメントをお願いいたします。
```

## 使用手順

1. **Slack通知の場合**:
   - 上記のSlack通知用テンプレートをコピー
   - `#line-ops` チャンネルに投稿
   - `@line-ops` をメンション

2. **メール通知の場合**:
   - 上記のメール通知用テンプレートをコピー
   - 運用チームのメールアドレスに送信
   - CCに `line-ops@example.com` を含める

3. **GitHub Issue通知の場合**:
   - 上記のGitHub Issue通知用テンプレートをコピー
   - Issue #8にコメントとして追加
   - 必要に応じて新しいIssueを作成

## 注意事項

- 承認日時と署名は実際の値に置き換えてください
- リンクは実際のURLに置き換えてください
- 運用チームの連絡先は実際の値に置き換えてください


