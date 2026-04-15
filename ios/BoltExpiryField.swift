import UIKit

/// UITextField for MM/YY expiry entry with auto-formatting.
///
/// Auto-inserts "/" after the 2nd digit. Validates month (01–12)
/// and that the expiry is not in the past.
class BoltExpiryField: BoltBaseField {

  private var rawDigits = [UInt8](repeating: 0, count: 4) // MMYY
  private var digitCount: Int = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  private func setup() {
    placeholder = "Expiration"
    keyboardType = .numberPad
    delegate = self
    addTarget(self, action: #selector(textDidChange), for: .editingChanged)
  }

  // MARK: - Validation

  override var isValid: Bool {
    guard digitCount == 4 else { return false }
    let month = Int(rawDigits[0]) * 10 + Int(rawDigits[1])
    let year = Int(rawDigits[2]) * 10 + Int(rawDigits[3])
    guard month >= 1 && month <= 12 else { return false }

    let calendar = Calendar.current
    let now = Date()
    let currentYear = calendar.component(.year, from: now) % 100
    let currentMonth = calendar.component(.month, from: now)

    if year < currentYear { return false }
    if year == currentYear && month < currentMonth { return false }
    return true
  }

  /// Returns expiry as "YYYY-MM" for the tokenization request.
  func getFormattedExpiry() -> String {
    guard digitCount == 4 else { return "" }
    let month = Int(rawDigits[0]) * 10 + Int(rawDigits[1])
    let year = 2000 + Int(rawDigits[2]) * 10 + Int(rawDigits[3])
    return String(format: "%04d-%02d", year, month)
  }

  override func validateOnBlur() {
    guard digitCount > 0 else { return }
    if digitCount < 4 {
      showError()
      onFieldError?("Expiration date is invalid")
    } else {
      let month = Int(rawDigits[0]) * 10 + Int(rawDigits[1])
      let year = Int(rawDigits[2]) * 10 + Int(rawDigits[3])
      let calendar = Calendar.current
      let now = Date()
      let currentYear = calendar.component(.year, from: now) % 100
      let currentMonth = calendar.component(.month, from: now)

      if month < 1 || month > 12 {
        showError()
        onFieldError?("Expiration date is invalid")
      } else if year < currentYear || (year == currentYear && month < currentMonth) {
        showError()
        onFieldError?("Credit card is expired")
      }
    }
  }

  override func zeroBuffer() {
    for i in 0..<rawDigits.count {
      rawDigits[i] = 0
    }
    digitCount = 0
  }

  // MARK: - Display

  @objc private func textDidChange() {
    updateDisplayText()
    validateAndNotify()
  }

  private func updateDisplayText() {
    var result = ""
    for i in 0..<digitCount {
      if i == 2 { result += "/" }
      result += String(UnicodeScalar(rawDigits[i] + 48))
    }
    text = result
  }
}

// MARK: - UITextFieldDelegate

extension BoltExpiryField: UITextFieldDelegate {

  func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
    if string.isEmpty {
      if digitCount > 0 {
        digitCount -= 1
        rawDigits[digitCount] = 0
      }
      textDidChange()
      return false
    }

    for char in string {
      guard digitCount < 4, let ascii = char.asciiValue, ascii >= 48, ascii <= 57 else { continue }
      rawDigits[digitCount] = ascii - 48
      digitCount += 1
    }
    textDidChange()
    return false
  }
}
