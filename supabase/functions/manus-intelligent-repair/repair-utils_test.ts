import { assertEquals, assertRejects, assertThrows } from "std-assert";
import {
  classifyRepairOverallStatus,
  ensureGitHubApiOk,
  isGitHubManualInterventionMessage,
  ManualInterventionRequiredError,
  normalizeGitHubRepoAllowlist,
  preflightGitHubAccess,
  requireGitHubToken,
  resolveGitHubAuthContext,
  resolveGitHubTargetRepo,
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

Deno.test("normalizeGitHubRepoAllowlist uses defaults when env is empty", () => {
  assertEquals(
    normalizeGitHubRepoAllowlist("", ["cursorvers/cursorvers_line_free_dev"]),
    ["cursorvers/cursorvers_line_free_dev"],
  );
});

Deno.test("resolveGitHubTargetRepo rejects disallowed repo", () => {
  const error = assertThrows(
    () =>
      resolveGitHubTargetRepo(
        "generate_cards",
        "cursorvers/other-repo",
        ["cursorvers/cursorvers_line_free_dev"],
      ),
    ManualInterventionRequiredError,
  );

  assertEquals(
    error.message,
    "generate_cards: manual intervention required (GitHub repo target not allowed: cursorvers/other-repo)",
  );
});

Deno.test("resolveGitHubAuthContext prefers MANUS_GITHUB_TOKEN and preserves repo", () => {
  assertEquals(
    resolveGitHubAuthContext("redeploy_function", {
      manusToken: "manus-token",
      githubToken: "fallback-token",
      repo: "cursorvers/cursorvers_line_free_dev",
      allowedRepos: ["cursorvers/cursorvers_line_free_dev"],
    }),
    {
      token: "manus-token",
      tokenSource: "MANUS_GITHUB_TOKEN",
      repo: "cursorvers/cursorvers_line_free_dev",
    },
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

Deno.test("preflightGitHubAccess checks rate limit and repo reachability", async () => {
  const seen: string[] = [];
  const fetchImpl: typeof fetch = (input) => {
    seen.push(String(input));
    return Promise.resolve(new Response("{}", { status: 200 }));
  };

  await preflightGitHubAccess(
    "generate_cards",
    {
      token: "demo-token",
      tokenSource: "MANUS_GITHUB_TOKEN",
      repo: "cursorvers/cursorvers_line_free_dev",
    },
    fetchImpl,
  );

  assertEquals(seen, [
    "https://api.github.com/rate_limit",
    "https://api.github.com/repos/cursorvers/cursorvers_line_free_dev",
  ]);
});

Deno.test("isGitHubManualInterventionMessage matches auth/config failures", () => {
  assertEquals(
    isGitHubManualInterventionMessage(
      "redeploy_function: manual intervention required (GitHub API 403: forbidden)",
    ),
    true,
  );
  assertEquals(isGitHubManualInterventionMessage("other runtime issue"), false);
});
