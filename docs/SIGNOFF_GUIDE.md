# サインオフ手順ガイド

## 概要

このガイドでは、GitHub Issue #8でのOps/Complianceサインオフの手順を説明します。

## サインオフ方法

### 1. Issue #8を開く

以下のURLにアクセスしてください：
- **Issue #8**: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8

### 2. 確認資料を確認

以下の資料を確認してください：

#### 必須確認項目

1. **実行結果の確認**
   - Issue #8の本文に記載されている実行結果を確認
   - 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482

2. **Artifactの確認**
   - GitHub Actions実行ページ → Artifacts → `manus-api-inquiry-results` をダウンロード
   - 内容を確認（JSON形式の詳細結果とMarkdown形式のサマリー）

3. **セキュリティ要件の確認**
   - Secrets（`MANUS_API_KEY`）がGitHub Secretsで適切に管理されていること
   - ワークフローファイルに機密情報が含まれていないこと
   - Artifactが90日間保持されること（Compliance要件）

### 3. サインオフコメントを追加

Issue #8のコメント欄に、以下の形式でサインオフコメントを追加してください：

#### Ops Lead の場合

```markdown
## ✅ Ops Lead サインオフ

- [x] 実行結果を確認
- [x] Artifactの内容を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T10:00:00Z
- 署名: @mo666-med (Ops Lead)

**承認理由**:
- 実行結果が正常であることを確認
- セキュリティ要件を満たしていることを確認
- 本番環境へのデプロイを承認
```

#### Compliance の場合

```markdown
## ✅ Compliance サインオフ

- [x] 実行結果を確認
- [x] Artifact保持期間（90日）を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T10:00:00Z
- 署名: @mo666-med (Compliance)

**承認理由**:
- Artifact保持期間が90日間であることを確認
- セキュリティ要件を満たしていることを確認
- コンプライアンス要件を満たしていることを確認
```

### 4. チェックボックスの記入方法

GitHub Issueのコメント欄では、以下のように記入します：

- **未チェック**: `- [ ]` （スペースが重要）
- **チェック済み**: `- [x]` （xは小文字）

### 5. 承認日時の記入

ISO 8601形式（UTC）で記入してください：
- 例: `2025-11-06T10:00:00Z`

### 6. 署名の記入

GitHubのユーザー名を`@`でメンションしてください：
- 例: `@mo666-med`

## サインオフ完了後の流れ

1. **両方のサインオフが完了したら**:
   - Issue #8に`approved`ラベルを追加
   - `docs/POST_APPROVAL_DEPLOYMENT.md`に従ってデプロイを開始

2. **デプロイ手順**:
   - `docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`を確認
   - `docs/POST_APPROVAL_DEPLOYMENT.md`に従ってデプロイ

3. **デプロイ後の確認**:
   - 本番環境での動作確認
   - 監視とメンテナンス

## よくある質問

### Q: チェックボックスが機能しない場合は？

A: GitHub Issueのコメント欄では、チェックボックスの記法が正しくないと機能しません。以下の点を確認してください：
- `- [ ]` の間にスペースがあること
- `- [x]` のxは小文字であること
- リストのインデントが正しいこと

### Q: 承認日時はどのタイムゾーンで記入すればよいですか？

A: UTC（協定世界時）で記入してください。例: `2025-11-06T10:00:00Z`

### Q: 署名は必須ですか？

A: はい、署名は必須です。GitHubのユーザー名を`@`でメンションしてください。

### Q: 承認理由は必須ですか？

A: 必須ではありませんが、承認理由を記載することで、後から確認しやすくなります。

## 参考リンク

- Issue #8: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482
- サインオフドキュメント: `docs/OPS_COMPLIANCE_SIGNOFF.md`
- デプロイ手順書: `docs/POST_APPROVAL_DEPLOYMENT.md`


