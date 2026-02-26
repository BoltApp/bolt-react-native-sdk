import Foundation

/// TurboModule implementation for native HTTP networking.
/// Provides high-performance HTTP for non-UI API calls like tokenization.
@objc(BoltNetworking)
class NetworkingModule: NSObject {

  @objc
  static func moduleName() -> String {
    return "BoltNetworking"
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func request(_ method: String,
               url: String,
               headers: String,
               body: String,
               resolve: @escaping (Any) -> Void,
               reject: @escaping (String, String, NSError) -> Void) {
    guard let requestUrl = URL(string: url) else {
      reject("INVALID_URL", "Invalid URL: \(url)", NSError(domain: "BoltNetworking", code: 1))
      return
    }

    var request = URLRequest(url: requestUrl)
    request.httpMethod = method

    // Parse and set headers
    if let headersData = headers.data(using: .utf8),
       let headerDict = try? JSONSerialization.jsonObject(with: headersData) as? [String: String] {
      for (key, value) in headerDict {
        request.setValue(value, forHTTPHeaderField: key)
      }
    }

    // Set body if not empty
    if !body.isEmpty {
      request.httpBody = body.data(using: .utf8)
    }

    URLSession.shared.dataTask(with: request) { data, response, error in
      if let error = error {
        reject("NETWORK_ERROR", error.localizedDescription, error as NSError)
        return
      }

      let httpResponse = response as? HTTPURLResponse
      let status = httpResponse?.statusCode ?? 0
      let responseHeaders = httpResponse?.allHeaderFields as? [String: String] ?? [:]
      let responseBody = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""

      let result: [String: Any] = [
        "status": status,
        "headers": responseHeaders,
        "body": responseBody
      ]

      if let jsonData = try? JSONSerialization.data(withJSONObject: result),
         let jsonString = String(data: jsonData, encoding: .utf8) {
        resolve(jsonString)
      } else {
        reject("SERIALIZE_ERROR", "Failed to serialize response", NSError(domain: "BoltNetworking", code: 2))
      }
    }.resume()
  }
}
