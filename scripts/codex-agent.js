#!/usr/bin/env node
/**
 * Codex-powered Agent Executor
 * OpenAI APIを使用してMiyabiエージェントの代わりにIssueを処理
 */

import https from 'https';
import { readFileSync } from 'fs';

// UTF-8エンコーディングを明示的に設定
process.stdout.setDefaultEncoding('utf8');
process.stdin.setDefaultEncoding('utf8');
process.stderr.setDefaultEncoding('utf8');

// 環境変数でUTF-8を明示的に設定
if (!process.env.LANG) {
  process.env.LANG = 'ja_JP.UTF-8';
}
if (!process.env.LC_ALL) {
  process.env.LC_ALL = 'ja_JP.UTF-8';
}

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const REPOSITORY = process.env.REPOSITORY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || process.env.LLM_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.1';

// チャットモデルのホワイトリスト
const CHAT_MODELS = [
  // GPT-5 世代（高精度〜コストバランス）
  'gpt-5.1',
  'gpt-5.1-mini',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-nano',
  // GPT-4.1 / 4o 世代
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini-2024-07-18',
  'gpt-4o',
  'gpt-4o-mini',
  // 最新oシリーズ
  'o3',
  'o3-mini',
];

// 非チャットモデル（v1/completionsエンドポイント用）
const NON_CHAT_MODELS = [
  'text-davinci-003',
  'text-davinci-002',
  'text-davinci-001',
  'text-curie-001',
  'text-babbage-001',
  'text-ada-001',
  'davinci',
  'curie',
  'babbage',
  'ada',
];

/**
 * モデルがチャットモデルかどうかを検証
 */
function validateChatModel(model) {
  if (!model) {
    return { valid: false, error: 'モデル名が指定されていません' };
  }

  // チャットモデルの場合
  if (CHAT_MODELS.includes(model)) {
    return { valid: true };
  }

  // 非チャットモデルの場合
  if (NON_CHAT_MODELS.includes(model)) {
    return {
      valid: false,
      error: `モデル "${model}" はチャットモデルではありません。v1/chat/completionsエンドポイントでは使用できません。\n` +
        `チャットモデルを使用してください: ${CHAT_MODELS.slice(0, 5).join(', ')}...`
    };
  }

  // 未知のモデルの場合（警告のみ、実行は許可）
  console.warn(`⚠️  警告: 未知のモデル "${model}" が指定されました。チャットモデルであることを確認してください。`);
  return { valid: true, warning: true };
}

async function fetchIssue(issueNumber) {
  const [owner, repo] = REPOSITORY.split('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json; charset=utf-8',
        'User-Agent': 'Codex-Agent'
      },
      timeout: 30000, // 30秒タイムアウト
      agent: false // 接続プールを無効化して確実に接続を試みる
    }, (res) => {
      // UTF-8エンコーディングを明示的に設定
      res.setEncoding('utf8');
      let data = '';
      res.on('data', chunk => {
        // BufferをUTF-8文字列に変換
        data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (parseError) {
            reject(new Error(`JSON parse error: ${parseError.message}\nData: ${data.substring(0, 200)}`));
          }
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data.substring(0, 500)}`));
        }
      });
    });
    
    req.on('error', (error) => {
      // ネットワークエラーの詳細を提供
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        reject(new Error(`GitHub API接続エラー: ${error.code} - ${error.message}\n` +
          `URL: ${url}\n` +
          `ネットワーク接続を確認してください。`));
      } else {
        reject(new Error(`GitHub API接続エラー: ${error.message}`));
      }
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`GitHub API接続タイムアウト: ${url}`));
    });
    
    req.setTimeout(30000);
  });
}

async function callOpenAI(messages) {
  // フォールバック込みのモデル候補（重複を除去）
  const candidates = [
    OPENAI_MODEL,
    'gpt-5.1-mini',
    'gpt-5.1',
    'gpt-5-mini',
    'gpt-4o-2024-08-06',
    'gpt-4o',
  ].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i);

  // メッセージ内の日本語文字列をUTF-8で正しくエンコード
  const encodedMessages = messages.map(msg => ({
    role: msg.role,
    content: typeof msg.content === 'string'
      ? Buffer.from(msg.content, 'utf8').toString('utf8')
      : msg.content
  }));

  const url = new URL(OPENAI_ENDPOINT);

  const requestModel = (model) => {
    const validation = validateChatModel(model);
    if (!validation.valid) {
      return Promise.reject(new Error(`モデル検証エラー: ${validation.error}`));
    }

    const postData = JSON.stringify({
      model,
      messages: encodedMessages,
      temperature: 0.7,
      max_tokens: 2000
    }, null, 0);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData, 'utf8')
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', chunk => {
          data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const result = JSON.parse(data);
              resolve(result.choices[0].message.content);
            } catch (parseError) {
              reject(new Error(`JSON parse error: ${parseError.message}\nData: ${data.substring(0, 200)}`));
            }
          } else {
            let errorMessage = `OpenAI API error: ${res.statusCode}`;
            try {
              const errorData = JSON.parse(data);
              if (errorData.error) {
                errorMessage = `OpenAI API error (${res.statusCode}): ${errorData.error.message || errorData.error.type || 'Unknown error'}`;
                if (res.statusCode === 404 ||
                  (errorData.error.message && errorData.error.message.includes('not a chat model'))) {
                  errorMessage += `\n\n💡 トラブルシューティング:\n`;
                  errorMessage += `   1. モデル名を確認してください: ${model}\n`;
                  errorMessage += `   2. チャットモデルを使用しているか確認してください: ${CHAT_MODELS.slice(0, 5).join(', ')}...\n`;
                  errorMessage += `   3. エンドポイントが正しいか確認してください: ${OPENAI_ENDPOINT}\n`;
                  errorMessage += `   4. 非チャットモデル（${NON_CHAT_MODELS.slice(0, 3).join(', ')}...）は v1/completions エンドポイントを使用してください\n`;
                }
                if (errorData.error.param) {
                  errorMessage += `\n   パラメータ: ${errorData.error.param}`;
                }
                if (errorData.error.code) {
                  errorMessage += `\n   エラーコード: ${errorData.error.code}`;
                }
              } else {
                errorMessage += `\nResponse: ${data.substring(0, 500)}`;
              }
            } catch (parseError) {
              errorMessage += `\nResponse (raw): ${data.substring(0, 500)}`;
            }
            reject(new Error(errorMessage));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`OpenAI API接続エラー: ${error.message}\nエンドポイント: ${OPENAI_ENDPOINT}\nネットワーク接続を確認してください。`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`OpenAI API接続タイムアウト: ${OPENAI_ENDPOINT}`));
      });

      req.setTimeout(60000);
      req.write(postData);
      req.end();
    });
  };

  // フォールバック順に試行
  let lastError;
  for (const model of candidates) {
    try {
      return await requestModel(model);
    } catch (err) {
      lastError = err;
      // モデル未対応や404の場合のみ次候補へ。その他は即座にエラーを返す。
      const msg = err?.message || '';
      if (msg.includes('not a chat model') || msg.includes('404') || msg.includes('Invalid or missing model')) {
        continue;
      }
      throw err;
    }
  }
  // すべて失敗した場合
  throw lastError || new Error('OpenAIモデル呼び出しに失敗しました');
}

async function analyzeIssue(issue) {
  const prompt = `あなたはコード生成エージェントです。以下のGitHub Issueを分析し、実装すべき内容を提案してください。

Issue #${issue.number}: ${issue.title}

${issue.body}

リポジトリ: ${REPOSITORY}

以下の形式で回答してください：
1. 問題の要約
2. 実装すべき機能
3. 変更が必要なファイル
4. 実装ステップ

JSON形式で回答してください。`;

  const response = await callOpenAI([
    { role: 'system', content: 'You are a helpful coding assistant that analyzes GitHub issues and proposes implementation plans.' },
    { role: 'user', content: prompt }
  ]);

  return response;
}

async function generateCode(analysis, issue) {
  const prompt = `以下の分析に基づいて、実装コードを生成してください。

分析結果:
${analysis}

Issue #${issue.number}: ${issue.title}

必要なファイルとコードを生成してください。`;

  const response = await callOpenAI([
    { role: 'system', content: 'You are a senior software engineer. Generate production-ready code based on the analysis.' },
    { role: 'user', content: prompt }
  ]);

  return response;
}

async function main() {
  try {
    console.log(`🚀 Starting Codex-powered agent for Issue #${ISSUE_NUMBER}`);
    console.log(`📋 Model: ${OPENAI_MODEL}`);
    console.log(`🔗 Endpoint: ${OPENAI_ENDPOINT}`);
    
    // 環境変数の確認
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY or LLM_API_KEY environment variable is required');
    }
    
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    
    if (!REPOSITORY) {
      throw new Error('REPOSITORY environment variable is required (format: owner/repo)');
    }
    
    if (!ISSUE_NUMBER) {
      throw new Error('ISSUE_NUMBER environment variable is required');
    }

    // モデル検証（事前チェック）
    const validation = validateChatModel(OPENAI_MODEL);
    if (!validation.valid) {
      throw new Error(`モデル検証エラー: ${validation.error}`);
    }
    if (validation.warning) {
      console.warn(`⚠️  ${validation.warning}`);
    }

    // Issueを取得
    console.log(`📋 Fetching Issue #${ISSUE_NUMBER} from ${REPOSITORY}...`);
    let issue;
    try {
      issue = await fetchIssue(ISSUE_NUMBER);
      console.log(`✅ Issue fetched: ${issue.title}`);
    } catch (fetchError) {
      console.error(`❌ Failed to fetch issue: ${fetchError.message}`);
      console.error(`\n💡 トラブルシューティング:`);
      console.error(`   1. ネットワーク接続を確認してください`);
      console.error(`   2. GITHUB_TOKENが正しく設定されているか確認してください`);
      console.error(`   3. REPOSITORY環境変数が正しい形式か確認してください (例: owner/repo)`);
      console.error(`   4. GitHub APIのステータスを確認: https://githubstatus.com`);
      throw fetchError;
    }

    // Issueを分析
    console.log('🔍 Analyzing issue...');
    const analysis = await analyzeIssue(issue);
    console.log('✅ Analysis complete');

    // コードを生成
    console.log('💻 Generating code...');
    const code = await generateCode(analysis, issue);
    console.log('✅ Code generation complete');

    // 結果を出力
    console.log('\n📊 Analysis Result:');
    console.log(analysis);
    console.log('\n💻 Generated Code:');
    console.log(code);

    // Issueにコメント
    const [owner, repo] = REPOSITORY.split('/');
    const commentUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${ISSUE_NUMBER}/comments`;
    // UTF-8エンコーディングを明示的に指定してJSONを文字列化
    const commentBody = JSON.stringify({
      body: `## 🤖 Codex Agent Execution Complete

**Analysis:**
\`\`\`
${analysis}
\`\`\`

**Generated Code:**
\`\`\`
${code}
\`\`\`

*This was generated by Codex-powered agent using OpenAI API.*`
    }, null, 0);

    await new Promise((resolve, reject) => {
      const url = new URL(commentUrl);
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json; charset=utf-8',
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(commentBody, 'utf8'),
          'User-Agent': 'Codex-Agent'
        },
        timeout: 30000,
        agent: false
      }, (res) => {
        // UTF-8エンコーディングを明示的に設定
        res.setEncoding('utf8');
        let data = '';
        res.on('data', chunk => {
          // BufferをUTF-8文字列に変換
          data += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`GitHub API error: ${res.statusCode} ${data.substring(0, 500)}`));
          }
        });
      });
      
      req.on('error', (error) => {
        // ネットワークエラーの詳細を提供
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          reject(new Error(`GitHub API接続エラー: ${error.code} - ${error.message}\n` +
            `URL: ${commentUrl}\n` +
            `ネットワーク接続を確認してください。`));
        } else {
          reject(new Error(`GitHub API接続エラー: ${error.message}`));
        }
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`GitHub API接続タイムアウト: ${commentUrl}`));
      });
      
      req.setTimeout(30000);
      req.write(commentBody);
      req.end();
    });

    console.log('✅ Comment added to issue');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 エラー詳細:');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();



