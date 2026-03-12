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
import { Bolt, BoltProvider } from '@boltpay/react-native';
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

// Initialize Bolt with your publishable key
const bolt = new Bolt({
  publishableKey:
    'yayzpqS9Y7Qb.MBLn0CaZCM7I.aa226a2b80c3aac19300f82dc6be8e92c91b8df1d527311a79e8b190af1f6b2b',
  environment: 'staging',
});

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
    styles: {
      '--bolt-input-backgroundColor': '#fafafa',
    },
  });
  const threeDSecure = useThreeDSecure();
  const [tokenResult, setTokenResult] = useState<TokenResult | null>(null);
  const [threeDSRef, setThreeDSRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cardValid, setCardValid] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

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
      //   POST /v3/payments with token + 3DS reference for $1 auth
      //   If 3DS challenge required:
      //     const challengeResult = await threeDSecure.challengeWithConfig(
      //       paymentResponse.id,
      //       { referenceID, jwtPayload: ..., stepUpUrl: ... }
      //     );
      //   POST void transaction API to void the $1 auth
      //   POST add card API to store the card → receive creditCardID
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
    Alert.alert(
      'Apple Pay Card Added',
      `Token: ${result.token.slice(0, 20)}...\n` +
        `Email: ${result.billingContact?.emailAddress ?? 'N/A'}\n` +
        `Phone: ${result.billingContact?.phoneNumber ?? 'N/A'}\n` +
        `Name: ${result.billingContact?.givenName ?? ''} ${result.billingContact?.familyName ?? ''}\n\n` +
        'Next: merchant backend calls Bolt add-card API with this token. ' +
        'Bolt creates account using email from Apple Pay response.'
    );
  }, []);

  // Google Pay: capture token + billing address + email
  const handleGooglePayComplete = useCallback((result: GooglePayResult) => {
    Alert.alert(
      'Google Pay Card Added',
      `Token: ${result.token.slice(0, 20)}...\n` +
        `Email: ${result.email ?? 'N/A'}\n` +
        `Name: ${result.billingAddress?.name ?? 'N/A'}\n` +
        `Phone: ${result.billingAddress?.phoneNumber ?? 'N/A'}\n\n` +
        'Next: merchant backend calls Bolt add-card API with this token.'
    );
  }, []);

  const handleWalletError = useCallback((error: Error) => {
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
              merchantId: 'merchant.com.bolt.example',
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
              merchantId: 'BCR2DN6T7654321',
              merchantName: 'Demo Store',
              countryCode: 'US',
              currencyCode: 'USD',
              totalPrice: '0.00',
              totalPriceStatus: 'ESTIMATED',
            }}
            onComplete={handleGooglePayComplete}
            onError={handleWalletError}
            style={styles.walletButton}
          />
        )}
      </View>
    </ScrollView>
  );
};

export default function App() {
  return (
    <BoltProvider client={bolt}>
      <AddCardScreen />
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
  resultSpacing: {
    marginTop: 16,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#666',
  },
});
