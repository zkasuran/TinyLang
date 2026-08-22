/**
 * Self-contained digest and base64 primitives.
 *
 * These are implemented in plain TypeScript with no platform dependencies, so
 * the crypto stdlib behaves identically under Node and in the browser.
 *
 * Why not node:crypto? `src/stdlib/crypto.ts` used to `import * as crypto from
 * 'crypto'` and use `Buffer`. Both are Node-only, so bundling the interpreter
 * for the Web IDE failed outright ("Could not resolve \"crypto\"") and the
 * shipped playground/index.html silently went stale. Web Crypto is not an
 * option either: `crypto.subtle.digest` is asynchronous and TinyLang's native
 * functions are synchronous.
 *
 * Verified against the standard test vectors:
 *   sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
 *   md5("hello")    = 5d41402abc4b2a76b9719d911017c592
 */

/** Encode a JS string as UTF-8 bytes. */
export function utf8Encode(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);

    // Combine a surrogate pair into a single code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }

    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

/** Decode UTF-8 bytes back into a JS string. Throws on malformed input. */
export function utf8Decode(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let code: number;
    let extra: number;

    if (b < 0x80) {
      code = b;
      extra = 0;
    } else if ((b & 0xe0) === 0xc0) {
      code = b & 0x1f;
      extra = 1;
    } else if ((b & 0xf0) === 0xe0) {
      code = b & 0x0f;
      extra = 2;
    } else if ((b & 0xf8) === 0xf0) {
      code = b & 0x07;
      extra = 3;
    } else {
      throw new Error('invalid UTF-8: unexpected continuation byte');
    }

    if (i + extra >= bytes.length + (extra === 0 ? 1 : 0) && extra > 0) {
      throw new Error('invalid UTF-8: truncated sequence');
    }
    for (let k = 1; k <= extra; k++) {
      const cont = bytes[i + k];
      if (cont === undefined || (cont & 0xc0) !== 0x80) {
        throw new Error('invalid UTF-8: truncated sequence');
      }
      code = (code << 6) | (cont & 0x3f);
    }

    i += extra + 1;

    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64-encode a string, UTF-8 first. */
export function base64Encode(input: string): string {
  const bytes = utf8Encode(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 0x3f];
  }
  return out;
}

/** Base64-decode to a string. Throws on invalid input rather than guessing. */
export function base64Decode(input: string): string {
  const cleaned = input.replace(/[\r\n\s]/g, '');
  if (cleaned.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(cleaned)) {
    throw new Error('invalid base64 input');
  }

  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 4) {
    const c = [0, 1, 2, 3].map((k) => {
      const ch = cleaned[i + k];
      return ch === '=' ? -1 : B64.indexOf(ch);
    });
    if (c[0] < 0 || c[1] < 0) {
      throw new Error('invalid base64 input');
    }
    bytes.push((c[0] << 2) | (c[1] >> 4));
    if (c[2] >= 0) bytes.push(((c[1] & 0x0f) << 4) | (c[2] >> 2));
    if (c[3] >= 0) bytes.push(((c[2] & 0x03) << 6) | c[3]);
  }
  return utf8Decode(bytes);
}

function toHex(words: number[]): string {
  let out = '';
  for (const w of words) {
    out += (w >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** SHA-256, returning lowercase hex. */
export function sha256(input: string): string {
  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;

  // Pad: 0x80, then zeros, then a 64-bit big-endian length.
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  bytes.push(
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff
  );

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Array<number>(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] =
        ((bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;

      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  return toHex(h);
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000)
);

/** MD5, returning lowercase hex. Provided for parity, not for security. */
export function md5(input: string): string {
  const bytes = utf8Encode(input);
  const bitLen = bytes.length * 8;

  // Pad: 0x80, then zeros, then a 64-bit little-endian length.
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const lo = bitLen >>> 0;
  const hi = Math.floor(bitLen / 0x100000000);
  bytes.push(
    lo & 0xff, (lo >>> 8) & 0xff, (lo >>> 16) & 0xff, (lo >>> 24) & 0xff,
    hi & 0xff, (hi >>> 8) & 0xff, (hi >>> 16) & 0xff, (hi >>> 24) & 0xff
  );

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n));
  const m = new Array<number>(16);

  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      m[i] =
        (bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24)) >>> 0;
    }

    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = (a + f + MD5_K[i] + m[g]) >>> 0;
      b = (b + rotl(sum, MD5_S[i])) >>> 0;
      a = tmp;
    }

    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }

  // MD5 digests are little-endian per word.
  const leHex = (x: number): string =>
    [x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  return leHex(a0) + leHex(b0) + leHex(c0) + leHex(d0);
}

/**
 * A RFC 4122 version 4 UUID.
 *
 * Prefers the platform CSPRNG (present as `globalThis.crypto` in modern Node
 * and every browser) and falls back to Math.random only where neither exists,
 * so the function never simply fails.
 */
export function randomUUID(): string {
  // Typed structurally rather than as the DOM `Crypto` interface, which is not
  // in scope for a Node-targeted tsconfig.
  const g = globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (array: Uint8Array) => Uint8Array;
    };
  };

  if (typeof g.crypto?.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof g.crypto?.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
