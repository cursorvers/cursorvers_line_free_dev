#!/usr/bin/env node
/**
 * Broadcast and promotion limit helpers.
 */

const DEFAULT_MAX_BROADCASTS = Number.parseInt(process.env.LINE_MAX_BROADCASTS_PER_MONTH ?? '3', 10);
const DEFAULT_PROMO_COOLDOWN_DAYS = Number.parseInt(process.env.LINE_PROMO_COOLDOWN_DAYS ?? '30', 10);
const DEFAULT_PROMO_TEMPLATES = (process.env.LINE_PROMO_TEMPLATES ?? 'scenario_cmd_gift').split(',').map((entry) => entry.trim()).filter(Boolean);

function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isPromoTemplate(templateName, promoTemplates = DEFAULT_PROMO_TEMPLATES) {
  return promoTemplates.includes(templateName);
}

export function evaluateBroadcastPolicy({ metadata = {}, templateNames = [], config = {}, now = new Date() }) {
  if (templateNames.length === 0) {
    return { allowed: true, reason: 'no_templates' };
  }
  const maxPerMonth = Number.parseInt(config.maxPerMonth ?? DEFAULT_MAX_BROADCASTS, 10);
  const promoCooldownDays = Number.parseInt(config.promoCooldownDays ?? DEFAULT_PROMO_COOLDOWN_DAYS, 10);
  const monthKey = getMonthKey(now);
  const storedMonth = metadata.broadcast_month_key;
  const currentCount = storedMonth === monthKey ? Number(metadata.broadcast_count_month ?? 0) : 0;
  const nextCount = currentCount + 1;

  if (maxPerMonth > 0 && nextCount > maxPerMonth) {
    return { allowed: false, reason: 'monthly_limit', metadataPatch: {} };
  }

  const promoTemplates = templateNames.filter((name) => isPromoTemplate(name, config.promoTemplates ?? DEFAULT_PROMO_TEMPLATES));
  if (promoTemplates.length > 0 && promoCooldownDays > 0) {
    const lastPromo = metadata.promo_last_sent_at ? new Date(metadata.promo_last_sent_at) : null;
    if (lastPromo) {
      const diffDays = (now - lastPromo) / (1000 * 60 * 60 * 24);
      if (diffDays < promoCooldownDays) {
        return { allowed: false, reason: 'promo_cooldown', metadataPatch: {} };
      }
    }
  }

  const metadataPatch = {
    broadcast_month_key: monthKey,
    broadcast_count_month: nextCount,
  };
  if (promoTemplates.length > 0) {
    metadataPatch.promo_last_sent_at = now.toISOString();
  }

  return { allowed: true, reason: 'ok', metadataPatch };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = evaluateBroadcastPolicy({
    metadata: {},
    templateNames: ['scenario_cmd_detail'],
  });
  console.log(JSON.stringify(result, null, 2));
}
