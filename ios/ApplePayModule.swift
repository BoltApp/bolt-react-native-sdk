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
  private var publishableKey: String = ""
  private var baseUrl: String = ""

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
                       publishableKey: String,
                       baseUrl: String,
                       resolve: @escaping (Any) -> Void,
                       reject: @escaping (String, String, NSError) -> Void) {
    self.publishableKey = publishableKey
    self.baseUrl = baseUrl
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

    request.requiredBillingContactFields = [.postalAddress, .name]

    DispatchQueue.main.async {
      let controller = PKPaymentAuthorizationController(paymentRequest: request)
      controller.delegate = self
      controller.present()
    }
  }

  /// Call Bolt's merchant validation endpoint
  private func validateMerchant(url: URL, completion: @escaping (PKPaymentMerchantSession?) -> Void) {
    let validateUrl = URL(string: "\(baseUrl)/v1/applepay/validate_merchant")!
    var request = URLRequest(url: validateUrl)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(publishableKey)", forHTTPHeaderField: "Authorization")

    let body: [String: String] = [
      "validation_url": url.absoluteString
    ]
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)

    URLSession.shared.dataTask(with: request) { data, _, error in
      guard let data = data,
            error == nil,
            let session = try? PKPaymentMerchantSession(dictionary:
              JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]) else {
        completion(nil)
        return
      }
      completion(session)
    }.resume()
  }

  /// Tokenize Apple Pay payment token via Bolt's tokenizer API
  private func tokenizePayment(_ payment: PKPayment, completion: @escaping ([String: Any]?) -> Void) {
    let tokenizeUrl = URL(string: "\(baseUrl)/v1/applepay/tokenize")!
    var request = URLRequest(url: tokenizeUrl)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(publishableKey)", forHTTPHeaderField: "Authorization")

    let paymentData = payment.token.paymentData.base64EncodedString()
    let body: [String: Any] = [
      "payment_data": paymentData,
      "payment_method": [
        "display_name": payment.token.paymentMethod.displayName ?? "",
        "network": payment.token.paymentMethod.network?.rawValue ?? "",
        "type": payment.token.paymentMethod.type.rawValue
      ] as [String : Any],
      "transaction_identifier": payment.token.transactionIdentifier
    ]
    request.httpBody = try? JSONSerialization.data(withJSONObject: body)

    URLSession.shared.dataTask(with: request) { data, _, error in
      guard let data = data,
            error == nil,
            let result = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        completion(nil)
        return
      }
      completion(result)
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

    tokenizePayment(payment) { [weak self] result in
      guard let self = self else { return }

      if let result = result, let token = result["token"] as? String {
        // Build billing contact info
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

        if let jsonData = try? JSONSerialization.data(withJSONObject: response),
           let jsonString = String(data: jsonData, encoding: .utf8) {
          self.pendingResolve?(jsonString)
        }

        completion(PKPaymentAuthorizationResult(status: .success, errors: nil))
      } else {
        self.pendingReject?("TOKENIZE_FAILED", "Failed to tokenize Apple Pay payment", NSError(domain: "BoltApplePay", code: 3))
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
