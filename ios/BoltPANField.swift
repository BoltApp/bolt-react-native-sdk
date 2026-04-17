import UIKit

/// Detected card network from BIN range analysis.
enum CardNetwork: String {
  case visa
  case mastercard
  case amex
  case discover
  case unionpay
  case unknown
}

/// Custom UITextField for PAN entry with PCI-safe raw digit storage.
///
/// Raw digits are stored in a mutable UInt8 buffer that can be explicitly zeroed.
/// The field displays formatted text (e.g. "4242 4242 4242 4242") while focused,
/// and masks to show only last 4 after focus loss (SR-6).
///
/// Security controls:
/// - autocorrectionType = .no (prevents keyboard learning)
/// - spellCheckingType = .no (prevents text analysis)
/// - textContentType = .creditCardNumber on iOS 17+ (native autofill + camera scanner)
/// - Copy disabled via canPerformAction override
/// - Paste strips non-digits
class BoltPANField: BoltBaseField {

  /// Raw digit buffer — mutable, zeroable. Max 19 digits.
  private var rawDigits = [UInt8](repeating: 0, count: 19)
  private var digitCount: Int = 0
  private var cardNetwork: CardNetwork = .unknown

  var onCardTypeChanged: ((CardNetwork) -> Void)?

  /// The detected network as a string for the TokenResult.
  var detectedNetwork: String { cardNetwork.rawValue }

  /// Card brand icon displayed as leftView
  private let brandContainer: UIView = {
    let v = UIView(frame: CGRect(x: 0, y: 0, width: 48, height: 30))
    return v
  }()
  private let brandImageView: UIImageView = {
    let iv = UIImageView()
    iv.contentMode = .scaleAspectFit
    iv.frame = CGRect(x: 8, y: 3, width: 32, height: 24)
    return iv
  }()

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  private func setup() {
    placeholder = "Card number"
    keyboardType = .numberPad
    autocorrectionType = .no
    spellCheckingType = .no
    // SR-8: VoiceOver must not read the card number
    accessibilityLabel = "Card number"
    accessibilityTraits = .none
    autocapitalizationType = .none
    smartInsertDeleteType = .no

    // Card brand icon on the left
    brandContainer.addSubview(brandImageView)
    leftView = brandContainer
    leftViewMode = .always
    updateBrandIcon()

    if #available(iOS 17.0, *) {
      textContentType = .creditCardNumber
    }

    addTarget(self, action: #selector(textDidChange), for: .editingChanged)
    delegate = self
  }

  private static let assetBundle: Bundle? = {
    // Resource bundle created by CocoaPods from resource_bundles in podspec
    let candidates = [
      Bundle.main.url(forResource: "BoltCardBrandAssets", withExtension: "bundle"),
      Bundle(for: BoltPANField.self).url(forResource: "BoltCardBrandAssets", withExtension: "bundle"),
    ]
    for candidate in candidates {
      if let url = candidate, let bundle = Bundle(url: url) { return bundle }
    }
    return nil
  }()

  private func loadBrandImage(_ name: String) -> UIImage? {
    return UIImage(named: name, in: BoltPANField.assetBundle, compatibleWith: nil)
  }

  private func updateBrandIcon() {
    let imageName: String?
    switch cardNetwork {
    case .visa:       imageName = "visa"
    case .mastercard: imageName = "mastercard"
    case .amex:       imageName = "amex"
    case .discover:   imageName = "discover"
    case .unionpay:   imageName = nil
    case .unknown:    imageName = nil
    }

    if let name = imageName, let image = loadBrandImage(name) {
      brandImageView.image = image
      brandContainer.frame = CGRect(x: 0, y: 0, width: 48, height: 30)
    } else {
      brandImageView.image = nil
      // Just left padding when no icon
      brandContainer.frame = CGRect(x: 0, y: 0, width: 12, height: 30)
    }
  }

  override func validateOnBlur() {
    guard digitCount > 0 else { return }
    if cardNetwork == .unknown {
      showError()
      onFieldError?("Credit card type is not supported")
    } else if !passesLuhn() || digitCount < 13 {
      showError()
      onFieldError?("Credit card number is invalid")
    }
  }

  // MARK: - SR-8: Accessibility

  /// Prevent VoiceOver from reading the card number. Returns masked last 4 only.
  override var accessibilityValue: String? {
    get { digitCount >= 4 ? "ending in \(getLast4())" : nil }
    set { /* no-op — do not allow setting */ }
  }

  // MARK: - Validation

  override var isValid: Bool {
    return digitCount >= 13 && digitCount <= 19
      && cardNetwork != .unknown
      && passesLuhn()
  }

  private func passesLuhn() -> Bool {
    guard digitCount > 0 else { return false }
    var sum = 0
    var alternate = false
    for i in stride(from: digitCount - 1, through: 0, by: -1) {
      var n = Int(rawDigits[i])
      if alternate {
        n *= 2
        if n > 9 { n -= 9 }
      }
      sum += n
      alternate = !alternate
    }
    return sum % 10 == 0
  }

  // MARK: - BIN detection

  private func detectNetwork() {
    let old = cardNetwork

    guard digitCount >= 1 else {
      cardNetwork = .unknown
      if old != cardNetwork { onCardTypeChanged?(cardNetwork) }
      return
    }

    let d0 = rawDigits[0]
    let d1 = digitCount >= 2 ? rawDigits[1] : UInt8(0)
    let bin2 = Int(d0) * 10 + Int(d1)
    let bin4: Int = {
      guard digitCount >= 4 else { return 0 }
      return Int(rawDigits[0]) * 1000 + Int(rawDigits[1]) * 100 +
             Int(rawDigits[2]) * 10 + Int(rawDigits[3])
    }()
    let bin6: Int = {
      guard digitCount >= 6 else { return 0 }
      return Int(rawDigits[0]) * 100000 + Int(rawDigits[1]) * 10000 +
             Int(rawDigits[2]) * 1000 + Int(rawDigits[3]) * 100 +
             Int(rawDigits[4]) * 10 + Int(rawDigits[5])
    }()

    if d0 == 4 {
      cardNetwork = .visa
    } else if (bin2 >= 51 && bin2 <= 55) || (bin6 >= 222100 && bin6 <= 272099) {
      cardNetwork = .mastercard
    } else if bin2 == 34 || bin2 == 37 {
      cardNetwork = .amex
    } else if bin4 == 6011 || bin2 == 65 || (bin6 >= 644000 && bin6 <= 649999) {
      cardNetwork = .discover
    } else if bin2 == 62 {
      cardNetwork = .unionpay
    } else {
      cardNetwork = .unknown
    }

    if old != cardNetwork {
      updateBrandIcon()
      onCardTypeChanged?(cardNetwork)
    }
  }

  // MARK: - Formatting

  /// Returns the PAN formatted with spaces for display.
  private func formattedDisplayText() -> String {
    var result = ""
    let grouping: [Int] = cardNetwork == .amex ? [4, 6, 5] : [4, 4, 4, 4, 3]
    var idx = 0
    for groupSize in grouping {
      if idx >= digitCount { break }
      if !result.isEmpty { result += " " }
      let end = min(idx + groupSize, digitCount)
      for i in idx..<end {
        result += String(UnicodeScalar(rawDigits[i] + 48)) // 0..9 → "0".."9"
      }
      idx = end
    }
    return result
  }

  // MARK: - Text handling

  @objc private func textDidChange() {
    updateDisplayText()
    detectNetwork() // also updates brand icon when network changes
    validateAndNotify()
  }

  private func updateDisplayText() {
    text = formattedDisplayText()
  }

  // MARK: - Masking (SR-6)

  override func didBeginEditing() {
    super.didBeginEditing()
    isSecureTextEntry = false
    updateDisplayText()
  }

  override func didEndEditing() {
    super.didEndEditing()
    if digitCount > 0 {
      // Mask: show only last 4
      isSecureTextEntry = false // We'll show a custom masked string
      let last4 = getLast4()
      text = "•••• " + last4
    }
  }

  // MARK: - Raw data access

  func getRawDigits() -> [UInt8] {
    return Array(rawDigits[0..<digitCount])
  }

  func getLast4() -> String {
    guard digitCount >= 4 else { return "" }
    var result = ""
    for i in (digitCount - 4)..<digitCount {
      result += String(UnicodeScalar(rawDigits[i] + 48))
    }
    return result
  }

  func getBIN() -> String {
    let binLength = min(6, digitCount)
    guard binLength > 0 else { return "" }
    var result = ""
    for i in 0..<binLength {
      result += String(UnicodeScalar(rawDigits[i] + 48))
    }
    return result
  }

  override func zeroBuffer() {
    for i in 0..<rawDigits.count {
      rawDigits[i] = 0
    }
    digitCount = 0
  }

  // MARK: - Copy/Paste control

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    // Allow paste, disallow copy/cut (prevents CHD leaving via clipboard)
    if action == #selector(paste(_:)) { return true }
    if action == #selector(copy(_:)) || action == #selector(cut(_:)) { return false }
    return super.canPerformAction(action, withSender: sender)
  }

  override func paste(_ sender: Any?) {
    guard let pasted = UIPasteboard.general.string else { return }
    // Strip non-digits from paste content
    for char in pasted {
      guard digitCount < 19, let ascii = char.asciiValue, ascii >= 48, ascii <= 57 else { continue }
      rawDigits[digitCount] = ascii - 48
      digitCount += 1
    }
    textDidChange()
  }
}

// MARK: - UITextFieldDelegate

extension BoltPANField: UITextFieldDelegate {

  func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
    if string.isEmpty {
      // Backspace
      if digitCount > 0 {
        digitCount -= 1
        rawDigits[digitCount] = 0
      }
      textDidChange()
      return false
    }

    for char in string {
      guard digitCount < 19, let ascii = char.asciiValue, ascii >= 48, ascii <= 57 else { continue }
      rawDigits[digitCount] = ascii - 48
      digitCount += 1
    }
    textDidChange()
    return false // We manage text ourselves
  }
}
