import Foundation
import UIKit

/// Registry mapping React view tags to BoltCreditCardFieldView instances.
@objcMembers
public class BoltCardFieldRegistry: NSObject {
  public static let shared = BoltCardFieldRegistry()

  private var views: [Int: BoltCreditCardFieldView] = [:]
  private let lock = NSLock()

  public func register(tag: Int, view: BoltCreditCardFieldView) {
    lock.lock()
    views[tag] = view
    lock.unlock()
  }

  public func unregister(tag: Int) {
    lock.lock()
    views.removeValue(forKey: tag)
    lock.unlock()
  }

  public func view(forTag tag: Int) -> BoltCreditCardFieldView? {
    lock.lock()
    let v = views[tag]
    lock.unlock()
    return v
  }
}

/// Companion TurboModule for the BoltCreditCardField Fabric component (ADR-1).
///
/// Provides tokenize(viewTag:) which:
/// 1. Looks up the native BoltCreditCardFieldView via the registry
/// 2. Reads raw card data from byte buffers (never String)
/// 3. Builds JSON body from raw bytes (FR-3.4: no String intermediate for CHD)
/// 4. Encrypts and POSTs to the Bolt tokenizer service (/token endpoint)
/// 5. Zeros all card buffers on every exit path
/// 6. Resolves the Promise with JSON-encoded TokenResult
@objc(BoltCardField)
class BoltCardFieldModule: NSObject {

  private static let tokenizationTimeout: TimeInterval = 30

  @objc
  static func moduleName() -> String {
    return "BoltCardField"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func tokenize(_ viewTag: NSNumber,
                 publishableKey: String,
                 apiUrl: String,
                 resolve: @escaping (Any) -> Void,
                 reject: @escaping (String, String, NSError) -> Void) {

    DispatchQueue.main.async {
      self.performTokenize(
        viewTag: viewTag.intValue,
        publishableKey: publishableKey,
        apiUrl: apiUrl,
        resolve: resolve,
        reject: reject
      )
    }
  }

  private func performTokenize(
    viewTag: Int,
    publishableKey: String, // Reserved for future use (cert pinning, rate limiting)
    apiUrl: String,
    resolve: @escaping (Any) -> Void,
    reject: @escaping (String, String, NSError) -> Void
  ) {
    guard let cardFieldView = BoltCardFieldRegistry.shared.view(forTag: viewTag) else {
      reject("VIEW_NOT_FOUND",
             "BoltCreditCardFieldView not found for tag \(viewTag)",
             NSError(domain: "BoltCardField", code: 2))
      return
    }

    // Read raw byte buffers — CHD stays as [UInt8], never becomes String
    var panDigits = cardFieldView.getRawPAN()     // [UInt8] — raw digits 0-9
    var cvvDigits = cardFieldView.getRawCVV()     // [UInt8] — raw digits 0-9
    let expiry = cardFieldView.getRawExpiry()     // "YYYY-MM" (not CHD)
    let postalCode = cardFieldView.getRawPostalCode() // String? (not CHD)
    let network = cardFieldView.getCardNetwork()  // "visa" etc. (not CHD)
    let last4 = cardFieldView.getLast4()          // last 4 only (not full CHD)
    let bin = cardFieldView.getBIN()              // first 6 only (not full CHD)

    // Zero the native field buffers immediately
    cardFieldView.zeroAllBuffers()

    // Determine environment from apiUrl
    let environment: String
    if apiUrl.contains("sandbox") { environment = "sandbox" }
    else if apiUrl.contains("staging") { environment = "staging" }
    else { environment = "production" }

    // Tokenize via the Bolt tokenizer service (NaCl-encrypted)
    let tokenizer = BoltTokenizer(environment: environment)
    tokenizer.tokenize(panDigits: panDigits, cvvDigits: cvvDigits) { result in
      // Zero local copies of CHD
      for i in 0..<panDigits.count { panDigits[i] = 0 }
      for i in 0..<cvvDigits.count { cvvDigits[i] = 0 }

      switch result {
      case .failure(let error):
        reject("E_TOKENIZE_FAILED", error.localizedDescription, error as NSError)

      case .success(let tkResult):
        var tokenResult: [String: Any] = [
          "token": tkResult.token,
          "last4": tkResult.last4.isEmpty ? last4 : tkResult.last4,
          "bin": tkResult.bin.isEmpty ? bin : tkResult.bin,
          "network": network,
          "expiration": expiry,
        ]
        if let postal = postalCode, !postal.isEmpty {
          tokenResult["postal_code"] = postal
        }

        do {
          let jsonData = try JSONSerialization.data(withJSONObject: tokenResult)
          let jsonString = String(data: jsonData, encoding: .utf8) ?? "{}"
          resolve(jsonString)
        } catch let err {
          reject("E_SERIALIZE_FAILED", "Failed to serialize token result", err as NSError)
        }
      }
    }
  }
}
