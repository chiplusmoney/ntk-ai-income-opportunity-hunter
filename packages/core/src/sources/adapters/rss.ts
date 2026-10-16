/**
 * Tiny, dependency-free RSS/Atom reader.
 *
 * Why not DOMParser: the same adapters run in the browser, in a Cloudflare
 * Worker and in Node, and only the browser has DOMParser. A bounded regex
 * scanner keeps one implementation everywhere.
 *
 * The parser is deliberately forgiving about formatting and strict about
 * honesty: a missing element yields `null`, never an empty-string stand-in.
 */

export interface RssItem {
  title: string | null;
  link: string | null;
  description: string | null;
  pubDate: string | null;
  guid: string | null;
  categories: string[];
}

export interface RssChannel {
  title: string | null;
  link: string | null;
  description: string | null;
  items: RssItem[];
}

function decodeEntities(value: string): string {
  const point=(v:number)=>Number.isInteger(v)&&v>=0&&v<=0x10ffff?String.fromCodePoint(v):'�';
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => point(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => point(Number.parseInt(dec, 10)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function unwrapCdata(value: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(value);
  return cdata?.[1] ?? value;
}

function readTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i');
  const match = re.exec(block);
  if (!match?.[1]) return null;
  const text = decodeEntities(unwrapCdata(match[1])).trim();
  return text.length ? text : null;
}

function readAllTags(block: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const text = decodeEntities(unwrapCdata(match[1] ?? '')).trim();
    if (text) out.push(text);
  }
  return out;
}

/** Parse an RSS 2.0 document. Atom `<entry>` elements are not supported. */
export function parseRss(xml: string, maxItems = 200): RssChannel {
  const channelBlock = /<channel(?:\s[^>]*)?>([\s\S]*?)<\/channel>/i.exec(xml)?.[1] ?? xml;

  // Items are sliced out first so a tag inside one item can never leak into another.
  const itemBlocks: string[] = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(channelBlock)) !== null) {
    if (match[1]) itemBlocks.push(match[1]);
    if (itemBlocks.length >= maxItems) break;
  }

  const channelWithoutItems = channelBlock.replace(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi, '');

  const items: RssItem[] = itemBlocks.map(block => ({
    title: readTag(block, 'title'),
    link: readTag(block, 'link'),
    description: readTag(block, 'description'),
    pubDate: readTag(block, 'pubDate') ?? readTag(block, 'dc:date'),
    guid: readTag(block, 'guid'),
    categories: readAllTags(block, 'category')
  }));

  return {
    title: readTag(channelWithoutItems, 'title'),
    link: readTag(channelWithoutItems, 'link'),
    description: readTag(channelWithoutItems, 'description'),
    items
  };
}

export const __internal = { decodeEntities, readTag };
