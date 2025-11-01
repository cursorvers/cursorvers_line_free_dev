#!/usr/bin/env node
/**
 * Manus API Client
 * Manus APIを呼び出すためのヘルパー関数
 */

import https from 'https';

const MANUS_API_KEY = process.env.MANUS_API_KEY;
const MANUS_BASE_URL = process.env.MANUS_BASE_URL || 'https://api.manus.ai';
const PROGRESS_WEBHOOK_URL = process.env.PROGRESS_WEBHOOK_URL;

/**
 * Manus APIにタスクを作成
 * @param {Object} params - タスク作成パラメータ
 * @param {string} params.brief - Manus実行指示書
 * @param {Object} params.plan - Plan JSON
 * @param {string} params.webhookUrl - Progress Webhook URL
 * @param {Object} [params.metadata] - 追加メタデータ（idempotency_keyなど）
 * @param {boolean} [params.dryRun] - trueの場合HTTPリクエストを送らずpayloadのみ返す
 * @returns {Promise<Object>} 作成されたタスク情報
 */
export async function createManusTask({ brief, plan, webhookUrl, metadata, dryRun }) {
  const effectiveDryRun = dryRun ?? (process.env.MANUS_DRY_RUN === 'true');
  const apiKey = process.env.MANUS_API_KEY || MANUS_API_KEY;
  if (!apiKey && !effectiveDryRun) {
    throw new Error('MANUS_API_KEY environment variable is required');
  }

  const baseUrl = process.env.MANUS_BASE_URL || MANUS_BASE_URL;
  const defaultWebhook = process.env.PROGRESS_WEBHOOK_URL || PROGRESS_WEBHOOK_URL;
  const url = `${baseUrl}/v1/tasks`;
  // briefとplanを統合してpromptフィールドに設定
  if (!plan || typeof plan !== 'object') {
    throw new Error('plan must be provided as an object');
  }
  const prompt = `${brief}\n\nPlan JSON:\n${JSON.stringify(plan, null, 2)}`;
  const enrichedMetadata =
    metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0
      ? metadata
      : undefined;
  const payload = {
    prompt: prompt,
    plan,
    webhook_url: webhookUrl || defaultWebhook
  };
  if (enrichedMetadata) {
    payload.metadata = enrichedMetadata;
    if (enrichedMetadata.idempotency_key && !payload.idempotency_key) {
      payload.idempotency_key = enrichedMetadata.idempotency_key;
    }
  }

  if (effectiveDryRun) {
    return {
      dryRun: true,
      payload
    };
  }

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(payload);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'API_KEY': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Miyabi-Agent'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            resolve(data);
          }
        } else {
          reject(new Error(`Manus API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Manus APIからタスク情報を取得
 * @param {string} taskId - タスクID
 * @returns {Promise<Object>} タスク情報
 */
export async function getManusTask(taskId) {
  const apiKey = process.env.MANUS_API_KEY || MANUS_API_KEY;
  if (!apiKey) {
    throw new Error('MANUS_API_KEY environment variable is required');
  }

  const baseUrl = process.env.MANUS_BASE_URL || MANUS_BASE_URL;
  const url = `${baseUrl}/v1/tasks/${taskId}`;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'GET',
      headers: {
        'API_KEY': apiKey,
        'Accept': 'application/json',
        'User-Agent': 'Miyabi-Agent'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            resolve(data);
          }
        } else {
          reject(new Error(`Manus API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}
