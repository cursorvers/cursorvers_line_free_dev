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
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

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
            reject(new Error(`JSON解析エラー: ${parseError.message}\nデータ: ${data.substring(0, 200)}`));
          }
        } else {
          reject(new Error(`GitHub APIエラー: ${res.statusCode} ${data.substring(0, 500)}`));
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
  return new Promise((resolve, reject) => {
    const url = new URL(OPENAI_ENDPOINT);
    
    // メッセージ内の日本語文字列をUTF-8で正しくエンコード
    const encodedMessages = messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' 
        ? Buffer.from(msg.content, 'utf8').toString('utf8')
        : msg.content
    }));
    
    // UTF-8エンコーディングを明示的に指定してJSONを文字列化
    const postData = JSON.stringify({
      model: OPENAI_MODEL,
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

    const req = https.request(options, (res) => {
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
            const result = JSON.parse(data);
            resolve(result.choices[0].message.content);
          } catch (parseError) {
            reject(new Error(`JSON解析エラー: ${parseError.message}\nデータ: ${data.substring(0, 200)}`));
          }
        } else {
          reject(new Error(`OpenAI APIエラー: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function analyzeIssue(issue) {
  const prompt = `あなたはコード生成を支援するAIアシスタントです。以下のGitHub Issueを分析し、実装すべき内容を提案してください。

Issue #${issue.number}: ${issue.title}

${issue.body}

リポジトリ: ${REPOSITORY}

以下の形式で回答してください：
1. 問題の要約
2. 実装すべき機能
3. 変更が必要なファイル
4. 実装ステップ

回答はJSON形式でお願いします。`;

  const response = await callOpenAI([
    { role: 'system', content: 'あなたはGitHub Issueを分析し、実装計画を提案するコーディングアシスタントです。すべての回答は日本語で行ってください。' },
    { role: 'user', content: prompt }
  ]);

  return response;
}

async function generateCode(analysis, issue) {
  const prompt = `以下の分析結果に基づいて、実装コードを生成してください。

分析結果:
${analysis}

Issue #${issue.number}: ${issue.title}

必要なファイルとコードを生成してください。`;

  const response = await callOpenAI([
    { role: 'system', content: 'あなたは上級ソフトウェアエンジニアです。分析結果に基づいて本番環境で使用可能なコードを生成してください。すべての回答は日本語で行ってください。' },
    { role: 'user', content: prompt }
  ]);

  return response;
}

async function main() {
  try {
    console.log(`🚀 Codex-powered agentを開始します (Issue #${ISSUE_NUMBER})`);
    
    // 環境変数の確認
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEYまたはLLM_API_KEY環境変数が必要です');
    }
    
    if (!GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN環境変数が必要です');
    }
    
    if (!REPOSITORY) {
      throw new Error('REPOSITORY環境変数が必要です (形式: owner/repo)');
    }
    
    if (!ISSUE_NUMBER) {
      throw new Error('ISSUE_NUMBER環境変数が必要です');
    }

    // Issueを取得
    console.log(`📋 Issue #${ISSUE_NUMBER} を ${REPOSITORY} から取得中...`);
    let issue;
    try {
      issue = await fetchIssue(ISSUE_NUMBER);
      console.log(`✅ Issueを取得しました: ${issue.title}`);
    } catch (fetchError) {
      console.error(`❌ Issueの取得に失敗しました: ${fetchError.message}`);
      console.error(`\n💡 トラブルシューティング:`);
      console.error(`   1. ネットワーク接続を確認してください`);
      console.error(`   2. GITHUB_TOKENが正しく設定されているか確認してください`);
      console.error(`   3. REPOSITORY環境変数が正しい形式か確認してください (例: owner/repo)`);
      console.error(`   4. GitHub APIのステータスを確認: https://githubstatus.com`);
      throw fetchError;
    }

    // Issueを分析
    console.log('🔍 Issueを分析中...');
    const analysis = await analyzeIssue(issue);
    console.log('✅ 分析が完了しました');

    // コードを生成
    console.log('💻 コードを生成中...');
    const code = await generateCode(analysis, issue);
    console.log('✅ コード生成が完了しました');

    // 結果を出力
    console.log('\n📊 分析結果:');
    console.log(analysis);
    console.log('\n💻 生成されたコード:');
    console.log(code);

    // Issueにコメント
    const [owner, repo] = REPOSITORY.split('/');
    const commentUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${ISSUE_NUMBER}/comments`;
    // UTF-8エンコーディングを明示的に指定してJSONを文字列化
    const commentBody = JSON.stringify({
      body: `## 🤖 Codex Agent 実行完了

**分析結果:**
\`\`\`
${analysis}
\`\`\`

**生成されたコード:**
\`\`\`
${code}
\`\`\`

*このコメントは、OpenAI APIを使用したCodex-powered agentによって生成されました。*`
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
            reject(new Error(`GitHub APIエラー: ${res.statusCode} ${data.substring(0, 500)}`));
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

    console.log('✅ Issueにコメントを追加しました');
    process.exit(0);
  } catch (error) {
    console.error('❌ エラー:', error.message);
    process.exit(1);
  }
}

main();


