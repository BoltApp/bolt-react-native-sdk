#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BoltCardField, NSObject)

RCT_EXTERN_METHOD(tokenize:(nonnull NSNumber *)viewTag
                  publishableKey:(NSString *)publishableKey
                  apiUrl:(NSString *)apiUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
