## 🎯 プロジェクト: LINE-Discord導線 CRITICAL止血パッチ

### 概要
- **目的**: 3者合議(REJECTED)で検出された CRITICAL 5件の即時修正
- **対象**: cursorvers/cursorvers_line_free_dev
- **スコープ**: 止血パッチ（最小限の修正で安全性を確保）
- **期限**: 即日〜翌日

### レビュー結果
- **Codex code-reviewer**: 2/3（maintainability: 0）- CRITICAL 5件
- **GLM code-reviewer**: 2/7 NEEDS WORK
- **Gemini ui-reviewer**: REJECT
- **合議結果**: REJECTED（1/3承認）

---

## 🔴 フェーズ1: 権限昇格の防止（P1 即日） `cc:完了`

### 1-1. /join認可条件をtierベースに変更 `[feature:security]` `[feature:tdd]`

**ファイル**: `supabase/functions/discord-bot/index.ts` (行166-174)
**問題**: `status in ["active", "trialing"]` のみで判定 → free会員でもstatus=activeなら有料ロール付与可能

#### テストケース設計
| テストケース | 入力 | 期待出力 | 備考 |
|-------------|------|---------|------|
| 正常系: 有料active会員 | email=paid@test.com, tier=library, status=active | ロール付与成功 | 基本フロー |
| 正常系: trial会員 | tier=library, status=trialing | ロール付与成功 | トライアル |
| 異常系: free会員active | tier=free, status=active | 拒否「有料プランへの加入が必要」 | **権限昇格防止** |
| 異常系: free会員inactive | tier=free, status=inactive | 拒否 | 二重ガード |
| 異常系: メール未登録 | email不一致 | 拒否「決済情報なし」 | 既存動作維持 |

#### 実装タスク
- [ ] テスト作成: /join の tier ベース認可テスト
- [ ] 修正: `.in("status", [...])` → `.in("tier", ["library", "master"])` に変更
- [ ] 修正: エラーメッセージを「有料プランへの加入が必要です」に更新

### 1-2. 無料登録 status を tier 連動に修正 `[feature:security]` `[feature:tdd]`

**ファイル**: `supabase/functions/line-webhook/index.ts` (行280-288)
**問題**: 無料ユーザーに `status: "active"` を設定 → Issue 1-1 と組み合わさると権限昇格

#### テストケース設計
| テストケース | 入力 | 期待出力 | 備考 |
|-------------|------|---------|------|
| 正常系: 新規free登録 | tier=free | status="free" | **修正後の動作** |
| 正常系: 既存有料ユーザー | tier=library, 既存status=active | status="active"維持 | 既存動作維持 |
| 正常系: 有料→メール登録 | existingRecord.tier=library | status=既存値維持 | マージケース |
| エッジケース: tier未設定 | existingRecord=null | tier="free", status="free" | デフォルト値 |

#### 実装タスク
- [ ] テスト作成: 無料登録時の status 設定テスト
- [ ] 修正: `status: "active"` → `status: existingRecord?.status ?? "free"` に変更
- [ ] 確認: 既存有料ユーザーの status が変更されないこと

---

## 🔴 フェーズ2: 課金整合性の確保（P1 即日） `cc:完了`

### 2-1. Stripe冪等性テーブルを処理成功後insertに変更 `[feature:security]` `[feature:tdd]`

**ファイル**: `supabase/functions/stripe-webhook/index.ts` (行419-444)
**問題**: 処理前に `stripe_events_processed` へ insert → 処理失敗時にリトライ不能

#### テストケース設計
| テストケース | 入力 | 期待出力 | 備考 |
|-------------|------|---------|------|
| 正常系: 初回イベント処理成功 | event_id=evt_new | 処理実行 + events_processed記録 | 基本フロー |
| 正常系: 重複イベント | event_id=evt_existing | スキップ(200) | 冪等性維持 |
| 異常系: 処理途中エラー | event_id=evt_fail, DB error | エラー返却, events_processed記録なし | **リトライ可能** |
| 異常系: 処理成功→記録失敗 | event_id=evt_ok, insert error | 処理完了, 次回は再処理（冪等） | 安全側倒し |
| エッジケース: 並行処理 | 同一event_id同時到着 | 1つのみ処理 | RACEコンディション |

#### 実装タスク
- [ ] テスト作成: 冪等性テーブルの処理順序テスト
- [ ] 修正: insert を switch 処理の **後** に移動
- [ ] 修正: catch 内で insert しない（リトライ可能に）
- [ ] 修正: customer_email を実際の値で記録（null→実値）
- [ ] 確認: 並行処理時の UNIQUE 制約による自然なガード維持

---

## 🟡 フェーズ3: データ整合性とAPI修正（P2 翌日） `cc:完了`

### 3-1. 孤児LINEレコードのマージ条件を厳格化 `[feature:security]`

**ファイル**: `supabase/functions/stripe-webhook/index.ts` (行106付近)
**問題**: email=null の最古レコードを無条件マージ → 別ユーザーの line_user_id を誤紐付け

#### 実装タスク
- [ ] テスト作成: 孤児マージの条件テスト
- [ ] 修正: Checkout metadata の `line_user_id` との因果関係チェック追加
- [ ] 修正: 因果関係なしの場合はマージせず、管理者通知に変更
- [ ] 確認: 正規フロー（LINE先行→決済）でのマージが正常動作すること

### 3-2. Discord招待APIエンドポイントを修正 `[feature:security]`

**ファイル**: `supabase/functions/_shared/discord.ts` (行85付近)
**問題**: `guilds/{id}/invites` → 正しくは `channels/{id}/invites`

#### 実装タスク
- [ ] テスト作成: Discord招待生成のモックテスト
- [ ] 修正: エンドポイントを `channels/{channel_id}/invites` に変更
- [ ] 修正: 環境変数 `DISCORD_INVITE_CHANNEL_ID` を追加
- [ ] 確認: フォールバック固定URL `discord.gg/TkmmX5Z4vx` が引き続き機能すること

### 3-3. /sec-brief-publish に管理者ロールチェック追加 `[feature:security]`

**ファイル**: `supabase/functions/discord-bot/index.ts` (行437-551)
**問題**: 権限チェックなしで誰でもsec-brief公開可能

#### 実装タスク
- [ ] 修正: `interaction.member.roles` で管理者ロール確認
- [ ] 修正: 環境変数 `DISCORD_ADMIN_ROLE_ID` を追加
- [ ] 修正: 非管理者には「権限がありません」を返却

### 3-4. /join に guild_id 検証を追加 `[feature:security]`

**ファイル**: `supabase/functions/discord-bot/index.ts` (行108-132)
**問題**: `guild_id` の存在チェックのみ、正しいサーバーかの検証なし

#### 実装タスク
- [ ] 修正: `interaction.guild_id !== DISCORD_GUILD_ID` で検証
- [ ] 修正: 不一致時は「このサーバーでは使用できません」を返却

---

## 🟢 フェーズ4: 検証とデプロイ `cc:完了`

### 完了条件（不変条件）
- free tier の会員が Discord Library Member ロールを取得できないこと
- Stripe イベント処理が途中失敗した場合、次回リトライで正常処理されること
- 孤児レコードが因果関係なしに自動マージされないこと
- Discord 招待リンクが正常に生成されること（フォールバック含む）

### ロールバック方針
- 各 Edge Function は個別デプロイ可能 → 問題発生時は前バージョンに即時ロールバック
- DB migration は additive only（カラム追加のみ、削除なし）で可逆性を確保

- [ ] 全テスト実行（既存280件 + 新規テスト）
- [ ] Codex security-analyst に再レビュー委譲
- [ ] GLM code-reviewer に再レビュー（5/7以上目標）
- [ ] Supabase Edge Functions デプロイ
- [ ] 本番動作確認（LINE→Stripe→Discord導線）
- [ ] GitHub Issue に修正内容を記録

---

## 環境変数追加（必要）

| 変数名 | 用途 | 設定先 |
|--------|------|--------|
| `DISCORD_INVITE_CHANNEL_ID` | 招待生成先チャンネル | Repository Secrets |
| `DISCORD_ADMIN_ROLE_ID` | 管理者ロールID | Repository Secrets |

## 🔵 フェーズ5: 根因分析と完全修復（並行実施） `cc:完了`

### 根本原因（Codex architect + GLM 合意）

| # | 開発者の意図 | なぜ見逃された | 根本原因 |
|---|------------|--------------|---------|
| 1 | 「購読=有料」前提で status だけで最短実装 | 権限境界のネガティブテスト欠如 | 認可がドメインモデル(Entitlement)ではなくデータ断片(status)に直結 |
| 2 | 無料登録を「とりあえず有効化」する暫定措置 | 暫定コード検知の仕組みなし | 会員状態の状態機械が未定義、free/activeが混線 |
| 3 | 「先にロックして重複防止」の発想 | 冪等性の定石がチーム標準として未明文化 | イベント処理の状態管理モデル不在 |
| 4 | 重複ユーザー削減のための単純ルール | マージの不可逆性・安全条件の定義なし | Identity Resolution が独立コンポーネントになっていない |
| 5 | guilds/{id}/invites でドキュメント読み違い | 外部API契約テスト/スタブテストなし | 外部API境界が抽象化されていない |

### 共通パターン（GLM分析）
1. データモデルの誤解とハードコーディング
2. バリデーション・条件分岐の欠如
3. 外部API連携の順序・実装の誤り

### フェーズ5 実行順序（Codex architect 指摘による順序付け）
> フェーズ5は同時並行ではなく、事故寄与度と依存関係の強い順に段階実行:
> 1. Policy Engine (AuthZ) → 2. Idempotency Store → 3. Identity Resolver → 4. Discord API Adapter
> 各段階の完了条件を満たしてから次に進む。

### 5-1. Policy Engine 導入（認可判定の一元化） `[feature:security]`

**目的**: /join、LINE登録、Stripe webhook の認可判定を単一のポリシー層に集約

#### 実装タスク
- [ ] `_shared/policy.ts` 作成: `canAccessDiscord(member): boolean` 関数
- [ ] 判定ロジック: `tier in ["library", "master"] && status in ["active", "trialing"]`
- [ ] /join、stripe-webhook、line-webhook から Policy Engine を参照
- [ ] Decision Table テスト: tier × status × stripe_subscription_status の全組み合わせ

### 5-2. Identity Resolver 導入（マージ判定の安全化） `cc:実装完了`

**目的**: 孤児レコードの自動マージを安全な仕組みに置き換え

#### 実装タスク
- [x] `_shared/identity-resolver.ts` 作成
- [x] 強い証拠（同一 line_user_id in Checkout metadata）→ 自動マージ
- [x] 弱い証拠（email=null の最古レコード）→ 保留 + 管理者通知
- [x] マージ操作の監査ログ記録（`identity_merge_audit` テーブル + Migration 015）
- [x] stripe-webhook/index.ts に統合（mergeOrphanLineRecord → decideMerge）

### 5-3. Idempotency Store 標準化 `cc:実装完了`

**目的**: イベント処理の状態遷移を標準テンプレ化

#### 実装タスク
- [x] `stripe_events_processed` に `status` カラム追加（received/processing/succeeded/failed）
- [x] 処理フロー: received → processing → succeeded/failed（Codex案B: リース/タイムアウト付き）
- [x] failed イベントの再処理（指数バックオフ + max attempts=10）
- [x] Migration SQL 作成（014_idempotency_status.sql）
- [x] `_shared/idempotency.ts` モジュール作成（claimEvent/markSucceeded/markFailed）
- [x] stripe-webhook/index.ts に統合

### 5-4. Discord API Adapter 集約 `cc:実装完了`

**目的**: Discord API 呼び出しを抽象化し、契約テストで保護

#### 実装タスク
- [x] `_shared/discord-endpoints.ts` Endpoint Spec パターン（Codex案B: URL+method+okStatuses）
- [x] 契約テスト: 22テスト（URL構築、必須パラメータ検証、ステータスコード、HTTPメソッド）
- [x] エンドポイント定数化（全インラインURL → DISCORD_ENDPOINTS経由）
- [x] `_shared/discord.ts` を Adapter パターンにリファクタ

---

## 🔵 フェーズ6: 再発防止ガードレール `cc:完了`

### プロセス改善

- [x] PR レビューチェックリスト追加（`.github/PULL_REQUEST_TEMPLATE.md`）:
  - 権限境界（無料/取消/未払い/商品差分）
  - 状態遷移（状態機械との整合性）
  - 冪等性/リトライ（失敗→再送→成功のシナリオ）
  - 外部API契約（公式ドキュメント参照、権限、エラー時挙動）
  - 不可逆操作（マージ/ロール付与の安全条件）
- [ ] 暫定実装/ハードコードの期限管理ルール導入（運用フェーズで対応）
- [x] Decision Table を一次資料として運用開始（policy-parameterized_test.ts）

### テスト強化

- [x] 権限境界パラメタライズドテスト（4 tier × 6 status = 24組み合わせ + 12 CRITICAL）
- [x] 冪等性テスト（received→processing→succeeded, failed→re-claim→succeeded）
- [x] 外部API契約テスト（Discord 22テスト: URL/パラメータ/ステータスコード/メソッド）
- [x] 孤児マージのネガティブテスト（identity-resolver_test.ts: 弱証拠→HOLD_FOR_REVIEW）

### 監視・監査

- [x] マージ操作の監査ログ（identity_merge_audit テーブル + 自動記録）
- [x] failed イベントの定期チェック（cleanup_old_stripe_events関数: stale processing自動リセット）
- [ ] 異常検知アラート: 無料→有料ロール付与の比率監視（運用フェーズで対応）

---

## 参照

- 3者合議結果: REJECTED（Claude: CONDITIONAL / Codex: REJECT / Gemini: REJECT）
- Codex code-reviewer: 12件（CRITICAL 5, MAJOR 3, MINOR 4）
- GLM code-reviewer: 2/7 NEEDS WORK
- Codex architect 推奨: 案A止血 → 案B Entitlement一元化（中期）
- 根因分析: Codex architect（119s）+ GLM general-reviewer（52s）合意
