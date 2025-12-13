# Manusクレジット効率的システム設計

## 設計原則: Manusは最後の砦

### 基本方針
**Manusは「自動修正できない複雑な問題」のみに介入する**

---

## 1. 3層防御システム

```
┌─────────────────────────────────────────────────────────┐
│          Layer 1: 完全自動化（Manusなし）                 │
│  ・定期監査（GitHub Actions）                            │
│  ・既知エラーの自動修正（Bashスクリプト）                  │
│  ・ログ記録（Git自動コミット）                            │
│  ・Discord通知                                           │
│  💰 コスト: $0（GitHub Actions無料枠内）                 │
└──────────────────────┬──────────────────────────────────┘
                       │ 自動修正失敗
                       ▼
┌─────────────────────────────────────────────────────────┐
│        Layer 2: 半自動化（Manus最小限）                   │
│  ・GitHub Issue自動作成                                  │
│  ・ユーザーに通知                                         │
│  ・手動トリガーでManus起動                                │
│  💰 コスト: Manusクレジット（手動実行時のみ）             │
└──────────────────────┬──────────────────────────────────┘
                       │ 複雑な問題
                       ▼
┌─────────────────────────────────────────────────────────┐
│         Layer 3: Manus完全介入（最終手段）                │
│  ・複雑なコード修正                                       │
│  ・アーキテクチャ変更                                     │
│  ・新機能実装                                            │
│  💰 コスト: Manusクレジット（フル使用）                   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: 完全自動化（Manusなし）

### 2.1 自動修正可能なエラー

| エラータイプ | 検出方法 | 修正方法 | 実装 |
|------------|---------|---------|------|
| **Missing authorization header** | grep | sed置換 | `fix-auth-headers.sh` |
| **YAML構文エラー** | yamllint | sed/awk修正 | `fix-yaml-syntax.sh` |
| **タイムアウト** | ログ解析 | timeout値増加 | `fix-timeout.sh` |
| **環境変数未設定** | env確認 | GitHub Issue作成 | `create-issue.sh` |

### 2.2 実装例: manus-audit-daily.yml（改良版）

```yaml
name: Manus Audit (Daily)
on:
  schedule:
    - cron: '0 19 * * *'  # 毎日 04:00 JST
  workflow_dispatch:

jobs:
  audit:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.MANUS_GITHUB_TOKEN }}

      - name: Run daily audit
        id: audit
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          MANUS_AUDIT_API_KEY: ${{ secrets.MANUS_AUDIT_API_KEY }}
        run: |
          echo "🔍 日次監査を実行中..."
          
          RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
            "${SUPABASE_URL}/functions/v1/manus-audit-line-daily-brief?mode=daily" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer ${MANUS_AUDIT_API_KEY}")
          
          HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
          BODY=$(echo "$RESPONSE" | sed '$d')
          
          echo "Response: $BODY"
          echo "HTTP Code: $HTTP_CODE"
          
          # 結果を環境変数に保存
          echo "AUDIT_RESULT=$BODY" >> $GITHUB_ENV
          echo "HTTP_CODE=$HTTP_CODE" >> $GITHUB_ENV
          
          if [ "$HTTP_CODE" -ne 200 ]; then
            echo "❌ 監査が失敗しました (HTTP $HTTP_CODE)"
            exit 1
          fi
          
          echo "✅ 監査完了"

      - name: Record audit log
        if: always()
        run: |
          mkdir -p docs/logs/audit
          DATE=$(date +%Y-%m-%d)
          cat > docs/logs/audit/daily-${DATE}.md <<EOF
          # 日次監査ログ - ${DATE}
          
          ## 実行時刻
          $(date -u +"%Y-%m-%d %H:%M:%S UTC")
          
          ## HTTP Status
          ${HTTP_CODE}
          
          ## 結果
          \`\`\`json
          ${AUDIT_RESULT}
          \`\`\`
          EOF

      - name: Detect errors (if failed)
        if: failure()
        id: detect
        run: |
          # エラー検出スクリプト実行
          ERROR_INFO=$(bash scripts/auto-fix/detect-errors.sh "$AUDIT_RESULT")
          echo "$ERROR_INFO" > docs/logs/errors/error-$(date +%Y-%m-%d-%H%M%S).json
          
          # エラータイプを抽出
          ERROR_TYPE=$(echo "$ERROR_INFO" | jq -r '.error_type')
          echo "ERROR_TYPE=$ERROR_TYPE" >> $GITHUB_ENV

      - name: Auto-fix (if possible)
        if: failure() && env.ERROR_TYPE == 'missing_auth_header'
        run: |
          echo "🔧 自動修正を試行中..."
          bash scripts/auto-fix/fix-auth-headers.sh
          
          # 修正ログを記録
          cat > docs/logs/fixes/fix-$(date +%Y-%m-%d-%H%M%S).md <<EOF
          # 自動修正ログ
          
          ## エラータイプ
          ${ERROR_TYPE}
          
          ## 修正内容
          認証ヘッダーを X-API-Key から Authorization: Bearer に修正
          
          ## 修正ファイル
          - .github/workflows/manus-audit-daily.yml
          - .github/workflows/manus-audit-weekly.yml
          - .github/workflows/manus-audit-monthly.yml
          - .github/workflows/manus-audit-report.yml
          EOF

      - name: Commit and push logs
        if: always()
        run: |
          git config user.name "Manus Automation"
          git config user.email "automation@manus.im"
          git add docs/logs/
          git commit -m "chore: audit log $(date +%Y-%m-%d)" || echo "No changes"
          git push || echo "Push failed"

      - name: Create GitHub Issue (if auto-fix failed)
        if: failure() && env.ERROR_TYPE != 'missing_auth_header'
        uses: actions/github-script@v7
        with:
          github-token: ${{ secrets.MANUS_GITHUB_TOKEN }}
          script: |
            const errorType = process.env.ERROR_TYPE;
            const auditResult = process.env.AUDIT_RESULT;
            
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `🚨 Manus Audit Failed: ${errorType}`,
              body: `## エラー詳細\n\n\`\`\`json\n${auditResult}\n\`\`\`\n\n## 対応方法\n\n1. エラーログを確認: \`docs/logs/errors/\`\n2. 手動修正が必要な場合は、Manusを起動してください\n3. 修正後、このIssueをクローズしてください`,
              labels: ['bug', 'auto-audit', 'needs-manus']
            });

      - name: Notify Discord (success)
        if: success()
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_ADMIN_WEBHOOK_URL }}
        run: |
          curl -X POST "${DISCORD_WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d '{
              "content": "✅ **Manus Audit (Daily)** 成功\n\n**日時**: '"$(date '+%Y-%m-%d %H:%M:%S JST')"'\n**ステータス**: 正常\n**詳細**: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }'

      - name: Notify Discord (failure)
        if: failure()
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_ADMIN_WEBHOOK_URL }}
        run: |
          AUTO_FIX_STATUS="自動修正を試行しました"
          if [ "$ERROR_TYPE" != "missing_auth_header" ]; then
            AUTO_FIX_STATUS="⚠️ 自動修正不可 - GitHub Issueを作成しました"
          fi
          
          curl -X POST "${DISCORD_WEBHOOK_URL}" \
            -H "Content-Type: application/json" \
            -d '{
              "content": "❌ **Manus Audit (Daily)** 失敗\n\n**日時**: '"$(date '+%Y-%m-%d %H:%M:%S JST')"'\n**エラータイプ**: '"$ERROR_TYPE"'\n**対応**: '"$AUTO_FIX_STATUS"'\n**詳細**: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"
            }'
```

---

## 3. Layer 2: 半自動化（Manus最小限）

### 3.1 GitHub Issue自動作成

自動修正できないエラーは、GitHub Issueを自動作成し、ユーザーに通知。

**Issueテンプレート**:
```markdown
## エラー詳細
- エラータイプ: invalid_jwt
- 発生日時: 2025-12-13 04:00:00 JST

## 対応方法
1. Supabaseダッシュボードで新しいService Role Keyを取得
2. GitHub Secretsの`MANUS_AUDIT_API_KEY`を更新
3. ワークフローを手動実行してテスト

## Manus起動コマンド
手動修正が難しい場合は、以下のコマンドでManusを起動:
```bash
gh workflow run manus-manual-fix.yml -f issue_number=123
```
```

### 3.2 手動トリガーワークフロー

```yaml
# .github/workflows/manus-manual-fix.yml
name: Manus Manual Fix
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'GitHub Issue番号'
        required: true
        type: number

jobs:
  fix:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Manus API
        run: |
          # Manus APIを呼び出し（クレジット消費）
          curl -X POST https://api.manus.im/v1/tasks \
            -H "Authorization: Bearer ${{ secrets.MANUS_API_KEY }}" \
            -d '{
              "prompt": "GitHub Issue #${{ inputs.issue_number }} を解決してください",
              "context": {
                "repository": "${{ github.repository }}",
                "issue": ${{ inputs.issue_number }}
              }
            }'
```

---

## 4. クレジット消費比較

| シナリオ | 従来（全てManus） | 新設計（3層防御） | 削減率 |
|---------|-----------------|-----------------|-------|
| **日次監査（成功）** | 1クレジット/日 | 0クレジット | **100%削減** |
| **既知エラー（自動修正可能）** | 5クレジット | 0クレジット | **100%削減** |
| **未知エラー（Issue作成）** | 5クレジット | 0クレジット（Issue作成のみ） | **100%削減** |
| **複雑な問題（Manus必要）** | 10クレジット | 10クレジット（手動実行） | 0%削減 |

### 月間コスト試算

- 日次監査: 30日 × 0クレジット = **0クレジット**
- 既知エラー: 月2回 × 0クレジット = **0クレジット**
- 未知エラー: 月1回 × 0クレジット = **0クレジット**
- 複雑な問題: 月1回 × 10クレジット = **10クレジット**

**合計: 月10クレジット**（従来は月150クレジット）

**削減率: 93%**

---

## 5. 実装優先順位

### Phase 1: 完全自動化（今すぐ実装）
1. ✅ ディレクトリ構造作成
2. ✅ 自動修正スクリプト作成
3. ⏳ ワークフロー拡張（自動記録・自動修正）
4. ⏳ Discord通知統合

### Phase 2: 半自動化（次回実装）
1. GitHub Issue自動作成
2. 手動トリガーワークフロー
3. Manus API統合

### Phase 3: 最適化（将来）
1. 機械学習によるエラー予測
2. 自動修正パターンの拡充
3. クレジット消費監視ダッシュボード

---

## 6. まとめ

**Manusは「最後の砦」として、自動化できない複雑な問題のみに介入する設計**

これにより:
- ✅ クレジット消費を93%削減
- ✅ 既知エラーは即座に自動修正
- ✅ 未知エラーはIssue作成で可視化
- ✅ Manusは本当に必要な時だけ起動

**次のステップ**: Phase 1の実装を完了させる
