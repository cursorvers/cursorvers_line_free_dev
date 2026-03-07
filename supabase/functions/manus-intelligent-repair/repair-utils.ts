export class ManualInterventionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualInterventionRequiredError";
  }
}

export interface GitHubAuthContext {
  token: string;
  tokenSource: "MANUS_GITHUB_TOKEN" | "GITHUB_TOKEN";
  repo: string;
}

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function normalizeGitHubRepoAllowlist(
  raw: string | undefined | null,
  defaults: string[] = [],
): string[] {
  const values = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length > 0) {
    return Array.from(new Set(values));
  }

  return Array.from(new Set(defaults.filter((value) => value.trim().length > 0)));
}

export function resolveGitHubTargetRepo(
  actionLabel: string,
  repo: string | undefined | null,
  allowedRepos: string[] = [],
): string {
  const normalizedRepo = (repo ?? "").trim();

  if (!GITHUB_REPO_PATTERN.test(normalizedRepo)) {
    throw new ManualInterventionRequiredError(
      `${actionLabel}: manual intervention required (invalid GitHub repo target: ${normalizedRepo || "missing"})`,
    );
  }

  if (allowedRepos.length > 0 && !allowedRepos.includes(normalizedRepo)) {
    throw new ManualInterventionRequiredError(
      `${actionLabel}: manual intervention required (GitHub repo target not allowed: ${normalizedRepo})`,
    );
  }

  return normalizedRepo;
}

export function requireGitHubToken(
  actionLabel: string,
  token: string | undefined | null,
): string {
  if (token && token.trim().length > 0) {
    return token;
  }

  throw new ManualInterventionRequiredError(
    `${actionLabel}: manual intervention required (MANUS_GITHUB_TOKEN/GITHUB_TOKEN not configured)`,
  );
}

export function resolveGitHubAuthContext(
  actionLabel: string,
  options: {
    manusToken?: string | undefined | null;
    githubToken?: string | undefined | null;
    repo?: string | undefined | null;
    allowedRepos?: string[] | undefined;
  },
): GitHubAuthContext {
  const manusToken = options.manusToken?.trim();
  const githubToken = options.githubToken?.trim();
  const repo = resolveGitHubTargetRepo(
    actionLabel,
    options.repo,
    options.allowedRepos ?? [],
  );

  if (manusToken && manusToken.length > 0) {
    return {
      token: manusToken,
      tokenSource: "MANUS_GITHUB_TOKEN",
      repo,
    };
  }

  if (githubToken && githubToken.length > 0) {
    return {
      token: githubToken,
      tokenSource: "GITHUB_TOKEN",
      repo,
    };
  }

  return {
    token: requireGitHubToken(actionLabel, undefined),
    tokenSource: "MANUS_GITHUB_TOKEN",
    repo,
  };
}

export async function ensureGitHubApiOk(
  actionLabel: string,
  response: Response,
): Promise<void> {
  if (response.ok) {
    return;
  }

  const rawBody = (await response.text()).trim();
  const body = rawBody.length > 180 ? `${rawBody.slice(0, 177)}...` : rawBody;
  const detail = body ? `: ${body}` : "";

  if ([401, 403, 404, 422].includes(response.status)) {
    throw new ManualInterventionRequiredError(
      `${actionLabel}: manual intervention required (GitHub API ${response.status}${detail})`,
    );
  }

  throw new Error(`GitHub API error: ${response.status}${detail}`);
}

export async function preflightGitHubAccess(
  actionLabel: string,
  context: GitHubAuthContext,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const headers = {
    "Authorization": `Bearer ${context.token}`,
    "Accept": "application/vnd.github+json",
  };

  const rateLimitResponse = await fetchImpl("https://api.github.com/rate_limit", {
    headers,
  });
  await ensureGitHubApiOk(actionLabel, rateLimitResponse);

  const repoResponse = await fetchImpl(
    `https://api.github.com/repos/${context.repo}`,
    { headers },
  );
  await ensureGitHubApiOk(actionLabel, repoResponse);
}

export function isGitHubManualInterventionMessage(
  message: string | undefined | null,
): boolean {
  if (!message) {
    return false;
  }

  return /GitHub API (401|403|404|422)|MANUS_GITHUB_TOKEN|GITHUB_TOKEN|not configured|manual intervention required/i
    .test(message);
}

export function classifyRepairOverallStatus(
  dryRun: boolean,
  successCount: number,
  failedCount: number,
  skippedCount: number,
): "success" | "partial" | "failed" | "dry_run" {
  if (dryRun) {
    return "dry_run";
  }

  if (failedCount === 0 && skippedCount === 0) {
    return "success";
  }

  if (successCount > 0 || skippedCount > 0) {
    return "partial";
  }

  return "failed";
}
