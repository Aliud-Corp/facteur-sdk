/**
 * A six-digit code, computed the way an authenticator app would.
 *
 * It sits in the SDK for one reason: a suite that can receive the verification email
 * still cannot walk past the second factor, and the code is the one thing it cannot ask
 * us for — we never see it. Twenty lines of RFC 6238 over `node:crypto` close that gap,
 * and the alternative a team reaches for otherwise is a phone in a drawer.
 *
 * Duplicated rather than imported from elsewhere: a published package carries its own
 * twenty lines rather than a dependency, and RFC 6238 gives them no reason to drift.
 *
 * SHA-1, six digits, a thirty-second step. Not a preference — the defaults of every
 * authenticator application, and what a login form expects.
 */

import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 as RFC 4648, which is how a secret travels inside an `otpauth://` URI. */
function decodeBase32(input) {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];

  for (const character of clean) {
    const index = BASE32.indexOf(character);
    if (index === -1) throw new TypeError(`not a base32 secret: ${character}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(out);
}

/**
 * The secret out of an `otpauth://` URI, which is what an enrolment screen hands over.
 *
 * Parsed with `URL` rather than split by hand: the label segment carries a colon and a
 * percent-encoded issuer, and a split mangles both.
 */
export function secretFromUri(uri) {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new TypeError(`no secret in ${uri}`);
  return secret;
}

/**
 * The code for a moment. `at` is injectable so a test can prove the step boundary
 * instead of waiting thirty seconds to meet it.
 */
export function totp(secret, at = Date.now()) {
  const counter = Math.floor(at / 1000 / 30);

  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter % 2 ** 32, 4);

  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 1_000_000).padStart(6, '0');
}
