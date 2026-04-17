#import <UIKit/UIKit.h>
#import <React/RCTViewComponentView.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/BoltReactNativeSdkSpec/ComponentDescriptors.h>
#import <react/renderer/components/BoltReactNativeSdkSpec/EventEmitters.h>
#import <react/renderer/components/BoltReactNativeSdkSpec/Props.h>

// Import the generated Swift bridging header so we can create the Swift view.
#if __has_include("BoltReactNativeSdk-Swift.h")
#import "BoltReactNativeSdk-Swift.h"
#elif __has_include("bolt_react_native_sdk-Swift.h")
#import "bolt_react_native_sdk-Swift.h"
#endif

using namespace facebook::react;

// MARK: - Fabric ComponentView

@interface BoltCreditCardFieldComponentView : RCTViewComponentView
@end

@implementation BoltCreditCardFieldComponentView {
  BoltCreditCardFieldView *_cardFieldView;
  BOOL _registered;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<BoltCreditCardFieldComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _cardFieldView = [[BoltCreditCardFieldView alloc] init];
    _cardFieldView.translatesAutoresizingMaskIntoConstraints = NO;
    [self addSubview:_cardFieldView];

    [NSLayoutConstraint activateConstraints:@[
      [_cardFieldView.topAnchor constraintEqualToAnchor:self.topAnchor],
      [_cardFieldView.bottomAnchor constraintEqualToAnchor:self.bottomAnchor],
      [_cardFieldView.leadingAnchor constraintEqualToAnchor:self.leadingAnchor],
      [_cardFieldView.trailingAnchor constraintEqualToAnchor:self.trailingAnchor],
    ]];
  }
  return self;
}

- (void)dealloc
{
  if (_registered) {
    [[BoltCardFieldRegistry shared] unregisterWithTag:(int)self.tag];
  }
}

- (void)didMoveToWindow
{
  [super didMoveToWindow];
  if (self.window && !_registered) {
    [[BoltCardFieldRegistry shared] registerWithTag:(int)self.tag view:_cardFieldView];
    _registered = YES;
  } else if (!self.window && _registered) {
    [[BoltCardFieldRegistry shared] unregisterWithTag:(int)self.tag];
    _registered = NO;
  }
}

// MARK: - Event emission helpers (called from callbacks set on _cardFieldView)

- (void)emitValid
{
  if (_eventEmitter) {
    auto emitter = std::static_pointer_cast<BoltCreditCardFieldEventEmitter const>(_eventEmitter);
    emitter->onCardValid({});
  }
}

- (void)emitError:(NSString *)message
{
  if (_eventEmitter) {
    auto emitter = std::static_pointer_cast<BoltCreditCardFieldEventEmitter const>(_eventEmitter);
    BoltCreditCardFieldEventEmitter::OnCardError event;
    event.message = std::string([message UTF8String] ?: "");
    emitter->onCardError(event);
  }
}

- (void)emitFocus
{
  if (_eventEmitter) {
    auto emitter = std::static_pointer_cast<BoltCreditCardFieldEventEmitter const>(_eventEmitter);
    emitter->onCardFocus({});
  }
}

- (void)emitBlur
{
  if (_eventEmitter) {
    auto emitter = std::static_pointer_cast<BoltCreditCardFieldEventEmitter const>(_eventEmitter);
    emitter->onCardBlur({});
  }
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  // No child components
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  // No child components
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  if (_registered) {
    [[BoltCardFieldRegistry shared] unregisterWithTag:(int)self.tag];
    _registered = NO;
  }
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  auto const &newProps = *std::static_pointer_cast<BoltCreditCardFieldProps const>(props);

  if (!oldProps || newProps.showPostalCode != std::static_pointer_cast<BoltCreditCardFieldProps const>(oldProps)->showPostalCode) {
    [_cardFieldView setShowPostalCode:newProps.showPostalCode];
  }

  if (!oldProps || newProps.publishableKey != std::static_pointer_cast<BoltCreditCardFieldProps const>(oldProps)->publishableKey) {
    NSString *key = [NSString stringWithUTF8String:newProps.publishableKey.c_str()];
    [_cardFieldView setPublishableKey:key];
  }

  // Style props
  NSString *textColor = newProps.styleTextColor.empty() ? nil : [NSString stringWithUTF8String:newProps.styleTextColor.c_str()];
  NSString *placeholderColor = newProps.stylePlaceholderColor.empty() ? nil : [NSString stringWithUTF8String:newProps.stylePlaceholderColor.c_str()];
  NSString *borderColor = newProps.styleBorderColor.empty() ? nil : [NSString stringWithUTF8String:newProps.styleBorderColor.c_str()];
  NSString *bgColor = newProps.styleBackgroundColor.empty() ? nil : [NSString stringWithUTF8String:newProps.styleBackgroundColor.c_str()];
  NSString *fontFamily = newProps.styleFontFamily.empty() ? nil : [NSString stringWithUTF8String:newProps.styleFontFamily.c_str()];

  [_cardFieldView applyFieldStylesWithTextColor:textColor
                                       fontSize:newProps.styleFontSize
                               placeholderColor:placeholderColor
                                    borderColor:borderColor
                                    borderWidth:newProps.styleBorderWidth
                                   borderRadius:newProps.styleBorderRadius
                                backgroundColor:bgColor
                                     fontFamily:fontFamily];

  // Wire up callbacks (only once, but safe to re-set)
  __weak BoltCreditCardFieldComponentView *weakSelf = self;
  _cardFieldView.onValidCallback = ^{
    [weakSelf emitValid];
  };
  _cardFieldView.onErrorCallback = ^(NSString *message) {
    [weakSelf emitError:message];
  };
  _cardFieldView.onFocusCallback = ^{
    [weakSelf emitFocus];
  };
  _cardFieldView.onBlurCallback = ^{
    [weakSelf emitBlur];
  };

  [super updateProps:props oldProps:oldProps];
}

@end

Class<RCTComponentViewProtocol> BoltCreditCardFieldCls(void)
{
  return BoltCreditCardFieldComponentView.class;
}
