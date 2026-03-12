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

// ── Apple Pay Types ─────────────────────────────────────────

export interface ApplePayResult {
  token: string;
  billingContact?: ApplePayBillingContact;
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
  merchantId: string;
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
  email?: string;
  billingAddress?: GooglePayBillingAddress;
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

export interface GooglePayConfig {
  merchantId: string;
  merchantName: string;
  countryCode: string;
  currencyCode: string;
  totalPrice: string;
  totalPriceStatus?: 'FINAL' | 'ESTIMATED';
}
