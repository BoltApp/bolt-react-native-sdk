import Foundation
import PassKit

/// TurboModule implementation for Apple Pay via PassKit.
///
/// Handles:
/// 1. Checking device Apple Pay capability
/// 2. Presenting the PKPaymentAuthorizationController
/// 3. Merchant validation via Bolt's /v1/applepay/validate_merchant endpoint
/// 4. Tokenizing the Apple Pay payment and returning a Bolt token
@objc(BoltApplePay)
class ApplePayModule: NSObject {

  private var paymentCompletion: ((PKPaymentAuthorizationResult) -> Void)?
  private var pendingResolve: ((Any) -> Void)?
  private var pendingReject: ((String, String, NSError) -> Void)?
  private var tokenizerUrl: String = ""
  private var tokenizerFallbackUrl: String = ""

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

  @objc
  func requestPayment(_ configJson: String,
                       tokenizerUrl: String,
                       tokenizerFallbackUrl: String,
                       resolve: @escaping (Any) -> Void,
                       reject: @escaping (String, String, NSError) -> Void) {
    self.tokenizerUrl = tokenizerUrl
    self.tokenizerFallbackUrl = tokenizerFallbackUrl
    self.pendingResolve = resolve
    self.pendingReject = reject

    guard let configData = configJson.data(using: .utf8),
          let config = try? JSONSerialization.jsonObject(with: configData) as? [String: Any] else {
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

  /// Tokenize Apple Pay payment token via Bolt's tokenizer service.
  ///
  /// The body shape matches `IPostApplePayTokenRequest` in @boltpay/tokenizer:
  ///   { paymentData: { data, signature, header: { publicKeyHash, ephemeralPublicKey, transactionId }, version },
  ///     paymentMethod: { displayName, network, type },
  ///     transactionIdentifier }
  ///
  /// PassKit's `payment.token.paymentData` is a JSON blob encoded as Data — we parse it
  /// into the nested object shape the tokenizer expects.
  ///
  /// Posts to `$tokenizerUrl/token/applepay`, falling back to the alternative host on
  /// any non-2xx / transport failure. Passes a real error message to the completion
  /// handler so the JS promise rejection is actionable (not "failed to tokenize").
  private func tokenizePayment(_ payment: PKPayment,
                                completion: @escaping ([String: Any]?, String?) -> Void) {
    guard let paymentDataObject =
      try? JSONSerialization.jsonObject(with: payment.token.paymentData) as? [String: Any] else {
      completion(nil, "Failed to parse Apple Pay paymentData as JSON")
      return
    }

    let body: [String: Any] = [
      "paymentData": paymentDataObject,
      "paymentMethod": [
        "displayName": payment.token.paymentMethod.displayName ?? "",
        "network": payment.token.paymentMethod.network?.rawValue ?? "",
        "type": Self.paymentMethodTypeName(payment.token.paymentMethod.type)
      ],
      "transactionIdentifier": payment.token.transactionIdentifier
    ]

    guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else {
      completion(nil, "Failed to serialize tokenizer request body")
      return
    }

    // Strong-capture self: if we go weak and self is released between primary and
    // fallback, the tokenize completion is never called and the caller's PassKit
    // handler hangs (frozen Apple Pay sheet). Strong capture keeps self alive for
    // the duration of the request — self is released when the closure releases.
    let fallbackUrl = tokenizerFallbackUrl
    postJson(urlString: "\(tokenizerUrl)/token/applepay", body: bodyData) { result, primaryError in
      if let result = result {
        completion(result, nil)
        return
      }
      self.postJson(urlString: "\(fallbackUrl)/token/applepay", body: bodyData) { fallbackResult, fallbackError in
        if let fallbackResult = fallbackResult {
          completion(fallbackResult, nil)
        } else {
          completion(nil, "primary=\(primaryError ?? "unknown"); fallback=\(fallbackError ?? "unknown")")
        }
      }
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

  /// POST JSON to `urlString`. Calls `completion(parsed, nil)` on 2xx, or
  /// `completion(nil, "HTTP N: <body>")` on non-2xx / transport failure.
  private func postJson(urlString: String,
                         body: Data,
                         completion: @escaping ([String: Any]?, String?) -> Void) {
    guard let url = URL(string: urlString) else {
      completion(nil, "invalid url: \(urlString)")
      return
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = body
    request.timeoutInterval = 15

    URLSession.shared.dataTask(with: request) { data, response, error in
      if let error = error {
        completion(nil, "transport: \(error.localizedDescription)")
        return
      }
      guard let http = response as? HTTPURLResponse, let data = data else {
        completion(nil, "no response")
        return
      }
      if (200..<300).contains(http.statusCode) {
        guard let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
          completion(nil, "HTTP \(http.statusCode): unparseable body")
          return
        }
        completion(parsed, nil)
      } else {
        let snippet = String(data: data, encoding: .utf8)?.prefix(500) ?? ""
        completion(nil, "HTTP \(http.statusCode): \(snippet)")
      }
    }.resume()
  }
}

// MARK: - PKPaymentAuthorizationControllerDelegate

extension ApplePayModule: PKPaymentAuthorizationControllerDelegate {

  func paymentAuthorizationController(
    _ controller: PKPaymentAuthorizationController,
    didRequestMerchantSessionUpdate handler: @escaping (PKPaymentRequestMerchantSessionUpdate) -> Void
  ) {
    // This is called for merchant validation
  }

  func paymentAuthorizationController(
    _ controller: PKPaymentAuthorizationController,
    didAuthorizePayment payment: PKPayment,
    handler completion: @escaping (PKPaymentAuthorizationResult) -> Void
  ) {
    self.paymentCompletion = completion

    // Strong capture: PassKit REQUIRES `completion` to fire or the Apple Pay sheet
    // hangs indefinitely. Using `[weak self]` + `guard let self` silently drops
    // the handler if self is deallocated mid-flight.
    tokenizePayment(payment) { result, errorMessage in
      if let result = result, let token = result["token"] as? String {
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
          "token": token,
          "billingContact": billingContact,
          "boltReference": result["bolt_reference"] as? String ?? ""
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
          return
        }

        self.pendingResolve?(jsonString)
        completion(PKPaymentAuthorizationResult(status: .success, errors: nil))
      } else {
        let message = errorMessage ?? "Failed to tokenize Apple Pay payment"
        self.pendingReject?("TOKENIZE_FAILED", message, NSError(domain: "BoltApplePay", code: 3))
        completion(PKPaymentAuthorizationResult(status: .failure, errors: nil))
      }
    }
  }

  func paymentAuthorizationControllerDidFinish(_ controller: PKPaymentAuthorizationController) {
    DispatchQueue.main.async {
      controller.dismiss()
    }
  }
}
