import UIKit

/// Base class for all card input fields. Provides common styling,
/// focus/blur handling, and validation callback infrastructure.
class BoltBaseField: UITextField {

  var onFieldFocus: (() -> Void)?
  var onFieldBlur: (() -> Void)?
  var onFieldError: ((String) -> Void)?
  var onFieldValidityChanged: (() -> Void)?

  private let errorColor = UIColor(red: 220/255, green: 38/255, blue: 38/255, alpha: 1) // #dc2626
  private let normalTextColor = UIColor.label
  /// Override in subclasses to report field-specific validity.
  var isValid: Bool { return false }

  override init(frame: CGRect) {
    super.init(frame: frame)
    commonSetup()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  private func commonSetup() {
    borderStyle = .none
    font = UIFont.systemFont(ofSize: 16)
    textColor = normalTextColor
    autocorrectionType = .no
    spellCheckingType = .no
    tintColor = UIColor(red: 90/255, green: 49/255, blue: 244/255, alpha: 1) // Bolt purple cursor

    let paddingView = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 0))
    leftView = paddingView
    leftViewMode = .always

    addTarget(self, action: #selector(handleEditingDidBegin), for: .editingDidBegin)
    addTarget(self, action: #selector(handleEditingDidEnd), for: .editingDidEnd)
  }

  @objc private func handleEditingDidBegin() {
    didBeginEditing()
    clearError()
    onFieldFocus?()
  }

  @objc private func handleEditingDidEnd() {
    didEndEditing()
    onFieldBlur?()
    // Show error on blur if field has been edited and is invalid
    validateOnBlur()
  }

  /// Override point for subclasses to handle focus.
  func didBeginEditing() {}

  /// Override point for subclasses to handle blur.
  func didEndEditing() {}

  /// Call after any content change to fire validation events.
  func validateAndNotify() {
    if isValid {
      clearError()
      onFieldValidityChanged?()
    }
  }

  /// Called on blur — show error if field was edited but is invalid.
  func validateOnBlur() {
    // Override in subclasses to provide specific error messages
  }

  /// Show error state — red text color.
  func showError() {
    textColor = errorColor
  }

  /// Clear error state.
  func clearError() {
    textColor = normalTextColor
  }

  /// Override in subclasses to zero sensitive data.
  func zeroBuffer() {}
}

// MARK: - UIColor hex initializer

extension UIColor {
  convenience init(hex: String) {
    var hexStr = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if hexStr.hasPrefix("#") { hexStr.removeFirst() }
    var rgb: UInt64 = 0
    Scanner(string: hexStr).scanHexInt64(&rgb)
    let r = CGFloat((rgb >> 16) & 0xFF) / 255
    let g = CGFloat((rgb >> 8) & 0xFF) / 255
    let b = CGFloat(rgb & 0xFF) / 255
    self.init(red: r, green: g, blue: b, alpha: 1)
  }
}
