#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BoltNetworking, NSObject)
RCT_EXTERN_METHOD(request:(NSString *)method
                  url:(NSString *)url
                  headers:(NSString *)headers
                  body:(NSString *)body
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
@end
