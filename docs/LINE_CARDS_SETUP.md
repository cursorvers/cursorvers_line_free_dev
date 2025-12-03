# LINE Cards セットアップガイド

Obsidian Vault のメモから LINE 公式アカウントへ毎日1件のカードを配信するシステムです。

---

## 概要

```
Obsidian Vault
    ↓ (手動: npm run export)
Supabase: line_cards テーブル
    ↓ (自動: 毎日 08:00 JST)
LINE 公式アカウント → 全フォロワーに配信
```

---

## 1. Obsidian でやること

### タグの付け方

任意のノートの任意の行に `#cv_line` タグを付けると、その行がカード候補になります。

```markdown
# 税務メモ

- 医療法人の役員報酬は損金算入できるが、不相当に高額な場合は否認される #cv_line #tax
- 節税よりもまず「見える化」が大事。月次で数字を見る習慣をつける #cv_line #tax
- 医師の副業収入は雑所得か事業所得か。継続性・規模がポイント #cv_line #career
```

### テーマタグ（オプション）

`#cv_line` と同じ行に以下のタグを付けると、テーマ分類されます：

| タグ | テーマ | 説明 |
|------|--------|------|
| `#ai_gov` | 医療AIガバナンス | AI活用、データガバナンス |
| `#tax` | 税務・資産形成 | 節税、法人化、確定申告 |
| `#law` | 法務・契約 | 契約書、リスク管理 |
| `#biz` | 事業戦略 | Cursorvers事業、マーケティング |
| `#career` | 医師キャリア | 働き方、転職、副業 |
| `#asset` | 個人の資産形成 | 投資、不動産、資産運用 |

タグがなければ `general` に分類されます。

### 良いカードの書き方

```markdown
# 良い例 ✅

- 勤務医でも副業を持つと「事業主」として確定申告が必要になる場合がある。20万円以上の雑所得が目安 #cv_line #tax

# 悪い例 ❌（短すぎる）

- 確定申告 #cv_line
```

---

## 2. 同期スクリプトの実行

### 初回セットアップ

```bash
cd cursorvers_line_stripe_discord/scripts/export-line-cards
npm install
```

### 環境変数の設定

```bash
export SUPABASE_URL="https://haaxgwyimoqzzxzdaeep.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."  # Supabaseダッシュボードから取得
```

### 実行

```bash
npm run export
```

または Vault パスを指定：

```bash
npm run export "/Users/masayuki/Obsidian Professional Kit"
```

### 出力例

```
═══════════════════════════════════════════
  Obsidian → Supabase LINE Cards Sync
═══════════════════════════════════════════

📁 Vault: /Users/masayuki/Obsidian Professional Kit
🏷️  対象タグ: #cv_line
📖 コンテキスト行: 1

═══ Phase 1: カード抽出 ═══

📂 Scanning 234 markdown files...
  ✓ 税務/シリウス/2025-見積もりメモ.md: 3 cards
  ✓ キャリア/医師の働き方.md: 2 cards
  ✓ AI/ガバナンス方針.md: 1 cards

📝 Total cards extracted: 6

═══ Phase 2: Supabase同期 ═══

☁️  Supabase に同期中...
  既存カード数: 10
  新規カード: 3
  スキップ（重複）: 3
✅ 3 件のカードを追加しました

═══ Phase 3: 統計情報 ═══

📊 テーマ別カード数（ready）:
  tax: 5
  career: 4
  ai_gov: 2
  general: 2

📈 全体統計:
  総カード数: 13
  配信可能: 13

═══════════════════════════════════════════
  同期完了！
═══════════════════════════════════════════
  抽出カード数: 6
  新規追加: 3
  スキップ: 3
```

---

## 3. Edge Function のデプロイ

### マイグレーション適用

```bash
cd cursorvers_line_stripe_discord
supabase db push --project-ref haaxgwyimoqzzxzdaeep
```

### Edge Function デプロイ

```bash
supabase functions deploy line-daily-brief --no-verify-jwt --project-ref haaxgwyimoqzzxzdaeep
```

### 環境変数設定

```bash
# Cron認証用シークレット（任意の文字列）
supabase secrets set LINE_DAILY_BRIEF_CRON_SECRET=your-secret-here --project-ref haaxgwyimoqzzxzdaeep
```

GitHub Secrets にも設定：
- `LINE_DAILY_BRIEF_CRON_SECRET`: 上と同じ値

### 手動テスト

```bash
curl -X POST https://haaxgwyimoqzzxzdaeep.supabase.co/functions/v1/line-daily-brief \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: your-secret-here"
```

---

## 4. スケジューラ設定

GitHub Actions で毎日 JST 08:00 に自動配信されます。

### 設定ファイル

`.github/workflows/line-daily-brief-cron.yml`

### 手動実行

GitHub Actions の「Actions」タブから「LINE Daily Brief」ワークフローを手動実行できます。

---

## 5. トラブルシューティング

### カードが同期されない

1. `#cv_line` タグが正しく付いているか確認
2. Vault パスが正しいか確認
3. 環境変数が設定されているか確認

### LINE配信が失敗する

1. `LINE_CHANNEL_ACCESS_TOKEN` が有効か確認
2. LINE Developers Console でエラーログを確認
3. Supabase ダッシュボードで Edge Function のログを確認

### 同じカードばかり配信される

配信アルゴリズムは「テーマの偏りが少ない」＆「配信回数が少ない」カードを優先します。
カード数が少ないとバリエーションが出にくいため、継続的にカードを追加してください。

---

## 6. データモデル

### line_cards テーブル

| カラム | 型 | 説明 |
|--------|------|------|
| `id` | UUID | 主キー |
| `body` | TEXT | LINE配信用の本文 |
| `theme` | ENUM | テーマ分類 |
| `source_path` | TEXT | Obsidian内のファイルパス |
| `source_line` | INTEGER | 元の行番号 |
| `content_hash` | TEXT | 重複防止用ハッシュ |
| `status` | ENUM | ready / used / archived |
| `times_used` | INTEGER | 配信回数 |
| `last_used_at` | TIMESTAMPTZ | 最終配信日時 |

### line_card_broadcasts テーブル

配信履歴を記録（デバッグ・分析用）

---

## 7. 運用フロー

1. **毎週〜毎月**: Obsidian で新しいメモを書き、良いフレーズに `#cv_line` タグを付ける
2. **手動**: `npm run export` で Supabase に同期
3. **自動**: 毎日 08:00 に LINE 配信（GitHub Actions）

---

最終更新: 2025-12-03

