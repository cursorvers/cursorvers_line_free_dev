#!/usr/bin/env deno
/**
 * Replay Progress Event Script
 * 
 * テストフィクスチャを使用してManus Progress Eventをリプレイします。
 * 主にテストやデバッグで使用します。
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

interface ReplayOptions {
  fixturePath?: string;
  eventType?: string;
  taskId?: string;
  dryRun?: boolean;
}

async function replayProgressEvent(options: ReplayOptions = {}) {
  const {
    fixturePath,
    eventType,
    taskId,
    dryRun = false,
  } = options;

  // フィクスチャファイルのパス解決
  let fixtureFile: string;
  
  if (fixturePath) {
    fixtureFile = resolve(PROJECT_ROOT, fixturePath);
  } else if (eventType) {
    // イベントタイプからフィクスチャを探す
    fixtureFile = resolve(
      PROJECT_ROOT,
      'tests/fixtures/supabase',
      `manus-progress-${eventType}.json`
    );
  } else {
    // デフォルトのフィクスチャを使用
    fixtureFile = resolve(
      PROJECT_ROOT,
      'tests/fixtures/supabase/manus-progress-fixtures.json'
    );
  }

  console.log(`📂 Loading fixture: ${fixtureFile}`);

  // フィクスチャの読み込み
  let fixtureData: any;
  try {
    const content = await readFile(fixtureFile, 'utf8');
    fixtureData = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Failed to load fixture: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }

  // イベントの抽出
  let events: any[] = [];
  
  if (Array.isArray(fixtureData)) {
    events = fixtureData;
  } else if (fixtureData.events) {
    events = fixtureData.events;
  } else if (fixtureData.event) {
    events = [fixtureData.event];
  } else {
    events = [fixtureData];
  }

  // taskIdでフィルタリング
  if (taskId) {
    events = events.filter((e: any) => e.task_id === taskId);
  }

  if (events.length === 0) {
    console.error('❌ No matching events found');
    Deno.exit(1);
  }

  console.log(`✅ Found ${events.length} event(s)`);

  // 各イベントをリプレイ
  for (const event of events) {
    console.log(`\n🔄 Replaying event: ${event.task_id || event.event_type || 'unknown'}`);
    
    if (dryRun) {
      console.log('  [DRY RUN] Event would be sent:');
      console.log(JSON.stringify(event, null, 2));
    } else {
      // 実際のリプレイ処理
      // ここではupsert-progress-event.jsを呼び出す
      console.log('  Sending event to Supabase...');
      
      // 一時ファイルに書き込んでから実行
      const tmpFile = resolve(PROJECT_ROOT, 'tmp/replay-event.json');
      await Deno.writeTextFile(tmpFile, JSON.stringify(event, null, 2));
      
      // upsert-progress-event.jsを実行
      const process = Deno.run({
        cmd: ['node', 'scripts/supabase/upsert-progress-event.js', tmpFile],
        stdout: 'piped',
        stderr: 'piped',
      });

      const { code } = await process.status();
      const output = new TextDecoder().decode(await process.output());
      const errorOutput = new TextDecoder().decode(await process.stderrOutput());

      if (code === 0) {
        console.log('  ✅ Event replayed successfully');
        console.log('  Response:', output);
      } else {
        console.error('  ❌ Failed to replay event');
        console.error('  Error:', errorOutput);
      }
    }
  }

  console.log('\n✅ Replay completed');
}

// CLI引数の解析
const args = Deno.args;
const options: ReplayOptions = {
  dryRun: args.includes('--dry-run'),
};

if (args.includes('--fixture')) {
  const index = args.indexOf('--fixture');
  options.fixturePath = args[index + 1];
}

if (args.includes('--event-type')) {
  const index = args.indexOf('--event-type');
  options.eventType = args[index + 1];
}

if (args.includes('--task-id')) {
  const index = args.indexOf('--task-id');
  options.taskId = args[index + 1];
}

// 実行
if (import.meta.main) {
  replayProgressEvent(options).catch((error) => {
    console.error('❌ Replay failed:', error);
    Deno.exit(1);
  });
}

