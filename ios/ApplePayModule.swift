import Foundation
import PassKit

/// TurboModule implementation for Apple Pay via PassKit.
///
/// Handles:
/// 1. Checking device Apple Pay capability
/// 2. Presenting the PKPaymentAuthorizationController
/// 3. Returning raw payment data to JS for tokenization via @boltpay/tokenizer
@objc(BoltApplePay)
class ApplePayModule: NSObject {

  private var paymentCompletion: ((PKPaymentAuthorizationResult) -> Void)?
  private var pendingResolve: ((Any) -> Void)?
  private var pendingReject: ((String, String, NSError) -> Void)?

  @objc
  static func moduleName() -> String {
    return "BoltApplePay"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func canMakePayments(_ resolve: @escaping (Any) -> Void,
                       reject: @escaping (String, String, NSError) -> Void) {
    let canPay = PKPaymentAuthorizationController.canMakePayments()
    resolve(canPay)
  }

  /// Finalize the PassKit sheet after JS tokenization completes. The sheet is
  /// held in a processing state between `didAuthorizePayment` and this call so
  /// users see the success/failure outcome reflected on the Apple Pay UI
  /// rather than an instant success dismissal. Silent no-op when there's no
  /// retained completion — either the sheet was never presented, the user
  /// cancelled before authorization, or this is a duplicate call.
  @objc
  func reportAuthorizationResult(_ success: Bool,
                                  errorMessage: NSString?,
                                  resolve: @escaping (Any) -> Void,
                                  reject: @escaping (String, String, NSError) -> Void) {
    guard let completion = self.paymentCompletion else {
      resolve(NSNull())
      return
    }
    self.paymentCompletion = nil
    self.pendingResolve = nil
    self.pendingReject = nil

    let result = success
      ? PKPaymentAuthorizationResult(status: .success, errors: nil)
      : PKPaymentAuthorizationResult(status: .failure, errors: nil)
    completion(result)

    if !success, let msg = errorMessage as String? {
      NSLog("[BoltApplePay] JS tokenization reported failure: %@", msg)
    }
    resolve(NSNull())
  }

  @objc
  func requestPayment(_ configJson: String,
                       resolve: @escaping (Any) -> Void,
                       reject: @escaping (String, String, NSError) -> Void) {
    // Re-entry guard: rapid double-tap while an earlier sheet is still pending
    // would otherwise overwrite pendingResolve and leak the first promise.
    if self.pendingResolve != nil {
      reject(
        "IN_PROGRESS",
        "Another Apple Pay authorization is already in progress",
        NSError(domain: "BoltApplePay", code: 5)
      )
      return
    }
    self.pendingResolve = resolve
    self.pendingReject = reject

    guard let configData = configJson.data(using: .utf8),
          let config = try? JSONSerialization.jsonObject(with: configData) as? [String: Any] else {
      self.pendingResolve = nil
      self.pendingReject = nil
      reject("INVALID_CONFIG", "Failed to parse Apple Pay config", NSError(domain: "BoltApplePay", code: 1))
      return
    }

    let request = PKPaymentRequest()
    request.merchantIdentifier = config["merchantId"] as? String ?? ""
    request.countryCode = config["countryCode"] as? String ?? "US"
    request.currencyCode = config["currencyCode"] as? String ?? "USD"
    request.supportedNetworks = [.visa, .masterCard, .amex, .discover]
    request.merchantCapabilities = .threeDSecure

    if let total = config["total"] as? [String: String],
       let label = total["label"],
       let amount = total["amount"] {
      request.paymentSummaryItems = [
        PKPaymentSummaryItem(label: label, amount: NSDecimalNumber(string: amount))
      ]
    }

    request.requiredBillingContactFields = [.postalAddress, .name, .emailAddress, .phoneNumber]

    DispatchQueue.main.async {
      let controller = PKPaymentAuthorizationController(paymentRequest: request)
      controller.delegate = self
      controller.present()
    }
  }

  /// Map PKPaymentMethodType to the semantic name string the tokenizer expects.
  /// rawValue is UInt (0..5) which is not meaningful to downstream systems.
  private static func paymentMethodTypeName(_ type: PKPaymentMethodType) -> String {
    switch type {
    case .debit: return "debit"
    case .credit: return "credit"
    case .prepaid: return "prepaid"
    case .store: return "store"
    case .eMoney: return "eMoney"
    default: return "unknown"
    }
  }
}

// MARK: - PKPaymentAuthorizationControllerDelegate

extension ApplePayModule: PKPaymentAuthorizationControllerDelegate {

  func paymentAuthorizationController(
    _ controller: PKPaymentAuthorizationController,
    didAuthorizePayment payment: PKPayment,
    handler completion: @escaping (PKPaymentAuthorizationResult) -> Void
  ) {
    self.paymentCompletion = completion

    // Extract the raw Apple Pay token payload for JS-side tokenization via
    // @boltpay/tokenizer's TkClient.postApplePayToken(). Shape matches
    // IPostApplePayTokenRequest: { paymentData, paymentMethod, transactionIdentifier }.
    guard let paymentDataObject =
      try? JSONSerialization.jsonObject(with: payment.token.paymentData) as? [String: Any] else {
      self.pendingReject?(
        "PAYMENT_DATA_PARSE_FAILED",
        "Failed to parse Apple Pay paymentData as JSON",
        NSError(domain: "BoltApplePay", code: 2)
      )
      completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
      // PassKit forbids invoking the completion handler twice. Drop the
      // retained state now so a later reportAuthorizationResult call from JS
      // (or paymentAuthorizationControllerDidFinish) cannot re-invoke it.
      self.paymentCompletion = nil
      self.pendingResolve = nil
      self.pendingReject = nil
      return
    }

    let applePayToken: [String: Any] = [
      "paymentData": paymentDataObject,
      "paymentMethod": [
        "displayName": payment.token.paymentMethod.displayName ?? "",
        "network": payment.token.paymentMethod.network?.rawValue ?? "",
        "type": Self.paymentMethodTypeName(payment.token.paymentMethod.type)
      ],
      "transactionIdentifier": payment.token.transactionIdentifier
    ]

    var billingContact: [String: Any] = [:]
    if let contact = payment.billingContact {
      billingContact["givenName"] = contact.name?.givenName ?? ""
      billingContact["familyName"] = contact.name?.familyName ?? ""
      billingContact["emailAddress"] = contact.emailAddress ?? ""
      billingContact["phoneNumber"] = contact.phoneNumber?.stringValue ?? ""
      if let address = contact.postalAddress {
        billingContact["postalAddress"] = [
          "street": address.street,
          "city": address.city,
          "state": address.state,
          "postalCode": address.postalCode,
          "country": address.country
        ]
      }
    }

    let response: [String: Any] = [
      "applePayToken": applePayToken,
      "billingContact": billingContact
    ]

    // If serialization fails, reject rather than silently dismissing as success
    // (which would hang the JS promise with no resolve and no reject).
    guard let jsonData = try? JSONSerialization.data(withJSONObject: response),
          let jsonString = String(data: jsonData, encoding: .utf8) else {
      self.pendingReject?(
        "SERIALIZE_FAILED",
        "Failed to serialize Apple Pay result",
        NSError(domain: "BoltApplePay", code: 4)
      )
      completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
      // Same invariant as the paymentData-parse branch above: drop the
      // retained completion so a later reportAuthorizationResult or
      // paymentAuthorizationControllerDidFinish cannot re-invoke it.
      self.paymentCompletion = nil
      self.pendingResolve = nil
      self.pendingReject = nil
      return
    }

    // Resolve the JS promise with the raw payload. DO NOT call `completion(...)`
    // here — `paymentCompletion` is intentionally retained (stored above) so
    // PassKit holds the sheet in "processing" state while JS tokenizes via
    // @boltpay/tokenizer. The sheet transitions to success/failure only when
    // JS calls `reportAuthorizationResult(success:errorMessage:)` below, which
    // invokes the retained completion. Calling completion here would flash the
    // sheet to ".success" before tokenization actually runs, showing the user
    // a successful checkmark even when tokenization fails.
    self.pendingResolve?(jsonString)
  }

  func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
    // The sheet is closing. Drop any retained state so the next requestPayment
    // starts clean — if JS never called reportAuthorizationResult the stale
    // completion handler would stay attached and confuse the re-entry guard.
    self.paymentCompletion = nil
    self.pendingResolve = nil
    self.pendingReject = nil
    DispatchQueue.main.async {
      controller.dismiss()
    }
  }
}
