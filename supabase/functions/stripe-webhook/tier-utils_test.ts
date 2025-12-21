/**
 * stripe-webhook tier-utils テスト
 */
import { assertEquals, assertStrictEquals } from "std-assert";
import {
  determineMembershipTier,
  determineStatus,
  determineTierByAmount,
  determineTierByPaymentLink,
  MASTER_CLASS_MIN_AMOUNT,
  MASTER_CLASS_PAYMENT_LINK_PATTERN,
} from "./tier-utils.ts";

Deno.test("tier-utils - determineTierByAmount", async (t) => {
  await t.step("returns 'master' for amount >= 380000", () => {
    assertEquals(determineTierByAmount(380000), "master");
    assertEquals(determineTierByAmount(400000), "master");
    assertEquals(determineTierByAmount(1000000), "master");
  });

  await t.step("returns 'library' for amount < 380000", () => {
    assertEquals(determineTierByAmount(379999), "library");
    assertEquals(determineTierByAmount(10000), "library");
    assertEquals(determineTierByAmount(1), "library");
  });

  await t.step("returns 'library' for null amount", () => {
    assertEquals(determineTierByAmount(null), "library");
  });

  await t.step("returns 'library' for zero amount", () => {
    assertEquals(determineTierByAmount(0), "library");
  });
});

Deno.test("tier-utils - determineTierByPaymentLink", async (t) => {
  await t.step("returns 'master' for Master Class payment link", () => {
    assertEquals(
      determineTierByPaymentLink(`plink_${MASTER_CLASS_PAYMENT_LINK_PATTERN}`),
      "master",
    );
    assertEquals(
      determineTierByPaymentLink(
        `plink_xxx${MASTER_CLASS_PAYMENT_LINK_PATTERN}yyy`,
      ),
      "master",
    );
  });

  await t.step("returns 'library' for other payment links", () => {
    assertEquals(determineTierByPaymentLink("plink_abc123"), "library");
    assertEquals(determineTierByPaymentLink("plink_library_member"), "library");
  });

  await t.step("returns 'library' for null", () => {
    assertEquals(determineTierByPaymentLink(null), "library");
  });

  await t.step("returns 'library' for empty string", () => {
    assertEquals(determineTierByPaymentLink(""), "library");
  });
});

Deno.test("tier-utils - determineMembershipTier", async (t) => {
  await t.step("returns 'master' if amount qualifies", () => {
    assertEquals(
      determineMembershipTier(MASTER_CLASS_MIN_AMOUNT, null),
      "master",
    );
    assertEquals(
      determineMembershipTier(MASTER_CLASS_MIN_AMOUNT, "plink_other"),
      "master",
    );
  });

  await t.step("returns 'master' if payment link qualifies", () => {
    assertEquals(
      determineMembershipTier(
        1000,
        `plink_${MASTER_CLASS_PAYMENT_LINK_PATTERN}`,
      ),
      "master",
    );
  });

  await t.step("returns 'master' if both qualify", () => {
    assertEquals(
      determineMembershipTier(
        MASTER_CLASS_MIN_AMOUNT,
        `plink_${MASTER_CLASS_PAYMENT_LINK_PATTERN}`,
      ),
      "master",
    );
  });

  await t.step("returns 'library' if neither qualifies", () => {
    assertEquals(determineMembershipTier(1000, "plink_other"), "library");
    assertEquals(determineMembershipTier(null, null), "library");
  });
});

Deno.test("tier-utils - determineStatus", async (t) => {
  await t.step("returns 'inactive' for canceled subscription", () => {
    assertStrictEquals(determineStatus("canceled"), "inactive");
  });

  await t.step("returns 'active' for active subscription", () => {
    assertStrictEquals(determineStatus("active"), "active");
  });

  await t.step("returns 'active' for trialing subscription", () => {
    assertStrictEquals(determineStatus("trialing"), "active");
  });

  await t.step("returns 'active' for past_due subscription", () => {
    assertStrictEquals(determineStatus("past_due"), "active");
  });

  await t.step("returns 'active' for unpaid subscription", () => {
    assertStrictEquals(determineStatus("unpaid"), "active");
  });
});

Deno.test("tier-utils - constants", async (t) => {
  await t.step("MASTER_CLASS_MIN_AMOUNT is 380000", () => {
    assertEquals(MASTER_CLASS_MIN_AMOUNT, 380000);
  });

  await t.step("MASTER_CLASS_PAYMENT_LINK_PATTERN is defined", () => {
    assertEquals(
      typeof MASTER_CLASS_PAYMENT_LINK_PATTERN,
      "string",
    );
    assertEquals(MASTER_CLASS_PAYMENT_LINK_PATTERN.length > 0, true);
  });
});
