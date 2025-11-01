# MiyabiとCodex（Cursor）の互換性

## 📋 結論

**Miyabiは主にClaude Code向けに設計されていますが、Codex（Cursor）でも動作するようにカスタマイズ可能です。**

## 🎯 Miyabiの設計思想

### 1. Claude Code統合が標準

Miyabiは以下のように**Claude Code**向けに設計されています：

- ✅ `.claude/`ディレクトリとMCPサーバー統合
- ✅ Claude Codeのカスタムコマンド（`/agent-run`, `/miyabi-agent`など）
- ✅ MCPサーバーでMiyabi CLIを呼び出し
- ✅ CodeGenAgentは**Claude Sonnet 4**を使用（Anthropic API）

### 2. 標準的な実装

```typescript
// CodeGenAgentの標準実装
const apiKey = process.env.ANTHROPIC_API_KEY; // Claude API
const model = 'claude-sonnet-4-20250514';
```

## 🔄 Codex（Cursor）での使用

### 現在の実装

このプロジェクトでは、Codex（Cursor）で動作するようにカスタマイズしました：

1. **OpenAI APIを使用するCodexエージェント**を作成
   - `scripts/codex-agent.js`: OpenAI APIを使用
   - `LLM_API_KEY`環境変数で設定可能

2. **ワークフローを修正**
   - `ANTHROPIC_API_KEY`の代わりに`LLM_API_KEY`を使用
   - OpenAI APIエンドポイントに対応

### 動作方法

```yaml
# .github/workflows/autonomous-agent.yml
env:
  LLM_API_KEY: ${{ secrets.LLM_API_KEY }}  # OpenAI APIキー
  LLM_ENDPOINT: ${{ secrets.LLM_ENDPOINT }} # OpenAI APIエンドポイント
```

## 📊 比較表

| 項目 | Claude Code（標準） | Codex（Cursor）カスタム |
|------|-------------------|----------------------|
| **LLM API** | Anthropic API（Claude） | OpenAI API |
| **環境変数** | `ANTHROPIC_API_KEY` | `LLM_API_KEY` |
| **MCP統合** | ✅ 標準サポート | ⚠️ 部分的サポート |
| **カスタムコマンド** | ✅ 完全サポート | ⚠️ 一部サポート |
| **エージェント実行** | ✅ `npx miyabi agent run` | ✅ `node scripts/codex-agent.js` |

## 🛠️ 実装の違い

### Claude Code標準（Miyabi）

```javascript
// CodeGenAgent
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  messages: [...]
});
```

### Codex（Cursor）カスタム実装

```javascript
// scripts/codex-agent.js
const OPENAI_API_KEY = process.env.LLM_API_KEY;
const response = await fetch(OPENAI_ENDPOINT, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
  body: JSON.stringify({ model: 'gpt-4o', messages: [...] })
});
```

## ✅ Codexで動作させる方法

### 方法1: OpenAI APIを使用（現在の実装）

```bash
# GitHub Secretsを設定
gh secret set LLM_API_KEY --body "sk-..."
gh secret set LLM_ENDPOINT --body "https://api.openai.com/v1/chat/completions"

# GitHub Variablesを設定
gh variable set OPENAI_MODEL --body "gpt-4o"
```

### 方法2: CursorのAPIを使用（将来的）

CursorがAPIを提供している場合：

```bash
# Cursor APIキーを設定（将来の実装）
gh secret set CURSOR_API_KEY --body "..."
gh secret set CURSOR_ENDPOINT --body "https://api.cursor.com/v1/..."
```

## 🎯 結論

### Miyabiの設計

- ✅ **Claude Code向けに最適化**されている
- ✅ **Anthropic API（Claude）が標準**
- ✅ **MCP統合**でClaude Codeと深く統合

### Codex（Cursor）での使用

- ✅ **カスタマイズ可能**（OpenAI APIを使用）
- ⚠️ **標準機能の一部が制限**される可能性
- ✅ **基本的なエージェント機能は動作**する

## 📝 推奨事項

### Claude Codeを使用する場合（推奨）

```bash
# Anthropic APIキーを設定
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."

# 標準のMiyabiエージェントを使用
npx miyabi agent run --issue 1
```

### Codex（Cursor）を使用する場合

```bash
# OpenAI APIキーを設定
gh secret set LLM_API_KEY --body "sk-..."

# カスタムCodexエージェントを使用
# （ワークフローが自動的に実行）
```

## 🔗 参考資料

- `CLAUDE.md`: Claude Code統合の詳細
- `.claude/README.md`: Claude Code設定
- `docs/CODEX_AGENT_SETUP.md`: Codexエージェント設定
- `scripts/codex-agent.js`: Codexエージェント実装

