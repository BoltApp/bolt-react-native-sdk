#include "tweetnacl.h"
#include <Security/Security.h>

// Required by TweetNaCl for random number generation
void randombytes(unsigned char *buf, unsigned long long len) {
    if (SecRandomCopyBytes(kSecRandomDefault, (size_t)len, buf) != errSecSuccess) {
        // Crypto-critical: zero the buffer and abort if PRNG fails
        memset(buf, 0, (size_t)len);
        abort();
    }
}

// Thin wrappers so Swift can call TweetNaCl (macros aren't visible to Swift)
int nacl_box_keypair(unsigned char *pk, unsigned char *sk) {
    return crypto_box_keypair(pk, sk);
}

int nacl_box(unsigned char *c, const unsigned char *m, unsigned long long mlen,
             const unsigned char *n, const unsigned char *y, const unsigned char *x) {
    return crypto_box(c, m, mlen, n, y, x);
}

int nacl_box_open(unsigned char *m, const unsigned char *c, unsigned long long clen,
                  const unsigned char *n, const unsigned char *y, const unsigned char *x) {
    return crypto_box_open(m, c, clen, n, y, x);
}

void nacl_randombytes(unsigned char *buf, unsigned long long len) {
    randombytes(buf, len);
}
