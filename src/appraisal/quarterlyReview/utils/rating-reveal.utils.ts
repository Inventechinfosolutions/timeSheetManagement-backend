import * as crypto from 'crypto';

const REVEAL_SECRET = process.env.JWT_SECRET || 'worksphere_reveal_secret_key_2026';

export function createRevealToken(
  userId: string,
  loginId: string,
  reviewId: number | string,
  expiresAt: number,
): string {
  const payload = {
    userId,
    loginId,
    reviewId: String(reviewId),
    expiresAt,
  };
  const payloadStr = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', REVEAL_SECRET)
    .update(`${loginId}:${reviewId}:${expiresAt}`)
    .digest('hex');
  return Buffer.from(JSON.stringify({ p: payloadStr, s: signature })).toString('base64');
}

export function isRevealTokenValid(
  token: string | undefined | null,
  reviewId: number | string,
  loginId?: string,
): boolean {
  if (!token || typeof token !== 'string') return false;
  try {
    const raw = Buffer.from(token, 'base64').toString('utf8');
    const { p, s } = JSON.parse(raw);
    const payload = JSON.parse(p);
    if (!payload || !payload.expiresAt || !s) return false;
    if (Date.now() > payload.expiresAt) return false;
    if (String(payload.reviewId) !== String(reviewId)) return false;
    if (loginId && payload.loginId && payload.loginId.toLowerCase() !== loginId.toLowerCase()) {
      return false;
    }
    const expectedSig = crypto
      .createHmac('sha256', REVEAL_SECRET)
      .update(`${payload.loginId}:${payload.reviewId}:${payload.expiresAt}`)
      .digest('hex');
    return s === expectedSig;
  } catch {
    return false;
  }
}
