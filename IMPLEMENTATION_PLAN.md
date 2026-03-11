# Bolt React Native SDK — Implementation Plan

## Status Summary

| Phase                                   | Status                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Phase 1: Infrastructure & Configuration | ✅ Complete                                                                |
| Phase 2: WebView Bridge (2.1-2.4)       | ✅ Complete                                                                |
| Phase 2.5: Storm-Side Changes           | [ ] Not started (external dependency — requires changes to storm codebase) |
| Phase 3: Credit Card Component          | ✅ Complete (core messages + field events; `setPort` RPC pending)          |
| Phase 4: 3D Secure Component            | ✅ Complete                                                                |
| Phase 5: Digital Wallets                | ✅ Code written — needs physical device testing                            |
| Phase 6: Integration & QA               | Partial — example app built, E2E/device testing pending                    |
| Phase 7: End-to-End Flows               | [ ] Not started — new phase based on updated requirements                  |
| File structure                          | ✅ All 24 planned files created                                            |
| TypeScript                              | ✅ Compiles cleanly (strict mode)                                          |
| Unit tests                              | ✅ 54 tests passing                                                        |

**Remaining work:**

- Storm-side changes (3 files in `libs/base/`) — external dependency, not in this repo
- Credit Card `setPort` RPC channel
- E2E verification (bridge smoke test, tokenization, 3DS challenge)
- Physical device testing for Apple Pay and Google Pay
- App store compliance review
- **Phase 7 work** — wallet management, 3DS bootstrap, Tokenizer Proxy compatibility, add-card-from-wallet flows

---

## Context

**Scope:** Credit Card inputs, 3D Secure, Apple Pay, Google Pay — **no auth/SSO** (merchant uses their own login, calling Bolt Merchant Shopper Login endpoint directly)
**Package:** `@boltpay/react-native` with sub-exports (`/payments`, future `/auth`)
**Approach:** Hybrid — WebView bridge for PCI-compliant flows (credit card, 3DS), native TurboModules for wallets (Apple Pay/Google Pay)

Reference: Alan Thai's scoping doc (Feb 2026) defines the API shape, phases, and estimates.

### Expected Integration Pattern

The SDK is designed for merchants who use their own authentication (no Bolt SSO) and maintain their own UI (no Bolt webview checkout). The SDK provides only the PCI-compliant components (card input, 3DS, wallet card-addition).

**Typical integration flow:**

1. **User login & account setup:** Merchant authenticates the shopper, then calls the Bolt **Merchant Shopper Login** endpoint (creates the shopper in Bolt if they don't exist). Exchanges the authorization code via **OAuth Authorize → OAuth Token** to get an access token scoped for card management.

2. **Card addition & 3DS bootstrap:** Using the access token, the merchant **adds a credit card** via Bolt APIs and receives a `creditCardID`. Optionally runs a **$1 authorization with 3DS** to bootstrap liability shift early (fetch 3DS reference → V3 Payments $1 auth → void immediately), since Bolt's $0 add-card auth does not currently support 3DS.

3. **Order authorizations:** Merchant authorizes payments using either:
   - **Tokenizer Proxy** (`POST /v1/tokenizer/proxy`) — proxies payment to the merchant's existing processor (e.g., Stripe). Takes a Bolt token, exchanges it for the raw PAN in a PCI-compliant environment, and forwards to the processor.
   - **V3 Payments** (`POST /v3/payments`) — authorizes directly through Bolt using a stored `creditCardID` or new token.

4. **Capture & settlement:** Merchant finalizes payment via `POST /v3/payments/{id}` or through their existing processor.

**Three shopper flows:**

- **Recognized (new to app):** Opens app → enters phone → OTP on Bolt network → details populate → shopper completes action → Bolt processes payment
- **Unrecognized:** Opens app → enters card details → shopper completes action → Bolt processes payment (creates Bolt profile)
- **Recognized (returning):** Opens app → uses stored card (or adds new) → Bolt processes and updates profile

### Bolt API Surface Per Requirements

| API Endpoint                                 | Purpose                                                                | SDK Responsibility                           |
| -------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| Merchant Shopper Login                       | Create/login shopper in Bolt                                           | Merchant backend (not SDK)                   |
| `POST /v3/oauth/token`                       | Get access token for card management                                   | Merchant backend (not SDK)                   |
| `GET /v3/account`                            | Fetch saved cards & addresses (`credit_card_id`, `shopper_address_id`) | Merchant backend (not SDK)                   |
| `POST /v3/payments`                          | Authorize payment (with saved `credit_card_id` or new token)           | Merchant backend; SDK provides 3DS reference |
| `POST /v3/payments/{id}`                     | Finalize/capture payment                                               | Merchant backend (not SDK)                   |
| `POST /v3/guest/payments`                    | Guest payment (no Bolt account)                                        | Merchant backend (not SDK)                   |
| Void Transaction API                         | Void $1 3DS bootstrap auth                                             | Merchant backend (not SDK)                   |
| `POST /v1/tokenizer/proxy` (Tokenizer Proxy) | Proxy payment to merchant's existing processor with Bolt token         | Merchant backend (not SDK)                   |
| Credit card tokenization                     | PCI-compliant card input + token                                       | **SDK (WebView bridge)**                     |
| 3DS reference + challenge                    | `fetchReferenceID()` + `challengeWithConfig()`                         | **SDK (WebView bridge)**                     |
| Apple Pay card addition                      | Add card from Apple Wallet to Bolt account                             | **SDK (native TurboModule)**                 |
| Google Pay card addition                     | Add card from Google Wallet to Bolt account                            | **SDK (native TurboModule)**                 |

### Storm Embedded SDK vs. This SDK — Gap Analysis

The storm embedded SDK (web) exposes these elements. Items marked ❌ are not in our RN SDK but may be needed:

| Storm Element                         | Purpose                                 | RN SDK Status                                                    |
| ------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| `credit_card_input`                   | PCI card input + tokenization           | ✅ Have it                                                       |
| `3d-secure`                           | 3DS challenges                          | ✅ Have it                                                       |
| `add-card-from-apple-wallet`          | Add card from Apple Pay to Bolt wallet  | ⚠️ Reframe needed (see Phase 7)                                  |
| `add-card-from-google-wallet`         | Add card from Google Pay to Bolt wallet | ⚠️ Reframe needed (see Phase 7)                                  |
| `login_modal`                         | Email → OTP/passkey auth                | ❌ Not in scope (app owns auth)                                  |
| `payment-selector`                    | Browse saved cards + add new            | ❌ Not in scope (app builds own UI using `GET /v3/account` data) |
| `shopper-session`                     | Detect returning shopper                | ❌ Not in scope (app manages sessions)                           |
| `shopper-address` / `shopper-payment` | Edit saved addresses/cards              | ❌ Not in scope (app builds own UI)                              |
| `login-status`                        | Display login state + logout            | ❌ Not in scope (app owns auth UI)                               |
| `account_checkbox`                    | Consent for Bolt account creation       | ❌ Not in scope (app handles consent)                            |
| `apm-credit-input`                    | Alternative payment methods             | ❌ Not needed currently                                          |

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
│   └── App.tsx                           # Checkout demo app
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

### Apple Pay / Google Wallet (Add Card to Bolt Account)

Storm's web SDK names these `add-card-from-apple-wallet` and `add-card-from-google-wallet` — they are primarily for **adding a card to the shopper's Bolt wallet**, not one-shot payments. The token returned is used to call Bolt's add-card API, which stores the card and returns a `creditCardID` for future use.

Per requirements, the flow is: tap Apple Pay → get token + billing contact (including email) → merchant backend calls Bolt add-card API → Bolt creates account (using email from Apple Pay response) and stores card → returns `creditCardID`.

```typescript
import { ApplePay, GoogleWallet } from '@boltpay/react-native/payments';

function AddCardScreen() {
  const handleApplePay = async (result) => {
    // result.token — Apple Pay payment token
    // result.billingContact — includes email for Bolt account creation
    // Merchant backend: call Bolt add-card API with this token
    // Bolt returns creditCardID for future payments
    await merchantApi.addCardFromApplePay(result);
  };

  return (
    <>
      <ApplePay onComplete={handleApplePay} />
      <GoogleWallet
        onComplete={(result) => {
          // Same pattern — add card to Bolt wallet
          merchantApi.addCardFromGooglePay(result);
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
| Frame → Host | `Focus`, `Blur`, `Valid`, `Error` | Field events              | ✅          |
| Frame → Host | `SetIFrameHeight`                 | Auto-size WebView height  | ✅          |
| Host → Frame | `GetToken`                        | When `tokenize()` called  | ✅          |
| Frame → Host | `GetTokenReply`                   | Tokenization result       | ✅          |
| Host → Frame | `SetStyles`                       | When `setStyles()` called | ✅          |

### Phase 4: 3D Secure Component (3 days – 1 week) — COMPLETE

- ✅ `src/payments/ThreeDSecure.tsx` — `useThreeDSecure()` hook with `fetchReferenceID()` and `challengeWithConfig()`

WebView-based — loads `connect.bolt.com/src/iframes/3d-secure/index.html`. The 3DS element uses Cardinal Commerce for device data collection and step-up challenges.

### Phase 5: Digital Wallets — Native TurboModules (2-8 weeks) — CODE WRITTEN, NEEDS DEVICE TESTING + REFRAME

Apple Pay and Google Pay cannot use WebViews — they require native platform APIs.

**Important reframe:** Per requirements, Apple/Google Pay are used to **add a card to the Bolt wallet** (not as one-shot payment buttons). The flow is: present native Pay sheet → receive payment token + billing contact → merchant backend sends to Bolt add-card API → Bolt stores card and returns `creditCardID`. The email from the Apple Pay response is used for Bolt account creation.

**Webview for Apple Pay (alternative path):** Bolt is building a URL-based Apple Pay session (target: available already) that initializes the Apple Pay sheet via a webview and returns the payload. This could be an alternative to the native TurboModule if native PassKit proves problematic. **Open question:** do we need both approaches or can we pick one?

- ✅ `src/native/NativeApplePay.ts` — TurboModule spec
- ✅ `src/native/NativeGooglePay.ts` — TurboModule spec
- ✅ `src/payments/ApplePay.tsx` — React component wrapping native module
- ✅ `src/payments/GoogleWallet.tsx` — React component wrapping native module
- ✅ `ios/ApplePayModule.swift` — PassKit implementation (canMakePayments, requestPayment, merchant validation, tokenization)
- ✅ `android/.../GooglePayModule.kt` — PaymentsClient implementation (isReadyToPay, requestPayment, tokenization)
- [ ] Verify token format is compatible with Bolt's add-card API (not just direct payment)
- [ ] Ensure billing contact fields (especially email) are requested and returned
- [ ] Test Apple Pay on physical iPhone with sandbox account
- [ ] Test Google Pay on physical Android device with test account
- [ ] App store compliance review for wallet payment provisioning
- [ ] Evaluate webview Apple Pay alternative vs native TurboModule

### Phase 6: Integration & QA (1-3 weeks) — PARTIALLY COMPLETE

- ✅ Build checkout flow in `example/` app
- [ ] Test complete payment flow: card entry → tokenize → 3DS → payment
- [ ] Test Apple Pay and Google Pay on real devices
- [ ] Test error states (invalid card, network timeout, 3DS failure)
- [ ] Regression testing on both iOS and Android
- [ ] App store compliance review preparation

### Phase 7: End-to-End Flows — NOT STARTED

This phase addresses the full integration requirements beyond basic card input/tokenization, based on the updated requirements doc and the March 5th integration call.

#### 7.1 — 3DS Bootstrap Flow (SDK + Merchant Backend Coordination)

Per requirements, 3DS authentication is needed at card-addition time to shift liability early. The current design:

1. **SDK:** `cc.tokenize()` → get token
2. **SDK:** `threeDSecure.fetchReferenceID({ token, bin, last4 })` → get 3DS reference
3. **Merchant backend:** Call `POST /v3/payments` with token + 3DS reference for **$1 authorization**
4. **SDK:** If 3DS challenge required → `threeDSecure.challengeWithConfig(paymentId, config)` → present challenge
5. **Merchant backend:** Call **Void Transaction API** to void the $1 auth

**SDK impact:** Our existing `fetchReferenceID()` and `challengeWithConfig()` already support this. The SDK work is ensuring the example app demonstrates this flow and that the 3DS component can be triggered independently of a "real" payment (i.e., for a $1 bootstrap auth).

**Open question (optimization):** Can Bolt support 3DS at add-card time ($0 auth)? Currently confirmed that $0 auth does not include 3DS. If this changes, the $1 bootstrap flow becomes unnecessary.

**Open question (optimization):** Can the void of the $1 auth be moved to an async background process to reduce latency by ~1.5-2 seconds?

#### 7.2 — Apple Pay / Google Pay as Card Addition

Storm's web elements (`add-card-from-apple-wallet`, `add-card-from-google-wallet`) are designed for adding cards to the Bolt wallet, not one-shot payments. Our native TurboModules need to support this pattern:

- **Ensure billing contact fields are collected** — especially email (used for Bolt account creation when shopper has no Bolt account). Apple Pay's `PKPaymentRequest.requiredBillingContactFields` must include `.emailAddress`.
- **Token format:** Verify the Apple Pay / Google Pay payment token we return is compatible with Bolt's add-card API endpoint (not just direct payment authorization).
- **`onComplete` result shape** should include: `{ token, billingContact: { email, name, phone, postalAddress } }` (Apple Pay) and equivalent for Google Pay.
- **Bolt account creation:** When a shopper pays with Apple Pay for the first time, Bolt generates an account using the email from the Apple Pay response.

**Deliverable targets from requirements doc:**

- Apple Pay card addition: 9/22 target
- Webview for Apple Pay (URL-based session): 9/15 target
- Google Pay: TBD — is Apple Pay enough? (merchant to confirm)

#### 7.3 — Tokenizer Proxy Compatibility

The Tokenizer Proxy (`POST /v1/tokenizer/proxy`) allows merchants to use Bolt tokenization while keeping their existing payment processor. It takes a Bolt token, exchanges it for the raw PAN in a PCI-compliant environment, and forwards to the merchant's processor. This is a **backend-only** concern — the SDK does not call this endpoint directly.

**SDK responsibility:** Ensure `tokenize()` returns tokens compatible with the Tokenizer Proxy. The token format from `credit_card_input` tokenization should already work, but needs E2E verification.

**No SDK changes needed**, but documentation/example should show the expected backend integration.

#### 7.4 — Wallet Management Documentation

Per requirements, the merchant must maintain shopper wallets in their own app UI. The data comes from Bolt's APIs but the merchant renders it (they don't want our webview/payment-selector element).

**Backend APIs the merchant will use (not SDK, but must be documented):**

- `GET /v3/account` — returns saved `credit_card_id`s (with last4, network, expiration) and `shopper_address_id`s
- Add card via API (after tokenization or Apple/Google Pay)
- Delete card / update default payment method (if supported)

**SDK responsibility:** Our documentation/example app should show the complete wallet management flow:

1. Merchant authenticates shopper → calls Merchant Shopper Login → gets auth code
2. Merchant backend exchanges auth code → OAuth token → access token
3. Merchant backend calls `GET /v3/account` → gets saved cards
4. Merchant app displays cards in their own UI
5. To add a new card: SDK `CreditCard.Component` → `tokenize()` → merchant backend adds card via API
6. To add via Apple Pay: SDK `ApplePay` component → `onComplete` → merchant backend adds card via API

#### 7.5 — Shopper Identity Flows Documentation

Three flows need to be documented per requirements:

**Flow 1: Recognized (new to app)**

```
App auth → phone number → Bolt Merchant Shopper Login (finds existing Bolt account)
→ OAuth token exchange → GET /v3/account → saved cards populate in app UI
→ Shopper completes action → POST /v3/payments with credit_card_id (or Tokenizer Proxy to Stripe)
```

**Flow 2: Unrecognized (new shopper)**

```
App auth → Bolt Merchant Shopper Login (creates new Bolt account)
→ OAuth token exchange → no saved cards
→ SDK: CreditCard.Component → tokenize() → add card to Bolt account
→ 3DS bootstrap ($1 auth + void)
→ Shopper completes action → POST /v3/payments or Tokenizer Proxy
```

**Flow 3: Returning shopper**

```
App auth → Bolt Merchant Shopper Login (existing account)
→ OAuth token exchange → GET /v3/account → stored cards shown
→ Use stored card or add new via SDK
→ Shopper completes action → payment
```

**Open question:** How to capture email for unrecognized shoppers?

- Option 1: Don't require email (phone-only Bolt account) — under discussion
- Option 2-3: TBD

#### 7.6 — Guest/Unrecognized Shopper Payments

For shoppers without a Bolt account who decline to create one, the Bolt API supports `POST /v3/guest/payments`. This requires:

- Profile data (name, email, phone)
- Cart details
- Tokenized credit card with billing address
- Optional `create_bolt_account` flag

**SDK impact:** No additional SDK components needed. The SDK provides the token via `tokenize()`, the merchant backend handles the guest payment API call.

---

## Open Questions & Dependencies

| Question                                                             | Owner           | Status                                               |
| -------------------------------------------------------------------- | --------------- | ---------------------------------------------------- |
| Can Bolt support 3DS at add-card time ($0 auth)?                     | Bolt backend    | Confirmed NO currently — merchant using $1 bootstrap |
| Can void of $1 auth be async to reduce latency?                      | Bolt backend    | Under discussion                                     |
| Webview Apple Pay vs native TurboModule — pick one or both?          | SDK team + Bolt | Webview target 9/15, native TBD                      |
| Is Google Pay required or is Apple Pay enough?                       | Merchant        | TBD                                                  |
| How to handle email for unrecognized shoppers (phone-only accounts)? | Bolt + Merchant | Under discussion                                     |
| Ignite API support for Bolt Connect?                                 | Bolt backend    | 9/15 target                                          |
| Tokenizer Proxy revenue/fee model for proxied payments?              | Bolt biz        | Under discussion                                     |
| Bolt Connect onboarding docs ready?                                  | Bolt docs       | 9/15 target                                          |

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

| Risk                                                    | Impact | Mitigation                                                       |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| `window.parent` override fails on some WebView engines  | High   | Storm-side changes provide reliable fallback                     |
| CSP on connect.bolt.com blocks injected JS              | High   | `injectedJavaScriptBeforeContentLoaded` runs pre-CSP             |
| Apple/Google Pay complexity                             | High   | Budget 4-8 weeks; get device access early                        |
| Apple Pay token format incompatible with add-card API   | High   | Verify early; webview Apple Pay is fallback (9/15 target)        |
| $0 auth doesn't support 3DS (forces $1 bootstrap)       | Medium | Workaround in place; track backend support for $0+3DS            |
| Tokenizer Proxy issues (currently being debugged) | High   | Active work with merchant to unblock                             |
| WebView cold start performance                          | Medium | Preload WebView on app init                                      |
| Keyboard handling in WebView                            | Medium | `keyboardDisplayRequiresUserAction={false}`, auto-resize         |
| Screenshot/screen recording of card data                | Medium | Research `FLAG_SECURE` (Android) and screenshot prevention (iOS) |

---

## Verification

1. [ ] **Bridge smoke test:** Load credit-card-input in WebView, verify `CreditCard.FrameInitialized` is received
2. [ ] **Tokenization E2E:** Enter test card, call `tokenize()`, verify token returned
3. [ ] **3DS E2E:** Trigger 3DS challenge with test card, verify Cardinal UI renders
4. [ ] **Apple Pay:** Physical iPhone test sandbox, verify Apple Pay sheet and Bolt token
5. [ ] **Google Pay:** Physical Android device, verify Google Pay sheet and Bolt token
6. [ ] **Cross-platform:** Both iOS simulator and Android emulator + physical devices
7. ✅ **Unit tests:** 54 tests passing (BoltBridgeDispatcher, CreditCard, ThreeDSecure, root exports)
8. ✅ **TypeScript:** Compiles cleanly with strict mode
9. [ ] **3DS bootstrap flow:** Tokenize → fetch 3DS ref → $1 auth → challenge (if required) → void
10. [ ] **Tokenizer Proxy compatibility:** Verify tokenize() output works with `POST /v1/tokenizer/proxy`
11. [ ] **Apple Pay add-card:** Verify token + billing contact compatible with Bolt add-card API
12. [ ] **Wallet round-trip:** Add card via SDK → verify card appears in `GET /v3/account` response
