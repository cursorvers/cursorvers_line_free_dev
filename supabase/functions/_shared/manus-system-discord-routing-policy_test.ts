import { assertEquals } from "std-assert";

const REPO_ROOT = new URL("../../../", import.meta.url);

const MANUS_SYSTEM_POLICY_FILES = [
  ".github/workflows/manus-audit.yml",
  ".github/workflows/auto-repair-line.yml",
  ".github/workflows/manus-progress.yml",
  ".github/workflows/manus-code-fixer.yml",
  ".github/workflows/edge-function-monitor.yml",
  ".github/workflows/e2e-pipeline-monitor.yml",
  ".github/workflows/discord-forum-sync.yml",
  ".github/workflows/replenish-cards.yml",
  ".github/workflows/stripe-consistency-check-cron.yml",
  ".github/workflows/metrics-export.yml",
  ".github/workflows/line-daily-brief-cron.yml",
  ".github/workflows/stats-exporter-cron.yml",
  ".github/workflows/sec-brief-cron.yml",
  ".github/workflows/sync-line-cards.yml",
  "supabase/functions/_shared/alert.ts",
  "supabase/functions/manus-audit-line-daily-brief/index.ts",
  "supabase/functions/manus-intelligent-repair/index.ts",
  "supabase/functions/manus-code-fixer/index.ts",
] as const;

const FORBIDDEN_WEBHOOK_KEYS = [
  "DISCORD_ALERT_WEBHOOK",
  "DISCORD_ADMIN_WEBHOOK_URL",
  "DISCORD_MAINT_WEBHOOK_URL",
  "DISCORD_MANUS_WEBHOOK_URL",
  "DISCORD_WEBHOOK_URL",
] as const;

const DISCORD_NOTIFICATION_FILES = [
  ".github/workflows/manus-audit.yml",
  ".github/workflows/auto-repair-line.yml",
  ".github/workflows/manus-progress.yml",
  ".github/workflows/edge-function-monitor.yml",
  ".github/workflows/e2e-pipeline-monitor.yml",
  ".github/workflows/discord-forum-sync.yml",
  ".github/workflows/replenish-cards.yml",
  ".github/workflows/stripe-consistency-check-cron.yml",
  ".github/workflows/metrics-export.yml",
  ".github/workflows/line-daily-brief-cron.yml",
  ".github/workflows/stats-exporter-cron.yml",
  ".github/workflows/sec-brief-cron.yml",
  ".github/workflows/sync-line-cards.yml",
  "supabase/functions/_shared/alert.ts",
  "supabase/functions/manus-audit-line-daily-brief/index.ts",
  "supabase/functions/manus-intelligent-repair/index.ts",
  "supabase/functions/manus-code-fixer/index.ts",
] as const;

async function readRepoFile(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, REPO_ROOT));
}

Deno.test("manus/system policy files do not reference legacy or generic Discord webhook keys", async () => {
  for (const file of MANUS_SYSTEM_POLICY_FILES) {
    const content = await readRepoFile(file);
    for (const forbidden of FORBIDDEN_WEBHOOK_KEYS) {
      assertEquals(
        content.includes(forbidden),
        false,
        `${file} must not reference ${forbidden}`,
      );
    }
  }
});

Deno.test("manus/system Discord notification surfaces require DISCORD_SYSTEM_WEBHOOK", async () => {
  for (const file of DISCORD_NOTIFICATION_FILES) {
    const content = await readRepoFile(file);
    assertEquals(
      content.includes("DISCORD_SYSTEM_WEBHOOK"),
      true,
      `${file} must reference DISCORD_SYSTEM_WEBHOOK`,
    );
  }
});
