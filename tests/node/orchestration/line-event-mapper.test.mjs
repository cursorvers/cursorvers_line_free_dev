import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveLineSpecEvent } from '../../../scripts/orchestration/line-event-mapper.js';

test('deriveLineSpecEvent maps follow to add_line', () => {
  const { eventName } = deriveLineSpecEvent({ type: 'follow' });
  assert.equal(eventName, 'add_line');
});

test('deriveLineSpecEvent maps known commands', () => {
  const detail = deriveLineSpecEvent({
    type: 'message',
    message: { type: 'text', text: '#詳しく' }
  });
  assert.equal(detail.eventName, 'cmd_detail');

  const participate = deriveLineSpecEvent({
    type: 'message',
    message: { type: 'text', text: '#参加' }
  });
  assert.equal(participate.eventName, 'cmd_participate');

  const resume = deriveLineSpecEvent({
    type: 'message',
    message: { type: 'text', text: '#再開' }
  });
  assert.equal(resume.eventName, 'resubscribe');
});

test('deriveLineSpecEvent maps consulting text to cmd_contact', () => {
  const consulting = deriveLineSpecEvent({
    type: 'message',
    message: { type: 'text', text: '導入支援の相談' }
  });
  assert.equal(consulting.eventName, 'cmd_contact');
  assert.equal(consulting.command, '導入支援の相談');
});

test('deriveLineSpecEvent handles unmapped hash commands', () => {
  const result = deriveLineSpecEvent({
    type: 'message',
    message: { type: 'text', text: '#未知コマンド' }
  });
  assert.equal(result.eventName, 'line_command_unmapped');
  assert.equal(result.command, '#未知コマンド');
});

test('deriveLineSpecEvent defaults to line_message', () => {
  const result = deriveLineSpecEvent({
    type: 'message',
    message: { type: 'text', text: 'こんにちは' }
  });
  assert.equal(result.eventName, 'line_message');
});
