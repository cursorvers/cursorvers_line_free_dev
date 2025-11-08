#!/bin/bash
# Miyabi CLI Interactive Chat Mode

# 色付きプロンプト
PROMPT="🤖 Miyabi > "

echo "🤖 Miyabi CLI Chat Mode"
echo "======================="
echo ""
echo "Type 'help' for available commands"
echo "Type 'exit' or 'quit' to exit"
echo ""
echo "Note: This uses Codex Agent (OpenAI-powered) to process issues."
echo ""
echo "⚠️  OPENAI_API_KEY環境変数が必要です"
echo "   設定: export OPENAI_API_KEY=\"sk-...\""
echo ""

while true; do
  read -p "$PROMPT" command
  
  if [ "$command" == "exit" ] || [ "$command" == "quit" ]; then
    echo "Goodbye!"
    break
  fi
  
  if [ "$command" == "help" ]; then
    echo ""
    echo "Available commands:"
    echo "  issue <number>    - Process issue (e.g., 'issue 3')"
    echo "  status            - Show Miyabi status"
    echo "  issues            - List open issues"
    echo "  help              - Show this help"
    echo "  exit/quit         - Exit chat"
    echo ""
    continue
  fi
  
  if [ "$command" == "status" ]; then
    echo "Fetching Miyabi status..."
    npx miyabi status 2>&1 || echo "Status unavailable"
    continue
  fi
  
  if [ "$command" == "issues" ]; then
    echo "Fetching open issues..."
    gh issue list --limit 10 --json number,title,labels --jq '.[] | "#\(.number): \(.title) [\(.labels | map(.name) | join(", "))]"'
    continue
  fi
  
  if [[ "$command" =~ ^issue\ +([0-9]+)$ ]]; then
    ISSUE_NUM=${BASH_REMATCH[1]}
    echo "Processing Issue #$ISSUE_NUM..."
    echo ""
    
    # 環境変数を設定
    export ISSUE_NUMBER=$ISSUE_NUM
    export REPOSITORY=mo666-med/cursorvers_line_free_dev
    export GITHUB_TOKEN=$(gh auth token 2>/dev/null || echo "")
    
    # OPENAI_API_KEYを取得（GitHub Secretsからは直接取得できないため、環境変数から取得）
    if [ -z "$OPENAI_API_KEY" ]; then
      echo "⚠️  OPENAI_API_KEYが設定されていません。"
      echo "環境変数を設定してください: export OPENAI_API_KEY=\"sk-...\""
      echo ""
      continue
    fi
    
    export OPENAI_MODEL=$(gh variable get OPENAI_MODEL --json value -q .value 2>/dev/null || echo "gpt-5")
    
    # Codex Agentを実行
    if [ -f "scripts/codex-agent.js" ]; then
      node scripts/codex-agent.js 2>&1 || echo "Failed to process issue"
    else
      echo "❌ scripts/codex-agent.js not found"
      echo "Available: Run 'npx miyabi agent run <agent-name> --issue $ISSUE_NUM' manually"
    fi
    echo ""
  else
    if [ -n "$command" ]; then
      echo "Unknown command: $command"
      echo "Type 'help' for available commands"
    fi
  fi
done
