export interface TokenResult {
  token: string;
  last4: string;
  bin: string;
  network: string;
  expiration: string;
  postal_code: string;
}

export interface CreditCardInfo {
  token: string;
  bin: string;
  last4: string;
}

export interface ThreeDSConfig {
  referenceID: string;
  jwtPayload: string;
  stepUpUrl: string;
}

export interface ThreeDSResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

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

export interface GooglePayResult {
  token: string;
  billingAddress?: GooglePayBillingAddress;
}

export interface GooglePayBillingAddress {
  name?: string;
  address1?: string;
  address2?: string;
  locality?: string;
  administrativeArea?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface GooglePayConfig {
  merchantId: string;
  merchantName: string;
  countryCode: string;
  currencyCode: string;
  totalPrice: string;
  totalPriceStatus?: 'FINAL' | 'ESTIMATED';
}
