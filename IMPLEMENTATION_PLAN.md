# Bolt React Native SDK — Implementation Plan

## Status Summary

| Phase                                   | Status                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Phase 1: Infrastructure & Configuration | ✅ Complete                                                                |
| Phase 2: WebView Bridge (2.1-2.4)       | ✅ Complete                                                                |
| Phase 2.5: Storm-Side Changes           | [ ] Not started (external dependency — requires changes to storm codebase) |
| Phase 3: Credit Card Component          | ✅ Complete (core messages; `setPort` and field events listener pending)   |
| Phase 4: 3D Secure Component            | ✅ Complete                                                                |
| Phase 5: Digital Wallets                | ✅ Code written — needs physical device testing                            |
| Phase 6: Tabbed Integration & QA        | Partial — example app built, E2E/device testing pending                    |
| File structure                          | ✅ All 24 planned files created                                            |
| TypeScript                              | ✅ Compiles cleanly (strict mode)                                          |
| Unit tests                              | ✅ 17 tests passing                                                        |

**Remaining work:**

- Storm-side changes (3 files in `libs/base/`) — external dependency, not in this repo
- Credit Card `setPort` RPC channel and field event forwarding (`Focus`, `Blur`, `Valid`, `Error`)
- E2E verification (bridge smoke test, tokenization, 3DS challenge)
- Physical device testing for Apple Pay and Google Pay
- App store compliance review

---

## Context

**First customer:** Tabbed (React Native app)
**Scope:** Credit Card inputs, 3D Secure, Apple Pay, Google Pay — **no auth/SSO** (Tabbed uses their own login, calling Bolt Connect shopper login endpoint directly)
**Package:** `@boltpay/react-native` with sub-exports (`/payments`, future `/auth`)
**Approach:** Hybrid — WebView bridge for PCI-compliant flows (credit card, 3DS), native TurboModules for wallets (Apple Pay/Google Pay)

Reference: Alan Thai's scoping doc (Feb 2026) defines the API shape, phases, and estimates.

### Why WebViews for Credit Card & 3DS

The storm embedded SDK (`source/storm`) renders credit card fields inside secure iframes served from `connect.bolt.com`. Re-implementing natively would require PCI-DSS certification for the mobile app. Instead, we load the same iframe pages in React Native WebViews with an injected JavaScript bridge that makes the WebView environment look like an iframe to the existing Bolt code. This:

- Preserves PCI compliance (card data stays in connect.bolt.com WebView)
- Reuses all existing validation, tokenization, and 3DS challenge UI
- Gets automatic updates when the web components are updated (no app store redeploy)

### Why Native for Apple Pay / Google Pay

Apple Pay requires `PassKit` (native iOS) and Google Pay requires `PaymentsClient` (native Android). Neither API works reliably in WebViews. The storm SDK's wallet elements (`add-card-from-apple-wallet`, `add-card-from-google-wallet`) use `ApplePaySession` and `google.payments.api.PaymentsClient` web APIs in iframes, but these web APIs are not available inside React Native WebViews. TurboModules are required.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                 React Native App                          │
│                                                           │
│  <BoltProvider client={bolt}>                             │
│    ├── <CreditCard.Component controller={cc} />           │
│    │     └── WebView → connect.bolt.com/credit-card-input │
│    │         └── Injected Bridge JS                       │
│    ├── <threeDSecure.Component />                          │
│    │     └── WebView → connect.bolt.com/3d-secure          │
│    ├── <ApplePay onComplete={...} />                       │
│    │     └── TurboModule → PassKit                        │
│    └── <GoogleWallet onComplete={...} />                   │
│          └── TurboModule → PaymentsClient                 │
│                                                           │
│  BoltBridgeDispatcher (per WebView)                       │
│  - Envelope parsing & event routing                       │
│  - Virtual MessagePort emulation                          │
│  - Origin spoofing for Bolt's validation                  │
│                                                           │
│  Native Networking TurboModule (JSI)                      │
│  - High-perf HTTP for non-UI API calls                    │
└──────────────────────────────────────────────────────────┘
```

---

## File Structure

```
bolt-react-native-sdk/
├── src/
│   ├── index.ts                          # Root exports
│   ├── payments/
│   │   ├── index.ts                      # @boltpay/react-native/payments exports
│   │   ├── CreditCard.tsx                # CreditCard.Component + CreditCard.useController
│   │   ├── ThreeDSecure.tsx              # useThreeDSecure hook + Component
│   │   ├── ApplePay.tsx                  # <ApplePay /> native component
│   │   ├── GoogleWallet.tsx              # <GoogleWallet /> native component
│   │   └── types.ts                      # TokenResult, ThreeDSConfig, etc.
│   ├── client/
│   │   ├── Bolt.ts                       # Bolt class (publishableKey config)
│   │   └── BoltProvider.tsx              # React context provider
│   ├── bridge/
│   │   ├── injectedBridge.ts             # JS string injected into WebViews
│   │   ├── BoltBridgeDispatcher.ts       # Native-side message router
│   │   ├── BoltPaymentWebView.tsx        # Shared WebView wrapper component
│   │   └── buildIframeUrl.ts             # URL construction
│   ├── native/
│   │   ├── NativeApplePay.ts             # TurboModule spec for Apple Pay
│   │   ├── NativeGooglePay.ts            # TurboModule spec for Google Pay
│   │   └── NativeNetworking.ts           # TurboModule spec for JSI networking
│   └── __tests__/
│       ├── BoltBridgeDispatcher.test.ts
│       ├── CreditCard.test.tsx
│       └── ThreeDSecure.test.tsx
├── ios/
│   ├── ApplePayModule.swift              # PassKit TurboModule implementation
│   └── NetworkingModule.swift            # Native HTTP TurboModule
├── android/
│   ├── src/main/java/com/boltreactnativesdk/
│   │   ├── GooglePayModule.kt            # PaymentsClient TurboModule
│   │   └── NetworkingModule.kt           # Native HTTP TurboModule
├── example/src/
│   └── App.tsx                           # Tabbed-style checkout demo
└── package.json
```

---

## Public API (matches Alan's spec)

### Initialization

```typescript
import { Bolt, BoltProvider } from '@boltpay/react-native';

const bolt = new Bolt({ publishableKey: 'your_publishable_key_here' });

function App() {
  return (
    <BoltProvider client={bolt}>
      <Routes />
    </BoltProvider>
  );
}
```

### Credit Card + 3DS Payment Flow

```typescript
import { CreditCard, useThreeDSecure } from '@boltpay/react-native/payments';

function CheckoutScreen() {
  const cc = CreditCard.useController();
  const threeDSecure = useThreeDSecure();

  const handlePayment = async () => {
    // 1. Tokenize card (sends GetToken to WebView, receives GetTokenReply)
    const tokenResult = await cc.tokenize();
    // tokenResult: { token, last4, bin, network, expiration, postal_code }

    // 2. Fetch 3DS reference ID
    const referenceID = await threeDSecure.fetchReferenceID({
      token: tokenResult.token,
      bin: tokenResult.bin,
      last4: tokenResult.last4,
    });

    // 3. Create payment on merchant backend
    const paymentResponse = await merchantApi.createPayment(tokenResult);

    // 4. Handle 3DS challenge if required
    if (paymentResponse['.tag'] === 'three_ds_required') {
      const result = await threeDSecure.challengeWithConfig(
        paymentResponse.id,
        {
          referenceID,
          jwtPayload: paymentResponse.jwt_payload,
          stepUpUrl: paymentResponse.step_up_url,
        }
      );
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

### Apple Pay / Google Wallet

```typescript
import { ApplePay, GoogleWallet } from '@boltpay/react-native/payments';

function WalletScreen() {
  return (
    <>
      <ApplePay
        onComplete={(result) => {
          /* result.token, result.billingContact */
        }}
      />
      <GoogleWallet
        onComplete={(result) => {
          /* result.token, result.billingAddress */
        }}
      />
    </>
  );
}
```

---

## Implementation Phases

### Phase 1: Infrastructure & Configuration (1-2 weeks) — COMPLETE

**Files to create:**

- ✅ `src/client/Bolt.ts` — `Bolt` class accepting `publishableKey`, resolving environment URL
- ✅ `src/client/BoltProvider.tsx` — React context wrapping children with Bolt config
- ✅ `src/native/NativeNetworking.ts` — TurboModule spec for JSI HTTP
- ✅ `ios/NetworkingModule.swift` — iOS native HTTP implementation
- ✅ `android/.../NetworkingModule.kt` — Android native HTTP implementation
- ✅ `package.json` updates — add `react-native-webview` peer dep, configure sub-exports

**Sub-exports configuration in `package.json`:**

```json
{
  "exports": {
    ".": { "source": "./src/index.ts", ... },
    "./payments": { "source": "./src/payments/index.ts", ... }
  }
}
```

### Phase 2: WebView Bridge (3 days – 2 weeks) — COMPLETE

This is the core of the SDK. The bridge makes a React Native WebView behave like an iframe host.

#### 2.1 — ✅ Injected Bridge (`src/bridge/injectedBridge.ts`)

A JavaScript string injected via `injectedJavaScriptBeforeContentLoaded` that runs before Bolt's code loads.

**What it patches:**

1. ✅ **`window.parent`** — The Bolt iframe code calls `getParent()` (`libs/base/utils/Parent.ts:11`) which returns `window.parent`. The bridge overrides this via `Object.defineProperty` to return a fake Window whose `postMessage()` wraps data in an envelope and sends via `window.ReactNativeWebView.postMessage()`.

2. ✅ **`window.addEventListener('message', ...)`** — The Bolt iframe listens for inbound messages and validates `event.origin` against `connect.bolt.com` (`libs/base/messaging/Listener.ts:26`). The bridge wraps message handlers to intercept bridge envelopes, create synthetic `MessageEvent` objects with `origin: 'https://connect.bolt.com'`.

3. ✅ **`isIframe()` detection** — `libs/base/utils/Parent.ts:3` checks `window.location !== window.parent.location`. The bridge ensures this returns `true` so `getParent()` returns the fake parent.

4. ✅ **Virtual MessagePort** — When the host transfers a `MessagePort` via `postMessage(data, origin, [port])`, the bridge creates a virtual port object that routes messages through the envelope system. Used for the RPC channel (authorization, merchant details).

**Envelope format:**

```typescript
interface BridgeEnvelope {
  __boltBridge: true;
  direction: 'inbound' | 'outbound';
  type: 'postMessage' | 'portMessage' | 'bridgeReady';
  data?: unknown;
  virtualPortId?: string;
  portId?: string;
}
```

**Critical message serialization note:** The Bolt iframe serializes outbound messages as JSON strings (`libs/base/messaging/Serialization.ts:2` — `JSON.stringify(message)`), and deserializes inbound messages checking `typeof data === "string" && data.startsWith("{")` (`Serialization.ts:6`). The bridge must maintain this format — send JSON strings, not objects.

#### 2.2 — ✅ Bridge Dispatcher (`src/bridge/BoltBridgeDispatcher.ts`)

TypeScript class on the React Native side that:

- ✅ Receives raw strings from WebView via `onMessage` callback
- ✅ Detects bridge envelopes (has `__boltBridge` field) vs raw Bolt messages
- ✅ Routes events by `type` field to registered listeners
- ✅ Manages virtual MessagePort channels
- ✅ Queues messages before bridge is ready, flushes on `bridgeReady` signal
- ✅ Provides `sendMessage(data)` which wraps in envelope and calls `webViewRef.current.postMessage()`

#### 2.3 — ✅ Shared WebView Component (`src/bridge/BoltPaymentWebView.tsx`)

Reusable WebView wrapper used by CreditCard and 3DS components.

#### 2.4 — ✅ URL Builder (`src/bridge/buildIframeUrl.ts`)

Constructs URLs matching `dom-host.utils.ts:15-59`:

```
https://connect.bolt.com/src/iframes/{element}/index.html?
  origin={encodeURIComponent(baseUrl)}
  &publishableKey={key}
  &l={language}
  &mcid={merchantClientId}
  &checkoutPageID={uuid}
  &transport=rn-webview          ← NEW: signals RN environment
```

#### 2.5 — Storm-Side Changes (for reliability) — NOT STARTED (external dependency)

**Why:** `Object.defineProperty(window, 'parent', ...)` may not work on all WebView engines (Android older Chromium versions). Adding server-side detection provides a reliable fallback.

- [ ] **Change 1:** `libs/base/utils/Parent.ts` — detect React Native WebView
- [ ] **Change 2:** `libs/base/messaging/Listener.ts` — relax origin validation for RN
- [ ] **Change 3:** `libs/base/messaging/PostMessage.ts` — route through RN bridge

These changes are minimal, safe, and backward-compatible — the `isReactNativeWebView()` check only activates when both `window.ReactNativeWebView` exists AND the `?transport=rn-webview` URL parameter is present.

### Phase 3: Credit Card Component (part of Phase 2 timeline) — COMPLETE

- ✅ `src/payments/CreditCard.tsx` — `CreditCard.Component` + `CreditCard.useController()` with `tokenize()` and `setStyles()`
- ✅ `src/payments/types.ts` — `TokenResult`, `CreditCardInfo`, `ThreeDSConfig`, etc.

Implements the controller pattern from Alan's spec with message flow:

| Direction    | Message                           | When                      | Implemented |
| ------------ | --------------------------------- | ------------------------- | ----------- |
| Frame → Host | `CreditCard.FrameInitialized`     | WebView content loaded    | ✅          |
| Host → Frame | `SetConfig`                       | After init, sends options | ✅          |
| Host → Frame | `setPort` (with virtual port)     | RPC channel for auth      | [ ]         |
| Frame → Host | `Focus`, `Blur`, `Valid`, `Error` | Field events              | [ ]         |
| Frame → Host | `SetIFrameHeight`                 | Auto-size WebView height  | ✅          |
| Host → Frame | `GetToken`                        | When `tokenize()` called  | ✅          |
| Frame → Host | `GetTokenReply`                   | Tokenization result       | ✅          |
| Host → Frame | `SetStyles`                       | When `setStyles()` called | ✅          |

### Phase 4: 3D Secure Component (3 days – 1 week) — COMPLETE

- ✅ `src/payments/ThreeDSecure.tsx` — `useThreeDSecure()` hook with `fetchReferenceID()` and `challengeWithConfig()`

WebView-based — loads `connect.bolt.com/src/iframes/3d-secure/index.html`. The 3DS element uses Cardinal Commerce for device data collection and step-up challenges.

### Phase 5: Digital Wallets — Native TurboModules (2-8 weeks) — CODE WRITTEN, NEEDS DEVICE TESTING

Apple Pay and Google Pay cannot use WebViews — they require native platform APIs.

- ✅ `src/native/NativeApplePay.ts` — TurboModule spec
- ✅ `src/native/NativeGooglePay.ts` — TurboModule spec
- ✅ `src/payments/ApplePay.tsx` — React component wrapping native module
- ✅ `src/payments/GoogleWallet.tsx` — React component wrapping native module
- ✅ `ios/ApplePayModule.swift` — PassKit implementation (canMakePayments, requestPayment, merchant validation, tokenization)
- ✅ `android/.../GooglePayModule.kt` — PaymentsClient implementation (isReadyToPay, requestPayment, tokenization)
- [ ] Test Apple Pay on physical iPhone with sandbox account
- [ ] Test Google Pay on physical Android device with test account
- [ ] App store compliance review for wallet payment provisioning

### Phase 6: Tabbed Integration & QA (1-3 weeks) — PARTIALLY COMPLETE

- ✅ Build "Tabbed-style" checkout flow in `example/` app
- [ ] Test complete payment flow: card entry → tokenize → 3DS → payment
- [ ] Test Apple Pay and Google Pay on real devices
- [ ] Test error states (invalid card, network timeout, 3DS failure)
- [ ] Regression testing on both iOS and Android
- [ ] App store compliance review preparation

---

## Storm Codebase Changes Required — NOT STARTED (external dependency)

| File                                 | Change                                                    | Risk | Status |
| ------------------------------------ | --------------------------------------------------------- | ---- | ------ |
| `libs/base/utils/Parent.ts`          | Add `isReactNativeWebView()`, update `getParent()`        | Low  | [ ]    |
| `libs/base/messaging/Listener.ts`    | Skip origin validation in RN WebView                      | Low  | [ ]    |
| `libs/base/messaging/PostMessage.ts` | Route `safePost` through `ReactNativeWebView.postMessage` | Low  | [ ]    |

---

## Dependencies — ✅ CONFIGURED

```json
{
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-native": ">=0.73.0",
    "react-native-webview": ">=13.0.0"
  }
}
```

---

## Risks & Mitigations

| Risk                                                   | Impact | Mitigation                                                       |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------- |
| `window.parent` override fails on some WebView engines | High   | Storm-side changes provide reliable fallback                     |
| CSP on connect.bolt.com blocks injected JS             | High   | `injectedJavaScriptBeforeContentLoaded` runs pre-CSP             |
| Apple/Google Pay complexity                            | High   | Budget 4-8 weeks; get device access early                        |
| WebView cold start performance                         | Medium | Preload WebView on app init                                      |
| Keyboard handling in WebView                           | Medium | `keyboardDisplayRequiresUserAction={false}`, auto-resize         |
| Screenshot/screen recording of card data               | Medium | Research `FLAG_SECURE` (Android) and screenshot prevention (iOS) |

---

## Verification

1. [ ] **Bridge smoke test:** Load credit-card-input in WebView, verify `CreditCard.FrameInitialized` is received
2. [ ] **Tokenization E2E:** Enter test card, call `tokenize()`, verify token returned
3. [ ] **3DS E2E:** Trigger 3DS challenge with test card, verify Cardinal UI renders
4. [ ] **Apple Pay:** Physical iPhone test sandbox, verify Apple Pay sheet and Bolt token
5. [ ] **Google Pay:** Physical Android device, verify Google Pay sheet and Bolt token
6. [ ] **Cross-platform:** Both iOS simulator and Android emulator + physical devices
7. ✅ **Unit tests:** 17 tests passing (BoltBridgeDispatcher, CreditCard, ThreeDSecure, root exports)
8. ✅ **TypeScript:** Compiles cleanly with strict mode
