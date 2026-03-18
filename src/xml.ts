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

export type GeweQuoteDetails = {
  title?: string;
  referType?: number;
  svrid?: string;
  fromUsr?: string;
  chatUsr?: string;
  displayName?: string;
  content?: string;
  msgSource?: string;
};

function parseOptionalNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapQuoteTypeLabel(type?: number): string {
  switch (type) {
    case 1:
      return "文本";
    case 3:
      return "图片";
    case 6:
      return "文件";
    case 43:
      return "视频";
    case 49:
      return "卡片";
    default:
      return "消息";
  }
}

function looksLikeXmlFragment(value?: string): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return trimmed.startsWith("<") && trimmed.endsWith(">");
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

export function extractQuoteDetails(xml: string): GeweQuoteDetails | undefined {
  if (!/<refermsg>/i.test(xml)) return undefined;
  const referXml = extractXmlTag(xml, "refermsg");
  if (!referXml) return undefined;
  const details = {
    title: extractXmlTag(xml, "title"),
    referType: parseOptionalNumber(extractXmlTag(referXml, "type")),
    svrid: extractXmlTag(referXml, "svrid"),
    fromUsr: extractXmlTag(referXml, "fromusr"),
    chatUsr: extractXmlTag(referXml, "chatusr"),
    displayName: extractXmlTag(referXml, "displayname"),
    content: extractXmlTag(referXml, "content"),
    msgSource: extractXmlTag(referXml, "msgsource"),
  };
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== undefined),
  ) as GeweQuoteDetails;
}

export function extractQuoteSummary(xml: string):
  | {
      body: string;
      quoteLabel: string;
    }
  | undefined {
  const details = extractQuoteDetails(xml);
  if (!details) return undefined;
  const quoteLabel = mapQuoteTypeLabel(details.referType);
  const parts = [];
  const referContent = details.content?.trim();
  const safeReferContent =
    referContent && !looksLikeXmlFragment(referContent) && !/<img[\s>]/i.test(referContent)
      ? referContent
      : undefined;
  parts.push(
    safeReferContent ? `[引用:${quoteLabel}] ${safeReferContent}` : `[引用:${quoteLabel}]`,
  );
  if (details.title?.trim()) {
    parts.push(details.title.trim());
  }
  return {
    body: parts.join("\n").trim(),
    quoteLabel,
  };
}
