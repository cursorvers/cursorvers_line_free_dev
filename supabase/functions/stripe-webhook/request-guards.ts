export function isHealthProbeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

export function shouldNotifyMissingSignature(
  alertFlag: string | undefined,
): boolean {
  return alertFlag === "true";
}
