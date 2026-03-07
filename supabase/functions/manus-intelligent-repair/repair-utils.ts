export class ManualInterventionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualInterventionRequiredError";
  }
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
