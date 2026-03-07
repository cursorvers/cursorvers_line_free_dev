import { assertEquals, assertRejects, assertThrows } from "std-assert";
import {
  classifyRepairOverallStatus,
  ensureGitHubApiOk,
  ManualInterventionRequiredError,
  requireGitHubToken,
} from "./repair-utils.ts";

Deno.test("requireGitHubToken returns configured token", () => {
  assertEquals(
    requireGitHubToken("generate_cards", "demo-token"),
    "demo-token",
  );
});

Deno.test("requireGitHubToken raises manual intervention error when token missing", () => {
  const error = assertThrows(
    () => requireGitHubToken("generate_cards", ""),
    ManualInterventionRequiredError,
  );
  assertEquals(
    error.message,
    "generate_cards: manual intervention required (MANUS_GITHUB_TOKEN/GITHUB_TOKEN not configured)",
  );
});

Deno.test("classifyRepairOverallStatus returns success when every step succeeds", () => {
  assertEquals(classifyRepairOverallStatus(false, 2, 0, 0), "success");
});

Deno.test("classifyRepairOverallStatus returns partial when steps are skipped", () => {
  assertEquals(classifyRepairOverallStatus(false, 0, 0, 3), "partial");
});

Deno.test("classifyRepairOverallStatus returns failed when all steps fail", () => {
  assertEquals(classifyRepairOverallStatus(false, 0, 2, 0), "failed");
});

Deno.test("classifyRepairOverallStatus preserves dry run", () => {
  assertEquals(classifyRepairOverallStatus(true, 0, 2, 0), "dry_run");
});

Deno.test("ensureGitHubApiOk treats GitHub auth/config errors as manual intervention", async () => {
  const error = await assertRejects(
    () =>
      ensureGitHubApiOk(
        "generate_cards",
        new Response("bad credentials", { status: 401 }),
      ),
    ManualInterventionRequiredError,
  );

  assertEquals(
    error.message,
    "generate_cards: manual intervention required (GitHub API 401: bad credentials)",
  );
});

Deno.test("ensureGitHubApiOk throws hard error for retryable server failures", async () => {
  const error = await assertRejects(
    () =>
      ensureGitHubApiOk(
        "redeploy_function",
        new Response("server unavailable", { status: 500 }),
      ),
    Error,
  );

  assertEquals(error.message, "GitHub API error: 500: server unavailable");
});
