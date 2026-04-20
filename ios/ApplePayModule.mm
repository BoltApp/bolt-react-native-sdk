#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BoltApplePay, NSObject)
RCT_EXTERN_METHOD(canMakePayments:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestPayment:(NSString *)configJson
                  tokenizerUrl:(NSString *)tokenizerUrl
                  tokenizerFallbackUrl:(NSString *)tokenizerFallbackUrl
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end
