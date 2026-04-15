import UIKit

/// UITextField for postal/ZIP code entry.
///
/// Validation: US 5-digit or ZIP+4, international: non-empty.
class BoltPostalField: BoltBaseField {

  override init(frame: CGRect) {
    super.init(frame: frame)
    setup()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  private func setup() {
    placeholder = "Billing zip"
    keyboardType = .default
    autocorrectionType = .no
    spellCheckingType = .no
    autocapitalizationType = .allCharacters
    addTarget(self, action: #selector(textDidChange), for: .editingChanged)
  }

  override var isValid: Bool {
    guard let text = text, !text.isEmpty else { return false }
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    // US: 5 digits or ZIP+4 (12345 or 12345-6789)
    let usZipPattern = "^\\d{5}(-\\d{4})?$"
    if trimmed.range(of: usZipPattern, options: .regularExpression) != nil {
      return true
    }
    // International: non-empty
    return !trimmed.isEmpty
  }

  override func validateOnBlur() {
    guard let text = text, !text.trimmingCharacters(in: .whitespaces).isEmpty else {
      showError()
      onFieldError?("Postal code is required")
      return
    }
    if !isValid {
      showError()
      onFieldError?("Postal code is invalid")
    }
  }

  @objc private func textDidChange() {
    validateAndNotify()
  }
}
