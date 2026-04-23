#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BoltApplePay, NSObject)
RCT_EXTERN_METHOD(canMakePayments:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestPayment:(NSString *)configJson
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(reportAuthorizationResult:(BOOL)success
                  errorMessage:(NSString *)errorMessage
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end
