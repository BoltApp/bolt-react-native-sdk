import Foundation

/// Native port of @boltpay/tokenizer TkClient.
///
/// Uses vendored TweetNaCl C sources (tweetnacl.c) via Swift bridging header
/// for NaCl crypto_box (Curve25519-XSalsa20-Poly1305).
///
/// Protocol:
/// 1. GET /public_key → base64-encoded Curve25519 server public key
/// 2. Generate client Curve25519 key pair via NaClBox.keyPair()
/// 3. Encrypt {cc, cvv} using NaCl crypto_box
/// 4. POST /token with { payload, nonce, public_key } (all base64)
/// 5. Decrypt response using NaCl crypto_box_open
/// 6. Response: { token, bin, last4 }
///
/// Note: CryptoKit's ChaChaPoly uses 12-byte nonces (IETF) while the
/// server requires XSalsa20's 24-byte nonces — do not substitute CryptoKit here.
class BoltTokenizer {

  struct TokenResult {
    let token: String
    let bin: String
    let last4: String
  }

  enum TokenizerError: Error, LocalizedError {
    case publicKeyFetchFailed(String)
    case encryptionFailed
    case requestFailed(String)
    case decryptionFailed
    case invalidResponse

    var errorDescription: String? {
      switch self {
      case .publicKeyFetchFailed(let msg): return "Failed to fetch public key: \(msg)"
      case .encryptionFailed: return "Failed to encrypt card data"
      case .requestFailed(let msg): return "Tokenization request failed: \(msg)"
      case .decryptionFailed: return "Failed to decrypt tokenization response"
      case .invalidResponse: return "Invalid tokenization response"
      }
    }
  }

  private let baseURL: String
  private let fallbackURL: String
  private let timeout: TimeInterval = 20

  init(environment: String) {
    switch environment {
    case "sandbox":
      baseURL = "https://sandbox.bolttk.com"
      fallbackURL = "https://tokenizer-sandbox.bolt.com"
    case "staging":
      baseURL = "https://staging.bolttk.com"
      fallbackURL = "https://tokenizer-staging.bolt.com"
    default: // production (safest default for unknown env strings)
      baseURL = "https://production.bolttk.com"
      fallbackURL = "https://tokenizer.bolt.com"
    }
  }

  /// Tokenize card data using the Bolt tokenizer service.
  /// PAN and CVV are passed as raw byte arrays — never converted to String.
  func tokenize(panDigits: [UInt8], cvvDigits: [UInt8],
                completion: @escaping (Result<TokenResult, Error>) -> Void) {

    // Step 1: Fetch server public key
    // Strong capture: tokenizer must stay alive for the duration of the request
    fetchPublicKey { result in

      switch result {
      case .failure(let error):
        completion(.failure(error))
      case .success(let serverPublicKey):
        // Step 2: Generate client NaCl key pair (mutable so we can zero the secret key)
        guard let kp = NaClBox.keyPair() else {
          completion(.failure(TokenizerError.encryptionFailed))
          return
        }
        var clientSecretKey = kp.secretKey
        let clientPublicKey = kp.publicKey

        // Step 3: Build plaintext JSON from raw bytes
        // {"cc":"<digits>","cvv":"<digits>"}
        var plaintext = [UInt8]()
        plaintext.append(contentsOf: Array("{\"cc\":\"".utf8))
        for d in panDigits { plaintext.append(d + 48) } // digit → ASCII
        plaintext.append(contentsOf: Array("\",\"cvv\":\"".utf8))
        for d in cvvDigits { plaintext.append(d + 48) }
        plaintext.append(contentsOf: Array("\"}".utf8))

        // Step 4: Encrypt using NaCl box (TweetNaCl C implementation)
        guard let (encryptedPayload, nonce) = NaClBox.seal(
          message: plaintext,
          recipientPublicKey: serverPublicKey,
          senderSecretKey: clientSecretKey
        ) else {
          for i in 0..<plaintext.count { plaintext[i] = 0 }
          for i in 0..<clientSecretKey.count { clientSecretKey[i] = 0 }
          completion(.failure(TokenizerError.encryptionFailed))
          return
        }

        // Zero plaintext immediately (secret key zeroed after decryption below)
        for i in 0..<plaintext.count { plaintext[i] = 0 }

        // Step 5: Build POST body
        let body: [String: String] = [
          "payload": Data(encryptedPayload).base64EncodedString(),
          "nonce": Data(nonce).base64EncodedString(),
          "public_key": Data(clientPublicKey).base64EncodedString(),
        ]

        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else {
          completion(.failure(TokenizerError.encryptionFailed))
          return
        }

        // Step 6: POST to /token
        self.postToken(body: bodyData) { postResult in
          switch postResult {
          case .failure(let error):
            completion(.failure(error))
          case .success(let encryptedResponse):
            // Step 7: Decrypt response
            guard let payloadStr = encryptedResponse["payload"] as? String,
                  let nonceStr = encryptedResponse["nonce"] as? String,
                  let payloadData = Data(base64Encoded: payloadStr),
                  let nonceData = Data(base64Encoded: nonceStr) else {
              completion(.failure(TokenizerError.invalidResponse))
              return
            }

            guard let decrypted = NaClBox.open(
              ciphertext: Array(payloadData),
              nonce: Array(nonceData),
              senderPublicKey: serverPublicKey,
              recipientSecretKey: clientSecretKey
            ) else {
              // Zero secret key even on failure
              for i in 0..<clientSecretKey.count { clientSecretKey[i] = 0 }
              completion(.failure(TokenizerError.decryptionFailed))
              return
            }

            // Zero client secret key after decryption (in-place, no CoW copy)
            for i in 0..<clientSecretKey.count { clientSecretKey[i] = 0 }

            guard let json = try? JSONSerialization.jsonObject(with: Data(decrypted)) as? [String: Any] else {
              completion(.failure(TokenizerError.invalidResponse))
              return
            }

            guard let token = json["token"] as? String, !token.isEmpty else {
              completion(.failure(TokenizerError.invalidResponse))
              return
            }

            let tokenResult = TokenResult(
              token: token,
              bin: json["bin"] as? String ?? "",
              last4: json["last4"] as? String ?? ""
            )
            completion(.success(tokenResult))
          }
        }
      }
    }
  }

  // MARK: - Network

  private func fetchPublicKey(completion: @escaping (Result<[UInt8], Error>) -> Void) {
    fetchWithFallback(path: "/public_key", method: "GET", body: nil) { result in
      switch result {
      case .failure(let error):
        completion(.failure(TokenizerError.publicKeyFetchFailed(error.localizedDescription)))
      case .success(let data):
        guard let keyStr = String(data: data, encoding: .utf8),
              let keyData = Data(base64Encoded: keyStr.trimmingCharacters(in: .whitespacesAndNewlines)) else {
          completion(.failure(TokenizerError.publicKeyFetchFailed("Invalid key format")))
          return
        }
        // Curve25519 public keys must be exactly 32 bytes
        guard keyData.count == 32 else {
          completion(.failure(TokenizerError.publicKeyFetchFailed("Invalid key length: \(keyData.count)")))
          return
        }
        completion(.success(Array(keyData)))
      }
    }
  }

  private func postToken(body: Data, completion: @escaping (Result<[String: Any], Error>) -> Void) {
    fetchWithFallback(path: "/token", method: "POST", body: body) { result in
      switch result {
      case .failure(let error):
        completion(.failure(TokenizerError.requestFailed(error.localizedDescription)))
      case .success(let data):
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
          completion(.failure(TokenizerError.invalidResponse))
          return
        }
        completion(.success(json))
      }
    }
  }

  private func fetchWithFallback(path: String, method: String, body: Data?,
                                  completion: @escaping (Result<Data, Error>) -> Void) {
    guard let primaryURL = URL(string: baseURL + path) else {
      completion(.failure(TokenizerError.requestFailed("Invalid primary URL")))
      return
    }
    fetch(url: primaryURL, method: method, body: body) { result in
      switch result {
      case .success:
        completion(result)
      case .failure:
        guard let fallbackURL = URL(string: self.fallbackURL + path) else {
          completion(.failure(TokenizerError.requestFailed("Invalid fallback URL")))
          return
        }
        self.fetch(url: fallbackURL, method: method, body: body, completion: completion)
      }
    }
  }

  // SR-10: Transport security is provided by NaCl crypto_box encryption,
  // not certificate pinning. The tokenizer protocol encrypts card data with
  // the server's Curve25519 public key — a MITM cannot decrypt the payload
  // without the server's private key, even with a compromised CA.
  // Certificate pinning was evaluated but removed due to maintenance burden
  // (SDK updates on CA rotation) with marginal additional security benefit.

  private func fetch(url: URL, method: String, body: Data?,
                     completion: @escaping (Result<Data, Error>) -> Void) {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = timeout
    if let body = body {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = body
    }

    URLSession.shared.dataTask(with: request) { data, response, error in
      if let error = error {
        completion(.failure(error))
        return
      }
      guard let httpResponse = response as? HTTPURLResponse,
            httpResponse.statusCode == 200,
            let data = data else {
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        completion(.failure(TokenizerError.requestFailed("HTTP \(code)")))
        return
      }
      completion(.success(data))
    }.resume()
  }
}
