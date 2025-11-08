export const COMMAND_EVENT_MAP = new Map([
  ['#詳しく', 'cmd_detail'],
  ['#参加', 'cmd_participate'],
  ['#完了', 'cmd_done'],
  ['#受講開始', 'cmd_start_course'],
  ['#つまずき', 'cmd_stuck'],
  ['#規約', 'cmd_regulation'],
  ['#通知停止', 'unsubscribe'],
  ['#再開', 'resubscribe'],
  ['開発事例のご案内', 'cmd_detail'],
  ['開発事例を見る', 'cmd_detail'],
  ['プレゼントの受け取り', 'cmd_gift'],
  ['限定プレゼント', 'cmd_gift'],
  ['お問い合わせ', 'cmd_contact'],
  ['相談したい', 'cmd_contact'],
  ['導入支援の相談', 'cmd_contact'],
  ['導入支援', 'cmd_contact'],
]);

export function deriveLineSpecEvent(event) {
  if (!event || typeof event !== 'object') {
    return { eventName: 'line_unknown', command: null };
  }
  const type = event.type ?? 'unknown';
  if (type === 'follow') {
    return { eventName: 'add_line', command: null };
  }
  if (type === 'unfollow') {
    return { eventName: 'unsubscribe', command: null };
  }
  const message = event.message;
  if (message && typeof message === 'object' && message.type === 'text') {
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (text.length > 0) {
      const mapped = COMMAND_EVENT_MAP.get(text);
      if (mapped) {
        return { eventName: mapped, command: text };
      }
      if (text.startsWith('#')) {
        return { eventName: 'line_command_unmapped', command: text };
      }
    }
  }
  switch (type) {
    case 'message':
      return { eventName: 'line_message', command: message?.text ?? null };
    case 'postback':
      return { eventName: 'line_postback', command: null };
    default:
      return { eventName: `line_${type}`, command: null };
  }
}
