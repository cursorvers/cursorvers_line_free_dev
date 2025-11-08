# Codex → Manus 操作指示書

## 📋 概要

このドキュメントは、Codex（AIエージェント）がManus APIを操作してタスクを実行する際の指示書です。

## ⚠️ 制限事項（更新: 制限解除済み）

**Codex環境の制限（過去の記述）**:
- ~~Codex環境では**外部ネットワーク自体が遮断されている**~~ → **解除済み**
- ~~実際に`api.manus.ai`へは到達できず`getaddrinfo ENOTFOUND`エラーとなる~~ → **解除済み**
- ~~Codex環境から直接Manus APIを呼び出すことは**できない**~~ → **解除済み**

**現在の状態（制限解除後）**:
- ✅ **すべての外部ネットワーク接続が許可**されています
- ✅ **直接Manus APIを呼び出すことが可能**です
- ✅ **MCP経由、GitHub Actions経由、ローカル環境すべてで実行可能**です

**実行方法（すべて利用可能）**:
- ✅ **直接接続**: Codex環境から直接Manus APIを呼び出し可能
- ✅ **MCP経由**: CursorのMCP（Model Context Protocol）を使用
- ✅ **GitHub Actions経由**: GitHub Actionsなどネットワーク許可のある経路から実行
- ✅ **ローカル環境**: ユーザーのローカルマシンから直接実行

### 役割分担

- **Codex（頭脳）**: 企画・分析・判断・計画立案
- **Manus（手足）**: 実際の操作実行・外部API連携・データ処理
- **User（承認者）**: 2段階認証・重要な判断・最終承認

## 🎯 基本原則

1. **Codexは企画を担当**: Plan JSONを作成し、Manusに実行指示を出す
2. **Manusは実行を担当**: Plan JSONに従って、実際の操作を実行する
3. **Userは承認を担当**: 2段階認証や重要な判断が必要な場合のみ介入
4. **結果報告は必須**: Manusは実行完了後、必ずCodexへ結果を報告する

## 📋 操作フロー

```
┌─────────┐      ┌─────────┐      ┌─────────┐
│  Codex  │─────▶│  Manus  │─────▶│  User   │
│ (頭脳)  │ 計画 │ (手足)  │ 承認 │ (承認)  │
└─────────┘      └─────────┘      └─────────┘
     ▲                │                │
     │                │                │
     │        結果報告 │                │
     └────────────────┘                │
                                       │
                                       ▼
                                実行完了
```

### 1. Codexが計画を立案

Codexは以下の情報を分析して、Plan JSONを作成します：

- タスクの目的
- 必要な外部API連携
- リスク評価
- 実行ステップ
- ロールバック手順
- 監視指標

**Plan JSONの形式**:

```json
{
  "title": "タスクのタイトル",
  "risk": {
    "level": "low" | "medium" | "high",
    "reasons": ["理由1", "理由2"],
    "approval": "not_required" | "required"
  },
  "steps": [
    {
      "id": "s1",
      "action": "action_name",
      "connector": "connector_name",
      "payload": {},
      "idempotency_key": "unique-key",
      "on_error": "abort" | "continue" | "compensate"
    }
  ],
  "rollback": ["ロールバック手順"],
  "observability": {
    "success_metrics": ["成功指標"],
    "logs": ["ログ項目"]
  }
}
```

### 2. CodexがManusにタスクを作成

Codexは`scripts/lib/manus-api.js`の`createManusTask`関数を使用して、Manusにタスクを作成します：

```javascript
import { createManusTask } from './scripts/lib/manus-api.js';

const brief = fs.readFileSync('orchestration/MANUS_EXECUTION_BRIEF_costaware.txt', 'utf8');
const plan = JSON.parse(fs.readFileSync('orchestration/plan/current_plan.json', 'utf8'));

const result = await createManusTask({
  brief: brief,
  plan: plan,
  webhookUrl: process.env.PROGRESS_WEBHOOK_URL
});

console.log(`✅ Task created: ${result.task_id}`);
console.log(`📋 Task URL: ${result.task_url}`);
```

**実行時の注意事項**:

- `brief`と`plan`は必須
- `webhook_url`は設定済みの環境変数を使用
- タスクIDを記録して、後で結果を取得できるようにする

### 3. Manusがタスクを実行

Manusは以下の手順でタスクを実行します：

1. Plan JSONの各ステップを順次実行
2. 各ステップの開始・成功・失敗をProgressEventとしてWebhookに送信
3. エラー発生時は`on_error`に従って処理
4. ユーザー承認が必要な場合は`status="ask"`で報告

**ProgressEventの形式**:

```json
{
  "task_id": "task-id",
  "step_id": "s1",
  "status": "started" | "completed" | "failed" | "ask",
  "timestamp": "2025-01-01T12:00:00Z",
  "logs": ["ログメッセージ"],
  "metrics": {
    "latency_ms": 100,
    "retries": 0
  },
  "ask": {
    "reason": "承認が必要な理由",
    "preview": "プレビュー内容",
    "approval_token": "token"
  }
}
```

### 4. ユーザー承認が必要な場合

Manusが以下の場合、ユーザー承認を要求します：

- `Plan.risk.approval == "required"`の場合
- 送信先が50件を超える場合
- コストが予算を超える可能性がある場合
- 2段階認証が必要な操作の場合

**承認フロー**:

```
Manus → ProgressEvent (status="ask") → Webhook → Codex → User
                                                           │
                                                           ▼
User → Manus API (approve/cancel) ←──────────────────────┘
```

**Codexの対応**:

1. `status="ask"`のProgressEventを受信
2. Userに承認を依頼（チャット、通知など）
3. Userの承認/拒否をManusに伝達
4. 承認された場合は実行継続、拒否された場合は停止

### 5. 実行結果の報告

Manusは実行完了後、**必ずCodexへ結果を報告**します：

**報告方法**:

1. **Webhook経由**: ProgressEventを`PROGRESS_WEBHOOK_URL`に送信
2. **API経由**: Codexが`getManusTask(taskId)`で結果を取得

**最終結果の形式**:

```json
{
  "task_id": "task-id",
  "status": "completed" | "failed" | "cancelled",
  "output": [
    {
      "id": "output-id",
      "status": "completed",
      "role": "user",
      "type": "message",
      "content": [
        {
          "type": "output_text",
          "text": "実行結果の詳細"
        }
      ]
    }
  ],
  "credit_usage": 100
}
```

**Codexが結果を取得する方法**:

```javascript
import { getManusTask } from './scripts/lib/manus-api.js';

const taskId = 'jiCEzwARmApWN4KbLaJXad';
const result = await getManusTask(taskId);

console.log(`📊 Task Status: ${result.status}`);
console.log(`📋 Output: ${JSON.stringify(result.output, null, 2)}`);
console.log(`💰 Credit Usage: ${result.credit_usage}`);
```

## 📋 Codex実装例

### 完全な操作フロー

```javascript
#!/usr/bin/env node
/**
 * Codex → Manus 操作例
 */

import { createManusTask, getManusTask } from './scripts/lib/manus-api.js';
import fs from 'fs';

async function codexManusWorkflow() {
  console.log('🧠 Codex: 計画を立案中...');
  
  // 1. Plan JSONを作成
  const plan = {
    title: "LINEウェルカムメッセージ送信",
    risk: {
      level: "low",
      reasons: ["定型メッセージのみ", "個人情報なし"],
      approval: "not_required"
    },
    steps: [
      {
        id: "s1",
        action: "line.get_profile",
        connector: "line_bot",
        payload: { user_id: "{{LINE_USER_ID}}" },
        idempotency_key: "{{EVENT_ID}}-s1",
        on_error: "abort"
      },
      {
        id: "s2",
        action: "line.reply",
        connector: "line_bot",
        payload: {
          reply_token: "{{REPLY_TOKEN}}",
          messages: [{ type: "text", text: "はじめまして！" }]
        },
        idempotency_key: "{{EVENT_ID}}-s2",
        on_error: "compensate"
      }
    ],
    rollback: ["s2: メッセージ送信の取り消し"],
    observability: {
      success_metrics: ["line.reply.success"],
      logs: ["step毎のlatency", "retries"]
    }
  };
  
  console.log('✅ Codex: Plan JSONを作成しました');
  
  // 2. Manusにタスクを作成
  console.log('🚀 Codex: Manusにタスクを作成中...');
  const brief = fs.readFileSync('orchestration/MANUS_EXECUTION_BRIEF_costaware.txt', 'utf8');
  
  const createResult = await createManusTask({
    brief: brief,
    plan: plan,
    webhookUrl: process.env.PROGRESS_WEBHOOK_URL
  });
  
  const taskId = createResult.task_id;
  console.log(`✅ Codex: タスクを作成しました (Task ID: ${taskId})`);
  console.log(`📋 Task URL: ${createResult.task_url}`);
  
  // 3. 実行状況を監視（Webhook経由またはポーリング）
  console.log('👀 Codex: Manusの実行状況を監視中...');
  
  // ポーリングで結果を取得（実運用ではWebhook推奨）
  let taskStatus = 'running';
  while (taskStatus === 'running') {
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5秒待機
    
    const taskInfo = await getManusTask(taskId);
    taskStatus = taskInfo.status;
    
    if (taskStatus === 'running') {
      console.log('⏳ Codex: 実行中...');
    }
  }
  
  // 4. 最終結果を取得
  console.log('📊 Codex: 最終結果を取得中...');
  const finalResult = await getManusTask(taskId);
  
  console.log(`✅ Codex: タスク完了 (Status: ${finalResult.status})`);
  console.log(`📋 Output: ${JSON.stringify(finalResult.output, null, 2)}`);
  console.log(`💰 Credit Usage: ${finalResult.credit_usage}`);
  
  // 5. 結果を分析・報告
  if (finalResult.status === 'completed') {
    console.log('✅ Codex: タスクが正常に完了しました');
    // 次のアクションを決定
  } else if (finalResult.status === 'failed') {
    console.log('❌ Codex: タスクが失敗しました');
    // エラー処理・ロールバック
  }
  
  return finalResult;
}

// 実行
codexManusWorkflow().catch(console.error);
```

## 🔐 2段階認証・ユーザー承認が必要な場合

### Manusから承認要求を受信

```javascript
// Webhook経由でProgressEventを受信
app.post('/webhook/manus-progress', async (req, res) => {
  const event = req.body;
  
  if (event.status === 'ask') {
    console.log('🔐 Codex: ユーザー承認が必要です');
    console.log(`📋 Reason: ${event.ask.reason}`);
    console.log(`👀 Preview: ${event.ask.preview}`);
    
    // Userに承認を依頼
    const userApproval = await requestUserApproval({
      reason: event.ask.reason,
      preview: event.ask.preview,
      approvalToken: event.ask.approval_token
    });
    
    // Userの承認/拒否をManusに伝達
    if (userApproval === 'approved') {
      await approveManusTask(event.task_id, event.ask.approval_token);
    } else {
      await cancelManusTask(event.task_id);
    }
  }
  
  res.status(200).send('OK');
});
```

### User承認の実装例

```javascript
async function requestUserApproval({ reason, preview, approvalToken }) {
  // GitHub Issueにコメント
  await gh.issues.createComment({
    owner: 'mo666-med',
    repo: 'cursorvers_line_free_dev',
    issue_number: currentIssueNumber,
    body: `🔐 **承認が必要です**\n\n**理由**: ${reason}\n\n**プレビュー**:\n\`\`\`\n${preview}\n\`\`\`\n\n**承認**: /approve ${approvalToken}\n**拒否**: /reject ${approvalToken}`
  });
  
  // ユーザーの応答を待つ（ポーリングまたはWebhook）
  return await waitForUserResponse(approvalToken);
}
```

## 📋 重要な注意事項

### 1. 必ず結果報告を行う

Manusは実行完了後、**必ずCodexへ結果を報告**します：

- ✅ Webhook経由でProgressEventを送信
- ✅ Codexが`getManusTask(taskId)`で結果を取得
- ✅ エラー時も必ず報告

### 2. エラーハンドリング

```javascript
try {
  const result = await createManusTask({ brief, plan, webhookUrl });
  // 成功処理
} catch (error) {
  console.error('❌ Codex: Manus API呼び出しエラー');
  console.error(`   Error: ${error.message}`);
  
  // エラーをUserに報告
  await reportErrorToUser(error);
  
  // 必要に応じてリトライ
  if (shouldRetry(error)) {
    await retryManusTask({ brief, plan, webhookUrl });
  }
}
```

### 3. ロールバック処理

Manusが失敗した場合、CodexはPlan JSONの`rollback`に従ってロールバックを実行します：

```javascript
if (finalResult.status === 'failed') {
  console.log('🔄 Codex: ロールバックを実行中...');
  
  for (const rollbackStep of plan.rollback) {
    await executeRollbackStep(rollbackStep);
  }
}
```

### 4. コスト管理

```javascript
// 実行前にコスト見積もり
const estimatedCost = await estimateCost(plan);
if (estimatedCost > BUDGET_LIMIT) {
  console.log('⚠️ Codex: コスト超過の可能性');
  // Userに承認を依頼
  await requestUserApproval({
    reason: `コスト見積もり: ${estimatedCost} (予算: ${BUDGET_LIMIT})`,
    preview: `実行すると予算を超過する可能性があります。続行しますか？`
  });
}
```

## 📋 チェックリスト

CodexがManusを操作する際のチェックリスト：

- [ ] Plan JSONが正しい形式で作成されている
- [ ] `brief`と`plan`が準備されている
- [ ] `PROGRESS_WEBHOOK_URL`が設定されている
- [ ] タスクIDを記録している
- [ ] Webhook経由またはポーリングで結果を監視している
- [ ] ユーザー承認が必要な場合は適切に処理している
- [ ] 実行完了後、必ず結果を取得・報告している
- [ ] エラー時はロールバックを実行している
- [ ] コストが予算内であることを確認している

## 📚 参考資料

- `docs/MANUS_API_JSON_FORMAT.md`: Manus APIのJSON形式
- `scripts/lib/manus-api.js`: Manus API呼び出し実装
- `orchestration/MANUS_EXECUTION_BRIEF_costaware.txt`: Manus実行指示書
- `docs/GPT5_MANUS_WORKFLOW.md`: GPT-5とManusの連携ワークフロー

## 🔗 関連ファイル

- `scripts/codex-agent.js`: Codexエージェントの実装
- `scripts/natural-language-agent.js`: 自然言語エージェントの実装
- `functions/relay/index.ts`: Progress Webhookのリレー関数

