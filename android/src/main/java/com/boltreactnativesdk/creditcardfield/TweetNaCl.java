package com.boltreactnativesdk.creditcardfield;

import java.security.SecureRandom;

/**
 * Minimal Java port of TweetNaCl (https://tweetnacl.cr.yp.to/).
 *
 * Implements only the functions required by BoltTokenizer:
 *   - crypto_box_keypair
 *   - crypto_box  (Curve25519-XSalsa20-Poly1305 authenticated encryption)
 *   - crypto_box_open
 *
 * The Curve25519 Montgomery ladder, XSalsa20 stream cipher, HSalsa20
 * key derivation, and Poly1305 MAC are each ported directly from the
 * TweetNaCl C reference to ensure byte-for-byte wire compatibility with
 * the Bolt tokenizer service (tweetnacl-js / libsodium).
 *
 * Padding conventions (same as NaCl C library):
 *   BOX_ZEROBYTES    = 32  — required zero-prefix on crypto_box plaintext
 *   BOX_BOXZEROBYTES = 16  — zero-prefix in crypto_box ciphertext output
 *   BOX_NONCE_BYTES  = 24  — XSalsa20 nonce length
 *   BOX_OVERHEAD     = 16  — Poly1305 MAC length
 */
public final class TweetNaCl {

    public static final int BOX_PUBLIC_KEY_BYTES  = 32;
    public static final int BOX_SECRET_KEY_BYTES  = 32;
    public static final int BOX_NONCE_BYTES       = 24;
    public static final int BOX_OVERHEAD_BYTES    = 16;
    public static final int BOX_ZEROBYTES         = 32;
    public static final int BOX_BOXZEROBYTES      = 16;

    private static final SecureRandom RNG = new SecureRandom();

    private TweetNaCl() {}

    // =========================================================================
    // Public API
    // =========================================================================

    /** Generate a Curve25519 key pair. pk and sk must each be 32 bytes. */
    public static int crypto_box_keypair(byte[] pk, byte[] sk) {
        RNG.nextBytes(sk);
        byte[] base = new byte[32];
        base[0] = 9;
        return scalarmult(pk, sk, base);
    }

    /**
     * NaCl crypto_box (encrypt).
     * {@code m} must start with BOX_ZEROBYTES (32) zero bytes; total length = mlen.
     * {@code c} receives output: first BOX_BOXZEROBYTES (16) bytes = 0, then MAC + ciphertext.
     * Returns 0 on success.
     */
    public static int crypto_box(byte[] c, byte[] m, long mlen,
                                 byte[] n, byte[] y, byte[] x) {
        byte[] k = new byte[32];
        box_beforenm(k, y, x);
        return box_afternm(c, m, mlen, n, k);
    }

    /**
     * NaCl crypto_box_open (decrypt + verify).
     * {@code c} must start with BOX_BOXZEROBYTES (16) zero bytes; total length = clen.
     * {@code m} receives output: first BOX_ZEROBYTES (32) bytes = 0, then plaintext.
     * Returns 0 on success, -1 on authentication failure.
     */
    public static int crypto_box_open(byte[] m, byte[] c, long clen,
                                      byte[] n, byte[] y, byte[] x) {
        byte[] k = new byte[32];
        box_beforenm(k, y, x);
        return box_open_afternm(m, c, clen, n, k);
    }

    /** Fill buf with cryptographically secure random bytes. */
    public static void randombytes(byte[] buf) {
        RNG.nextBytes(buf);
    }

    // =========================================================================
    // GF(2^255 - 19) arithmetic — 16 limbs × 16-bit
    // =========================================================================

    private static long[] gf()              { return new long[16]; }
    private static long[] gf(long[] a)     { return a.clone(); }

    /** a24 = 121665 = (486662-2)/4, used in Montgomery doubling. */
    private static final long[] GF_A24 = {
        0xDB41L, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    };

    private static void car25519(long[] o) {
        long c;
        for (int i = 0; i < 16; i++) {
            o[i] += (1L << 16);
            c = o[i] >> 16;
            o[(i + 1) * (i < 15 ? 1 : 0)] += c - 1 + 37 * (c - 1) * (i == 15 ? 1 : 0);
            o[i] -= c << 16;
        }
    }

    private static void sel25519(long[] p, long[] q, int b) {
        long t, c = ~(b - 1);
        for (int i = 0; i < 16; i++) {
            t    = c & (p[i] ^ q[i]);
            p[i] ^= t;
            q[i] ^= t;
        }
    }

    private static void pack25519(byte[] o, long[] n) {
        long[] m = gf(), t = gf(n);
        car25519(t); car25519(t); car25519(t);
        for (int j = 0; j < 2; j++) {
            m[0] = t[0] - 0xffedL;
            for (int i = 1; i < 15; i++) {
                m[i] = t[i] - 0xffffL - ((m[i - 1] >> 16) & 1);
                m[i - 1] &= 0xffffL;
            }
            m[15] = t[15] - 0x7fffL - ((m[14] >> 16) & 1);
            long b = (m[15] >> 16) & 1;
            m[14] &= 0xffffL;
            sel25519(t, m, (int)(1 - b));
        }
        for (int i = 0; i < 16; i++) {
            o[2 * i]     = (byte)(t[i] & 0xff);
            o[2 * i + 1] = (byte)((t[i] >> 8) & 0xff);
        }
    }

    private static void unpackfe(long[] o, byte[] n) {
        for (int i = 0; i < 16; i++)
            o[i] = (n[2 * i] & 0xffL) + ((n[2 * i + 1] & 0xffL) << 8);
        o[15] &= 0x7fffL;
    }

    private static long[] fadd(long[] a, long[] b) {
        long[] o = gf();
        for (int i = 0; i < 16; i++) o[i] = a[i] + b[i];
        return o;
    }

    private static long[] fsub(long[] a, long[] b) {
        long[] o = gf();
        for (int i = 0; i < 16; i++) o[i] = a[i] - b[i];
        return o;
    }

    private static long[] fmul(long[] a, long[] b) {
        long[] t = new long[31];
        for (int i = 0; i < 16; i++)
            for (int j = 0; j < 16; j++)
                t[i + j] += a[i] * b[j];
        long[] o = gf();
        for (int i = 0; i < 15; i++) t[i] += 38 * t[i + 16];
        System.arraycopy(t, 0, o, 0, 16);
        car25519(o); car25519(o);
        return o;
    }

    private static long[] fsq(long[] a) { return fmul(a, a); }

    private static long[] inv25519(long[] o) {
        long[] c = gf(o);
        for (int i = 253; i >= 0; i--) {
            c = fsq(c);
            if (i != 2 && i != 4) c = fmul(c, o);
        }
        return c;
    }

    // =========================================================================
    // Curve25519 scalar multiplication (RFC 7748 Montgomery ladder)
    // This matches the TweetNaCl C scalarmult exactly using projective coords.
    // =========================================================================

    private static int scalarmult(byte[] q, byte[] n_in, byte[] p) {
        // Clamp scalar
        byte[] e = n_in.clone();
        e[0]  &= 248;
        e[31] &= 127;
        e[31] |= 64;

        // Projective coordinates: R = (x2:z2), S = (x3:z3)
        // Start: R = (1:0) = point at infinity, S = P = (u:1)
        long[] x1 = gf();            // base point affine u-coord
        long[] x2 = gf(); x2[0] = 1; // R.x  = 1
        long[] z2 = gf();            // R.z  = 0
        long[] x3 = gf();            // S.x  = u
        long[] z3 = gf(); z3[0] = 1; // S.z  = 1

        unpackfe(x1, p);
        System.arraycopy(x1, 0, x3, 0, 16);

        int swap = 0;
        for (int pos = 254; pos >= 0; pos--) {
            int b = (e[pos / 8] >> (pos & 7)) & 1;
            swap ^= b;
            sel25519(x2, x3, swap);
            sel25519(z2, z3, swap);
            swap = b;

            //  A  = x2 + z2
            //  B  = x2 - z2
            //  C  = x3 + z3
            //  D  = x3 - z3
            //  DA = D * A,  CB = C * B
            //  x3 = (DA + CB)^2
            //  z3 = x1 * (DA - CB)^2
            //  x2 = A^2 * B^2      (= (x2+z2)^2 * (x2-z2)^2)
            //  E  = A^2 - B^2
            //  z2 = E * (A^2 + a24*E)
            long[] A  = fadd(x2, z2);
            long[] B  = fsub(x2, z2);
            long[] C  = fadd(x3, z3);
            long[] D  = fsub(x3, z3);
            long[] DA = fmul(D, A);
            long[] CB = fmul(C, B);
            x3 = fsq(fadd(DA, CB));
            z3 = fmul(x1, fsq(fsub(DA, CB)));
            long[] AA = fsq(A);
            long[] BB = fsq(B);
            x2 = fmul(AA, BB);
            long[] E  = fsub(AA, BB);
            z2 = fmul(E, fadd(AA, fmul(GF_A24, E)));
        }

        sel25519(x2, x3, swap);
        sel25519(z2, z3, swap);

        // Affine u = x2 * inv(z2)
        pack25519(q, fmul(x2, inv25519(z2)));
        return 0;
    }

    // =========================================================================
    // XSalsa20 stream cipher
    // =========================================================================

    private static final int[] SIGMA = {
        0x61707865, 0x3320646e, 0x79622d32, 0x6b206574
    };

    private static int ld32(byte[] x, int o) {
        return (x[o] & 0xff) | ((x[o+1] & 0xff) << 8) |
               ((x[o+2] & 0xff) << 16) | ((x[o+3] & 0xff) << 24);
    }

    private static void st32(byte[] x, int o, int v) {
        x[o]   = (byte) v;
        x[o+1] = (byte)(v >>  8);
        x[o+2] = (byte)(v >> 16);
        x[o+3] = (byte)(v >> 24);
    }

    private static int rotl(int v, int n) { return (v << n) | (v >>> (32 - n)); }

    /**
     * Salsa20 core / HSalsa20 core.
     * state[16] is the input; out[16] (full Salsa20) or out[8] (HSalsa20) is the output.
     * When {@code hsalsa} is true, only the diagonal words of the output are returned.
     */
    private static void salsa20core(int[] out, int[] in, boolean hsalsa) {
        int[] x = in.clone();
        for (int i = 20; i > 0; i -= 2) {
            x[ 4] ^= rotl(x[ 0]+x[12],  7); x[ 8] ^= rotl(x[ 4]+x[ 0],  9);
            x[12] ^= rotl(x[ 8]+x[ 4], 13); x[ 0] ^= rotl(x[12]+x[ 8], 18);
            x[ 9] ^= rotl(x[ 5]+x[ 1],  7); x[13] ^= rotl(x[ 9]+x[ 5],  9);
            x[ 1] ^= rotl(x[13]+x[ 9], 13); x[ 5] ^= rotl(x[ 1]+x[13], 18);
            x[14] ^= rotl(x[10]+x[ 6],  7); x[ 2] ^= rotl(x[14]+x[10],  9);
            x[ 6] ^= rotl(x[ 2]+x[14], 13); x[10] ^= rotl(x[ 6]+x[ 2], 18);
            x[ 3] ^= rotl(x[15]+x[11],  7); x[ 7] ^= rotl(x[ 3]+x[15],  9);
            x[11] ^= rotl(x[ 7]+x[ 3], 13); x[15] ^= rotl(x[11]+x[ 7], 18);
            x[ 1] ^= rotl(x[ 0]+x[ 3],  7); x[ 2] ^= rotl(x[ 1]+x[ 0],  9);
            x[ 3] ^= rotl(x[ 2]+x[ 1], 13); x[ 0] ^= rotl(x[ 3]+x[ 2], 18);
            x[ 6] ^= rotl(x[ 5]+x[ 4],  7); x[ 7] ^= rotl(x[ 6]+x[ 5],  9);
            x[ 4] ^= rotl(x[ 7]+x[ 6], 13); x[ 5] ^= rotl(x[ 4]+x[ 7], 18);
            x[11] ^= rotl(x[10]+x[ 9],  7); x[ 8] ^= rotl(x[11]+x[10],  9);
            x[ 9] ^= rotl(x[ 8]+x[11], 13); x[10] ^= rotl(x[ 9]+x[ 8], 18);
            x[12] ^= rotl(x[15]+x[14],  7); x[13] ^= rotl(x[12]+x[15],  9);
            x[14] ^= rotl(x[13]+x[12], 13); x[15] ^= rotl(x[14]+x[13], 18);
        }
        if (hsalsa) {
            // HSalsa20 output: words 0,5,10,15 then 6,7,8,9
            out[0] = x[0];  out[1] = x[5];  out[2] = x[10]; out[3] = x[15];
            out[4] = x[6];  out[5] = x[7];  out[6] = x[8];  out[7] = x[9];
        } else {
            for (int i = 0; i < 16; i++) out[i] = x[i] + in[i];
        }
    }

    /**
     * Build the Salsa20 initial state from a 32-byte key and 8-byte nonce.
     * @param n      nonce buffer
     * @param noff   offset into n where the 8-byte nonce starts
     */
    private static int[] salsa20state(byte[] k, byte[] n, int noff) {
        int[] s = new int[16];
        s[ 0] = SIGMA[0];
        s[ 1] = ld32(k,  0); s[ 2] = ld32(k,  4);
        s[ 3] = ld32(k,  8); s[ 4] = ld32(k, 12);
        s[ 5] = SIGMA[1];
        s[ 6] = ld32(n, noff);   s[ 7] = ld32(n, noff + 4);
        s[ 8] = 0;               s[ 9] = 0;
        s[10] = SIGMA[2];
        s[11] = ld32(k, 16); s[12] = ld32(k, 20);
        s[13] = ld32(k, 24); s[14] = ld32(k, 28);
        s[15] = SIGMA[3];
        return s;
    }

    /**
     * HSalsa20: derive a 32-byte subkey from {@code k} and a 16-byte nonce {@code n0}.
     * This is the key derivation step in XSalsa20.
     */
    private static byte[] hsalsa20(byte[] k, byte[] n0) {
        // State: sigma | k[0..15] | n0[0..15] | k[16..31]
        int[] state = new int[16];
        state[ 0] = SIGMA[0];
        state[ 1] = ld32(k,  0); state[ 2] = ld32(k,  4);
        state[ 3] = ld32(k,  8); state[ 4] = ld32(k, 12);
        state[ 5] = SIGMA[1];
        state[ 6] = ld32(n0, 0); state[ 7] = ld32(n0,  4);
        state[ 8] = ld32(n0, 8); state[ 9] = ld32(n0, 12);
        state[10] = SIGMA[2];
        state[11] = ld32(k, 16); state[12] = ld32(k, 20);
        state[13] = ld32(k, 24); state[14] = ld32(k, 28);
        state[15] = SIGMA[3];
        int[] out = new int[8];
        salsa20core(out, state, true);
        byte[] sub = new byte[32];
        for (int i = 0; i < 8; i++) st32(sub, i * 4, out[i]);
        return sub;
    }

    /**
     * XSalsa20 XOR: output[coffset..coffset+len) = input[moffset..moffset+len) XOR keystream.
     * The 24-byte nonce {@code n}: first 16 bytes → HSalsa20, bytes 16..23 → Salsa20 nonce.
     */
    private static void xsalsa20xor(byte[] c, int coffset,
                                    byte[] m, int moffset, int len,
                                    byte[] n, byte[] k) {
        byte[] subkey = hsalsa20(k, n);           // n[0..15] → HSalsa20
        int[] state   = salsa20state(subkey, n, 16); // n[16..23] as Salsa20 nonce

        int[] blk = new int[16];
        byte[] blkBytes = new byte[64];
        while (len > 0) {
            salsa20core(blk, state, false);
            for (int i = 0; i < 16; i++) st32(blkBytes, i * 4, blk[i]);
            int take = Math.min(len, 64);
            for (int i = 0; i < take; i++)
                c[coffset + i] = (byte)((m[moffset + i] & 0xff) ^ (blkBytes[i] & 0xff));
            coffset += take; moffset += take; len -= take;
            // Increment 64-bit counter (little-endian at state[8]/state[9])
            if (++state[8] == 0) ++state[9];
        }
    }

    // =========================================================================
    // Poly1305 one-time MAC (RFC 8439 / D. J. Bernstein)
    // =========================================================================

    /**
     * Compute a 16-byte Poly1305 MAC.
     * @param out    output buffer, 16 bytes written at {@code outoff}
     * @param m      message bytes
     * @param moff   start of message
     * @param mlen   message length in bytes
     * @param key    32-byte one-time key: r = key[0..15], s = key[16..31]
     */
    private static void poly1305mac(byte[] out, int outoff,
                                    byte[] m, int moff, int mlen,
                                    byte[] key) {
        // Parse r (clamp per RFC 8439)
        long r0 =  ld32u(key,  0)        & 0x3ffffffL;
        long r1 = (ld32u(key,  3) >>  2) & 0x3ffff03L;
        long r2 = (ld32u(key,  6) >>  4) & 0x3ffc0ffL;
        long r3 = (ld32u(key,  9) >>  6) & 0x3f03fffL;
        long r4 = (ld32u(key, 12) >>  8) & 0x00fffffL;

        // Pre-multiplied r*5 for reduction
        long s1 = r1 * 5, s2 = r2 * 5, s3 = r3 * 5, s4 = r4 * 5;

        // Accumulator h (5 × 26-bit limbs)
        long h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0;

        int pos = moff;
        int remaining = mlen;
        while (remaining > 0) {
            int take = Math.min(remaining, 16);
            // Pad block to 17 bytes with a 1-byte appended
            long t0 = 0, t1 = 0, t2 = 0, t3 = 0, hibit = 1;
            byte[] blk = new byte[17];
            System.arraycopy(m, pos, blk, 0, take);
            blk[take] = 1;
            t0 = ld32u(blk,  0);
            t1 = ld32u(blk,  4);
            t2 = ld32u(blk,  8);
            t3 = ld32u(blk, 12);

            h0 +=  t0                     & 0x3ffffffL;
            h1 += ((t0 >>> 26) | (t1 << 6))  & 0x3ffffffL;
            h2 += ((t1 >>> 20) | (t2 << 12)) & 0x3ffffffL;
            h3 += ((t2 >>> 14) | (t3 << 18)) & 0x3ffffffL;
            h4 +=  (t3 >>> 8)  | ((long)(blk[16] & 0xff) << 24);

            // h = h * r  (5-limb polynomial multiply mod 2^130-5)
            long d0 = h0*r0 + h1*s4 + h2*s3 + h3*s2 + h4*s1;
            long d1 = h0*r1 + h1*r0 + h2*s4 + h3*s3 + h4*s2;
            long d2 = h0*r2 + h1*r1 + h2*r0 + h3*s4 + h4*s3;
            long d3 = h0*r3 + h1*r2 + h2*r1 + h3*r0 + h4*s4;
            long d4 = h0*r4 + h1*r3 + h2*r2 + h3*r1 + h4*r0;

            // Partial reduction
            long c;
            c = d0 >> 26; h0 = d0 & 0x3ffffffL; d1 += c;
            c = d1 >> 26; h1 = d1 & 0x3ffffffL; d2 += c;
            c = d2 >> 26; h2 = d2 & 0x3ffffffL; d3 += c;
            c = d3 >> 26; h3 = d3 & 0x3ffffffL; d4 += c;
            c = d4 >> 26; h4 = d4 & 0x3ffffffL; h0 += c * 5;
            c = h0 >> 26; h0 &= 0x3ffffffL;      h1 += c;

            pos += take; remaining -= take;
        }

        // Final full reduction mod 2^130-5
        long c;
        c = h1 >> 26; h1 &= 0x3ffffffL; h2 += c;
        c = h2 >> 26; h2 &= 0x3ffffffL; h3 += c;
        c = h3 >> 26; h3 &= 0x3ffffffL; h4 += c;
        c = h4 >> 26; h4 &= 0x3ffffffL; h0 += c * 5;
        c = h0 >> 26; h0 &= 0x3ffffffL; h1 += c;

        // Compute h + (-p) to determine if fully reduced
        long g0 = h0 + 5; c = g0 >> 26; g0 &= 0x3ffffffL;
        long g1 = h1 + c; c = g1 >> 26; g1 &= 0x3ffffffL;
        long g2 = h2 + c; c = g2 >> 26; g2 &= 0x3ffffffL;
        long g3 = h3 + c; c = g3 >> 26; g3 &= 0x3ffffffL;
        long g4 = h4 + c - (1L << 26);

        // Select h if g < 0 (g4 sign bit == 1), else select g
        // mask = all-ones if g < 0 (i.e. g4 negative → keep h), else all-zeros (→ keep g)
        long mask = g4 >> 63; // arithmetic shift: -1L (all ones) if g < 0, 0 otherwise
        h0 = (h0 & mask) | (g0 & ~mask);
        h1 = (h1 & mask) | (g1 & ~mask);
        h2 = (h2 & mask) | (g2 & ~mask);
        h3 = (h3 & mask) | (g3 & ~mask);
        h4 = (h4 & mask) | (g4 & ~mask);

        // Serialize h as 128-bit little-endian integer
        long f0 = (h0       | (h1 << 26)) & 0xFFFFFFFFL;
        long f1 = ((h1 >> 6) | (h2 << 20)) & 0xFFFFFFFFL;
        long f2 = ((h2 >>12) | (h3 << 14)) & 0xFFFFFFFFL;
        long f3 = ((h3 >>18) | (h4 <<  8)) & 0xFFFFFFFFL;

        // Add s = key[16..31]
        long carry;
        f0 += ld32u(key, 16); carry = f0 >> 32; f0 &= 0xFFFFFFFFL;
        f1 += ld32u(key, 20) + carry; carry = f1 >> 32; f1 &= 0xFFFFFFFFL;
        f2 += ld32u(key, 24) + carry; carry = f2 >> 32; f2 &= 0xFFFFFFFFL;
        f3 += ld32u(key, 28) + carry;

        st32(out, outoff,      (int)f0);
        st32(out, outoff +  4, (int)f1);
        st32(out, outoff +  8, (int)f2);
        st32(out, outoff + 12, (int)f3);
    }

    private static long ld32u(byte[] x, int o) {
        return ((long)(x[o]   & 0xff))       |
               ((long)(x[o+1] & 0xff) <<  8) |
               ((long)(x[o+2] & 0xff) << 16) |
               ((long)(x[o+3] & 0xff) << 24);
    }

    /** Constant-time 16-byte comparison. Returns true iff equal. */
    private static boolean verify16(byte[] a, int ao, byte[] b, int bo) {
        int d = 0;
        for (int i = 0; i < 16; i++) d |= (a[ao + i] ^ b[bo + i]) & 0xff;
        return d == 0;
    }

    // =========================================================================
    // crypto_box (Curve25519-XSalsa20-Poly1305)
    // =========================================================================

    /**
     * Compute the shared box key: k = HSalsa20(scalarmult(x_secret, y_public), 0)
     */
    private static void box_beforenm(byte[] k, byte[] y, byte[] x) {
        byte[] s = new byte[32];
        scalarmult(s, x, y);
        byte[] zero16 = new byte[16];
        byte[] sub = hsalsa20(s, zero16);
        System.arraycopy(sub, 0, k, 0, 32);
    }

    /**
     * Authenticated encryption using the pre-computed box key k.
     *
     * Internally: generate 64-byte keystream (counter=0) → first 32 bytes become the
     * Poly1305 one-time key; XSalsa20 then XORs m into c starting from offset 0.
     * MAC is written at c[16..32).  c[0..16) = 0 (BOXZEROBYTES).
     */
    private static int box_afternm(byte[] c, byte[] m, long mlen, byte[] n, byte[] k) {
        if (mlen < 32) return -1;
        // XSalsa20: XOR m → c.  The first 32 bytes of c (m's ZEROBYTES region)
        // become the Poly1305 one-time key (keystream counter=0, words 0..7).
        xsalsa20xor(c, 0, m, 0, (int)mlen, n, k);
        // Poly1305 MAC over c[32..mlen) using c[0..32) as the one-time key
        poly1305mac(c, 16, c, 32, (int)(mlen - 32), c);
        // Zero BOXZEROBYTES (c[0..16) must be 0 per NaCl convention)
        for (int i = 0; i < 16; i++) c[i] = 0;
        return 0;
    }

    /**
     * Authenticated decryption using the pre-computed box key k.
     */
    private static int box_open_afternm(byte[] m, byte[] c, long clen, byte[] n, byte[] k) {
        if (clen < 32) return -1;
        // Regenerate the Poly1305 one-time key (first 32 bytes of the XSalsa20 keystream)
        byte[] block0 = new byte[64];
        byte[] zero64 = new byte[64];
        xsalsa20xor(block0, 0, zero64, 0, 64, n, k);
        byte[] macKey = new byte[32];
        System.arraycopy(block0, 0, macKey, 0, 32);

        // Verify MAC: the received MAC is at c[16..32), covers c[32..clen)
        byte[] tag = new byte[16];
        poly1305mac(tag, 0, c, 32, (int)(clen - 32), macKey);
        if (!verify16(tag, 0, c, 16)) return -1;

        // Decrypt: XSalsa20 XOR c → m
        xsalsa20xor(m, 0, c, 0, (int)clen, n, k);
        // Zero ZEROBYTES prefix in m
        for (int i = 0; i < 32; i++) m[i] = 0;
        return 0;
    }
}
