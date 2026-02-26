# @boltpay/react-native

Bolt React Native SDK for payments. Provides Credit Card tokenization, 3D Secure verification, Apple Pay, and Google Pay — all integrated with the Bolt payment platform.

## Architecture

- **Credit Card & 3DS** — WebView-based, loading secure pages from `connect.bolt.com`. Card data never touches your app (PCI compliant).
- **Apple Pay & Google Pay** — Native TurboModules using PassKit (iOS) and PaymentsClient (Android).

## Installation

```sh
npm install @boltpay/react-native react-native-webview
# or
yarn add @boltpay/react-native react-native-webview
```

For iOS:

```sh
cd ios && pod install
```

### Requirements

- React Native >= 0.73.0
- React >= 18.0.0
- react-native-webview >= 13.0.0

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

  const handlePayment = async () => {
    // Tokenize the card
    const tokenResult = await cc.tokenize();
    // { token, last4, bin, network, expiration, postal_code }

    // Fetch 3DS reference ID
    const referenceID = await threeDSecure.fetchReferenceID({
      token: tokenResult.token,
      bin: tokenResult.bin,
      last4: tokenResult.last4,
    });

    // Send token to your backend to create the payment
    const paymentResponse = await yourApi.createPayment(tokenResult);

    // Handle 3DS challenge if required
    if (paymentResponse['.tag'] === 'three_ds_required') {
      await threeDSecure.challengeWithConfig(paymentResponse.id, {
        referenceID,
        jwtPayload: paymentResponse.jwt_payload,
        stepUpUrl: paymentResponse.step_up_url,
      });
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

### 3. Apple Pay (iOS)

```typescript
import { ApplePay } from '@boltpay/react-native/payments';

<ApplePay
  config={{
    merchantId: 'merchant.com.yourapp',
    countryCode: 'US',
    currencyCode: 'USD',
    total: { label: 'Your Store', amount: '9.99' },
  }}
  onComplete={(result) => {
    // result.token, result.billingContact
  }}
  onError={(error) => console.error(error)}
/>
```

### 4. Google Pay (Android)

```typescript
import { GoogleWallet } from '@boltpay/react-native/payments';

<GoogleWallet
  config={{
    merchantId: 'YOUR_MERCHANT_ID',
    merchantName: 'Your Store',
    countryCode: 'US',
    currencyCode: 'USD',
    totalPrice: '9.99',
  }}
  onComplete={(result) => {
    // result.token, result.billingAddress
  }}
  onError={(error) => console.error(error)}
/>
```

## API Reference

### Root (`@boltpay/react-native`)

| Export         | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `Bolt`         | Client class. Takes `{ publishableKey, environment?, language? }`         |
| `BoltProvider` | React context provider. Wrap your app with `<BoltProvider client={bolt}>` |
| `useBolt()`    | Hook to access the Bolt client from any component                         |

### Payments (`@boltpay/react-native/payments`)

| Export                       | Description                                                               |
| ---------------------------- | ------------------------------------------------------------------------- |
| `CreditCard.Component`       | WebView-based credit card input                                           |
| `CreditCard.useController()` | Returns a controller with `tokenize()` and `setStyles()`                  |
| `useThreeDSecure()`          | Hook returning `{ Component, fetchReferenceID(), challengeWithConfig() }` |
| `ApplePay`                   | Native Apple Pay button (iOS only, renders nothing on Android)            |
| `GoogleWallet`               | Native Google Pay button (Android only, renders nothing on iOS)           |

### Types (`@boltpay/react-native/payments`)

- `TokenResult` — `{ token, last4, bin, network, expiration, postal_code }`
- `ThreeDSConfig` — `{ referenceID, jwtPayload, stepUpUrl }`
- `ThreeDSResult` — `{ success, transactionId?, error? }`
- `ApplePayResult` — `{ token, billingContact?, boltReference? }`
- `GooglePayResult` — `{ token, billingAddress? }`
- `ApplePayConfig`, `GooglePayConfig` — Configuration for wallet buttons

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
