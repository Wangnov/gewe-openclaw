function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
    })
    .replace(/&#(\d+);/g, (_match, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
    });
}

function stripCdata(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")) {
    return trimmed.slice(9, -3);
  }
  return trimmed;
}

export function extractXmlTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = re.exec(xml);
  if (!match) return undefined;
  const raw = stripCdata(match[1]);
  return decodeEntities(raw);
}

export function extractAppMsgType(xml: string): number | undefined {
  const match = /<appmsg[\s\S]*?<type>(\d+)<\/type>/i.exec(xml);
  if (!match?.[1]) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
}

export function extractLinkDetails(xml: string): {
  title?: string;
  desc?: string;
  linkUrl?: string;
  thumbUrl?: string;
} {
  return {
    title: extractXmlTag(xml, "title"),
    desc: extractXmlTag(xml, "des"),
    linkUrl: extractXmlTag(xml, "url"),
    thumbUrl: extractXmlTag(xml, "thumburl"),
  };
}

export function extractFileName(xml: string): string | undefined {
  const title = extractXmlTag(xml, "title");
  if (title) return title.trim();
  return undefined;
}
