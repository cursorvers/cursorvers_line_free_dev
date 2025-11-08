# Ops/Compliance 通知メッセージ（テンプレート）

## Slack通知用

```
@ops-team @compliance-team

【Manus API問い合わせワークフロー - サインオフ依頼】

Manus API問い合わせワークフローの実装と動作確認が完了しました。
以下の資料を確認いただき、サインオフをお願いいたします。

📋 Issue: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
📦 Artifact: manus-api-inquiry-results (1.3MB)
📊 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482

✅ 実行結果:
- 両エンドポイントで認証テストが成功（200 OK）
- MANUS_API_KEYが正しく設定されていることを確認
- セキュリティ要件を満たしていることを確認

詳細はIssue #8のコメントをご確認ください。
```

## メール通知用

件名: 【要承認】Manus API問い合わせワークフロー - サインオフ依頼

本文:

Ops/Compliance 各位

Manus API問い合わせワークフロー（`manus-api-inquiry.yml`）の実装と動作確認が完了しました。
以下の資料を確認いただき、サインオフをお願いいたします。

【確認資料】
1. GitHub Issue #8: https://github.com/mo666-med/cursorvers_line_free_dev/issues/8
2. Artifact: `manus-api-inquiry-results` (1.3MB)
   - ダウンロード方法: 実行ログページ → Artifacts → `manus-api-inquiry-results`
3. 実行ログ: https://github.com/mo666-med/cursorvers_line_free_dev/actions/runs/19130277482
4. サインオフドキュメント: `docs/OPS_COMPLIANCE_SIGNOFF.md`

【実行結果サマリー】
- ✅ 両エンドポイント（`api.manus.ai` / `api.manus.im`）で認証テストが成功（200 OK）
- ✅ `MANUS_API_KEY`が正しく設定され、認証が正常に動作
- ✅ `MANUS_BASE_URL`が正しく設定されていることを確認
- ✅ セキュリティ要件を満たしていることを確認

【サインオフ】
Issue #8のコメントにサインオフ欄を用意しております。
ご確認の上、チェックリストに記載をお願いいたします。

【次のステップ（承認後）】
1. 本番環境での最終検証
2. リリース手続きの開始
3. 運用開始

ご不明な点がございましたら、Issue #8にコメントをお願いいたします。

Tech Lead
@mo666-med


