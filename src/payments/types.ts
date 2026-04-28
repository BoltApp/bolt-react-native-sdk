// ── Style Types ─────────────────────────────────────────────

export type Styles = {
  [property in `--bolt-${string}`]: string;
};

// ── Credit Card Validation Error Codes ──────────────────────

export const validationErrorMap = new Map<number, string>([
  [1000, 'Credit card number is required'],
  [2000, 'Credit card number is invalid'],
  [3000, 'Credit card type is not supported'],
  [1001, 'Expiration date is required'],
  [2001, 'Expiration date is invalid'],
  [3001, 'Credit card is expired'],
  [1002, 'CVV is required'],
  [2002, 'CVV is invalid'],
  [1003, 'Postal code is required'],
  [2003, 'Postal code is invalid'],
]);

// ── Credit Card Types ───────────────────────────────────────

export interface TokenResult {
  token?: string;
  last4?: string;
  bin?: string;
  expiration?: string;
  postal_code?: string;
  network?: string;
}

export type EventCallback = ((e: string) => void) | (() => void);
export type EventType = 'error' | 'valid' | 'blur' | 'focus';

export interface EventListeners {
  blur: EventCallback;
  error: EventCallback;
  focus: EventCallback;
  valid: EventCallback;
}

// ── 3D Secure Types ─────────────────────────────────────────

export type CreditCardId = { id: string; expiration: string };
export type CreditCardInfo = CreditCardId | TokenResult;

export const threeDSErrorMap = new Map<number, string>([
  [1001, 'Credit card id or credit card token must be supplied'],
  [1002, 'Credit card id and token cannot both be supplied'],
  [1003, 'Malformed credit card token'],
  [1004, 'Order token does not exist'],
  [1005, 'API response error during verification'],
  [1006, 'Verification not required'],
  [1007, 'Setup error during verification'],
  [1008, 'Authentication failed'],
  [1009, 'Failed to create challenge or challenge failed'],
  [1010, 'Failed to get device data collection jwt'],
]);

export class ThreeDSError extends Error {
  code: number;

  constructor(code: number) {
    super(threeDSErrorMap.get(code) ?? '');
    this.code = code;
    this.message = threeDSErrorMap.get(code) ?? '';
  }
}

export interface ThreeDSConfig {
  referenceID: string;
  jwtPayload: string;
  stepUpUrl: string;
}

export interface ThreeDSResult {
  success: boolean;
  error?: ThreeDSError;
}

// ── Wallet Button Types ──────────────────────────────────────

/**
 * Approved Apple Pay button label variants per Apple's Human Interface
 * Guidelines. Maps to PKPaymentButtonType values.
 */
export type ApplePayButtonType =
  | 'plain'
  | 'buy'
  | 'setUp'
  | 'inStore'
  | 'donate'
  | 'checkout'
  | 'book'
  | 'subscribe'
  | 'reload'
  | 'addMoney'
  | 'topUp'
  | 'order'
  | 'rent'
  | 'support'
  | 'contribute'
  | 'tip';

/**
 * Approved Google Pay button label variants per Google's brand guidelines.
 */
export type GooglePayButtonType =
  | 'plain'
  | 'buy'
  | 'pay'
  | 'checkout'
  | 'subscribe'
  | 'donate'
  | 'order'
  | 'book';

/**
 * Google Pay button color theme. Maps to ButtonConstants.ButtonTheme on Android.
 */
export type GooglePayButtonTheme = 'dark' | 'light';

// ── Apple Pay Types ─────────────────────────────────────────

export interface ApplePayResult {
  token: string;
  bin?: string;
  network?: string;
  expiration?: string;
  billingContact?: ApplePayBillingContact;
  /**
   * Bolt reference string, only populated in webview mode. Native mode
   * tokenizes via @boltpay/tokenizer and does not surface a reference. Left
   * optional on the shared result shape so consumers can read it
   * conditionally without narrowing on mode.
   */
  boltReference?: string;
}

export interface ApplePayBillingContact {
  givenName?: string;
  familyName?: string;
  emailAddress?: string;
  phoneNumber?: string;
  postalAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface ApplePayConfig {
  merchantId?: string; // required for mode: 'native', not needed for mode: 'webview'
  countryCode: string;
  currencyCode: string;
  supportedNetworks?: string[];
  total: {
    label: string;
    amount: string;
  };
}

// ── Google Pay Types ────────────────────────────────────────

export interface GooglePayResult {
  token: string;
  bin?: string;
  last4?: string;
  network?: string;
  expiration?: string;
  email?: string;
  billingAddress?: GooglePayBillingAddress;
  /**
   * @deprecated Not populated by the JS tokenizer flow introduced in 0.9.x.
   * Retained for backwards-compatible typing so consumers reading
   * `result.boltReference` still compile. Will be removed in the next major
   * version.
   */
  boltReference?: string;
}

export interface GooglePayBillingAddress {
  name?: string;
  address1?: string;
  address2?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode?: string;
  phoneNumber?: string;
}

/**
 * Configuration for the Google Pay button. Merchant/gateway config is
 * automatically fetched from Bolt's `/v1/apm_config/googlepay` endpoint
 * using the publishable key — you only need to provide presentation options.
 */
export interface GooglePayConfig {
  /** Billing address collection: "full" collects all fields, "none" skips. Defaults to "full". */
  billingAddressCollectionFormat?: 'full' | 'none';
  /** ISO 4217 currency code. Defaults to "USD". */
  currencyCode?: string;
  /** Label shown in the Google Pay sheet (e.g. "Store card for future charges"). */
  label?: string;
  /** Total price as a string (e.g. "10.00"). Defaults to "0.00". */
  amount?: string;
}

// ── Internal Google Pay APM Config (from Bolt API) ─────────

/** Shape returned by GET /v1/apm_config/googlepay */
export interface GooglePayAPMConfigResponse {
  merchant_config?: GooglePayAPMConfig;
  bolt_config: GooglePayAPMConfig;
}

export interface GooglePayAPMConfig {
  credit_card_processor: string;
  tokenization_specification: {
    type: string;
    parameters: Record<string, string>;
  };
  merchant_id: string;
  merchant_name: string;
}
