#!/usr/bin/env node
/**
 * Manus Progress Event テストマトリクス統合テスト
 * 
 * テストケース:
 * - success_proceed: 正常終了
 * - retry_required: 再試行が必要
 * - amend_required: Plan修正が必要
 * - abort_required: 中止が必要
 * - failure_no_retry: 失敗（再試行なし）
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

// テストマトリクスの読み込み
const TEST_MATRIX_PATH = resolve(PROJECT_ROOT, 'tests/fixtures/manus-progress-test-matrix.json');
const SUPABASE_FIXTURES_PATH = resolve(PROJECT_ROOT, 'tests/fixtures/supabase/manus-progress-fixtures.json');

// PlanDeltaのdecision判定ロジック
const ALLOWED_DECISIONS = new Set(['proceed', 'retry', 'amended', 'abort']);

function validateDecision(decision) {
  if (!decision) {
    throw new Error('Decision is required');
  }
  if (!ALLOWED_DECISIONS.has(decision)) {
    throw new Error(`Invalid decision: ${decision}. Allowed: ${Array.from(ALLOWED_DECISIONS).join(', ')}`);
  }
  return true;
}

function shouldRetryManus(decision, planDelta) {
  validateDecision(decision);
  
  if (decision === 'proceed') {
    return false;
  }
  if (decision === 'abort') {
    return false;
  }
  if (decision === 'retry' || decision === 'amended') {
    return true;
  }
  return false;
}

function shouldUseAmendedPlan(decision, planDelta) {
  if (decision === 'amended' && planDelta?.amended_plan) {
    return true;
  }
  return false;
}

function shouldAbortWorkflow(decision, planDelta) {
  if (decision === 'abort') {
    return true;
  }
  // 最大再試行回数に達した場合
  if (planDelta?.evidence?.retry_count >= planDelta?.evidence?.max_retries) {
    return true;
  }
  return false;
}

// テスト実行
async function runTest(testCaseName, testCase, expected) {
  console.log(`\n🧪 テストケース: ${testCaseName}`);
  console.log(`   ${testCase.description}`);
  
  const event = testCase.event;
  const planDelta = event.plan_delta;
  const decision = planDelta?.decision;
  
  // Decisionの検証
  try {
    validateDecision(decision);
    console.log(`   ✅ Decision検証: ${decision}`);
  } catch (error) {
    console.error(`   ❌ Decision検証失敗: ${error.message}`);
    return false;
  }
  
  // Manus再試行の判定
  const shouldRetry = shouldRetryManus(decision, planDelta);
  if (shouldRetry !== expected.manus_retry) {
    console.error(`   ❌ Manus再試行判定: 期待=${expected.manus_retry}, 実際=${shouldRetry}`);
    return false;
  }
  console.log(`   ✅ Manus再試行判定: ${shouldRetry} (期待通り)`);
  
  // 修正Plan使用の判定
  if (expected.amended_plan_used !== undefined) {
    const useAmended = shouldUseAmendedPlan(decision, planDelta);
    if (useAmended !== expected.amended_plan_used) {
      console.error(`   ❌ 修正Plan使用判定: 期待=${expected.amended_plan_used}, 実際=${useAmended}`);
      return false;
    }
    console.log(`   ✅ 修正Plan使用判定: ${useAmended} (期待通り)`);
  }
  
  // ワークフロー中止の判定
  if (expected.workflow_aborted !== undefined) {
    const shouldAbort = shouldAbortWorkflow(decision, planDelta);
    if (shouldAbort !== expected.workflow_aborted) {
      console.error(`   ❌ ワークフロー中止判定: 期待=${expected.workflow_aborted}, 実際=${shouldAbort}`);
      return false;
    }
    console.log(`   ✅ ワークフロー中止判定: ${shouldAbort} (期待通り)`);
  }
  
  // 再試行回数の確認
  if (expected.retry_count !== undefined) {
    const retryCount = planDelta?.evidence?.retry_count ?? 0;
    if (retryCount !== expected.retry_count) {
      console.warn(`   ⚠️  再試行回数: 期待=${expected.retry_count}, 実際=${retryCount}`);
    } else {
      console.log(`   ✅ 再試行回数: ${retryCount} (期待通り)`);
    }
  }
  
  return true;
}

// メイン実行
async function main() {
  console.log('## 🚀 Manus Progress Event テストマトリクス統合テスト\n');
  
  // テストマトリクスの読み込み
  let testMatrix;
  try {
    const matrixContent = await readFile(TEST_MATRIX_PATH, 'utf8');
    testMatrix = JSON.parse(matrixContent);
    console.log('✅ テストマトリクス読み込み完了');
  } catch (error) {
    console.error('❌ テストマトリクスの読み込みに失敗:', error.message);
    process.exit(1);
  }
  
  // コマンドライン引数の解析
  const args = process.argv.slice(2);
  const caseFilter = args.includes('--case') 
    ? args[args.indexOf('--case') + 1]
    : null;
  
  // テストケースの実行
  const testCases = testMatrix.test_cases;
  let passed = 0;
  let failed = 0;
  
  console.log(`\n📋 テストケース数: ${Object.keys(testCases).length}`);
  if (caseFilter) {
    console.log(`  フィルター: ${caseFilter}\n`);
  }
  
  for (const [testCaseName, testCase] of Object.entries(testCases)) {
    if (caseFilter && testCaseName !== caseFilter) {
      continue;
    }
    
    const expected = testCase.expected_workflow_behavior;
    const result = await runTest(testCaseName, testCase, expected);
    
    if (result) {
      passed++;
    } else {
      failed++;
    }
  }
  
  // 結果サマリー
  console.log('\n## 📊 テスト結果サマリー\n');
  console.log(`✅ 成功: ${passed}`);
  console.log(`❌ 失敗: ${failed}`);
  console.log(`📊 合計: ${passed + failed}\n`);
  
  if (failed > 0) {
    console.log('⚠️  一部のテストが失敗しました');
    process.exit(1);
  } else {
    console.log('✅ すべてのテストが成功しました');
    process.exit(0);
  }
}

// 実行
main().catch(error => {
  console.error('❌ テスト実行エラー:', error);
  process.exit(1);
});

