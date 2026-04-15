import UIKit

/// Container UIView that hosts the PAN, expiry, CVV, and optional postal code fields.
/// This view is embedded as a child of the ObjC++ BoltCreditCardFieldComponentView
/// (which handles Fabric lifecycle and event emission).
///
/// CHD lives only in native memory — never crosses to JavaScript.
///
/// SR-7 note: Screen capture prevention is handled on Android via FLAG_SECURE.
/// On iOS, UIScreen.main.isCaptured monitoring is deferred to Phase C.
@objc public class BoltCreditCardFieldView: UIView {

  // MARK: - Event callbacks (set by ComponentView)

  @objc public var onValidCallback: (() -> Void)?
  @objc public var onErrorCallback: ((String) -> Void)?
  @objc public var onFocusCallback: (() -> Void)?
  @objc public var onBlurCallback: (() -> Void)?

  // MARK: - Fields

  let panField = BoltPANField()
  let expiryField = BoltExpiryField()
  let cvvField = BoltCVVField()
  let postalField = BoltPostalField()

  // Dynamic colors for dark mode support
  private let borderColor = UIColor { trait in
    trait.userInterfaceStyle == .dark
      ? UIColor(red: 55/255, green: 65/255, blue: 81/255, alpha: 1) // #374151
      : UIColor(red: 209/255, green: 213/255, blue: 219/255, alpha: 1) // #d1d5db
  }
  private let fieldBg = UIColor { trait in
    trait.userInterfaceStyle == .dark
      ? UIColor(red: 31/255, green: 41/255, blue: 55/255, alpha: 1) // #1f2937
      : UIColor(red: 250/255, green: 250/255, blue: 250/255, alpha: 1) // #fafafa
  }

  // Row containers (each gets its own rounded border)
  private let panRow = UIView()
  private let middleRow = UIView()
  private let middleDivider = UIView()
  private let postalRow = UIView()

  private var publishableKey: String = ""

  // SR-7: Screen capture prevention overlay
  private let captureOverlay: UIView = {
    let v = UIView()
    v.backgroundColor = .systemBackground
    v.isHidden = true
    v.translatesAutoresizingMaskIntoConstraints = false
    return v
  }()
  private var captureObserver: NSObjectProtocol?

  // MARK: - Init

  @objc public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear

    // SR-12: In production, log warning if device is jailbroken
    #if !DEBUG
    if BoltDeviceIntegrity.isJailbroken {
      NSLog("[Bolt] Warning: Device appears to be jailbroken.")
    }
    #endif

    setupLayout()
    setupFieldCallbacks()
    setupCaptureMonitoring()
  }

  @objc public convenience init() {
    self.init(frame: .zero)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) is not supported")
  }

  deinit {
    zeroAllBuffers()
    if let observer = captureObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  // MARK: - SR-12 Debug Warning

  private func setupDebugWarning() {
    let label = UILabel()
    label.text = "Card fields are not available in debug mode or on simulators."
    label.textColor = .secondaryLabel
    label.font = UIFont.systemFont(ofSize: 14)
    label.textAlignment = .center
    label.numberOfLines = 0
    label.translatesAutoresizingMaskIntoConstraints = false
    addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: centerXAnchor),
      label.centerYAnchor.constraint(equalTo: centerYAnchor),
      label.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
      label.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
    ])
  }

  // MARK: - Props

  @objc public func applyFieldStyles(
    textColor: String?, fontSize: CGFloat, placeholderColor: String?,
    borderColor: String?, borderWidth: CGFloat, borderRadius: CGFloat,
    backgroundColor: String?, fontFamily: String?
  ) {
    let allFields: [BoltBaseField] = [panField, expiryField, cvvField, postalField]
    let rows = [panRow, middleRow, postalRow]

    if let hex = textColor, !hex.isEmpty {
      let color = UIColor(hex: hex)
      for f in allFields { f.textColor = color }
    }
    if fontSize > 0 {
      let font: UIFont
      if let family = fontFamily, !family.isEmpty {
        font = UIFont(name: family, size: fontSize) ?? UIFont.systemFont(ofSize: fontSize)
      } else {
        font = UIFont.systemFont(ofSize: fontSize)
      }
      for f in allFields { f.font = font }
    }
    if let hex = placeholderColor, !hex.isEmpty {
      let color = UIColor(hex: hex)
      for f in allFields {
        if let placeholder = f.placeholder {
          f.attributedPlaceholder = NSAttributedString(
            string: placeholder, attributes: [.foregroundColor: color]
          )
        }
      }
    }
    if let hex = borderColor, !hex.isEmpty {
      let color = UIColor(hex: hex)
      for r in rows { r.layer.borderColor = color.cgColor }
    }
    if borderWidth > 0 {
      for r in rows { r.layer.borderWidth = borderWidth }
    }
    if borderRadius > 0 {
      for r in rows { r.layer.cornerRadius = borderRadius }
    }
    if let hex = backgroundColor, !hex.isEmpty {
      let color = UIColor(hex: hex)
      for r in rows { r.backgroundColor = color }
    }
  }

  @objc public func setPublishableKey(_ key: String) {
    publishableKey = key
  }

  // MARK: - Layout

  private func styleRow(_ row: UIView) {
    row.backgroundColor = fieldBg
    row.layer.borderColor = borderColor.cgColor
    row.layer.borderWidth = 1
    row.layer.cornerRadius = 10
    row.clipsToBounds = true
    row.translatesAutoresizingMaskIntoConstraints = false
  }

  private func setupLayout() {
    let fieldHeight: CGFloat = 48
    let rowSpacing: CGFloat = 16
    let dividerThickness: CGFloat = 1.0 / UIScreen.main.scale

    // Style each row container
    for row in [panRow, middleRow, postalRow] { styleRow(row) }
    middleDivider.backgroundColor = borderColor
    middleDivider.translatesAutoresizingMaskIntoConstraints = false

    // PAN row
    panField.translatesAutoresizingMaskIntoConstraints = false
    panRow.addSubview(panField)

    // Middle row: expiry | divider | CVV
    expiryField.translatesAutoresizingMaskIntoConstraints = false
    cvvField.translatesAutoresizingMaskIntoConstraints = false
    middleRow.addSubview(expiryField)
    middleRow.addSubview(middleDivider)
    middleRow.addSubview(cvvField)

    // Postal row
    postalField.translatesAutoresizingMaskIntoConstraints = false
    postalRow.addSubview(postalField)

    addSubview(panRow)
    addSubview(middleRow)
    addSubview(postalRow)
    postalRow.isHidden = true

    NSLayoutConstraint.activate([
      // PAN row
      panRow.topAnchor.constraint(equalTo: topAnchor),
      panRow.leadingAnchor.constraint(equalTo: leadingAnchor),
      panRow.trailingAnchor.constraint(equalTo: trailingAnchor),
      panRow.heightAnchor.constraint(equalToConstant: fieldHeight),

      panField.topAnchor.constraint(equalTo: panRow.topAnchor),
      panField.bottomAnchor.constraint(equalTo: panRow.bottomAnchor),
      panField.leadingAnchor.constraint(equalTo: panRow.leadingAnchor),
      panField.trailingAnchor.constraint(equalTo: panRow.trailingAnchor),

      // Middle row (expiry + CVV)
      middleRow.topAnchor.constraint(equalTo: panRow.bottomAnchor, constant: rowSpacing),
      middleRow.leadingAnchor.constraint(equalTo: leadingAnchor),
      middleRow.trailingAnchor.constraint(equalTo: trailingAnchor),
      middleRow.heightAnchor.constraint(equalToConstant: fieldHeight),

      expiryField.topAnchor.constraint(equalTo: middleRow.topAnchor),
      expiryField.bottomAnchor.constraint(equalTo: middleRow.bottomAnchor),
      expiryField.leadingAnchor.constraint(equalTo: middleRow.leadingAnchor),

      middleDivider.topAnchor.constraint(equalTo: middleRow.topAnchor),
      middleDivider.bottomAnchor.constraint(equalTo: middleRow.bottomAnchor),
      middleDivider.leadingAnchor.constraint(equalTo: expiryField.trailingAnchor),
      middleDivider.widthAnchor.constraint(equalToConstant: dividerThickness),
      middleDivider.centerXAnchor.constraint(equalTo: middleRow.centerXAnchor),

      cvvField.topAnchor.constraint(equalTo: middleRow.topAnchor),
      cvvField.bottomAnchor.constraint(equalTo: middleRow.bottomAnchor),
      cvvField.leadingAnchor.constraint(equalTo: middleDivider.trailingAnchor),
      cvvField.trailingAnchor.constraint(equalTo: middleRow.trailingAnchor),

      // Postal row
      postalRow.topAnchor.constraint(equalTo: middleRow.bottomAnchor, constant: rowSpacing),
      postalRow.leadingAnchor.constraint(equalTo: leadingAnchor),
      postalRow.trailingAnchor.constraint(equalTo: trailingAnchor),
      postalRow.heightAnchor.constraint(equalToConstant: fieldHeight),

      postalField.topAnchor.constraint(equalTo: postalRow.topAnchor),
      postalField.bottomAnchor.constraint(equalTo: postalRow.bottomAnchor),
      postalField.leadingAnchor.constraint(equalTo: postalRow.leadingAnchor),
      postalField.trailingAnchor.constraint(equalTo: postalRow.trailingAnchor),
    ])
  }

  @objc public func setShowPostalCode(_ show: Bool) {
    postalRow.isHidden = !show
  }

  // MARK: - SR-7: Screen capture prevention

  private func setupCaptureMonitoring() {
    // Add overlay that covers card fields when screen is being recorded/mirrored
    addSubview(captureOverlay)
    NSLayoutConstraint.activate([
      captureOverlay.topAnchor.constraint(equalTo: topAnchor),
      captureOverlay.bottomAnchor.constraint(equalTo: bottomAnchor),
      captureOverlay.leadingAnchor.constraint(equalTo: leadingAnchor),
      captureOverlay.trailingAnchor.constraint(equalTo: trailingAnchor),
    ])

    // Check initial state
    updateCaptureOverlay()

    // Monitor changes
    captureObserver = NotificationCenter.default.addObserver(
      forName: UIScreen.capturedDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.updateCaptureOverlay()
    }
  }

  private func updateCaptureOverlay() {
    captureOverlay.isHidden = !UIScreen.main.isCaptured
  }

  // MARK: - Dark mode

  public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    if traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection) {
      // CGColor doesn't auto-update with dynamic UIColor — re-apply
      for row in [panRow, middleRow, postalRow] {
        row.layer.borderColor = borderColor.cgColor
        row.backgroundColor = fieldBg
      }
      middleDivider.backgroundColor = borderColor
    }
  }

  // MARK: - Field callbacks

  private func setupFieldCallbacks() {
    let fields: [BoltBaseField] = [panField, expiryField, cvvField, postalField]
    for field in fields {
      field.onFieldFocus = { [weak self] in self?.onFocusCallback?() }
      field.onFieldBlur = { [weak self] in self?.handleBlur() }
      field.onFieldError = { [weak self] msg in self?.onErrorCallback?(msg) }
    }

    panField.onCardTypeChanged = { [weak self] cardType in
      self?.cvvField.updateExpectedLength(for: cardType)
    }

    panField.onFieldValidityChanged = { [weak self] in self?.checkAllFieldsValid() }
    expiryField.onFieldValidityChanged = { [weak self] in self?.checkAllFieldsValid() }
    cvvField.onFieldValidityChanged = { [weak self] in self?.checkAllFieldsValid() }
    postalField.onFieldValidityChanged = { [weak self] in self?.checkAllFieldsValid() }
  }

  private func handleBlur() {
    onBlurCallback?()
  }

  private func checkAllFieldsValid() {
    let postalValid = postalRow.isHidden || postalField.isValid
    if panField.isValid && expiryField.isValid && cvvField.isValid && postalValid {
      onValidCallback?()
    }
  }

  // MARK: - Data access (called by TurboModule during tokenize)

  /// Returns raw card data as byte arrays. The caller is responsible for zeroing after use.
  @objc public func getRawPAN() -> [UInt8] {
    return panField.getRawDigits()
  }

  @objc public func getRawExpiry() -> String {
    return expiryField.getFormattedExpiry()
  }

  @objc public func getRawCVV() -> [UInt8] {
    return cvvField.getRawDigits()
  }

  @objc public func getRawPostalCode() -> String? {
    return postalRow.isHidden ? nil : postalField.text
  }

  @objc public func getCardNetwork() -> String {
    return panField.detectedNetwork
  }

  @objc public func getLast4() -> String {
    return panField.getLast4()
  }

  @objc public func getBIN() -> String {
    return panField.getBIN()
  }

  /// Zero all card data buffers. Called after tokenization (all exit paths) and in deinit.
  @objc public func zeroAllBuffers() {
    panField.zeroBuffer()
    expiryField.zeroBuffer()
    cvvField.zeroBuffer()
    postalField.text = ""
  }
}
