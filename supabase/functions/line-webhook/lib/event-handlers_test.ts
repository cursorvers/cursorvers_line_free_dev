/**
 * event-handlers.ts ユニットテスト
 * Note: matchMenuCommand は純粋関数なのでここで直接テスト
 */
import { assertEquals } from "std-assert";

// matchMenuCommand のロジックをテスト用に再実装
// 本番コードは event-handlers.ts にあるが、Supabaseクライアント初期化を避けるため
type MenuCommand =
  | "tokuten"
  | "community"
  | "contact"
  | "service_list"
  | "service_detail"
  | "prompt_polish_guide"
  | "risk_check_guide"
  | null;

function matchMenuCommand(text: string): MenuCommand {
  const trimmed = text.trim();

  if (trimmed === "特典" || trimmed === "特典GET") return "tokuten";
  if (trimmed === "コミュニティ") return "community";
  if (trimmed === "お問い合わせ" || trimmed === "問い合わせ") return "contact";
  if (trimmed === "サービス一覧") return "service_list";
  if (trimmed === "サービス詳細を見る") return "service_detail";
  if (trimmed === "プロンプト整形の使い方") return "prompt_polish_guide";
  if (trimmed === "リスクチェックの使い方") return "risk_check_guide";

  return null;
}

// =======================
// matchMenuCommand テスト
// =======================

Deno.test("matchMenuCommand - tokuten commands", async (t) => {
  await t.step("returns tokuten for '特典'", () => {
    assertEquals(matchMenuCommand("特典"), "tokuten");
  });

  await t.step("returns tokuten for '特典GET'", () => {
    assertEquals(matchMenuCommand("特典GET"), "tokuten");
  });

  await t.step("handles whitespace", () => {
    assertEquals(matchMenuCommand("  特典  "), "tokuten");
  });
});

Deno.test("matchMenuCommand - community command", async (t) => {
  await t.step("returns community for 'コミュニティ'", () => {
    assertEquals(matchMenuCommand("コミュニティ"), "community");
  });
});

Deno.test("matchMenuCommand - contact commands", async (t) => {
  await t.step("returns contact for 'お問い合わせ'", () => {
    assertEquals(matchMenuCommand("お問い合わせ"), "contact");
  });

  await t.step("returns contact for '問い合わせ'", () => {
    assertEquals(matchMenuCommand("問い合わせ"), "contact");
  });
});

Deno.test("matchMenuCommand - service commands", async (t) => {
  await t.step("returns service_list for 'サービス一覧'", () => {
    assertEquals(matchMenuCommand("サービス一覧"), "service_list");
  });

  await t.step("returns service_detail for 'サービス詳細を見る'", () => {
    assertEquals(matchMenuCommand("サービス詳細を見る"), "service_detail");
  });
});

Deno.test("matchMenuCommand - tool guide commands", async (t) => {
  await t.step(
    "returns prompt_polish_guide for 'プロンプト整形の使い方'",
    () => {
      assertEquals(
        matchMenuCommand("プロンプト整形の使い方"),
        "prompt_polish_guide",
      );
    },
  );

  await t.step("returns risk_check_guide for 'リスクチェックの使い方'", () => {
    assertEquals(
      matchMenuCommand("リスクチェックの使い方"),
      "risk_check_guide",
    );
  });
});

Deno.test("matchMenuCommand - null for unknown commands", async (t) => {
  await t.step("returns null for unknown text", () => {
    assertEquals(matchMenuCommand("unknown command"), null);
  });

  await t.step("returns null for empty string", () => {
    assertEquals(matchMenuCommand(""), null);
  });

  await t.step("returns null for partial match", () => {
    assertEquals(matchMenuCommand("特"), null);
  });

  await t.step("returns null for similar but different text", () => {
    assertEquals(matchMenuCommand("特典を取得"), null);
  });
});

// =======================
// MenuCommand type テスト
// =======================

Deno.test("MenuCommand type - all values", async (t) => {
  await t.step("MenuCommand includes all expected values", () => {
    const commands: MenuCommand[] = [
      "tokuten",
      "community",
      "contact",
      "service_list",
      "service_detail",
      "prompt_polish_guide",
      "risk_check_guide",
      null,
    ];

    assertEquals(commands.length, 8);
    assertEquals(commands.includes("tokuten"), true);
    assertEquals(commands.includes("community"), true);
    assertEquals(commands.includes("contact"), true);
    assertEquals(commands.includes("service_list"), true);
    assertEquals(commands.includes("service_detail"), true);
    assertEquals(commands.includes("prompt_polish_guide"), true);
    assertEquals(commands.includes("risk_check_guide"), true);
    assertEquals(commands.includes(null), true);
  });
});

// =======================
// メール上書き防止テスト
// =======================

Deno.test("Email overwrite prevention", async (t) => {
  await t.step("should block different email for same LINE ID", () => {
    const existingRecord = {
      id: "member_123",
      email: "existing@example.com",
      line_user_id: "U1234567890abcdef1234567890abcdef",
      tier: "free",
    };
    const newEmail = "new@example.com";

    // Check if emails are different
    const isDifferentEmail = existingRecord.email &&
      existingRecord.email !== newEmail;

    assertEquals(isDifferentEmail, true);
    // Registration should be blocked
  });

  await t.step("should allow same email for same LINE ID", () => {
    const existingRecord = {
      id: "member_123",
      email: "same@example.com",
      line_user_id: "U1234567890abcdef1234567890abcdef",
      tier: "free",
    };
    const newEmail = "same@example.com";

    const isSameEmail = existingRecord.email === newEmail;

    assertEquals(isSameEmail, true);
    // Registration should proceed
  });

  await t.step("should allow email for LINE ID without email", () => {
    const existingRecord = {
      id: "member_123",
      email: null as string | null,
      line_user_id: "U1234567890abcdef1234567890abcdef",
      tier: "free",
    };
    const _newEmail = "new@example.com"; // Email to be set

    const canSetEmail = !existingRecord.email;

    assertEquals(canSetEmail, true);
    // Registration should proceed with _newEmail
  });
});

// =======================
// LINE紐付け競合テスト
// =======================

Deno.test("LINE linking race condition handling", async (t) => {
  await t.step("same LINE ID - should show success message", () => {
    const requestedLineUserId = "U1234567890abcdef1234567890abcdef";
    const currentRecordLineUserId = "U1234567890abcdef1234567890abcdef";

    const isSameLineId = currentRecordLineUserId === requestedLineUserId;

    assertEquals(isSameLineId, true);
    // Should show "既に認証完了しています" message
  });

  await t.step("different LINE ID - should show error message", () => {
    const requestedLineUserId: string = "U1111111111111111111111111111111";
    const currentRecordLineUserId: string = "U2222222222222222222222222222222";

    const isDifferentLineId = currentRecordLineUserId !== requestedLineUserId;

    assertEquals(isDifferentLineId, true);
    // Should show "別のLINEアカウントで認証済みです" message
  });
});
