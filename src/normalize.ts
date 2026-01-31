export function normalizeGeweMessagingTarget(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) return null;
  const prefix = /^(gewe-openclaw|gewe|wechat|wx):(group:|user:)?/i;
  return trimmed
    .replace(prefix, "")
    .trim();
}

export function looksLikeGeweTargetId(id: string): boolean {
  const trimmed = id?.trim();
  if (!trimmed) return false;
  if (/^(gewe-openclaw|gewe):/i.test(trimmed)) return true;
  if (/@chatroom$/i.test(trimmed)) return true;
  if (/^wxid_/i.test(trimmed)) return true;
  if (/^gh_/i.test(trimmed)) return true;
  return trimmed.length >= 3;
}
