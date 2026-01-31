export function normalizeGeweMessagingTarget(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/^gewe:(group:|user:)?/i, "")
    .replace(/^wechat:(group:|user:)?/i, "")
    .replace(/^wx:/i, "")
    .trim();
}

export function looksLikeGeweTargetId(id: string): boolean {
  const trimmed = id?.trim();
  if (!trimmed) return false;
  if (/^gewe:/i.test(trimmed)) return true;
  if (/@chatroom$/i.test(trimmed)) return true;
  if (/^wxid_/i.test(trimmed)) return true;
  if (/^gh_/i.test(trimmed)) return true;
  return trimmed.length >= 3;
}
