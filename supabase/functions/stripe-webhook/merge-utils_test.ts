/**
 * merge-utils.ts テスト
 * 孤児レコード検出とマージ判定ロジックのテスト
 */
import { assertEquals } from "std-assert";
import {
  canMergeLineId,
  findOrphanRecords,
  isDuplicateByLineId,
  isOrphanRecord,
  isPaidTier,
  type MemberRecord,
} from "./merge-utils.ts";

Deno.test("merge-utils - isOrphanRecord", async (t) => {
  await t.step(
    "returns true for orphan record (email=null, line_user_id exists, tier=free)",
    () => {
      const record: MemberRecord = {
        id: "1",
        email: null,
        line_user_id: "U1234567890",
        tier: "free",
      };
      assertEquals(isOrphanRecord(record), true);
    },
  );

  await t.step("returns false when email exists", () => {
    const record: MemberRecord = {
      id: "1",
      email: "test@example.com",
      line_user_id: "U1234567890",
      tier: "free",
    };
    assertEquals(isOrphanRecord(record), false);
  });

  await t.step("returns false when line_user_id is null", () => {
    const record: MemberRecord = {
      id: "1",
      email: null,
      line_user_id: null,
      tier: "free",
    };
    assertEquals(isOrphanRecord(record), false);
  });

  await t.step("returns false when tier is library", () => {
    const record: MemberRecord = {
      id: "1",
      email: null,
      line_user_id: "U1234567890",
      tier: "library",
    };
    assertEquals(isOrphanRecord(record), false);
  });

  await t.step("returns false when tier is master", () => {
    const record: MemberRecord = {
      id: "1",
      email: null,
      line_user_id: "U1234567890",
      tier: "master",
    };
    assertEquals(isOrphanRecord(record), false);
  });

  await t.step("returns false when tier is null", () => {
    const record: MemberRecord = {
      id: "1",
      email: null,
      line_user_id: "U1234567890",
      tier: null,
    };
    assertEquals(isOrphanRecord(record), false);
  });
});

Deno.test("merge-utils - canMergeLineId", async (t) => {
  await t.step(
    "returns true when paid record has no line_user_id and orphan has one",
    () => {
      const paidRecord: MemberRecord = {
        id: "1",
        email: "paid@example.com",
        line_user_id: null,
        tier: "library",
      };
      const orphanRecord: MemberRecord = {
        id: "2",
        email: null,
        line_user_id: "U1234567890",
        tier: "free",
      };
      assertEquals(canMergeLineId(paidRecord, orphanRecord), true);
    },
  );

  await t.step(
    "returns false when paid record already has line_user_id",
    () => {
      const paidRecord: MemberRecord = {
        id: "1",
        email: "paid@example.com",
        line_user_id: "U9999999999",
        tier: "library",
      };
      const orphanRecord: MemberRecord = {
        id: "2",
        email: null,
        line_user_id: "U1234567890",
        tier: "free",
      };
      assertEquals(canMergeLineId(paidRecord, orphanRecord), false);
    },
  );

  await t.step("returns false when orphan has no line_user_id", () => {
    const paidRecord: MemberRecord = {
      id: "1",
      email: "paid@example.com",
      line_user_id: null,
      tier: "library",
    };
    const orphanRecord: MemberRecord = {
      id: "2",
      email: null,
      line_user_id: null,
      tier: "free",
    };
    assertEquals(canMergeLineId(paidRecord, orphanRecord), false);
  });

  await t.step(
    "returns false when orphan is not actually orphan (has email)",
    () => {
      const paidRecord: MemberRecord = {
        id: "1",
        email: "paid@example.com",
        line_user_id: null,
        tier: "library",
      };
      const notOrphan: MemberRecord = {
        id: "2",
        email: "other@example.com",
        line_user_id: "U1234567890",
        tier: "free",
      };
      assertEquals(canMergeLineId(paidRecord, notOrphan), false);
    },
  );

  await t.step("returns false when orphan is paid tier", () => {
    const paidRecord: MemberRecord = {
      id: "1",
      email: "paid@example.com",
      line_user_id: null,
      tier: "library",
    };
    const paidOrphan: MemberRecord = {
      id: "2",
      email: null,
      line_user_id: "U1234567890",
      tier: "master",
    };
    assertEquals(canMergeLineId(paidRecord, paidOrphan), false);
  });
});

Deno.test("merge-utils - isDuplicateByLineId", async (t) => {
  await t.step(
    "returns true when multiple records have same line_user_id",
    () => {
      const records: MemberRecord[] = [
        {
          id: "1",
          email: "a@example.com",
          line_user_id: "U123",
          tier: "library",
        },
        { id: "2", email: null, line_user_id: "U123", tier: "free" },
      ];
      assertEquals(isDuplicateByLineId(records, "U123"), true);
    },
  );

  await t.step(
    "returns false when only one record has the line_user_id",
    () => {
      const records: MemberRecord[] = [
        {
          id: "1",
          email: "a@example.com",
          line_user_id: "U123",
          tier: "library",
        },
        { id: "2", email: null, line_user_id: "U456", tier: "free" },
      ];
      assertEquals(isDuplicateByLineId(records, "U123"), false);
    },
  );

  await t.step("returns false when no records match", () => {
    const records: MemberRecord[] = [
      {
        id: "1",
        email: "a@example.com",
        line_user_id: "U123",
        tier: "library",
      },
      { id: "2", email: null, line_user_id: "U456", tier: "free" },
    ];
    assertEquals(isDuplicateByLineId(records, "U999"), false);
  });

  await t.step("returns false for empty array", () => {
    assertEquals(isDuplicateByLineId([], "U123"), false);
  });

  await t.step("returns true for 3+ matching records", () => {
    const records: MemberRecord[] = [
      {
        id: "1",
        email: "a@example.com",
        line_user_id: "U123",
        tier: "library",
      },
      { id: "2", email: null, line_user_id: "U123", tier: "free" },
      { id: "3", email: "b@example.com", line_user_id: "U123", tier: "master" },
    ];
    assertEquals(isDuplicateByLineId(records, "U123"), true);
  });
});

Deno.test("merge-utils - findOrphanRecords", async (t) => {
  await t.step("finds orphan records", () => {
    const records: MemberRecord[] = [
      {
        id: "1",
        email: "a@example.com",
        line_user_id: "U123",
        tier: "library",
      },
      { id: "2", email: null, line_user_id: "U456", tier: "free" },
      { id: "3", email: null, line_user_id: "U789", tier: "free" },
    ];
    const orphans = findOrphanRecords(records);
    assertEquals(orphans.length, 2);
    assertEquals(orphans[0].id, "2");
    assertEquals(orphans[1].id, "3");
  });

  await t.step("returns empty array when no orphans", () => {
    const records: MemberRecord[] = [
      {
        id: "1",
        email: "a@example.com",
        line_user_id: "U123",
        tier: "library",
      },
      { id: "2", email: "b@example.com", line_user_id: "U456", tier: "free" },
    ];
    const orphans = findOrphanRecords(records);
    assertEquals(orphans.length, 0);
  });

  await t.step("excludes paid tier orphan-like records", () => {
    const records: MemberRecord[] = [
      { id: "1", email: null, line_user_id: "U123", tier: "library" },
      { id: "2", email: null, line_user_id: "U456", tier: "master" },
      { id: "3", email: null, line_user_id: "U789", tier: "free" },
    ];
    const orphans = findOrphanRecords(records);
    assertEquals(orphans.length, 1);
    assertEquals(orphans[0].id, "3");
  });

  await t.step("returns empty for empty input", () => {
    assertEquals(findOrphanRecords([]).length, 0);
  });
});

Deno.test("merge-utils - isPaidTier", async (t) => {
  await t.step("returns true for library tier", () => {
    assertEquals(isPaidTier("library"), true);
  });

  await t.step("returns true for master tier", () => {
    assertEquals(isPaidTier("master"), true);
  });

  await t.step("returns false for free tier", () => {
    assertEquals(isPaidTier("free"), false);
  });

  await t.step("returns false for null tier", () => {
    assertEquals(isPaidTier(null), false);
  });

  await t.step("returns false for unknown tier", () => {
    assertEquals(isPaidTier("premium"), false);
  });

  await t.step("returns false for empty string", () => {
    assertEquals(isPaidTier(""), false);
  });
});
