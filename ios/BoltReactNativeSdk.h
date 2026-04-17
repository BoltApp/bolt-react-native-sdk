#import <BoltReactNativeSdkSpec/BoltReactNativeSdkSpec.h>
#import "tweetnacl.h"

// randombytes provided by tweetnacl_randombytes.c
extern void randombytes(unsigned char *buf, unsigned long long len);

@interface BoltReactNativeSdk : NSObject <NativeBoltReactNativeSdkSpec>

@end
