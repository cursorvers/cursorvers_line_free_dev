📊 Cursorvers 日次システム点検レポート
日時: 2025-12-21 16:06:51

✅ LINE Bot: OK
✅ Discord Webhook: OK
✅ Supabase: OK (Edge Function Running)
⚠️ Google Sheets: NG (n8n API Unauthorized)
✅ GitHub: 
- Free: 🤖 [auto-fix] Format code with deno fmt (f5952f2)
- Paid: chore: Add workflow weekly-report.yml (ce73173)

[点検詳細]
- LINE Bot: curlテスト成功 ("OK - line-webhook is running")
- Discord Webhook: テストメッセージ送信成功
- Supabase: Edge Functionの応答を確認。ログの詳細はCLIログインが必要なため未確認。
- Google Sheets: n8n APIキーが無効または権限不足のため、ワークフロー状態を確認できませんでした。
- GitHub: 最新コミット情報を正常に取得。

[修繕]
- LINE Botが正常稼働しているため、再デプロイは実施していません。
