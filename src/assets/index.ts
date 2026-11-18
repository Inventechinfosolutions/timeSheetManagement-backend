import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolved paths for application and anniversary assets.
 * Evaluates dynamically to support both source (.ts) and compiled (.js in dist) execution.
 */
export const ASSETS_ROOT_DIR =
  [
    path.join(process.cwd(), 'src', 'assets'),
    path.join(process.cwd(), 'assets'),
    path.resolve(__dirname),
  ].find((dir) => fs.existsSync(dir)) ||
  path.join(process.cwd(), 'src', 'assets');

export const ANNIVERSARY_TEMPLATES_DIR =
  [
    path.join(process.cwd(), 'src', 'assets', 'anniversary_templates'),
    path.join(process.cwd(), 'assets', 'anniversary_templates'),
    path.join(__dirname, 'anniversary_templates'),
    path.join(ASSETS_ROOT_DIR, 'anniversary_templates'),
  ].find((dir) => fs.existsSync(dir)) ||
  path.join(process.cwd(), 'src', 'assets', 'anniversary_templates');

/**
 * Resolves an asset path, checking the local `src/assets/` directory first,
 * then falling back to project root `assets/`.
 */
export function resolveAssetPath(filename: string, subfolder = ''): string {
  const candidates = [
    subfolder ? path.join(ANNIVERSARY_TEMPLATES_DIR, filename) : null,
    subfolder
      ? path.join(process.cwd(), 'src', 'assets', subfolder, filename)
      : null,
    subfolder ? path.join(process.cwd(), 'assets', subfolder, filename) : null,
    subfolder ? path.join(ASSETS_ROOT_DIR, subfolder, filename) : null,
    subfolder ? path.join(__dirname, subfolder, filename) : null,
    path.join(process.cwd(), 'src', 'assets', filename),
    path.join(process.cwd(), 'assets', filename),
    path.join(ASSETS_ROOT_DIR, filename),
    path.join(__dirname, filename),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return subfolder
    ? path.join(ANNIVERSARY_TEMPLATES_DIR, filename)
    : path.join(ASSETS_ROOT_DIR, filename);
}

// ── Company Branding Logo Assets ──────────────────────────────────────────────
export const IN_LOGO_PATH = resolveAssetPath('in-logo.png');
export const INVENTECH_WORDMARK_PATH = resolveAssetPath(
  'inventech-wordmark.png',
  'anniversary_templates',
);
export const INVENTECH_LOGO_PATH = INVENTECH_WORDMARK_PATH || IN_LOGO_PATH;
export const WORKSPHERE_LOGO_PATH = resolveAssetPath('worksphere-logo.png');

// ── Master 15 Anniversary Background Template GIF Paths ───────────────────────
export const ANNIVERSARY_TEMPLATE_PATHS: Record<number, string> = {
  1: resolveAssetPath('anniversary-bg.gif', 'anniversary_templates'),
  2: resolveAssetPath('anniversary-bg2.gif', 'anniversary_templates'),
  3: resolveAssetPath('anniversary-bg3.gif', 'anniversary_templates'),
  4: resolveAssetPath('anniversary-bg4.gif', 'anniversary_templates'),
  5: resolveAssetPath('anniversary-bg5.gif', 'anniversary_templates'),
  6: resolveAssetPath('anniversary-bg6.gif', 'anniversary_templates'),
  7: resolveAssetPath('anniversary-bg7.gif', 'anniversary_templates'),
  8: resolveAssetPath('anniversary-bg8.gif', 'anniversary_templates'),
  9: resolveAssetPath('anniversary-bg9.gif', 'anniversary_templates'),
  10: resolveAssetPath('anniversary-bg10.gif', 'anniversary_templates'),
  11: resolveAssetPath('anniversary-bg11.gif', 'anniversary_templates'),
  12: resolveAssetPath('anniversary-bg12.gif', 'anniversary_templates'),
  13: resolveAssetPath('anniversary-bg13.gif', 'anniversary_templates'),
  14: resolveAssetPath('anniversary-bg14.gif', 'anniversary_templates'),
  15: resolveAssetPath('anniversary-bg15.gif', 'anniversary_templates'),
};

/**
 * Returns the resolved file path for an anniversary background template by its 1-based index (1-15).
 */
export function getAnniversaryTemplatePath(templateIndex: number = 1): string {
  const safeIndex = Math.max(1, Math.min(15, Number(templateIndex) || 1));
  return ANNIVERSARY_TEMPLATE_PATHS[safeIndex] || ANNIVERSARY_TEMPLATE_PATHS[1];
}

/**
 * Returns all available numbered anniversary template indices dynamically discovered on disk.
 */
export function getDiscoveredTemplateIndices(): number[] {
  if (!fs.existsSync(ANNIVERSARY_TEMPLATES_DIR)) {
    return [1];
  }

  const indices = fs
    .readdirSync(ANNIVERSARY_TEMPLATES_DIR)
    .map((file) => {
      const match = /^anniversary-bg(\d*)\.gif$/i.exec(file);
      if (!match) return null;
      return match[1] ? parseInt(match[1], 10) : 1;
    })
    .filter((n): n is number => n !== null && n >= 1)
    .sort((a, b) => a - b);

  return indices.length > 0 ? Array.from(new Set(indices)) : [1];
}

/**
 * Loads and returns an asset as a Buffer if it exists, or null.
 */
export function loadAssetBuffer(filePath: string): Buffer | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath);
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

/**
 * Loads and returns an asset as a base64 string if it exists, or null.
 */
export function loadAssetBase64(filePath: string): string | null {
  const buffer = loadAssetBuffer(filePath);
  return buffer ? buffer.toString('base64') : null;
}

// Birthday / festival CDN template registry (UAT)
export * from './templates';
