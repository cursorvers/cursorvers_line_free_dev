#!/usr/bin/env node
/**
 * Natural Language Agent - OpenAI APIを使用して自然言語で指示を処理
 */

import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPOSITORY = process.env.REPOSITORY || 'mo666-med/cursorvers_line_free_dev';

async function callOpenAI(messages) {
  return new Promise((resolve, reject) => {
    const url = new URL(OPENAI_ENDPOINT);
    const postData = JSON.stringify({
      model: OPENAI_MODEL,
      messages: messages,
      max_completion_tokens: 2000
    });

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            if (result.choices && result.choices[0] && result.choices[0].message) {
              const content = result.choices[0].message.content;
              if (!content || content.trim() === '') {
                console.error('⚠️  OpenAI API returned empty response');
                console.error(`   Response: ${JSON.stringify(result, null, 2)}`);
                reject(new Error('OpenAI API returned empty response'));
              } else {
                resolve(content);
              }
            } else {
              console.error('⚠️  Unexpected API response structure');
              console.error(`   Response: ${JSON.stringify(result, null, 2)}`);
              reject(new Error('OpenAI API returned unexpected response structure'));
            }
          } catch (parseError) {
            console.error('⚠️  Failed to parse API response');
            console.error(`   Response: ${data.substring(0, 500)}`);
            reject(new Error(`Failed to parse API response: ${parseError.message}`));
          }
        } else {
          console.error(`❌ OpenAI API error: ${res.statusCode}`);
          console.error(`   Response: ${data.substring(0, 500)}`);
          reject(new Error(`OpenAI API error: ${res.statusCode} ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Network error:', error.message);
      reject(error);
    });

    req.on('timeout', () => {
      console.error('❌ Request timeout');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.setTimeout(60000); // 60秒タイムアウト
    req.write(postData);
    req.end();
  });
}

async function listIssues() {
  return new Promise((resolve, reject) => {
    const [owner, repo] = REPOSITORY.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/issues`;
    
    https.get(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Miyabi-Agent'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchIssueDetails(issueNumber) {
  return new Promise((resolve, reject) => {
    const [owner, repo] = REPOSITORY.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
    
    https.get(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Miyabi-Agent'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function fetchIssueComments(issueNumber) {
  return new Promise((resolve, reject) => {
    const [owner, repo] = REPOSITORY.split('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    
    https.get(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Miyabi-Agent'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function readFileContent(filePath) {
  try {
    // 絶対パスまたは相対パスを処理
    let resolvedPath = filePath;
    if (!filePath.startsWith('/')) {
      // 相対パスの場合はプロジェクトルートから解決
      resolvedPath = join(process.cwd(), filePath);
    }
    const content = readFileSync(resolvedPath, 'utf-8');
    return content;
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }
}

async function processNaturalLanguage(input) {
  // ファイルパスを抽出（例: '/path/to/file.md'または'README.md'）
  const filePathMatch = input.match(/['"]?([^'"\s]+\.(md|json|js|ts|yml|yaml))['"]?/);
  let fileContent = '';
  let filePath = '';
  
  if (filePathMatch) {
    filePath = filePathMatch[1];
    try {
      fileContent = await readFileContent(filePath);
      console.log(`📄 File loaded: ${filePath} (${fileContent.length} chars)`);
    } catch (error) {
      console.error(`⚠️  Failed to read file: ${error.message}`);
    }
  }
  
  // 現在のIssue一覧を取得
  let issues = [];
  try {
    issues = await listIssues();
  } catch (error) {
    console.error('Failed to fetch issues:', error.message);
  }

  const issuesInfo = issues.slice(0, 10).map(issue => 
    `Issue #${issue.number}: ${issue.title}`
  ).join('\n');

  const systemPrompt = `あなたはMiyabiというGitHubリポジトリ管理エージェントです。
ユーザーの自然言語指示を理解し、適切なアクションを実行します。

利用可能なアクション:
1. Issue一覧の表示: "issues" または "issue一覧"
2. 特定Issueの処理: "issue 3を処理して" または "Issue #3を実行"
3. Issueの作成: "新しいIssueを作成" または "Issueを作成して"
4. Issueの更新: "Issue #3を更新" または "Issue #3にコメント追加"
5. Gitグラフの表示: "git graph" または "コミット履歴を見せて" または "git log"
6. Issueの実装結果確認: "Issueの実装結果" または "各Issueの状態" または "Issueの進捗" または "それぞれのissueの実装結果を教えて"
7. ファイルの実装計画作成: "README.mdの実装計画を立てて" または "ファイルの実装計画" または "${filePath ? filePath + 'の実装計画を立てて' : ''}"

${fileContent ? `\nユーザーが指定したファイルの内容:\nファイルパス: ${filePath}\n内容:\n${fileContent.substring(0, 5000)}\n` : ''}

現在のIssue一覧:
${issuesInfo || 'Issueはありません'}

リポジトリ: ${REPOSITORY}

ユーザーの指示を理解し、実行可能なアクションを提案してください。
実行する場合は、JSON形式で以下を返してください:
{
  "action": "issue_list" | "issue_process" | "issue_create" | "issue_update" | "issue_status" | "git_graph" | "file_plan" | "response",
  "issue_number": 数字（該当する場合）,
  "file_path": "${filePath || 'ファイルパス（該当する場合）'}",
  "message": "ユーザーへの応答メッセージ"
}

実行できない場合は、説明を含む応答を返してください。`;

  const response = await callOpenAI([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: input }
  ]);

  return response;
}

async function parseJSONResponse(response) {
  try {
    // JSON部分を抽出（```json...``` または {...} 形式）
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    }
    return JSON.parse(response);
  } catch (error) {
    // JSONとして解析できない場合は、responseとして返す
    return { action: 'response', message: response };
  }
}

async function executeAction(actionData) {
  const { action, issue_number, file_path, message } = actionData;

  console.log(`\n📋 アクション: ${action}`);
  if (issue_number) {
    console.log(`📌 Issue: #${issue_number}`);
  }
  if (file_path) {
    console.log(`📄 File: ${file_path}`);
  }
  if (message) {
    console.log(`💬 メッセージ: ${message}`);
  }
  console.log('─'.repeat(50));

  switch (action) {
    case 'issue_list':
      try {
        console.log('📋 Issue一覧を取得中...');
        const issues = await listIssues();
        console.log(`✅ ${issues.length}件のIssueが見つかりました\n`);
        
        console.log('📋 Open Issues:');
        console.log('─'.repeat(50));
        issues.slice(0, 10).forEach(issue => {
          const labels = issue.labels.map(l => l.name).join(', ');
          console.log(`#${issue.number}: ${issue.title}`);
          console.log(`   State: ${issue.state} | Labels: ${labels || 'none'}`);
          console.log(`   URL: ${issue.html_url}`);
          console.log('');
        });
        return true;
      } catch (error) {
        console.error('❌ Failed to list issues:', error.message);
        return false;
      }

    case 'issue_process':
      if (!issue_number) {
        console.error('❌ Issue number is required for issue_process action');
        return false;
      }
      console.log(`\n🚀 Issue #${issue_number}の処理を開始します...`);
      console.log('─'.repeat(50));
      console.log(`📝 計画: ${message || 'Issueを分析してコードを生成します'}`);
      console.log('');
      
      // codex-agent.jsを実行
      const { spawn } = await import('child_process');
      return new Promise((resolve) => {
        console.log('🔍 Issueを分析中...');
        const child = spawn('node', ['scripts/codex-agent.js'], {
          env: {
            ...process.env,
            ISSUE_NUMBER: issue_number.toString(),
            REPOSITORY: REPOSITORY
          },
          stdio: 'inherit'
        });

        child.on('close', (code) => {
          if (code === 0) {
            console.log('\n✅ Issue #' + issue_number + 'の処理が完了しました');
          } else {
            console.log('\n⚠️  Issue #' + issue_number + 'の処理でエラーが発生しました（終了コード: ' + code + '）');
          }
          resolve(code === 0);
        });

        child.on('error', (error) => {
          console.error('❌ Failed to execute codex-agent:', error.message);
          resolve(false);
        });
      });

    case 'issue_create':
      console.log(`\n📝 新しいIssueを作成します...`);
      console.log(`📝 内容: ${message || 'No message provided'}`);
      console.log('⚠️  Issue creation is not yet implemented');
      return false;

    case 'issue_update':
      if (!issue_number) {
        console.error('❌ Issue number is required for issue_update action');
        return false;
      }
      console.log(`\n📝 Issue #${issue_number}を更新します...`);
      console.log(`📝 内容: ${message || 'No message provided'}`);
      console.log('⚠️  Issue update is not yet implemented');
      return false;

    case 'git_graph':
      console.log(`\n📊 Git Commit Graphを表示します...`);
      console.log('─'.repeat(50));
      const { execSync } = await import('child_process');
      try {
        const graphOutput = execSync('git log --graph --oneline --all --decorate --abbrev-commit -20', {
          encoding: 'utf-8',
          cwd: process.cwd()
        });
        console.log(graphOutput);
        console.log('─'.repeat(50));
        return true;
      } catch (error) {
        console.error('❌ Failed to execute git log:', error.message);
        return false;
      }

    case 'issue_status':
      console.log(`\n📊 Issueの実装結果を確認中...`);
      console.log('─'.repeat(50));
      try {
        const issues = await listIssues();
        const openIssues = issues.filter(issue => issue.state === 'open').slice(0, 10);
        
        console.log(`📋 Open Issues: ${openIssues.length}件\n`);
        
        for (const issue of openIssues) {
          console.log(`─`.repeat(50));
          console.log(`#${issue.number}: ${issue.title}`);
          console.log(`   State: ${issue.state}`);
          console.log(`   Labels: ${issue.labels.map(l => l.name).join(', ') || 'none'}`);
          console.log(`   URL: ${issue.html_url}`);
          
          // コメントを取得
          try {
            const comments = await fetchIssueComments(issue.number);
            console.log(`   Comments: ${comments.length}件`);
            
            // Codex Agentのコメントを確認
            const codexComments = comments.filter(c => 
              c.body.includes('Codex Agent') || 
              c.body.includes('🤖') ||
              c.body.includes('Analysis') ||
              c.body.includes('Generated Code')
            );
            
            if (codexComments.length > 0) {
              console.log(`   🤖 Codex Agent実行: ${codexComments.length}回`);
              const latestComment = codexComments[codexComments.length - 1];
              const hasContent = latestComment.body.includes('Analysis') || 
                                latestComment.body.includes('Generated Code');
              if (hasContent) {
                const hasAnalysis = latestComment.body.match(/```[\s\S]*?Analysis[\s\S]*?```/);
                const hasCode = latestComment.body.match(/```[\s\S]*?Generated Code[\s\S]*?```/);
                if (hasAnalysis && hasAnalysis[0].length > 50) {
                  console.log(`   ✅ 分析結果あり`);
                } else {
                  console.log(`   ⚠️  分析結果が空または短い`);
                }
                if (hasCode && hasCode[0].length > 50) {
                  console.log(`   ✅ コード生成結果あり`);
                } else {
                  console.log(`   ⚠️  コード生成結果が空または短い`);
                }
              } else {
                console.log(`   ⚠️  実装結果が空の可能性`);
              }
            } else {
              console.log(`   📝 実装結果: 未実行またはコメントなし`);
            }
          } catch (error) {
            console.log(`   ⚠️  コメント取得エラー: ${error.message}`);
          }
          
          console.log('');
        }
        
        console.log('─'.repeat(50));
        return true;
      } catch (error) {
        console.error('❌ Failed to fetch issue status:', error.message);
        return false;
      }

    case 'file_plan':
      if (!file_path) {
        console.error('❌ File path is required for file_plan action');
        return false;
      }
      console.log(`\n📝 ${file_path}の実装計画を作成中...`);
      console.log('─'.repeat(50));
      try {
        const fileContent = await readFileContent(file_path);
        console.log(`📄 File loaded: ${file_path} (${fileContent.length} chars)`);
        console.log('');
        
        // GPT-5で実装計画を生成
        console.log('💭 実装計画を生成中...');
        const planPrompt = `以下のファイル内容を分析し、実装計画を立ててください。

ファイルパス: ${file_path}

ファイル内容:
${fileContent.substring(0, 8000)}

以下の形式で実装計画を提案してください：
1. 現状分析
2. 実装すべき機能
3. 変更が必要なファイル
4. 実装ステップ
5. 優先順位`;

        const planResponse = await callOpenAI([
          { role: 'system', content: 'You are a senior software engineer. Analyze files and create detailed implementation plans.' },
          { role: 'user', content: planPrompt }
        ]);

        console.log('─'.repeat(50));
        console.log('📊 実装計画:');
        console.log('─'.repeat(50));
        console.log(planResponse);
        console.log('─'.repeat(50));
        return true;
      } catch (error) {
        console.error('❌ Failed to create implementation plan:', error.message);
        return false;
      }

    case 'response':
    default:
      console.log(`\n💬 ${message || 'No message provided'}`);
      return true;
  }
}

async function main() {
  const input = process.argv[2];
  
  if (!input) {
    console.error('Usage: node scripts/natural-language-agent.js "自然言語の指示"');
    process.exit(1);
  }

  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  try {
    console.log(`💭 指示を解析中: "${input}"`);
    console.log('');
    
    const response = await processNaturalLanguage(input);
    const actionData = await parseJSONResponse(response);
    
    console.log('─'.repeat(50));
    console.log('📊 実行計画:');
    console.log(`   アクション: ${actionData.action}`);
    if (actionData.issue_number) {
      console.log(`   Issue: #${actionData.issue_number}`);
    }
    console.log('─'.repeat(50));
    console.log('');
    
    // アクションを実行
    const success = await executeAction(actionData);
    
    console.log('');
    console.log('─'.repeat(50));
    if (success) {
      console.log('✅ 処理が完了しました');
    } else {
      console.log(`❌ 処理が失敗しました（アクション: ${actionData.action}）`);
      if (actionData.action !== 'response') {
        process.exit(1);
      }
    }
    console.log('─'.repeat(50));
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

