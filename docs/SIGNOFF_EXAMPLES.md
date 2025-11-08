# サインオフコメント解答例

## Ops Lead のサインオフコメント例

以下のコメントをIssue #8のコメント欄にコピー&ペーストして、日時とユーザー名を実際の値に置き換えてください。

```markdown
## ✅ Ops Lead サインオフ

- [x] 実行結果を確認
- [x] Artifactの内容を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T09:16:54Z
- 署名: @mo666-med

**承認理由**:
- 実行結果を確認し、両エンドポイント（api.manus.ai / api.manus.im）で認証テストが成功（200 OK）していることを確認
- Artifactの内容を確認し、JSON形式の詳細結果とMarkdown形式のサマリーが正しく生成されていることを確認
- Secrets（MANUS_API_KEY）がGitHub Secretsで適切に管理されており、ワークフローファイルに機密情報が含まれていないことを確認
- 本番環境へのデプロイを承認します
```

## Compliance のサインオフコメント例

以下のコメントをIssue #8のコメント欄にコピー&ペーストして、日時とユーザー名を実際の値に置き換えてください。

```markdown
## ✅ Compliance サインオフ

- [x] 実行結果を確認
- [x] Artifact保持期間（90日）を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T09:16:54Z
- 署名: @mo666-med

**承認理由**:
- 実行結果を確認し、Manus API問い合わせワークフローが正常に動作していることを確認
- Artifact保持期間が90日間であることを確認（GitHub Actionsのデフォルト設定に準拠）
- Secrets（MANUS_API_KEY）がGitHub Secretsで適切に管理されており、ワークフローファイルに機密情報が含まれていないことを確認
- コンプライアンス要件を満たしていることを確認し、承認します
```

## 簡易版（承認理由を省略する場合）

承認理由を省略する場合は、以下の簡易版を使用できます。

### Ops Lead 簡易版

```markdown
## ✅ Ops Lead サインオフ

- [x] 実行結果を確認
- [x] Artifactの内容を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T09:16:54Z
- 署名: @mo666-med
```

### Compliance 簡易版

```markdown
## ✅ Compliance サインオフ

- [x] 実行結果を確認
- [x] Artifact保持期間（90日）を確認
- [x] セキュリティ要件を確認
- 承認日時: 2025-11-06T09:16:54Z
- 署名: @mo666-med
```

## 使用手順

1. 上記のいずれかのコメント例をコピー
2. Issue #8のコメント欄に貼り付け
3. 以下の項目を実際の値に置き換え：
   - `承認日時`: 現在の日時（UTC）に置き換え
     - 例: `2025-11-06T09:16:54Z`
     - 現在の日時を取得するには: `date -u +"%Y-%m-%dT%H:%M:%SZ"`
   - `署名`: 自分のGitHubユーザー名に置き換え
     - 例: `@mo666-med` → `@your-username`
4. 承認理由を必要に応じて編集
5. コメントを投稿

## 注意事項

- チェックボックスは `- [x]` の形式で記入してください（xは小文字、スペースが重要）
- 承認日時はUTC（協定世界時）で記入してください
- 署名はGitHubのユーザー名を`@`でメンションしてください
- 承認理由は必須ではありませんが、記載することで後から確認しやすくなります

## 現在の日時を取得する方法

### macOS/Linuxの場合

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
```

### Windowsの場合

```powershell
Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ" -AsUTC
```

### オンラインツール

- https://www.epochconverter.com/
- https://time.is/UTC

## 参考

- Issue #8: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
- サインオフ手順ガイド: `docs/SIGNOFF_GUIDE.md`
- サインオフドキュメント: `docs/OPS_COMPLIANCE_SIGNOFF.md`


