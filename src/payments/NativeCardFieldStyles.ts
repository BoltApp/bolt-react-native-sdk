/**
 * Style properties for the native credit card input fields.
 *
 * ADR-5: Native fields cannot use CSS custom properties (--bolt-*).
 * This type replaces the Styles type used by the WebView CreditCardController.
 */
export interface NativeCardFieldStyles {
  /** Text color as hex string (e.g., "#000000") */
  textColor?: string;
  /** Font size in points */
  fontSize?: number;
  /** Placeholder text color as hex string */
  placeholderColor?: string;
  /** Border color as hex string */
  borderColor?: string;
  /** Border width in points */
  borderWidth?: number;
  /** Corner radius in points */
  borderRadius?: number;
  /** Background color as hex string */
  backgroundColor?: string;
  /** System font family name */
  fontFamily?: string;
}
