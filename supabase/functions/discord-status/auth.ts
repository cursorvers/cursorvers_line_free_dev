export interface DiscordStatusAuthConfig {
  adminSecret?: string;
}

export function verifyDiscordStatusAuth(
  req: Request,
  config: DiscordStatusAuthConfig,
): boolean {
  const adminSecret = (config.adminSecret ?? "").trim();

  const adminHeader = req.headers.get("x-admin-secret") ?? "";
  if (adminSecret && adminHeader === adminSecret) {
    return true;
  }

  return false;
}

export function discordStatusUnauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}
