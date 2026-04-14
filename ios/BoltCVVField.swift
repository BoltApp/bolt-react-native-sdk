import UIKit

/// UITextField for CVV entry with secure text display.
///
/// Security controls:
/// - isSecureTextEntry = true always (SR-5)
/// - isAccessibilityElement = false (SR-8: VoiceOver must not read CVV)
/// - Copy/cut disabled
class BoltCVVField: BoltBaseField {

  private var rawDigits = [UInt8](repeating: 0, count: 4)
  private var digitCount: Int = 0
  private var expectedLength: Int = 3 // 3 for most networks, 4 for Amex

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  private func setup() {
    placeholder = "CVV"
    keyboardType = .numberPad
    isSecureTextEntry = true   // SR-5: always masked
    isAccessibilityElement = false // SR-8: VoiceOver must not read CVV
    autocorrectionType = .no
    spellCheckingType = .no
    delegate = self
    addTarget(self, action: #selector(textDidChange), for: .editingChanged)
  }

  /// Called by the container when the PAN field detects a card network change.
  func updateExpectedLength(for network: CardNetwork) {
    expectedLength = (network == .amex) ? 4 : 3
    // Re-validate in case length requirement changed
    validateAndNotify()
  }

  // MARK: - Validation

  override var isValid: Bool {
    return digitCount == expectedLength
  }

  func getRawDigits() -> [UInt8] {
    return Array(rawDigits[0..<digitCount])
  }

  override func validateOnBlur() {
    guard digitCount > 0 else { return }
    if digitCount != expectedLength {
      showError()
      onFieldError?("CVV is invalid")
    }
  }

  override func zeroBuffer() {
    for i in 0..<rawDigits.count {
      rawDigits[i] = 0
    }
    digitCount = 0
  }

  // MARK: - Copy/Paste control

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(copy(_:)) || action == #selector(cut(_:)) { return false }
    return super.canPerformAction(action, withSender: sender)
  }

  @objc private func textDidChange() {
    validateAndNotify()
  }
}

// MARK: - UITextFieldDelegate

extension BoltCVVField: UITextFieldDelegate {

  func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
    if string.isEmpty {
      // Backspace
      if digitCount > 0 {
        digitCount -= 1
        rawDigits[digitCount] = 0
      }
    } else {
      for char in string {
        guard digitCount < expectedLength, let ascii = char.asciiValue, ascii >= 48, ascii <= 57 else { continue }
        rawDigits[digitCount] = ascii - 48
        digitCount += 1
      }
    }
    // Always update the display to match digit count
    text = digitCount > 0 ? String(repeating: "•", count: digitCount) : ""
    textDidChange()
    return false
  }
}
