/**
 * Strips HTML tags, styles, scripts, base64 images, and URL-encoded metadata
 * to produce a lightweight plain-text snippet for note listing/inbox APIs.
 * This prevents multi-megabyte payloads in list endpoints while preserving
 * fast searches and clean snippet previews.
 */
export function cleanDescriptionSnippet(html?: string, maxLength = 300): string {
  if (!html || !html.trim()) return '';
  let str = html;

  // Handle URL-encoded JSON payloads (e.g. from excel extracts: %7B%22fileName...)
  if (str.startsWith('%7B') || str.includes('%22fileName%22') || str.includes('%22sheetName%22')) {
    try {
      const decoded = decodeURIComponent(str);
      if (decoded.startsWith('{') && decoded.includes('fileName')) {
        const parsed = JSON.parse(decoded);
        if (parsed.fileName) {
          return `[Spreadsheet: ${parsed.fileName}]`;
        }
      }
    } catch {
      str = str.replace(/%[0-9a-fA-F]{2}/g, ' ');
    }
  }

  return str
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/data:image\/[^;]+;base64,[^"'\s>]+/gi, ' ')
    .replace(/<button[^>]*class="[^"]*row-attach-[^"]*"[^>]*>[\s\S]*?<\/button>/gi, ' ')
    .replace(/<span[^>]*class="[^"]*row-attach-[^"]*"[^>]*>[\s\S]*?<\/span>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
