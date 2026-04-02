import { useCallback, useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import {
  Bolt,
  BoltProvider,
  setDevTelemetryConfig,
} from '@boltpay/react-native';
import { boltConfig } from './boltConfig';
import { devTelemetryConfig } from './devTelemetryConfig';

// Local dev only — credentials come from gitignored config files.
// Run `yarn gen-bolt-config` and `yarn gen-dev-telemetry-config` to generate from .env.
if (devTelemetryConfig.enabled) {
  setDevTelemetryConfig(devTelemetryConfig);
}
import {
  CreditCard,
  useThreeDSecure,
  ApplePay,
  GoogleWallet,
} from '@boltpay/react-native/payments';
import type {
  TokenResult,
  ApplePayResult,
  GooglePayResult,
} from '@boltpay/react-native/payments';

// Initialize Bolt — publishable key and environment come from boltConfig.ts (gitignored).
const bolt = new Bolt(boltConfig);

// Global styles applied to all Bolt components
bolt.configureOnPageStyles({
  '--bolt-input-fontFamily': 'System',
  '--bolt-input-fontSize': '16px',
  '--bolt-input-borderRadius': '8px',
  '--bolt-input-borderColor': '#d1d5db',
  '--bolt-input_focus-borderColor': '#5A31F4',
});

// ── Card Addition + 3DS Bootstrap Flow ─────────────────────
// Demonstrates: tokenize → fetch 3DS reference → (merchant backend
// would call V3 Payments $1 auth → void, then add card to Bolt account)

const AddCardScreen = () => {
  const cc = CreditCard.useController({
    styles: { '--bolt-input-backgroundColor': '#fafafa' },
    showBillingZIPField: true,
  });
  const threeDSecure = useThreeDSecure();
  const [tokenResult, setTokenResult] = useState<
    TokenResult | ApplePayResult | null
  >(null);
  const [threeDSRef, setThreeDSRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [walletStatus, setWalletStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Listen for field events
  cc.on('valid', () => {
    setCardValid(true);
    setFieldError(null);
  });
  cc.on('error', (msg) => setFieldError(msg as string));
  cc.on('focus', () => setFieldError(null));

  // Flow: tokenize card → fetch 3DS reference → ready for backend $1 auth
  const handleAddCard = useCallback(async () => {
    setLoading(true);
    setTokenResult(null);
    setThreeDSRef(null);
    try {
      // Step 1: Tokenize card
      const result = await cc.tokenize();
      if (result instanceof Error) {
        Alert.alert('Tokenization Error', result.message);
        return;
      }
      setTokenResult(result);

      // Step 2: Fetch 3DS reference ID for liability shift
      const referenceID = await threeDSecure.fetchReferenceID({
        token: result.token,
        bin: result.bin,
        last4: result.last4,
      });
      setThreeDSRef(referenceID);

      Alert.alert(
        'Card Ready',
        `Token: ${result.token?.slice(0, 20)}...\n` +
          `Last4: ${result.last4}\n` +
          `Network: ${result.network}\n` +
          `3DS Ref: ${referenceID.slice(0, 20)}...\n\n` +
          'Next: merchant backend calls V3 Payments $1 auth with 3DS reference, ' +
          'then voids the auth and adds the card to the Bolt account.'
      );

      // Step 3 (merchant backend, not SDK):
      //
      // Option A: Bolt V3 Payments (direct)
      //   POST /v3/payments with token + 3DS reference for $1 auth
      //   If 3DS challenge required:
      //     const challengeResult = await threeDSecure.challengeWithConfig(
      //       paymentResponse.id,
      //       { referenceID, jwtPayload: ..., stepUpUrl: ... }
      //     );
      //   POST void transaction API to void the $1 auth
      //   POST add card API to store the card → receive creditCardID
      //
      // Option B: Tokenizer Proxy (existing processor)
      //   POST /v1/tokenizer/proxy with Bolt token
      //   Bolt exchanges token for raw PAN in PCI-compliant environment
      //   Forwards to merchant's existing processor (e.g., Stripe)
      //   Merchant receives processor token for payment
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to add card'
      );
    } finally {
      setLoading(false);
    }
  }, [cc, threeDSecure]);

  // Apple Pay: capture token + billing contact (including email for Bolt account creation)
  const handleApplePayComplete = useCallback((result: ApplePayResult) => {
    setTokenResult(result);
    const msg =
      `Token: ${result.token.slice(0, 20)}...\n` +
      `Email: ${result.billingContact?.emailAddress ?? 'N/A'}\n` +
      `Name: ${result.billingContact?.givenName ?? ''} ${result.billingContact?.familyName ?? ''}`;
    setWalletStatus({ type: 'success', message: msg });
    Alert.alert('Apple Pay Card Added', msg);
  }, []);

  // Google Pay: capture token + billing address + email
  const handleGooglePayComplete = useCallback((result: GooglePayResult) => {
    const msg =
      `Token: ${result.token.slice(0, 20)}...\n` +
      `Email: ${result.email ?? 'N/A'}\n` +
      `Name: ${result.billingAddress?.name ?? 'N/A'}\n` +
      `Bolt Ref: ${result.boltReference ?? 'N/A'}`;
    setWalletStatus({ type: 'success', message: msg });
    Alert.alert('Google Pay Card Added', msg);
  }, []);

  const handleWalletError = useCallback((error: Error) => {
    setWalletStatus({ type: 'error', message: error.message });
    Alert.alert('Wallet Error', error.message);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Bolt SDK Demo</Text>
      <Text style={styles.subtitle}>Card Addition + 3DS Bootstrap</Text>

      {/* Credit Card Input */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Credit Card</Text>
        <CreditCard.Component controller={cc} style={styles.cardInput} />
        {cardValid && <Text style={styles.validText}>Card details valid</Text>}
        {fieldError && <Text style={styles.errorText}>{fieldError}</Text>}
      </View>

      {/* 3DS Component (hidden, but must be mounted for device data collection) */}
      <threeDSecure.Component style={styles.hidden} />

      {/* Add Card Button */}
      <TouchableOpacity
        style={[
          styles.primaryButton,
          (loading || !cardValid) && styles.buttonDisabled,
        ]}
        onPress={handleAddCard}
        disabled={loading || !cardValid}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? 'Processing...' : 'Add Card + 3DS Bootstrap'}
        </Text>
      </TouchableOpacity>

      {/* Results */}
      {tokenResult && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Token Result</Text>
          <Text style={styles.mono}>
            {JSON.stringify(tokenResult, null, 2)}
          </Text>
          {threeDSRef && (
            <>
              <Text style={[styles.sectionTitle, styles.resultSpacing]}>
                3DS Reference
              </Text>
              <Text style={styles.mono}>{threeDSRef}</Text>
            </>
          )}
        </View>
      )}

      {/* Add Card from Digital Wallet */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Add Card from Wallet</Text>
        <Text style={styles.description}>
          Adds card to Bolt account. Email from wallet response is used for Bolt
          account creation.
        </Text>

        {Platform.OS === 'ios' && (
          <ApplePay
            config={{
              countryCode: 'US',
              currencyCode: 'USD',
              total: { label: 'Card Verification', amount: '0.00' },
            }}
            onComplete={handleApplePayComplete}
            onError={handleWalletError}
            style={styles.walletButton}
          />
        )}

        {Platform.OS === 'android' && (
          <GoogleWallet
            config={{
              currencyCode: 'USD',
              amount: '0.00',
              label: 'Card Verification',
            }}
            onComplete={handleGooglePayComplete}
            onError={handleWalletError}
            style={styles.walletButton}
          />
        )}

        {walletStatus && (
          <View
            style={[
              styles.walletStatus,
              walletStatus.type === 'success'
                ? styles.walletStatusSuccess
                : styles.walletStatusError,
            ]}
          >
            <Text style={styles.walletStatusTitle}>
              {walletStatus.type === 'success' ? 'Success' : 'Error'}
            </Text>
            <Text style={styles.walletStatusMessage}>
              {walletStatus.message}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

// ── Wallet Management (Shopper Identity Flows) ─────────────
// Demonstrates how the merchant app manages saved cards using
// Bolt APIs alongside the SDK for card input/tokenization.
//
// This is a UI-only demo — the merchant backend calls are shown
// as commented pseudocode since they happen server-side.
//
// Three shopper flows:
//
// Flow 1: Recognized shopper (new to app)
//   App auth → phone number → Bolt Merchant Shopper Login (finds existing Bolt account)
//   → OAuth token exchange → GET /v3/account → saved cards populate in app UI
//   → Shopper pays → POST /v3/payments with credit_card_id
//
// Flow 2: Unrecognized shopper (new)
//   App auth → Bolt Merchant Shopper Login (creates new Bolt account)
//   → OAuth token exchange → no saved cards
//   → SDK: CreditCard.Component → tokenize() → add card to Bolt account
//   → 3DS bootstrap ($1 auth + void)
//   → Shopper pays → POST /v3/payments or Tokenizer Proxy
//
// Flow 3: Returning shopper
//   App auth → Bolt Merchant Shopper Login (existing account)
//   → OAuth token exchange → GET /v3/account → stored cards shown
//   → Use stored card or add new via SDK
//   → Shopper pays → payment

// Mock data representing what GET /v3/account returns
const MOCK_SAVED_CARDS = [
  {
    credit_card_id: 'cc_abc123',
    last4: '1111',
    network: 'visa',
    expiration: '2028-12',
  },
  {
    credit_card_id: 'cc_def456',
    last4: '4242',
    network: 'mastercard',
    expiration: '2027-06',
  },
];

const WalletScreen = () => {
  const [savedCards] = useState(MOCK_SAVED_CARDS);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  const handlePayWithSavedCard = useCallback((creditCardId: string) => {
    Alert.alert(
      'Pay with Saved Card',
      `Using credit_card_id: ${creditCardId}\n\n` +
        'Merchant backend would call:\n' +
        'POST /v3/payments with credit_card_id\n' +
        '  or\n' +
        'POST /v1/tokenizer/proxy for existing processor'
    );
  }, []);

  // Guest payment flow (7.6) — for shoppers without a Bolt account
  const handleGuestPayment = useCallback(() => {
    Alert.alert(
      'Guest Payment',
      'For shoppers without a Bolt account:\n\n' +
        '1. SDK: CreditCard.Component → tokenize()\n' +
        '2. Merchant backend: POST /v3/guest/payments with:\n' +
        '   - profile (name, email, phone)\n' +
        '   - cart details\n' +
        '   - tokenized credit card + billing address\n' +
        '   - optional: create_bolt_account flag'
    );
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Wallet Management</Text>
      <Text style={styles.subtitle}>Saved Cards from GET /v3/account</Text>

      {/* Saved Cards List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved Cards</Text>
        <Text style={styles.description}>
          Cards returned by GET /v3/account after Merchant Shopper Login + OAuth
          token exchange. The merchant renders these in their own UI.
        </Text>
        {savedCards.map((card) => (
          <TouchableOpacity
            key={card.credit_card_id}
            style={[
              styles.cardRow,
              selectedCard === card.credit_card_id && styles.cardRowSelected,
            ]}
            onPress={() => setSelectedCard(card.credit_card_id)}
          >
            <Text style={styles.cardNetwork}>{card.network.toUpperCase()}</Text>
            <Text style={styles.cardDetails}>
              ****{card.last4} — exp {card.expiration}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pay with Saved Card */}
      <TouchableOpacity
        style={[styles.primaryButton, !selectedCard && styles.buttonDisabled]}
        onPress={() => selectedCard && handlePayWithSavedCard(selectedCard)}
        disabled={!selectedCard}
      >
        <Text style={styles.primaryButtonText}>Pay with Saved Card</Text>
      </TouchableOpacity>

      {/* Guest Payment */}
      <TouchableOpacity
        style={[styles.primaryButton, styles.secondaryButton]}
        onPress={handleGuestPayment}
      >
        <Text style={[styles.primaryButtonText, styles.secondaryButtonText]}>
          Guest Payment Flow
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ── App with Tab Navigation ─────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<'addCard' | 'wallet'>('addCard');

  return (
    <BoltProvider client={bolt}>
      {activeTab === 'addCard' ? <AddCardScreen /> : <WalletScreen />}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'addCard' && styles.tabActive]}
          onPress={() => setActiveTab('addCard')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'addCard' && styles.tabTextActive,
            ]}
          >
            Add Card
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'wallet' && styles.tabActive]}
          onPress={() => setActiveTab('wallet')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'wallet' && styles.tabTextActive,
            ]}
          >
            Wallet
          </Text>
        </TouchableOpacity>
      </View>
    </BoltProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  description: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    lineHeight: 18,
  },
  cardInput: {
    minHeight: 200,
  },
  validText: {
    color: '#16a34a',
    fontSize: 13,
    marginTop: 8,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginTop: 8,
  },
  hidden: {
    height: 0,
    overflow: 'hidden',
  },
  primaryButton: {
    backgroundColor: '#5A31F4',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  walletButton: {
    marginTop: 12,
  },
  walletStatus: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  walletStatusSuccess: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  walletStatusError: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  walletStatusTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  walletStatusMessage: {
    fontSize: 12,
    color: '#374151',
  },
  resultSpacing: {
    marginTop: 16,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#666',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardRowSelected: {
    borderColor: '#5A31F4',
    backgroundColor: '#f5f3ff',
  },
  cardNetwork: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    width: 90,
  },
  cardDetails: {
    fontSize: 14,
    color: '#6b7280',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#5A31F4',
  },
  secondaryButtonText: {
    color: '#5A31F4',
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderTopWidth: 2,
    borderTopColor: '#5A31F4',
  },
  tabText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#5A31F4',
    fontWeight: '600',
  },
});
