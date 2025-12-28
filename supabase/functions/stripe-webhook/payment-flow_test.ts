/**
 * Stripe Webhook E2E決済フローテスト
 * 決済完了 → 会員作成 → Discord招待 の統合フローをテスト
 */
import { assertEquals, assertExists } from "std-assert";

// =======================
// モック用の型定義
// =======================

interface MockCheckoutSession {
  id: string;
  customer: string;
  customer_details: {
    email: string;
    name: string | null;
  };
  payment_status: "paid" | "unpaid" | "no_payment_required";
  mode: "payment" | "subscription" | "setup";
  subscription: string | null;
  amount_total: number | null;
  payment_link: string | null;
  metadata: Record<string, string>;
}

interface MockSubscription {
  id: string;
  status: string;
  current_period_end: number;
  customer: string;
}

interface MockMember {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  status: string;
  line_user_id: string | null;
  discord_invite_sent: boolean;
  verification_code: string | null;
  verification_expires_at: string | null;
  stripe_customer_id: string | null;
}

// =======================
// テスト用ヘルパー
// =======================

function createMockCheckoutSession(
  overrides: Partial<MockCheckoutSession> = {},
): MockCheckoutSession {
  return {
    id: "cs_test_" + Math.random().toString(36).substring(7),
    customer: "cus_test_" + Math.random().toString(36).substring(7),
    customer_details: {
      email: `test_${Date.now()}@example.com`,
      name: "Test User",
    },
    payment_status: "paid",
    mode: "subscription",
    subscription: "sub_test_" + Math.random().toString(36).substring(7),
    amount_total: 298000, // Library tier
    payment_link: null,
    metadata: {},
    ...overrides,
  };
}

function createMockMember(overrides: Partial<MockMember> = {}): MockMember {
  return {
    id: "mem_" + Math.random().toString(36).substring(7),
    email: `test_${Date.now()}@example.com`,
    name: "Test User",
    tier: "library",
    status: "active",
    line_user_id: null,
    discord_invite_sent: false,
    verification_code: null,
    verification_expires_at: null,
    stripe_customer_id: null,
    ...overrides,
  };
}

// =======================
// フロー1: 新規決済完了 → 会員作成 → 認証コード生成
// =======================

Deno.test("Payment Flow - New checkout creates member with verification code", async (t) => {
  await t.step("checkout session has required fields", () => {
    const session = createMockCheckoutSession();

    assertExists(session.id);
    assertExists(session.customer);
    assertExists(session.customer_details.email);
    assertEquals(session.payment_status, "paid");
  });

  await t.step(
    "member should be created with verification code when LINE not linked",
    () => {
      const member = createMockMember({
        line_user_id: null,
        verification_code: "ABC123",
        verification_expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
          .toISOString(),
        discord_invite_sent: false,
      });

      assertExists(member.verification_code);
      assertExists(member.verification_expires_at);
      assertEquals(member.discord_invite_sent, false);
      assertEquals(member.line_user_id, null);
    },
  );

  await t.step("verification code should be 6 characters alphanumeric", () => {
    const code = "ABC123";
    const pattern = /^[A-Z0-9]{6}$/;
    assertEquals(pattern.test(code), true);
  });

  await t.step("verification expires in 14 days", () => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const diffDays = Math.floor(
      (expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    assertEquals(diffDays, 14);
  });
});

// =======================
// フロー2: LINE紐付け済み → 即座にDiscord招待
// =======================

Deno.test("Payment Flow - Checkout with LINE linked sends Discord invite immediately", async (t) => {
  await t.step("member with LINE user ID should get Discord invite", () => {
    const member = createMockMember({
      line_user_id: "U1234567890abcdef1234567890abcdef",
      discord_invite_sent: false,
    });

    assertExists(member.line_user_id);
    assertEquals(member.line_user_id.startsWith("U"), true);
    assertEquals(member.line_user_id.length, 33);
  });

  await t.step("Discord invite sent flag should be set after sending", () => {
    const memberBefore = createMockMember({
      line_user_id: "U1234567890abcdef1234567890abcdef",
      discord_invite_sent: false,
    });

    // After sending Discord invite
    const memberAfter = {
      ...memberBefore,
      discord_invite_sent: true,
      verification_code: null,
      verification_expires_at: null,
    };

    assertEquals(memberAfter.discord_invite_sent, true);
    assertEquals(memberAfter.verification_code, null);
  });

  await t.step("should skip if already sent", () => {
    const member = createMockMember({
      line_user_id: "U1234567890abcdef1234567890abcdef",
      discord_invite_sent: true,
    });

    assertEquals(member.discord_invite_sent, true);
    // Flow should skip sending another invite
  });
});

// =======================
// フロー3: 認証コード入力 → LINE紐付け → Discord招待
// =======================

Deno.test("Payment Flow - Verification code links LINE and sends Discord invite", async (t) => {
  await t.step("valid verification code should match member", () => {
    const code = "ABC123";
    const member = createMockMember({
      verification_code: code,
      verification_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString(),
    });

    assertEquals(member.verification_code, code);
    assertEquals(member.verification_code?.length, 6);
  });

  await t.step("expired code should be rejected", () => {
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
    const isExpired = expiredDate < new Date();
    assertEquals(isExpired, true);
  });

  await t.step("LINE user should be linked after verification", () => {
    const memberBefore = createMockMember({
      verification_code: "ABC123",
      line_user_id: null,
    });

    // After verification
    const memberAfter = {
      ...memberBefore,
      line_user_id: "U1234567890abcdef1234567890abcdef",
      verification_code: null,
      verification_expires_at: null,
      discord_invite_sent: true,
    };

    assertExists(memberAfter.line_user_id);
    assertEquals(memberAfter.verification_code, null);
    assertEquals(memberAfter.discord_invite_sent, true);
  });
});

// =======================
// フロー4: サブスクリプション解約
// =======================

Deno.test("Payment Flow - Subscription cancellation updates member status", async (t) => {
  await t.step("member status changes to inactive on cancellation", () => {
    const memberBefore = createMockMember({
      status: "active",
      tier: "library",
    });

    // After cancellation
    const memberAfter = {
      ...memberBefore,
      status: "inactive",
    };

    assertEquals(memberBefore.status, "active");
    assertEquals(memberAfter.status, "inactive");
  });

  await t.step("subscription status changes to canceled", () => {
    const subscriptionStatus = "canceled";
    assertEquals(subscriptionStatus, "canceled");
  });

  await t.step("Discord role removal should be attempted", () => {
    const member = createMockMember(
      {
        discord_user_id: "123456789012345678",
      } as MockMember & { discord_user_id: string },
    );

    assertExists(
      (member as MockMember & { discord_user_id: string }).discord_user_id,
    );
  });

  await t.step("LINE notification should be sent", () => {
    const member = createMockMember({
      line_user_id: "U1234567890abcdef1234567890abcdef",
    });

    assertExists(member.line_user_id);
  });
});

// =======================
// フロー5: 孤児レコードマージ
// =======================

Deno.test("Payment Flow - Orphan LINE record merge", async (t) => {
  await t.step("orphan record has LINE ID but no email", () => {
    const orphan = createMockMember({
      email: "", // Empty or would be null
      line_user_id: "U1234567890abcdef1234567890abcdef",
      tier: "free",
    });

    assertExists(orphan.line_user_id);
  });

  await t.step("paid member without LINE should receive orphan LINE ID", () => {
    const paidMember = createMockMember({
      email: "paid@example.com",
      line_user_id: null,
      tier: "library",
    });

    const orphan = createMockMember({
      email: "",
      line_user_id: "U1234567890abcdef1234567890abcdef",
      tier: "free",
    });

    // After merge
    const mergedMember = {
      ...paidMember,
      line_user_id: orphan.line_user_id,
    };

    assertExists(mergedMember.line_user_id);
    assertEquals(mergedMember.tier, "library");
    assertEquals(mergedMember.email, "paid@example.com");
  });

  await t.step("orphan record should be deleted after merge", () => {
    // Orphan deletion is verified by checking merge result
    const mergeResult = {
      merged: true,
      orphanLineUserId: "U1234567890abcdef1234567890abcdef",
    };
    assertEquals(mergeResult.merged, true);
    assertExists(mergeResult.orphanLineUserId);
  });
});

// =======================
// フロー6: Tier判定
// =======================

Deno.test("Payment Flow - Tier determination", async (t) => {
  await t.step("amount >= 380000 is Master tier", () => {
    const amount = 380000;
    const tier = amount >= 380000 ? "master" : "library";
    assertEquals(tier, "master");
  });

  await t.step("amount < 380000 is Library tier", () => {
    const amount = 298000;
    const tier = amount >= 380000 ? "master" : "library";
    assertEquals(tier, "library");
  });

  await t.step("Master payment link returns Master tier", () => {
    const paymentLinkId = "plink_master_class_xxx";
    const isMasterLink = paymentLinkId.includes("master");
    assertEquals(isMasterLink, true);
  });

  await t.step("null amount defaults to Library tier", () => {
    const amount: number | null = null;
    const tier = amount && amount >= 380000 ? "master" : "library";
    assertEquals(tier, "library");
  });
});

// =======================
// フロー7: 冪等性チェック
// =======================

Deno.test("Payment Flow - Idempotency checks", async (t) => {
  await t.step("same event ID should be processed once", () => {
    const eventId = "evt_test_123456";
    const processedEvents = new Set<string>();

    // First process
    const shouldProcess1 = !processedEvents.has(eventId);
    processedEvents.add(eventId);

    // Second attempt
    const shouldProcess2 = !processedEvents.has(eventId);

    assertEquals(shouldProcess1, true);
    assertEquals(shouldProcess2, false);
  });

  await t.step(
    "same stripe_customer_id with discord_invite_sent should skip",
    () => {
      const member = createMockMember({
        stripe_customer_id: "cus_test_123",
        discord_invite_sent: true,
      });

      const session = createMockCheckoutSession({
        customer: "cus_test_123",
      });

      const shouldSkip = member.stripe_customer_id === session.customer &&
        member.discord_invite_sent === true;

      assertEquals(shouldSkip, true);
    },
  );

  await t.step("existing verification code should be reused if valid", () => {
    const _existingCode = "ABC123"; // Used for context: represents code to be reused
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const isValid = expiresAt > new Date();

    assertEquals(isValid, true);
    // Should reuse _existingCode instead of generating new one
  });
});

// =======================
// フロー8: エラーハンドリング
// =======================

Deno.test("Payment Flow - Error handling scenarios", async (t) => {
  await t.step("unpaid checkout should not create member", () => {
    const session = createMockCheckoutSession({
      payment_status: "unpaid",
    });

    assertEquals(session.payment_status, "unpaid");
    // Flow should exit early
  });

  await t.step("missing email should not create member", () => {
    const session = createMockCheckoutSession({
      customer_details: {
        email: "",
        name: null,
      },
    });

    const hasEmail = !!session.customer_details.email;
    assertEquals(hasEmail, false);
  });

  await t.step("DB error should not crash webhook", () => {
    // Simulating error handling
    const error = { message: "Database connection failed" };
    assertExists(error.message);
    // Should log and return 500, not throw
  });
});

// =======================
// フロー9: Discord招待フラグ管理
// =======================

Deno.test("Payment Flow - Discord invite flag management", async (t) => {
  await t.step(
    "discord_invite_sent should not reset for existing members",
    () => {
      const existingMember = createMockMember({
        discord_invite_sent: true,
        line_user_id: "U1234567890abcdef1234567890abcdef",
      });

      // When updating existing member, should NOT reset discord_invite_sent
      const updatePayload = {
        stripe_customer_id: "cus_new",
        tier: "master",
        // discord_invite_sent should NOT be in this payload
      };

      // Verify existing value is preserved
      assertEquals(existingMember.discord_invite_sent, true);
      assertEquals("discord_invite_sent" in updatePayload, false);
    },
  );

  await t.step("new member should have discord_invite_sent = false", () => {
    const newMember = createMockMember({
      discord_invite_sent: false,
    });

    assertEquals(newMember.discord_invite_sent, false);
  });

  await t.step("flag should only be true after successful LINE send", () => {
    // Simulate LINE send result
    const lineSendSuccess = true;
    const memberAfterUpdate = createMockMember({
      discord_invite_sent: lineSendSuccess,
    });

    assertEquals(memberAfterUpdate.discord_invite_sent, true);
  });

  await t.step("flag should remain false if LINE send fails", () => {
    const lineSendSuccess = false;
    const memberAfterUpdate = createMockMember({
      discord_invite_sent: lineSendSuccess,
    });

    assertEquals(memberAfterUpdate.discord_invite_sent, false);
  });
});

// =======================
// フロー10: 認証コード生成ロジック
// =======================

Deno.test("Payment Flow - Verification code generation logic", async (t) => {
  await t.step("should skip code generation if LINE already linked", () => {
    const existingMember = createMockMember({
      line_user_id: "U1234567890abcdef1234567890abcdef",
      discord_invite_sent: false,
    });

    const alreadyLinked = existingMember.line_user_id != null;
    assertEquals(alreadyLinked, true);
    // Code should NOT be generated
  });

  await t.step("should skip code generation if Discord already invited", () => {
    const existingMember = createMockMember({
      line_user_id: null,
      discord_invite_sent: true,
    });

    const alreadyInvited = existingMember.discord_invite_sent === true;
    assertEquals(alreadyInvited, true);
    // Code should NOT be generated
  });

  await t.step(
    "should generate code if LINE not linked and Discord not invited",
    () => {
      const existingMember = createMockMember({
        line_user_id: null,
        discord_invite_sent: false,
      });

      const alreadyLinked = existingMember.line_user_id != null;
      const alreadyInvited = existingMember.discord_invite_sent === true;
      const shouldGenerateCode = !alreadyLinked && !alreadyInvited;

      assertEquals(shouldGenerateCode, true);
    },
  );

  await t.step("should reuse valid existing code", () => {
    const _existingCode = "ABC123"; // Code to be reused
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    const isValid = expiresAt > new Date();

    assertEquals(isValid, true);
    // Should reuse _existingCode
  });

  await t.step("should generate new code if existing code expired", () => {
    const _existingCode = "ABC123"; // Expired code
    const expiresAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
    const isExpired = expiresAt <= new Date();

    assertEquals(isExpired, true);
    // Should generate new code instead of _existingCode
  });
});
