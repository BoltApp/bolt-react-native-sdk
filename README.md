# @boltpay/react-native

[![npm version](https://img.shields.io/npm/v/@boltpay/react-native)](https://www.npmjs.com/package/@boltpay/react-native)
[![build](https://img.shields.io/github/actions/workflow/status/BoltApp/bolt-react-native-sdk/ci.yml?branch=main)](https://github.com/BoltApp/bolt-react-native-sdk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@boltpay/react-native)](LICENSE)

Bolt React Native SDK for payments. Provides Credit Card tokenization, 3D Secure verification, Apple Pay, and Google Pay — all integrated with the Bolt payment platform.

## Architecture

- **Credit Card (WebView)** — WebView-based, loading secure pages from `connect.bolt.com`. Card data never touches your app (PCI SAQ A compliant).
- **Credit Card (Native)** — Platform-native text fields (`UITextField` on iOS, `EditText` on Android). Card data stays in native memory, never enters the JS heap. Requires Bolt PCI SSS certification for SAQ A — see [Native Credit Card (Beta)](#7-native-credit-card-beta) below.
- **Apple Pay & Google Pay** — Native Fabric view components for buttons (`PKPaymentButton` on iOS, `PayButton` on Android) with TurboModules for the payment sheet.

## Installation

```sh
npm install @boltpay/react-native react-native-webview react-native-get-random-values
# or
yarn add @boltpay/react-native react-native-webview react-native-get-random-values
```

For iOS:

```sh
cd ios && pod install
```

`react-native-get-random-values` is required because the SDK tokenizes wallet
payloads (Apple Pay / Google Pay) using `@boltpay/tokenizer`, which needs a
secure PRNG. Hermes and JavaScriptCore do not ship `crypto.getRandomValues` on
their own — this peer dependency provides the native implementation via React
Native autolinking. Install it once alongside the SDK; you don't need to import
it in your app code, since the SDK activates the polyfill internally the first
time a wallet component mounts.

### Requirements

- React Native >= 0.73.0
- React >= 18.0.0
- react-native-webview >= 13.0.0
- react-native-get-random-values >= 2.0.0

## Quick Start

### 1. Initialize Bolt

```typescript
import { Bolt, BoltProvider } from '@boltpay/react-native';

const bolt = new Bolt({
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
  environment: 'sandbox', // or 'production'
});

function App() {
  return (
    <BoltProvider client={bolt}>
      <CheckoutScreen />
    </BoltProvider>
  );
}
```

### 2. Credit Card Payment

```typescript
import { CreditCard, useThreeDSecure } from '@boltpay/react-native/payments';

function CheckoutScreen() {
  const cc = CreditCard.useController();
  const threeDSecure = useThreeDSecure();

  // Listen for field events
  cc.on('valid', () => setCanSubmit(true));
  cc.on('error', (msg) => setFieldError(msg));

  const handlePayment = async () => {
    // 1. Tokenize — returns TokenResult | Error (never throws)
    const result = await cc.tokenize();
    if (result instanceof Error) {
      console.error(result.message);
      return;
    }
    // result: { token?, last4?, bin?, network?, expiration?, postal_code? }

    // 2. Fetch 3DS reference ID — throws ThreeDSError on failure
    const referenceID = await threeDSecure.fetchReferenceID({
      token: result.token,
      bin: result.bin,
      last4: result.last4,
    });

    // 3. Send token to your backend to create the payment
    const paymentResponse = await yourApi.createPayment(result);

    // 4. Handle 3DS challenge if required — returns ThreeDSResult (never throws)
    if (paymentResponse['.tag'] === 'three_ds_required') {
      const challengeResult = await threeDSecure.challengeWithConfig(
        paymentResponse.id,
        {
          referenceID,
          jwtPayload: paymentResponse.jwt_payload,
          stepUpUrl: paymentResponse.step_up_url,
        }
      );
      if (!challengeResult.success) {
        console.error(challengeResult.error?.message);
      }
    }
  };

  return (
    <>
      <CreditCard.Component controller={cc} />
      <threeDSecure.Component />
      <Button onPress={handlePayment} title="Pay" />
    </>
  );
}
```

### 3. 3DS with Stored Card ID

If you've already added a card via Bolt's Add Card API and have a `creditCardID`, you can perform 3DS without re-tokenizing:

```typescript
import { useThreeDSecure } from '@boltpay/react-native/payments';

function StoredCardPayment() {
  const threeDSecure = useThreeDSecure();

  const handlePayment = async (creditCardId: string, expiration: string) => {
    // Fetch 3DS reference using stored card ID
    const referenceID = await threeDSecure.fetchReferenceID({
      id: creditCardId,
      expiration,
    });

    // Create payment on your backend with the 3DS reference
    const paymentResponse = await yourApi.createPayment({
      creditCardId,
      referenceID,
    });

    // Handle 3DS challenge if required
    if (paymentResponse['.tag'] === 'three_ds_required') {
      const result = await threeDSecure.challengeWithConfig(
        paymentResponse.id,
        {
          referenceID,
          jwtPayload: paymentResponse.jwt_payload,
          stepUpUrl: paymentResponse.step_up_url,
        }
      );
      if (!result.success) {
        console.error(result.error?.message);
      }
    }
  };

  return <threeDSecure.Component />;
}
```

### 4. Apple Pay (iOS)

Apple Pay defaults to `mode="webview"` — the Bolt-hosted Apple Pay iframe handles merchant validation and tokenization server-side. No entitlement or merchant certificate setup is required for this mode.

#### Usage (default — WebView mode)

```typescript
import { ApplePay } from '@boltpay/react-native/payments';

function CheckoutScreen() {
  return (
    <ApplePay
      config={{
        countryCode: 'US',
        currencyCode: 'USD',
        total: { label: 'Your Store', amount: '9.99' },
      }}
      referrer="https://your-store.example.com"
      buttonType="buy"
      buttonStyle="black"
      onComplete={(result) => {
        // result: { token, bin?, expiration?, billingContact?, boltReference? }
        // boltReference is populated in webview mode only.
      }}
      onError={(error) => console.error(error)}
    />
  );
}
```

#### Native mode (opt-in)

If you need the native PassKit payment sheet (`mode="native"`), your app must have the Apple Pay entitlement configured with your Apple-registered merchant identifier. This is **not** your Bolt publishable key — it's the identifier you register in the [Apple Developer portal](https://developer.apple.com/account/resources/identifiers).

**Xcode:** Open your app target → **Signing & Capabilities** → **+ Capability** → **Apple Pay** → check your merchant ID.

**Expo:** Add this to your `app.json`:

```json
{
  "ios": {
    "entitlements": {
      "com.apple.developer.in-app-payments": ["merchant.com.yourapp"]
    }
  }
}
```

Then re-run `expo prebuild` and rebuild.

```typescript
<ApplePay
  mode="native"
  config={{
    merchantId: 'merchant.com.yourapp',
    countryCode: 'US',
    currencyCode: 'USD',
    total: { label: 'Your Store', amount: '9.99' },
  }}
  buttonType="buy"
  onComplete={(result) => { /* ... */ }}
/>
```

### 5. Google Pay (Android)

Merchant and gateway configuration (tokenization spec, merchant IDs) is automatically fetched from Bolt's API using your publishable key — you only need to provide presentation options like currency and amount.

```typescript
import { GoogleWallet } from '@boltpay/react-native/payments';

function CheckoutScreen() {
  return (
    <GoogleWallet
      config={{
        currencyCode: 'USD',
        amount: '9.99',
        label: 'Your Store',
        billingAddressCollectionFormat: 'full',
      }}
      buttonType="buy"
      borderRadius={8}
      onComplete={(result) => {
        // result: { token, bin?, last4?, expiration?, email?, billingAddress? }
      }}
      onError={(error) => console.error(error)}
    />
  );
}
```

### 6. Styling

Apply global styles to all Bolt components, or per-element styles at creation time. Uses the v3 CSS custom property format (`--bolt-{target}-{property}`). See [Bolt styling docs](https://help.bolt.com/products/checkout/embeddable-checkout/api-implementation/styling/style-components-v3/) for the full list of tokens.

```typescript
// Global styles — applies to all elements
bolt.configureOnPageStyles({
  '--bolt-input-fontFamily': 'Inter, sans-serif',
  '--bolt-input-fontSize': '16px',
  '--bolt-input-borderRadius': '8px',
});

// Per-element styles — passed at creation time
const cc = CreditCard.useController({
  styles: {
    '--bolt-input-borderColor': '#ccc',
    '--bolt-input_focus-borderColor': '#5A31F4',
  },
});

// Update styles after creation
cc.setStyles({
  '--bolt-input-backgroundColor': '#f9f9f9',
});
```

### 7. Native Credit Card (Beta)

> **Note:** The native card input is in beta. Card data is kept in native memory and never enters the JS heap. PCI SSS certification is in progress — contact your Bolt representative for the latest compliance guidance.

The `NativeCreditCard` component uses platform-native text fields instead of a WebView. Benefits include faster rendering (no WebView cold-start), native autofill, iOS 17+ card camera scanner support, and built-in security controls (screen capture prevention, accessibility protection, memory zeroing).

```typescript
import { NativeCreditCard } from '@boltpay/react-native/payments';

function CheckoutScreen() {
  const cc = NativeCreditCard.useController();

  cc.on('valid', () => setCanSubmit(true));
  cc.on('error', (msg) => setFieldError(msg));

  const handlePayment = async () => {
    const result = await cc.tokenize();
    if (result instanceof Error) {
      console.error(result.message);
      return;
    }
    // result: { token?, last4?, bin?, network?, expiration?, postal_code? }
  };

  return (
    <>
      <NativeCreditCard.Component
        controller={cc}
        showPostalCode={true}
      />
      <Button onPress={handlePayment} title="Pay" />
    </>
  );
}
```

The `NativeCreditCard` API mirrors `CreditCard` — same `useController()` / `Component` / `on()` / `tokenize()` pattern. The two implementations coexist; merchants opt in to native by importing `NativeCreditCard` instead of `CreditCard`.

#### Styling

Native fields use `NativeCardFieldStyles` instead of CSS custom properties:

```typescript
cc.setStyles({
  textColor: '#333333',
  fontSize: 16,
  placeholderColor: '#9ca3af',
  borderColor: '#d1d5db',
  borderRadius: 10,
  backgroundColor: '#fafafa',
});
```

Or pass initial styles via controller options:

```typescript
const cc = NativeCreditCard.useController({
  styles: { textColor: '#333', borderRadius: 8 },
});
```

#### Migrating from WebView to Native

The migration is a one-line import change. The controller API (`on()`, `tokenize()`) and `TokenResult` shape are identical.

```diff
- import { CreditCard } from '@boltpay/react-native/payments';
+ import { NativeCreditCard } from '@boltpay/react-native/payments';

- const cc = CreditCard.useController({
-   styles: { '--bolt-input-backgroundColor': '#fafafa' },
-   showBillingZIPField: true,
- });
+ const cc = NativeCreditCard.useController();

- <CreditCard.Component controller={cc} style={styles.cardInput} />
+ <NativeCreditCard.Component controller={cc} showPostalCode={true} style={styles.cardInput} />
```

**What stays the same:**

- `cc.on('valid' | 'error' | 'focus' | 'blur', callback)` — identical API
- `cc.tokenize()` — returns `Promise<TokenResult | Error>`, same shape
- `TokenResult` — `{ token?, last4?, bin?, network?, expiration?, postal_code? }`

**What changes:**

|                    | WebView (`CreditCard`)                               | Native (`NativeCreditCard`)                             |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| Import             | `CreditCard`                                         | `NativeCreditCard`                                      |
| Postal code prop   | `showBillingZIPField` (on controller options)        | `showPostalCode` (on Component)                         |
| Styling            | CSS custom properties (`--bolt-*`) via `setStyles()` | `NativeCardFieldStyles` (`textColor`, `fontSize`, etc.) |
| WebView dependency | Requires `react-native-webview`                      | No WebView needed                                       |
| PCI compliance     | SAQ A (production-ready)                             | SAQ A pending PCI SSS certification (beta)              |

## API Reference

### Root (`@boltpay/react-native`)

| Export                               | Description                                                               |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `Bolt`                               | Client class. Takes `{ publishableKey, environment?, language? }`         |
| `BoltProvider`                       | React context provider. Wrap your app with `<BoltProvider client={bolt}>` |
| `useBolt()`                          | Hook to access the Bolt client from any component                         |
| `bolt.configureOnPageStyles(styles)` | Set global v3 styles applied to all elements                              |

### Payments (`@boltpay/react-native/payments`)

| Export                                     | Description                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `CreditCard.Component`                     | WebView-based credit card input (PCI SAQ A)                               |
| `CreditCard.useController(options?)`       | Returns a controller with `tokenize()`, `on()`, and `setStyles()`         |
| `NativeCreditCard.Component`               | Native platform credit card input (Beta — PCI SSS pending)                |
| `NativeCreditCard.useController(options?)` | Returns a controller with `tokenize()`, `on()`, and `setStyles()`         |
| `useThreeDSecure()`                        | Hook returning `{ Component, fetchReferenceID(), challengeWithConfig() }` |
| `ApplePay`                                 | Native `PKPaymentButton` (iOS only, renders nothing on Android)           |
| `GoogleWallet`                             | Native Google Pay `PayButton` (Android only, renders nothing on iOS)      |

### Credit Card Controller

| Method                | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `tokenize()`          | Returns `Promise<TokenResult \| Error>`. Never throws.             |
| `on(event, callback)` | Register event listener. Events: `valid`, `error`, `blur`, `focus` |
| `setStyles(styles)`   | Update input field styles                                          |

### ApplePay Props

| Prop          | Type                                   | Default     | Description                                                                                                       |
| ------------- | -------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `config`      | `ApplePayConfig`                       | required    | Country/currency, total amount, and optional merchant ID (`mode='native'` only)                                   |
| `onComplete`  | `(ApplePayResult) => void`             | required    | Called with token, bin, expiration, and billing contact on success                                                |
| `onError`     | `(Error) => void`                      | —           | Called on payment failure                                                                                         |
| `mode`        | `'webview' \| 'native'`                | `'webview'` | `'webview'` uses the Bolt-hosted iframe (no entitlement needed). `'native'` uses PKPaymentButton + PassKit sheet. |
| `buttonType`  | `ApplePayButtonType`                   | `'plain'`   | Button label variant. Auto-localized by Apple.                                                                    |
| `buttonStyle` | `'black' \| 'white' \| 'whiteOutline'` | `'black'`   | Button color theme                                                                                                |
| `referrer`    | `string`                               | —           | Merchant website URL registered with Bolt and Apple (`mode='webview'` only). Required for merchant validation.    |
| `style`       | `ViewStyle`                            | —           | Container style overrides (height, margin, etc.)                                                                  |

### GoogleWallet Props

| Prop           | Type                        | Default   | Description                                                                                                       |
| -------------- | --------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| `config`       | `GooglePayConfig`           | required  | Presentation options: currency, amount, label, billing address format. Merchant config is auto-fetched from Bolt. |
| `onComplete`   | `(GooglePayResult) => void` | required  | Called with token, bin, expiration, and billing address on success                                                |
| `onError`      | `(Error) => void`           | —         | Called on payment failure or cancellation                                                                         |
| `buttonType`   | `GooglePayButtonType`       | `'plain'` | Maps to Google Pay `ButtonConstants.ButtonType`. Button text is rendered natively and auto-localized.             |
| `buttonTheme`  | `GooglePayButtonTheme`      | `'dark'`  | Button color theme: `'dark'` or `'light'`. Maps to `ButtonConstants.ButtonTheme`.                                 |
| `borderRadius` | `number`                    | —         | Corner radius in dp applied to the Google Pay button                                                              |
| `style`        | `ViewStyle`                 | —         | Container style overrides (height, margin, etc.)                                                                  |

### 3D Secure

| Method                                    | Description                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `fetchReferenceID(creditCardInfo)`        | Accepts `TokenResult` or `CreditCardId`. Returns `Promise<string>`. Throws `ThreeDSError`. |
| `challengeWithConfig(orderToken, config)` | Returns `Promise<ThreeDSResult>`. Never throws. Check `result.success`.                    |

### Types (`@boltpay/react-native/payments`)

- `Styles` — `{ [--bolt-*]: string }` (v3 CSS custom properties)
- `TokenResult` — `{ token?, last4?, bin?, network?, expiration?, postal_code? }`
- `ThreeDSConfig` — `{ referenceID, jwtPayload, stepUpUrl }`
- `ThreeDSResult` — `{ success, error?: ThreeDSError }`
- `ThreeDSError` — Error subclass with numeric `code` (1001–1010)
- `CreditCardId` — `{ id: string, expiration: string }` (from Bolt's Add Card API)
- `CreditCardInfo` — `CreditCardId | TokenResult` (input for `fetchReferenceID`)
- `NativeCardFieldStyles` — `{ textColor?, fontSize?, placeholderColor?, borderColor?, borderWidth?, borderRadius?, backgroundColor?, fontFamily? }` (for `NativeCreditCard`)
- `EventType` — `'error' | 'valid' | 'blur' | 'focus'`
- `ApplePayResult` — `{ token, bin?, expiration?, billingContact?, boltReference? }` (`boltReference` is webview-mode only)
- `ApplePayButtonType` — Apple-approved button label variants (`'plain'`, `'buy'`, `'checkout'`, `'book'`, `'subscribe'`, `'donate'`, `'order'`, `'setUp'`, `'inStore'`, `'reload'`, `'addMoney'`, `'topUp'`, `'rent'`, `'support'`, `'contribute'`, `'tip'`)
- `GooglePayResult` — `{ token, bin?, last4?, expiration?, email?, billingAddress? }`
- `GooglePayButtonType` — Google-approved button label variants (`'plain'`, `'buy'`, `'pay'`, `'checkout'`, `'subscribe'`, `'donate'`, `'order'`, `'book'`)
- `GooglePayButtonTheme` — Button color theme (`'dark'`, `'light'`)
- `ApplePayConfig` — Apple Pay configuration (merchant ID, country/currency, total)
- `GooglePayConfig` — `{ billingAddressCollectionFormat?, currencyCode?, label?, amount? }` (merchant/gateway config auto-fetched from Bolt)

### Error Codes (`ThreeDSError`)

| Code | Description                                      |
| ---- | ------------------------------------------------ |
| 1001 | Credit card id or token must be supplied         |
| 1002 | Credit card id and token cannot both be supplied |
| 1003 | Malformed credit card token                      |
| 1004 | Order token does not exist                       |
| 1005 | API response error during verification           |
| 1006 | Verification not required                        |
| 1007 | Setup error during verification                  |
| 1008 | Authentication failed                            |
| 1009 | Failed to create challenge or challenge failed   |
| 1010 | Failed to get device data collection jwt         |

## Example App

The `example/` directory contains a full checkout demo. To run it:

```sh
yarn example ios
# or
yarn example android
```

## Contributing

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT
