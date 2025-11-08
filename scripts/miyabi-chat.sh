#!/bin/bash
# Miyabi CLI Chat Mode
# VSCodeターミナルで実行可能なチャットインターフェース

# スクリプトのディレクトリに移動（VSCodeターミナルで実行する場合に備えて）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

# .envファイルから環境変数を読み込む（存在する場合）
if [ -f ".env" ]; then
  echo "📋 Loading environment variables from .env file..."
  # .envファイルから環境変数を安全に読み込む
  set -a
  source .env
  set +a
  echo "✅ Environment variables loaded"
fi

# シンプルでクリーンなUI
echo ""
echo "🤖 Miyabi - Natural Language Agent"
echo ""
if [ -n "$OPENAI_API_KEY" ]; then
  echo "✅ Ready"
else
  echo "⚠️  OPENAI_API_KEYが必要です"
fi
echo ""

while true; do
  # プロンプトを表示して入力を待つ（シンプルでクリーンなUI）
  echo -n "Miyabi > "
  read -r command
  
  # 空の入力の場合は再入力
  if [ -z "$command" ]; then
    continue
  fi
  
  if [ "$command" == "exit" ] || [ "$command" == "quit" ]; then
    echo "Goodbye!"
    break
  fi
  
  if [ "$command" == "help" ]; then
    echo ""
    echo "Commands:"
    echo "  issue <number>    - Process issue"
    echo "  status            - Show status"
    echo "  issues            - List issues"
    echo "  graph             - Show git commit graph"
    echo "  model <name>      - Switch OpenAI model (e.g., 'model gpt-4o')"
    echo "  model status      - Show current model"
    echo "  help              - Show help"
    echo "  exit/quit         - Exit"
    echo ""
    echo "💡 Natural Language Mode (Default)"
    echo "  例: 'Issue #3を処理して'"
    echo ""
    continue
  fi
  
  if [ "$command" == "status" ]; then
    npx miyabi status 2>&1 || echo "Status unavailable"
    continue
  fi
  
  if [ "$command" == "issues" ]; then
    gh issue list --limit 10 --json number,title,labels --jq '.[] | "#\(.number): \(.title) [\(.labels | map(.name) | join(", "))]"'
    continue
  fi
  
  if [[ "$command" =~ ^model\ +(.*)$ ]]; then
    MODEL_NAME=${BASH_REMATCH[1]}
    if [ "$MODEL_NAME" == "status" ]; then
      echo ""
      echo "📊 Current Model Settings:"
      echo "──────────────────────────────────────────────────"
      GITHUB_MODEL=$(gh variable get OPENAI_MODEL --json value -q .value 2>/dev/null || echo "not set")
      LOCAL_MODEL=$(grep "^OPENAI_MODEL=" .env 2>/dev/null | cut -d'=' -f2 || echo "not set")
      ENV_MODEL=${OPENAI_MODEL:-"not set"}
      
      echo "GitHub Variables: $GITHUB_MODEL"
      echo "Local .env file:  $LOCAL_MODEL"
      echo "Environment var:  $ENV_MODEL"
      echo ""
      echo "💡 Usage:"
      echo "  model gpt-4o        - Switch to GPT-4o (high quality)"
      echo "  model gpt-3.5-turbo - Switch to GPT-3.5-turbo (cost-effective)"
      echo "  model status        - Show current model settings"
      echo "──────────────────────────────────────────────────"
      echo ""
    else
      echo ""
      echo "🔄 Switching model to: $MODEL_NAME"
      echo "──────────────────────────────────────────────────"
      
      # GitHub Variablesを更新
      if gh variable set OPENAI_MODEL --body "$MODEL_NAME" 2>/dev/null; then
        echo "✅ GitHub Variables updated: OPENAI_MODEL=$MODEL_NAME"
      else
        echo "⚠️  Failed to update GitHub Variables (may require authentication)"
      fi
      
      # ローカル.envファイルを更新
      if [ -f ".env" ]; then
        if grep -q "^OPENAI_MODEL=" .env 2>/dev/null; then
          sed -i.bak "s/^OPENAI_MODEL=.*/OPENAI_MODEL=$MODEL_NAME/" .env
          echo "✅ Local .env file updated: OPENAI_MODEL=$MODEL_NAME"
        else
          echo "OPENAI_MODEL=$MODEL_NAME" >> .env
          echo "✅ Local .env file created: OPENAI_MODEL=$MODEL_NAME"
        fi
      else
        echo "OPENAI_MODEL=$MODEL_NAME" > .env
        echo "✅ Local .env file created: OPENAI_MODEL=$MODEL_NAME"
      fi
      
      # 現在のシェルセッションの環境変数を更新
      export OPENAI_MODEL=$MODEL_NAME
      echo "✅ Environment variable updated: OPENAI_MODEL=$MODEL_NAME"
      echo ""
      echo "💡 Note: Changes will take effect in new sessions."
      echo "   Restart Miyabi chat or run: export OPENAI_MODEL=$MODEL_NAME"
      echo "──────────────────────────────────────────────────"
      echo ""
    fi
    continue
  fi
  
  if [ "$command" == "graph" ]; then
    echo ""
    echo "📊 Opening Git Graph extension..."
    # VS Codeのコマンドパレットを開いてGit Graphを実行
    # Git Graph拡張機能のコマンドID: gitGraph.viewGitGraph
    if command -v code >/dev/null 2>&1; then
      # VS Codeのコマンドパレットを開く（Cmd+Shift+P / Ctrl+Shift+P）
      # ユーザーが"Git Graph"と入力してEnterを押す必要があります
      echo "📊 VS Codeのコマンドパレットを開きます..."
      echo "   'Git Graph'と入力してEnterを押してください"
      # コマンドパレットを開くキーバインドをシミュレート
      # macOSの場合: osascriptを使ってコマンドパレットを開く
      if [[ "$OSTYPE" == "darwin"* ]]; then
        osascript -e 'tell application "System Events" to keystroke "p" using {command down, shift down}' 2>/dev/null || {
          echo "   (または、VS Codeで Cmd+Shift+P を押して 'Git Graph' と入力してください)"
        }
      else
        echo "   (または、VS Codeで Ctrl+Shift+P を押して 'Git Graph' と入力してください)"
      fi
      # フォールバック: ターミナルでgit logを表示
      echo ""
      echo "──────────────────────────────────────────────────"
      echo "📊 Git Commit Graph (Terminal - Fallback):"
      echo "──────────────────────────────────────────────────"
      git log --graph --oneline --all --decorate --abbrev-commit -20 2>/dev/null || echo "❌ Git repository not found or no commits"
      echo ""
    else
      # VS Codeが見つからない場合は、ターミナルでgit logを表示
      echo "──────────────────────────────────────────────────"
      echo "📊 Git Commit Graph (Terminal):"
      echo "──────────────────────────────────────────────────"
      git log --graph --oneline --all --decorate --abbrev-commit -20 2>/dev/null || echo "❌ Git repository not found or no commits"
      echo ""
    fi
    echo ""
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
    
    # OPENAI_API_KEYを取得
    if [ -z "$OPENAI_API_KEY" ]; then
      echo "⚠️  OPENAI_API_KEYが設定されていません"
      echo ""
      continue
    fi
    
    export OPENAI_MODEL=$(gh variable get OPENAI_MODEL --json value -q .value 2>/dev/null || echo "gpt-5")
    
    # Codex Agentを実行
    if [ -f "scripts/codex-agent.js" ]; then
      node scripts/codex-agent.js 2>&1 || echo "Failed to process issue"
    else
      echo "❌ scripts/codex-agent.js not found"
    fi
    echo ""
  else
    # デフォルト: 自然言語モード
    if [ -n "$OPENAI_API_KEY" ] && [ -f "scripts/natural-language-agent.js" ]; then
      # 環境変数を設定（.envファイルから再読み込み）
      if [ -f ".env" ]; then
        set -a
        source .env
        set +a
        if [ -n "$OPENAI_API_KEY" ]; then
          export OPENAI_API_KEY
        fi
      fi
      
      export REPOSITORY=mo666-med/cursorvers_line_free_dev
      export GITHUB_TOKEN=$(gh auth token 2>/dev/null || echo "")
      export OPENAI_MODEL=$(gh variable get OPENAI_MODEL --json value -q .value 2>/dev/null || echo "gpt-5")
      
      # OPENAI_API_KEYがまだ設定されていない場合、LLM_API_KEYから取得を試みる
      if [ -z "$OPENAI_API_KEY" ] && [ -n "$LLM_API_KEY" ]; then
        OPENAI_API_KEY="$LLM_API_KEY"
        export OPENAI_API_KEY
      fi
      
      # 自然言語エージェントを実行
      node scripts/natural-language-agent.js "$command" 2>&1
      EXIT_CODE=$?
      if [ $EXIT_CODE -ne 0 ]; then
        echo ""
        echo "⚠️  Error (exit code: $EXIT_CODE)"
      fi
      echo ""
    else
      if [ -n "$command" ]; then
        if [ -z "$OPENAI_API_KEY" ]; then
          echo "⚠️  OPENAI_API_KEYが必要です"
        fi
        if [ ! -f "scripts/natural-language-agent.js" ]; then
          echo "⚠️  scripts/natural-language-agent.js not found"
        fi
        echo "Unknown command: $command"
        echo "Type 'help' for help"
      fi
    fi
  fi
done
