# 次セッション実装プラン

**作成日**: 2026-02-01
**Weekly Limit**: リセット後（0%スタート）
**優先度**: CRITICAL（Claude 98%問題の根本解決）

---

## 完了タスク（今セッション）

### ✅ LINE Bot ワークフロー削減（36 → 29）

| Priority | 削減内容 | Commit |
|----------|---------|--------|
| P1 | auto-fix 系統合 | `64e0513` |
| P2-2 | manus-audit 統合 | `ef60538` |
| P2 追加 | item-opened + weekly-reports 統合 | `004f20d` |

**成果**: 7削減達成、19.4% 効率化

---

## 次セッションの最優先タスク

### 🎯 Task 1: デュアルパス型ルータ実装

**目的**: Claude 使用率を 98% → 35% に削減

#### 現状分析

```
問題の構造:
delegation-matrix.md（SSOT）
    ↓ 参照のみ
Claude（手動で判断・委譲）
    ↓ 毎回全タスクを処理
Weekly limit 98% 到達
```

#### 解決策: 実行時ルータの実装

```
タスク受領
    ↓
自動分類（ルータ）
├─ Layer 1: Codex（コード・設計）→ 固定費$200/月
├─ Layer 2: GLM（軽量・明確）→ $15/月
├─ Layer 3: Haiku（超軽量）→ 従量課金
└─ Layer 4: Sonnet（複雑・高リスク）→ 従量課金
    ↓
各層で実行
    ↓
Claude は統合・報告のみ
```

#### 実装ファイル

| ファイル | 変更内容 |
|---------|----------|
| `~/.claude/rules/auto-execution.md` | 4層判断ロジック追加 |
| `~/.claude/rules/delegation-flow.md` | ルータ呼び出しフロー追加 |
| `~/.claude/skills/orchestra-delegator/scripts/router.js` | 新規作成（分類エンジン） |

#### タスク分類基準（Codex 案B: デュアルパス・ハイブリッド）

**分類ロジック**:
```
1. delegation-matrix.md に明示ルールあり？
   → Yes: 該当レイヤーへ（SSOT 優先）
   → No: 動的分類（以下の基準）

2. 動的分類（トリガーワード + 複雑度 + リスク）
   - 高リスク語（security, incident, payment）→ 強制 Sonnet
   - 高複雑語（refactor, migration, architecture）→ Codex or Sonnet
   - 低複雑語（typo, format, search）→ Haiku or GLM
```

**Layer 1: Codex** (目標: 80-100回/週)
- トリガー: `コード`, `バグ修正`, `リファクタ`, `テスト`, `CI`, `アーキテクチャ`
- 条件: コード中心 AND 複雑度 ≤ 中
- 強制昇格: セキュリティ関連、認証・決済コード
- 例: "この関数をリファクタして"

**Layer 2: GLM** (目標: 100回/週)
- トリガー: `要約`, `翻訳`, `計算`, `数学`, `FAQ`, `レビュー`
- 条件: 明確 AND 低リスク AND 非コード
- 制約: 10行以上の変更は Codex へ昇格
- 例: "このドキュメントを要約して"

**Layer 3: Haiku** (目標: 20-30回/週)
- トリガー: `tl;dr`, `一言で`, `タグ`, `分類`, `ファイル探して`
- 条件: 超軽量 AND トークン ≤ 300
- 制約: 曖昧な質問は Sonnet へ昇格
- 例: "このファイルを探して"

**Layer 4: Sonnet** (目標: 10-15回/週)
- トリガー: `設計`, `トレードオフ`, `リスク`, `セキュリティ`, `性能`, `曖昧`
- 条件: 複雑 OR 高リスク OR 重要判断
- 強制: payment, security, incident, 本番変更
- 例: "この機能の設計方針を決めて"

**ガードレール（Claude 使用率制御）**:
- 週次使用率 > 35% → 次タスクを下位レイヤーへ降格
- 月次バースト許容: 1週間だけ 50% まで許可
- 高リスクタスクは使用率無視で Sonnet 強制

#### リスク分析

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| 誤分類 | 非効率な委譲 | フォールバック to Sonnet |
| 後方互換性破壊 | 既存スキル動作不良 | 段階的ロールアウト |
| パフォーマンス劣化 | ルータ判断に時間 | キャッシング + 閾値最適化 |

#### 成功指標

- Claude 使用率: 98% → 35% 以下
- Codex 使用: 15回/週 → 80-100回/週
- GLM 使用: 74回/週 → 100回/週
- タスク完了時間: 現状維持または改善

---

## Task 2: CLAUDE.md 更新（今日の作業反映）

**ファイル**: `cursorvers_line_free_dev/CLAUDE.md`

### 更新内容

1. **ワークフロー削減の記録**
   - 36 → 29 workflows
   - 統合済みワークフロー一覧

2. **最近の更新セクション**
   - 日付を 2026-02-01 に更新
   - ワークフロー統合完了を追記

3. **監査スケジュール**
   - manus-audit.yml（統合版）に更新
   - daily/weekly/monthly を単一ファイルに変更

---

## Task 3: Platform system-architecture.md 更新

**ファイル**: `Cursorvers_Platform/docs/system-architecture.md`

### 追記内容

- 開発ログに今日の変更を記録
- GitHub Actions ワークフロー削減の経緯
- 統合方針の記録（後続プロジェクトの参考資料）

---

## 実装順序（次セッション）

```
1. Codex 設計書確認（今セッションで取得済み）
   ↓
2. router.js 実装（30分）
   ↓
3. auto-execution.md 更新（15分）
   ↓
4. テスト実行（簡単なタスクで検証）
   ↓
5. CLAUDE.md 更新（10分）
   ↓
6. system-architecture.md 更新（10分）
   ↓
7. 1週間モニタリング
```

**推定時間**: 1-2時間（実装 + 検証）

---

## 期待効果（1週間後）

| 指標 | Before | After | 改善率 |
|------|--------|-------|--------|
| Claude 使用率 | 98% | 35% | 64% 削減 |
| Codex 使用 | 15回/週 | 80-100回/週 | 6倍増 |
| GLM 使用 | 74回/週 | 100回/週 | 35% 増 |
| コスト効率 | $13.33/タスク | $2.00/タスク | 85% 削減 |

---

## Codex 設計書の統合

**Status**: ✅ 完了（bd93f14）

**推奨案**: 案B - デュアルパス・ハイブリッド

### Router 擬似コード（Codex設計）

```javascript
// ~/.claude/skills/orchestra-delegator/scripts/router.js

function route(task, runtime) {
  // Step 1: Matrix rule lookup (SSOT priority)
  const rule = lookupMatrix(task);

  if (rule.exists) {
    layer = rule.layer;
  } else {
    // Step 2: Dynamic classification
    const category = classify(task);
    const complexity = estimateComplexity(task);
    layer = scoreLayer(category, complexity, runtime);
  }

  // Step 3: Claude usage guardrails
  layer = enforceClaudeCap(layer, runtime);

  // Step 4: Availability check + fallback
  if (!available(layer)) {
    layer = nextLayer(layer);
  }

  return layer;
}

// Error handler: Always fallback to Sonnet
on error -> Layer 4: Sonnet

// High-risk forced routing
if (task.includes('security|incident|payment')) {
  return 'Layer 4: Sonnet';
}
```

### 実装優先度

1. **Phase 1**: シャドールーティング（既存ワークフロー影響なし）
   - ルータを実行するが、結果をログのみ
   - 1週間モニタリング

2. **Phase 2**: 段階ロールアウト
   - Layer 1 (Codex) のみ有効化
   - 2週間で問題なければ Layer 2-3 を有効化

3. **Phase 3**: 完全移行
   - 全レイヤー有効化
   - メトリクスダッシュボード整備

---

**次セッション開始時のアクション**:
1. 本ファイルを読む
2. Codex 設計書（bd93f14 の出力）を確認
3. router.js 実装開始
