# T6: Manus再試行テストマトリクス

## 📋 テストマトリクス概要

Manus Progress Eventの処理において、PlanDeltaのdecisionに基づく再試行ロジックをテストするためのマトリクスです。

## 🎯 テストケース

### 1. success_proceed（正常終了）

**シナリオ**: タスクが正常に完了し、次のステップに進む

**入力**:
```json
{
  "event_type": "task_completed",
  "task_id": "test-task-success-001",
  "status": "complete",
  "plan_delta": {
    "decision": "proceed",
    "reasons": ["正常に完了しました"]
  }
}
```

**期待動作**:
- ✅ Manus再試行: なし
- ✅ PlanDelta保存: 実行
- ✅ Supabase upsert: 実行
- ✅ ログコミット: 実行

### 2. retry_required（再試行が必要）

**シナリオ**: 一時的なエラーにより再試行が必要

**入力**:
```json
{
  "event_type": "step_failed",
  "task_id": "test-task-retry-001",
  "step_id": "s1",
  "status": "failed",
  "plan_delta": {
    "decision": "retry",
    "reasons": ["Supabase一時的な503エラー"],
    "actions": [
      {
        "type": "retry",
        "step_id": "s1",
        "backoff_ms": 5000,
        "max_retries": 2
      }
    ]
  }
}
```

**期待動作**:
- ✅ Manus再試行: 実行（retry_count=1）
- ✅ PlanDelta保存: 実行
- ✅ Supabase upsert: 実行
- ✅ ログコミット: 実行

### 3. amend_required（Plan修正が必要）

**シナリオ**: Plan JSONに誤りがあり、修正が必要

**入力**:
```json
{
  "event_type": "step_failed",
  "task_id": "test-task-amend-001",
  "step_id": "s2",
  "status": "failed",
  "plan_delta": {
    "decision": "amended",
    "reasons": ["ステップs2のペイロードに誤りがある"],
    "actions": [
      {
        "type": "amend",
        "step_id": "s2",
        "payload_corrections": {...}
      }
    ],
    "amended_plan": {...}
  }
}
```

**期待動作**:
- ✅ Manus再試行: 実行（amended_plan使用）
- ✅ PlanDelta保存: 実行
- ✅ Supabase upsert: 実行
- ✅ ログコミット: 実行
- ✅ 修正されたPlan使用: true

### 4. abort_required（中止が必要）

**シナリオ**: 致命的なエラーにより、タスクを中止する必要がある

**入力**:
```json
{
  "event_type": "task_failed",
  "task_id": "test-task-abort-001",
  "status": "failed",
  "plan_delta": {
    "decision": "abort",
    "reasons": ["致命的なエラーが発生しました"],
    "actions": []
  }
}
```

**期待動作**:
- ✅ Manus再試行: なし
- ✅ PlanDelta保存: 実行
- ✅ Supabase upsert: 実行
- ✅ ログコミット: 実行
- ✅ ワークフロー中止: true

### 5. failure_no_retry（失敗 - 再試行なし）

**シナリオ**: 最大再試行回数に達し、これ以上再試行しない

**入力**:
```json
{
  "event_type": "task_failed",
  "task_id": "test-task-failure-001",
  "status": "failed",
  "plan_delta": {
    "decision": "abort",
    "reasons": ["最大再試行回数に達しました"],
    "evidence": {
      "retry_count": 3,
      "max_retries": 3
    }
  }
}
```

**期待動作**:
- ✅ Manus再試行: なし
- ✅ PlanDelta保存: 実行
- ✅ Supabase upsert: 実行
- ✅ ログコミット: 実行
- ✅ ワークフロー中止: true

## 📊 テストマトリクス

| decision | status | event_type | manus_retry | 備考 |
|----------|--------|------------|-------------|------|
| proceed | complete | task_completed | ❌ | 正常終了 |
| retry | failed | step_failed | ✅ | 再試行実行 |
| amended | failed | step_failed | ✅ | 修正Planで再試行 |
| abort | failed | task_failed | ❌ | 中止 |
| abort | failed | task_failed | ❌ | 最大再試行回数到達 |

## 🧪 テスト実装

### テストファイルの場所

- `tests/fixtures/manus-progress-test-matrix.json`: テストケース定義
- `tests/fixtures/supabase/manus-progress-fixtures.json`: Supabase fixtures

### 実行方法

```bash
# テストマトリクスを読み込んでテスト実行
node tests/manus-progress-matrix.test.mjs

# 特定のテストケースのみ実行
node tests/manus-progress-matrix.test.mjs --case retry_required
```

## 🔄 PlanDeltaのdecision判定ロジック

```javascript
const ALLOWED_DECISIONS = new Set([
  'proceed',   // 正常終了、次のステップへ
  'retry',     // 再試行が必要
  'amended',   // Plan修正が必要
  'abort',     // 中止が必要
]);
```

### decision別の動作

1. **proceed**: 正常終了、Manus再試行なし
2. **retry**: Manus APIで同じPlanを再実行
3. **amended**: 修正されたPlanでManus APIを再実行
4. **abort**: ワークフローを中止、Manus再試行なし

## 📝 実装ステップ

1. ✅ テストマトリクス定義作成
2. ✅ Supabase fixtures準備
3. ⏳ テストスクリプト実装
4. ⏳ モックManus API準備
5. ⏳ 統合テスト実装

## 🔗 関連ファイル

- `.github/workflows/manus-progress.yml`: Manus Progress Handler
- `scripts/supabase/upsert-progress-event.js`: Progress Event処理
- `scripts/plan/generate-plan-delta.js`: PlanDelta生成

