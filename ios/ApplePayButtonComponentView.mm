#import <UIKit/UIKit.h>
#import <PassKit/PassKit.h>
#import <React/RCTViewComponentView.h>
#import <React/RCTFabricComponentsPlugins.h>
#import <react/renderer/components/BoltReactNativeSdkSpec/ComponentDescriptors.h>
#import <react/renderer/components/BoltReactNativeSdkSpec/EventEmitters.h>
#import <react/renderer/components/BoltReactNativeSdkSpec/Props.h>

using namespace facebook::react;

// MARK: - Button type/style mapping

static PKPaymentButtonType PKButtonTypeFromString(const std::string &str) {
  if (str == "buy")        return PKPaymentButtonTypeBuy;
  if (str == "setUp")      return PKPaymentButtonTypeSetUp;
  if (str == "inStore")    return PKPaymentButtonTypeInStore;
  if (str == "donate")     return PKPaymentButtonTypeDonate;
  if (str == "checkout")   return PKPaymentButtonTypeCheckout;
  if (str == "book")       return PKPaymentButtonTypeBook;
  if (str == "subscribe")  return PKPaymentButtonTypeSubscribe;
  if (str == "reload")     return PKPaymentButtonTypeReload;
  if (str == "addMoney")   return PKPaymentButtonTypeAddMoney;
  if (str == "topUp")      return PKPaymentButtonTypeTopUp;
  if (str == "order")      return PKPaymentButtonTypeOrder;
  if (str == "rent")       return PKPaymentButtonTypeRent;
  if (str == "support")    return PKPaymentButtonTypeSupport;
  if (str == "contribute") return PKPaymentButtonTypeContribute;
  if (str == "tip")        return PKPaymentButtonTypeTip;
  return PKPaymentButtonTypePlain;
}

static PKPaymentButtonStyle PKButtonStyleFromString(const std::string &str) {
  if (str == "white")        return PKPaymentButtonStyleWhite;
  if (str == "whiteOutline") return PKPaymentButtonStyleWhiteOutline;
  return PKPaymentButtonStyleBlack;
}

// MARK: - Fabric ComponentView

@interface ApplePayButtonComponentView : RCTViewComponentView
@end

@implementation ApplePayButtonComponentView {
  PKPaymentButton *_paymentButton;
  NSArray<NSLayoutConstraint *> *_buttonConstraints;
  std::string _currentButtonType;
  std::string _currentButtonStyle;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<BoltApplePayButtonComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _currentButtonType = "plain";
    _currentButtonStyle = "black";
    [self rebuildButton];
  }
  return self;
}

- (void)rebuildButton
{
  if (_buttonConstraints) {
    [NSLayoutConstraint deactivateConstraints:_buttonConstraints];
  }
  [_paymentButton removeFromSuperview];

  PKPaymentButtonType type = PKButtonTypeFromString(_currentButtonType);
  PKPaymentButtonStyle style = PKButtonStyleFromString(_currentButtonStyle);
  _paymentButton = [[PKPaymentButton alloc] initWithPaymentButtonType:type paymentButtonStyle:style];
  _paymentButton.translatesAutoresizingMaskIntoConstraints = NO;
  [_paymentButton addTarget:self action:@selector(handleTap) forControlEvents:UIControlEventTouchUpInside];
  [self addSubview:_paymentButton];

  _buttonConstraints = @[
    [_paymentButton.topAnchor constraintEqualToAnchor:self.topAnchor],
    [_paymentButton.bottomAnchor constraintEqualToAnchor:self.bottomAnchor],
    [_paymentButton.leadingAnchor constraintEqualToAnchor:self.leadingAnchor],
    [_paymentButton.trailingAnchor constraintEqualToAnchor:self.trailingAnchor],
  ];
  [NSLayoutConstraint activateConstraints:_buttonConstraints];
}

- (void)handleTap
{
  if (_eventEmitter) {
    auto emitter = std::static_pointer_cast<BoltApplePayButtonEventEmitter const>(_eventEmitter);
    emitter->onPress({});
  }
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  auto const &newProps = *std::static_pointer_cast<BoltApplePayButtonProps const>(props);
  bool needsRebuild = false;

  if (!oldProps || newProps.buttonType != std::static_pointer_cast<BoltApplePayButtonProps const>(oldProps)->buttonType) {
    _currentButtonType = newProps.buttonType;
    needsRebuild = true;
  }

  if (!oldProps || newProps.buttonStyle != std::static_pointer_cast<BoltApplePayButtonProps const>(oldProps)->buttonStyle) {
    _currentButtonStyle = newProps.buttonStyle;
    needsRebuild = true;
  }

  if (needsRebuild) {
    [self rebuildButton];
  }

  [super updateProps:props oldProps:oldProps];
}

@end

Class<RCTComponentViewProtocol> BoltApplePayButtonCls(void)
{
  return ApplePayButtonComponentView.class;
}
