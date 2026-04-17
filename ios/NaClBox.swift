import Foundation

/// Swift wrapper around the canonical TweetNaCl C implementation.
/// Provides NaCl crypto_box (Curve25519-XSalsa20-Poly1305).
/// Compatible with tweetnacl.box() used by the Bolt tokenizer service.
enum NaClBox {

  static let nonceLength = 24
  static let publicKeyLength = 32
  static let secretKeyLength = 32
  static let macLength = 16 // crypto_box_MACBYTES
  static let zeroLength = 32 // crypto_box_ZEROBYTES
  static let boxZeroLength = 16 // crypto_box_BOXZEROBYTES

  /// Generate a Curve25519 key pair.
  static func keyPair() -> (publicKey: [UInt8], secretKey: [UInt8])? {
    var pk = [UInt8](repeating: 0, count: publicKeyLength)
    var sk = [UInt8](repeating: 0, count: secretKeyLength)
    guard nacl_box_keypair(&pk, &sk) == 0 else { return nil }
    return (pk, sk)
  }

  /// Encrypt using NaCl crypto_box.
  /// Returns (ciphertext, nonce) where ciphertext = MAC (16 bytes) + encrypted message.
  static func seal(message: [UInt8], recipientPublicKey: [UInt8],
                   senderSecretKey: [UInt8]) -> (ciphertext: [UInt8], nonce: [UInt8])? {
    guard recipientPublicKey.count == publicKeyLength,
          senderSecretKey.count == secretKeyLength else { return nil }

    // Generate random nonce
    var nonce = [UInt8](repeating: 0, count: nonceLength)
    nacl_randombytes(&nonce, UInt64(nonceLength))

    // crypto_box requires zero-padded input: 32 zero bytes + message
    let paddedLen = zeroLength + message.count
    var padded = [UInt8](repeating: 0, count: paddedLen)
    for i in 0..<message.count {
      padded[zeroLength + i] = message[i]
    }

    var cipherPadded = [UInt8](repeating: 0, count: paddedLen)
    let result = nacl_box(&cipherPadded, padded, UInt64(paddedLen),
                          nonce, recipientPublicKey, senderSecretKey)

    // Zero the padded plaintext immediately after encryption
    for i in 0..<paddedLen { padded[i] = 0 }

    guard result == 0 else { return nil }

    // Strip the 16 leading zero bytes (BOXZEROBYTES), keep MAC + ciphertext
    let ciphertext = Array(cipherPadded[boxZeroLength...])
    return (ciphertext, nonce)
  }

  /// Decrypt using NaCl crypto_box_open.
  static func open(ciphertext: [UInt8], nonce: [UInt8],
                   senderPublicKey: [UInt8], recipientSecretKey: [UInt8]) -> [UInt8]? {
    guard nonce.count == nonceLength,
          senderPublicKey.count == publicKeyLength,
          recipientSecretKey.count == secretKeyLength,
          ciphertext.count >= macLength else { return nil }

    // Re-add the 16 leading zero bytes that were stripped
    let paddedLen = boxZeroLength + ciphertext.count
    var cipherPadded = [UInt8](repeating: 0, count: paddedLen)
    for i in 0..<ciphertext.count {
      cipherPadded[boxZeroLength + i] = ciphertext[i]
    }

    var plainPadded = [UInt8](repeating: 0, count: paddedLen)
    guard nacl_box_open(&plainPadded, cipherPadded, UInt64(paddedLen),
                        nonce, senderPublicKey, recipientSecretKey) == 0 else {
      return nil
    }

    // Strip the 32 leading zero bytes (ZEROBYTES) to get plaintext
    return Array(plainPadded[zeroLength...])
  }
}
