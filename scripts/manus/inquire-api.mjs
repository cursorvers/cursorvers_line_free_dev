#!/usr/bin/env node
/**
 * Manus API問い合わせスクリプト
 * GitHub Actionsから実行して、Manus APIの接続情報を確認します
 */

import { resolveConfig } from '../lib/manus-api.js';

const TEST_ENDPOINTS = [
  'https://api.manus.ai',
  'https://api.manus.im',
];

async function testEndpoint(baseUrl, apiKey) {
  const results = {
    baseUrl,
    tests: [],
    summary: {},
  };

  // Test 1: Health check or root endpoint
  try {
    const healthUrl = `${baseUrl}/health`;
    const healthResponse = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'cursorvers-line-discord/1.0.0',
      },
    });
    results.tests.push({
      name: 'Health Check',
      endpoint: '/health',
      status: healthResponse.status,
      ok: healthResponse.ok,
      response: await healthResponse.text().catch(() => null),
    });
  } catch (error) {
    results.tests.push({
      name: 'Health Check',
      endpoint: '/health',
      error: error.message,
    });
  }

  // Test 2: API version endpoint
  try {
    const versionUrl = `${baseUrl}/v1`;
    const versionResponse = await fetch(versionUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'cursorvers-line-discord/1.0.0',
      },
    });
    results.tests.push({
      name: 'Version Endpoint',
      endpoint: '/v1',
      status: versionResponse.status,
      ok: versionResponse.ok,
      response: await versionResponse.text().catch(() => null),
    });
  } catch (error) {
    results.tests.push({
      name: 'Version Endpoint',
      endpoint: '/v1',
      error: error.message,
    });
  }

  // Test 3: Authentication test (if API key provided)
  if (apiKey) {
    try {
      const authUrl = `${baseUrl}/v1/tasks`;
      const authResponse = await fetch(authUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'API_KEY': apiKey,
          'User-Agent': 'cursorvers-line-discord/1.0.0',
        },
      });
      let authData;
      try {
        authData = await authResponse.json();
      } catch {
        const text = await authResponse.text();
        authData = { text };
      }
      results.tests.push({
        name: 'Authentication Test',
        endpoint: '/v1/tasks',
        status: authResponse.status,
        ok: authResponse.ok,
        response: authData,
        headers: {
          'API_KEY': '***',
        },
      });
    } catch (error) {
      results.tests.push({
        name: 'Authentication Test',
        endpoint: '/v1/tasks',
        error: error.message,
      });
    }
  }

  // Summary
  results.summary = {
    totalTests: results.tests.length,
    successfulTests: results.tests.filter(t => t.ok === true).length,
    failedTests: results.tests.filter(t => t.ok === false).length,
    errorTests: results.tests.filter(t => t.error).length,
  };

  return results;
}

async function main() {
  const apiKey = process.env.MANUS_API_KEY || null;
  const results = {
    timestamp: new Date().toISOString(),
    apiKeyProvided: !!apiKey,
    endpoints: [],
  };

  console.log('🔍 Manus API問い合わせ開始');
  console.log(`API Key提供: ${apiKey ? 'あり' : 'なし'}`);
  console.log('');

  for (const endpoint of TEST_ENDPOINTS) {
    console.log(`📡 Testing endpoint: ${endpoint}`);
    const endpointResults = await testEndpoint(endpoint, apiKey);
    results.endpoints.push(endpointResults);
    console.log(`  ✅ Successful: ${endpointResults.summary.successfulTests}`);
    console.log(`  ❌ Failed: ${endpointResults.summary.failedTests}`);
    console.log(`  ⚠️  Errors: ${endpointResults.summary.errorTests}`);
    console.log('');
  }

  // Output JSON
  const { promises: fs } = await import('node:fs');
  
  const outputPath = 'tmp/manus-inquiry-results.json';
  await fs.mkdir('tmp', { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

  // Generate markdown summary
  let markdown = '# Manus API問い合わせ結果\n\n';
  markdown += `**実行日時**: ${results.timestamp}\n`;
  markdown += `**API Key提供**: ${results.apiKeyProvided ? 'あり' : 'なし'}\n\n`;

  for (const endpoint of results.endpoints) {
    markdown += `## ${endpoint.baseUrl}\n\n`;
    markdown += `- 成功: ${endpoint.summary.successfulTests}\n`;
    markdown += `- 失敗: ${endpoint.summary.failedTests}\n`;
    markdown += `- エラー: ${endpoint.summary.errorTests}\n\n`;

    for (const test of endpoint.tests) {
      markdown += `### ${test.name}\n\n`;
      markdown += `- **エンドポイント**: \`${test.endpoint}\`\n`;
      if (test.status) {
        markdown += `- **ステータス**: ${test.status}\n`;
        markdown += `- **成功**: ${test.ok ? '✅' : '❌'}\n`;
      }
      if (test.error) {
        markdown += `- **エラー**: \`${test.error}\`\n`;
      }
      if (test.response) {
        const responseStr = typeof test.response === 'string' 
          ? test.response 
          : JSON.stringify(test.response, null, 2);
        markdown += `- **レスポンス**:\n\`\`\`json\n${responseStr.substring(0, 500)}\n\`\`\`\n`;
      }
      markdown += '\n';
    }
  }

  // Write markdown summary
  const summaryPath = 'tmp/manus-inquiry-summary.md';
  await fs.writeFile(summaryPath, markdown);

  console.log('✅ 問い合わせ完了');
  console.log(`結果: ${outputPath}`);
  console.log(`サマリー: ${summaryPath}`);

  // Output to GitHub Actions step summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  }

  // Exit with error if all tests failed
  const allFailed = results.endpoints.every(e => e.summary.successfulTests === 0);
  if (allFailed && results.apiKeyProvided) {
    console.error('❌ すべてのテストが失敗しました');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ エラー:', error);
  process.exit(1);
});

