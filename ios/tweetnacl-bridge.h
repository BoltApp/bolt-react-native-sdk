#ifndef TWEETNACL_BRIDGE_H
#define TWEETNACL_BRIDGE_H

#include <stdint.h>

/// Thin wrappers around TweetNaCl macros, callable from Swift.
int nacl_box_keypair(unsigned char *pk, unsigned char *sk);
int nacl_box(unsigned char *c, const unsigned char *m, unsigned long long mlen,
             const unsigned char *n, const unsigned char *y, const unsigned char *x);
int nacl_box_open(unsigned char *m, const unsigned char *c, unsigned long long clen,
                  const unsigned char *n, const unsigned char *y, const unsigned char *x);
void nacl_randombytes(unsigned char *buf, unsigned long long len);

#endif
