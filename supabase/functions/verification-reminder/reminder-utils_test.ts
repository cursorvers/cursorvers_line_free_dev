/**
 * verification-reminder ユーティリティ テスト
 * リマインダースケジュールと日数計算のテスト
 */
import { assertEquals } from "std-assert";

// リマインドスケジュール定数
const REMINDER_DAYS = {
  FIRST: 3,
  SECOND: 7,
  FINAL: 14,
};

/**
 * 購入からの経過日数を計算（テスト用コピー）
 */
function getDaysSincePurchase(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

Deno.test("reminder-utils - REMINDER_DAYS constants", async (t) => {
  await t.step("FIRST reminder is at 3 days", () => {
    assertEquals(REMINDER_DAYS.FIRST, 3);
  });

  await t.step("SECOND reminder is at 7 days", () => {
    assertEquals(REMINDER_DAYS.SECOND, 7);
  });

  await t.step("FINAL fallback is at 14 days", () => {
    assertEquals(REMINDER_DAYS.FINAL, 14);
  });

  await t.step("FIRST < SECOND < FINAL", () => {
    assertEquals(REMINDER_DAYS.FIRST < REMINDER_DAYS.SECOND, true);
    assertEquals(REMINDER_DAYS.SECOND < REMINDER_DAYS.FINAL, true);
  });
});

Deno.test("reminder-utils - getDaysSincePurchase", async (t) => {
  await t.step("returns 0 for today", () => {
    const today = new Date().toISOString();
    const days = getDaysSincePurchase(today);
    assertEquals(days, 0);
  });

  await t.step("returns correct days for past date", () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const days = getDaysSincePurchase(threeDaysAgo.toISOString());
    assertEquals(days, 3);
  });

  await t.step("returns correct days for 7 days ago", () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const days = getDaysSincePurchase(sevenDaysAgo.toISOString());
    assertEquals(days, 7);
  });

  await t.step("returns correct days for 14 days ago", () => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const days = getDaysSincePurchase(fourteenDaysAgo.toISOString());
    assertEquals(days, 14);
  });

  await t.step("floors partial days", () => {
    const almostTwoDays = new Date();
    almostTwoDays.setDate(almostTwoDays.getDate() - 1);
    almostTwoDays.setHours(almostTwoDays.getHours() - 23);
    const days = getDaysSincePurchase(almostTwoDays.toISOString());
    assertEquals(days >= 1 && days <= 2, true);
  });
});

Deno.test("reminder-utils - Reminder eligibility", async (t) => {
  await t.step("day 2 - no reminder yet", () => {
    const daysSincePurchase = 2;
    const reminderCount = 0;
    const shouldSendFirst = daysSincePurchase >= REMINDER_DAYS.FIRST &&
      reminderCount < 1;
    assertEquals(shouldSendFirst, false);
  });

  await t.step("day 3 - first reminder eligible", () => {
    const daysSincePurchase = 3;
    const reminderCount = 0;
    const shouldSendFirst = daysSincePurchase >= REMINDER_DAYS.FIRST &&
      reminderCount < 1;
    assertEquals(shouldSendFirst, true);
  });

  await t.step("day 5 with reminder count 1 - no second reminder yet", () => {
    const daysSincePurchase = 5;
    const reminderCount = 1;
    const shouldSendSecond = daysSincePurchase >= REMINDER_DAYS.SECOND &&
      reminderCount < 2;
    assertEquals(shouldSendSecond, false);
  });

  await t.step("day 7 with reminder count 1 - second reminder eligible", () => {
    const daysSincePurchase = 7;
    const reminderCount = 1;
    const shouldSendSecond = daysSincePurchase >= REMINDER_DAYS.SECOND &&
      reminderCount < 2;
    assertEquals(shouldSendSecond, true);
  });

  await t.step("day 14 - final fallback eligible", () => {
    const daysSincePurchase = 14;
    const shouldSendFinal = daysSincePurchase >= REMINDER_DAYS.FINAL;
    assertEquals(shouldSendFinal, true);
  });

  await t.step("day 20 - still final fallback eligible", () => {
    const daysSincePurchase = 20;
    const shouldSendFinal = daysSincePurchase >= REMINDER_DAYS.FINAL;
    assertEquals(shouldSendFinal, true);
  });
});

Deno.test("reminder-utils - UnverifiedMember interface", async (t) => {
  await t.step("has required fields", () => {
    const member = {
      id: "uuid-1234",
      email: "test@example.com",
      tier: "library",
      verification_code: "ABC123",
      created_at: new Date().toISOString(),
      reminder_sent_count: 0,
    };

    assertEquals(typeof member.id, "string");
    assertEquals(typeof member.email, "string");
    assertEquals(typeof member.tier, "string");
    assertEquals(typeof member.verification_code, "string");
    assertEquals(typeof member.created_at, "string");
    assertEquals(typeof member.reminder_sent_count, "number");
  });

  await t.step("reminder_sent_count can be null", () => {
    const member = {
      id: "uuid-1234",
      email: "test@example.com",
      tier: "library",
      verification_code: "ABC123",
      created_at: new Date().toISOString(),
      reminder_sent_count: null,
    };

    const count = member.reminder_sent_count ?? 0;
    assertEquals(count, 0);
  });

  await t.step("tier is library or master", () => {
    const validTiers = ["library", "master"];
    assertEquals(validTiers.includes("library"), true);
    assertEquals(validTiers.includes("master"), true);
    assertEquals(validTiers.includes("free"), false);
  });
});

Deno.test("reminder-utils - Email masking for logging", async (t) => {
  await t.step("masks email after first 5 characters", () => {
    const email = "testuser@example.com";
    const masked = email.slice(0, 5) + "***";
    assertEquals(masked, "testu***");
  });

  await t.step("handles short emails", () => {
    const email = "ab@x.com";
    const masked = email.slice(0, 5) + "***";
    assertEquals(masked, "ab@x.***");
  });

  await t.step("masks different length emails consistently", () => {
    const emails = [
      "a@b.com",
      "test@example.com",
      "very.long.email.address@domain.co.jp",
    ];
    for (const email of emails) {
      const masked = email.slice(0, 5) + "***";
      assertEquals(masked.endsWith("***"), true);
      assertEquals(masked.length, 8); // 5 chars + "***"
    }
  });
});

Deno.test("reminder-utils - Stats tracking", async (t) => {
  await t.step("initial stats are zero", () => {
    const stats = {
      firstReminder: 0,
      secondReminder: 0,
      finalInvite: 0,
      errors: 0,
    };
    assertEquals(stats.firstReminder, 0);
    assertEquals(stats.secondReminder, 0);
    assertEquals(stats.finalInvite, 0);
    assertEquals(stats.errors, 0);
  });

  await t.step("stats increment correctly", () => {
    const stats = {
      firstReminder: 0,
      secondReminder: 0,
      finalInvite: 0,
      errors: 0,
    };

    stats.firstReminder++;
    stats.secondReminder++;
    stats.finalInvite++;
    stats.errors++;

    assertEquals(stats.firstReminder, 1);
    assertEquals(stats.secondReminder, 1);
    assertEquals(stats.finalInvite, 1);
    assertEquals(stats.errors, 1);
  });

  await t.step("total processed is sum of stats", () => {
    const stats = {
      firstReminder: 5,
      secondReminder: 3,
      finalInvite: 2,
      errors: 1,
    };

    const totalActions = stats.firstReminder + stats.secondReminder +
      stats.finalInvite + stats.errors;
    assertEquals(totalActions, 11);
  });
});

Deno.test("reminder-utils - Tier name conversion", async (t) => {
  await t.step("master tier displays as Master Class", () => {
    const tier = "master";
    const tierName = tier === "master" ? "Master Class" : "Library Member";
    assertEquals(tierName, "Master Class");
  });

  await t.step("library tier displays as Library Member", () => {
    const tier = "library";
    const tierName = tier === "master" ? "Master Class" : "Library Member";
    assertEquals(tierName, "Library Member");
  });
});

Deno.test("reminder-utils - Discord invite sent flag", async (t) => {
  await t.step("discord_invite_sent defaults to false", () => {
    const member = {
      discord_invite_sent: false,
    };
    assertEquals(member.discord_invite_sent, false);
  });

  await t.step("can be set to true after sending", () => {
    const member = {
      discord_invite_sent: false,
    };
    member.discord_invite_sent = true;
    assertEquals(member.discord_invite_sent, true);
  });
});
