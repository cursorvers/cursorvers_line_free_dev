import { createHash } from 'node:crypto';

export function hashUserId(userId = '', salt = '') {
  const hash = createHash('sha256');
  hash.update(salt ?? '');
  hash.update(':');
  hash.update(userId ?? '');
  return hash.digest('hex').slice(0, 16);
}

export function detectEventType(payload) {
  if (payload && typeof payload === 'object') {
    const data = payload;
    if (Array.isArray(data.events)) return 'line_event';
    if (data.progress_id || data.event_type || data.task_id) return 'manus_progress';
  }
  return 'unknown';
}

export function sanitizePayload(payload, eventType, options = {}) {
  const hashSalt = options.hashSalt ?? '';
  const redact = options.redactLineMessage === true;
  const deriveLineEvent = typeof options.deriveLineEvent === 'function' ? options.deriveLineEvent : null;

  if (eventType === 'manus_progress' && payload && typeof payload === 'object') {
    const data = payload;
    return {
      progress_id: data.progress_id ?? data.task_id ?? null,
      decision: data.decision ?? data.plan_delta?.decision ?? 'unknown',
      plan_variant: data.plan_variant ?? data.context?.plan_variant ?? 'production',
      retry_after_seconds: data.retry_after_seconds ?? data.plan_delta?.retry_after_seconds ?? null,
      manus_points_consumed: data.manus_points_consumed ?? data.metrics?.manus_points ?? null,
      metadata: {
        step_id: data.step_id ?? null,
        event_type: data.event_type ?? null,
        manus_run_id: data.manus_run_id ?? null,
        context: data.context ?? null,
        preview: data.preview ?? null,
        error: data.error ?? null,
      },
    };
  }

  if (eventType === 'line_event' && payload && typeof payload === 'object') {
    const data = payload;
    const events = Array.isArray(data.events) ? data.events : [];
    const sanitizedEvents = events.map((event) => {
      const src = event.source ?? {};
      const hashed = src?.userId ? hashUserId(src.userId, hashSalt) : null;
      const msg = event.message ?? null;
      const rawText = msg?.text ?? null;
      const safeText = redact && rawText ? '[redacted]' : rawText;
      return {
        type: event.type ?? 'unknown',
        timestamp: event.timestamp ?? null,
        source: {
          type: src?.type ?? 'unknown',
          userId: hashed,
        },
        replyToken: event.replyToken ?? null,
        message: msg
          ? {
              type: msg.type ?? null,
              id: msg.id ?? null,
              text: safeText,
              raw_text: redact ? null : rawText,
            }
          : null,
      };
    });

    const primary = sanitizedEvents[0] ?? {};
    const derived = deriveLineEvent ? deriveLineEvent(events[0] ?? {}) : { eventName: null, command: null };
    return {
      event: derived.eventName ?? data.event ?? null,
      command: derived.command ?? data.command ?? null,
      occurred_at: events[0]?.timestamp ?? null,
      user: {
        hashed_id: events[0]?.source?.userId ? hashUserId(events[0].source.userId, hashSalt) : null,
        source_type: events[0]?.source?.type ?? null,
      },
      message: primary.message ?? null,
      destination: data.destination ?? null,
      events: sanitizedEvents,
      raw: {
        destination: data.destination ?? null,
        events: sanitizedEvents,
      },
    };
  }

  return payload;
}

export function createDedupKey(eventType, payload, options = {}) {
  const hashSalt = options.hashSalt ?? '';
  const signature = options.signature ?? '';
  const rawBody = options.rawBody ?? '';
  const hash = createHash('sha256');
  hash.update(eventType);

  if (eventType === 'line_event' && payload && typeof payload === 'object') {
    const data = payload;
    const event = Array.isArray(data.events) ? data.events[0] ?? {} : {};
    const source = event.source ?? {};
    const message = event.message ?? {};
    hash.update(hashUserId(source.userId ?? 'unknown', hashSalt));
    hash.update('|');
    hash.update(String(event.type ?? 'unknown'));
    hash.update('|');
    hash.update(String(event.timestamp ?? ''));
    hash.update('|');
    hash.update(String(message.id ?? ''));
    hash.update('|');
    hash.update(String(event.replyToken ?? ''));
    return hash.digest('hex');
  }

  if (eventType === 'manus_progress' && payload && typeof payload === 'object') {
    const data = payload;
    hash.update(String(data.progress_id ?? data.task_id ?? 'unknown'));
    hash.update('|');
    hash.update(String(data.decision ?? data.plan_delta?.decision ?? 'unknown'));
    hash.update('|');
    hash.update(String(data.plan_variant ?? data.context?.plan_variant ?? 'production'));
    hash.update('|');
    hash.update(String(data.step_id ?? ''));
    return hash.digest('hex');
  }

  hash.update(signature ?? '');
  hash.update('|');
  hash.update(rawBody ?? '');
  return hash.digest('hex');
}

export function resolveDedupeTtl(envValue, defaultTtl = 120) {
  const parsed = Number(envValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return defaultTtl;
}
