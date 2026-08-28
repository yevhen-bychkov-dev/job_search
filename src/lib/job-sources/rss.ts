const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeXmlEntities(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, key: string) => {
      if (key.startsWith("#")) {
        const hex = key[1]?.toLocaleLowerCase("en") === "x";
        const codePoint = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(codePoint) && codePoint > 0 ? String.fromCodePoint(codePoint) : entity;
      }
      return XML_ENTITIES[key.toLocaleLowerCase("en")] ?? entity;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export function rssItems(xml: string): string[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1] ?? "");
}

export function rssTag(item: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = item.match(new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, "i"))?.[1] ?? "";
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)?.[1] ?? value;
  return decodeXmlEntities(cdata.trim());
}

export function htmlToText(value: string, maxLength = 30_000): string {
  return decodeXmlEntities(value)
    .replace(/<\s*(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function isoDate(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}
