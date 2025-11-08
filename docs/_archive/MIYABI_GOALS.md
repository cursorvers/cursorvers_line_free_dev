# Miyabiが達成しようとしていること

## 🎯 プロジェクト全体の目標

Miyabiは、**LINE友だち登録システムをGitHub Actions中心で運用する堅牢なアーキテクチャ**を構築し、**自律型開発環境**を実現することを目指しています。

## 📋 現在取り組んでいるIssue

### Issue #1: プロジェクト全体の推敲と改善 🏗️

**状態**: `📥 state:pending` + `🤖agent-execute`（待機中）

#### 達成目標

1. **README.mdの改善**
   - 説明の明確化と構造化
   - セットアップ手順の詳細化
   - アーキテクチャ図の改善
   - コード例の充実

2. **コードの品質向上**
   - TypeScriptの型安全性の向上
   - エラーハンドリングの改善
   - コメントとドキュメントの充実
   - ベストプラクティスの適用

3. **ドキュメントの整備**
   - 各ディレクトリの説明追加
   - API仕様の明確化
   - トラブルシューティングガイドの充実

4. **GitHub Actionsワークフローの最適化**
   - エラーハンドリングの改善
   - ログ出力の改善
   - パフォーマンスの最適化

#### 期待される成果物

- ✅ 改善されたREADME.md
- ✅ コードの品質向上
- ✅ より分かりやすいドキュメント
- ✅ 最適化されたワークフロー

---

### Issue #2: Manus API連動の実装 ⚡

**状態**: `🏗️ state:implementing`（実装中）

#### 達成目標

**GitHub ActionsワークフローからManus APIを呼び出して、LINE友だち登録システムと連動させる**

#### 実装内容

1. **`line-event.yml`の実装**
   - LINE EventからPlan JSONを生成
   - Manus APIを呼び出してタスクを作成
   - エラーハンドリングとリトライロジック

2. **`manus-progress.yml`の実装**
   - Progress Eventを解析
   - GPTで解析（必要に応じて）
   - PlanDeltaを更新
   - 必要に応じてManus APIを再実行

3. **Manus API呼び出し関数の作成**
   - Node.js/TypeScriptで実装
   - エラーハンドリングとリトライロジック
   - ログと監視機能

#### 実装タスク

- [ ] Manus API呼び出し関数の作成（Node.js/TypeScript）
- [ ] `line-event.yml`の実装（Plan生成→Manus API呼び出し）
- [ ] `manus-progress.yml`の実装（Progress Event解析→PlanDelta更新）
- [ ] GPT解析ロジックの実装（オプション）
- [ ] エラーハンドリングとリトライロジック
- [ ] ログと監視機能

---

## 🏗️ システムアーキテクチャの目標

### 現在のアーキテクチャ

```
[LINE] ─┐
        ├→ Front Door（Supabase Edge Function）→ GitHub API repository_dispatch
[Manus Progress] ─┘                                   └→ GitHub Actions
                                                            ├→ GPT（解析/シミュレーション）
                                                            ├→ Manus API（実行指示）
                                                            ├→ Supabase（ログ/指標）
                                                            └→ LINE返信
```

### 設計原則

- ✅ **止めない入口**: Front Doorは薄い関数（100～200行）で常時稼働
- ✅ **見える運用**: すべての進捗・差分をGitに記録
- ✅ **自動対策**: GPTが進捗を解析し、異常時は自動で対策
- ✅ **完全な監査**: 全イベント・差分・ログを永続化
- ✅ **段階的改善**: バージョン管理で安全にロールバック可能

---

## 🤖 Miyabiエージェントの役割

### エージェントの実行フロー

```
Issue作成/検出
    ↓
CoordinatorAgent（タスク分解・DAG構築）
    ↓ 並行実行
├─ IssueAgent（分析・Label付与）
├─ CodeGenAgent（GPT-5でコード生成）
├─ ReviewAgent（品質チェック≥80点）
└─ TestAgent（テスト実行）
    ↓
PRAgent（Draft PR作成）
    ↓
人間レビュー待ち
```

### 各エージェントの目標

1. **IssueAgent**
   - Issueを分析し、タスクを分解
   - 識学理論65ラベル体系による自動分類
   - タスク複雑度推定（小/中/大/特大）

2. **CoordinatorAgent**
   - タスク統括・並列実行制御
   - DAG（Directed Acyclic Graph）ベースのタスク分解
   - Critical Path特定と並列実行最適化

3. **CodeGenAgent**
   - AI駆動コード生成（GPT-5使用）
   - TypeScript strict mode完全対応
   - 高品質コード生成

4. **ReviewAgent**
   - コード品質判定
   - 静的解析・セキュリティスキャン
   - 品質スコアリング（100点満点、80点以上で合格）

5. **PRAgent**
   - Pull Request自動作成
   - Conventional Commits準拠
   - Draft PR自動生成

6. **TestAgent**
   - テスト自動実行
   - テスト実行・カバレッジレポート
   - 80%+カバレッジ目標

---

## 🎯 プロジェクトの最終目標

### ビジネス目標

1. **LINE友だち登録システムの運用**
   - 医療AI監査・コンサルティングサービスのトップオブファネル
   - 公開ノートブログからのリード獲得
   - LINEチャネルでの継続的なエンゲージメント

2. **自律型開発環境の実現**
   - 人間の介入を最小限に
   - 全工程が自動実行
   - GitHubをOSとして扱う設計思想

3. **運用の軽量化**
   - メンテナンス作業の最小化
   - 監査準備と安全コンプライアンスの維持
   - スケーラブルな運用

### 技術目標

1. **堅牢なアーキテクチャ**
   - GitHub Actions中心の運用
   - 完全な監査可能性
   - 自動ロールバック機能

2. **コード品質の向上**
   - TypeScript strict mode完全対応
   - 80%以上のテストカバレッジ
   - 80点以上の品質スコア

3. **自動化の徹底**
   - コード生成からPR作成まで自動化
   - 自動デプロイとヘルスチェック
   - 自動Rollback機能

---

## 📊 現在の進捗状況

### Issue #1: プロジェクト全体の推敲と改善
- **状態**: `📥 state:pending`
- **ラベル**: `🤖agent-execute`（エージェント実行待機中）
- **優先度**: P2-Medium

### Issue #2: Manus API連動の実装
- **状態**: `🏗️ state:implementing`（実装中）
- **優先度**: P1-High
- **進捗**: エージェントが作業中

### 全体の状態

```
📊 Agentic OS Status - mo666-med/cursorvers_line_free_dev

📥 Pending: 2 (待機中)
🏗️ Implementing: 1 (実装中)
🔍 Analyzing: 0
👀 Reviewing: 0

Total open Issues: 2
Active agents: 1
Blocked: 0
```

---

## 💡 まとめ

Miyabiは以下のことを達成しようとしています：

1. **プロジェクト全体の品質向上**（Issue #1）
   - README、コード、ドキュメント、ワークフローの改善

2. **Manus API連動の実装**（Issue #2）
   - LINE EventとManus APIの統合
   - GPT解析による自動対策

3. **自律型開発環境の構築**
   - 人間の介入を最小限に
   - 全工程の自動化

4. **堅牢な運用システムの実現**
   - GitHub Actions中心の運用
   - 完全な監査可能性
   - 自動ロールバック機能

現在、Issue #2が実装中で、Issue #1はエージェント実行待機中です。

