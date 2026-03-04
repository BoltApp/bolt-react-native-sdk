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

const CheckoutScreen = () => {
  // Per-element styles override global onPageStyles
  const cc = CreditCard.useController({
    styles: {
      '--bolt-input-backgroundColor': '#fafafa',
    },
  });
  const threeDSecure = useThreeDSecure();
  const [tokenResult, setTokenResult] = useState<TokenResult | null>(null);
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

  const handlePayment = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Tokenize card — returns TokenResult | Error (never throws)
      const result = await cc.tokenize();
      if (result instanceof Error) {
        Alert.alert('Tokenization Error', result.message);
        return;
      }
      setTokenResult(result);

      // 2. Fetch 3DS reference ID — throws ThreeDSError on failure
      const referenceID = await threeDSecure.fetchReferenceID({
        token: result.token,
        bin: result.bin,
        last4: result.last4,
      });

      Alert.alert(
        'Tokenization Success',
        `Token: ${result.token?.slice(0, 20)}...\n` +
          `Last4: ${result.last4}\n` +
          `Network: ${result.network}\n` +
          `3DS Ref: ${referenceID.slice(0, 20)}...`
      );

      // Reset form state for another payment
      setTokenResult(null);
      setCardValid(false);
      setFieldError(null);

      // 3. In a real app, you would now create the payment on your backend:
      // const paymentResponse = await merchantApi.createPayment(result);
      //
      // 4. Handle 3DS challenge if required — returns ThreeDSResult (never throws):
      // if (paymentResponse[".tag"] === "three_ds_required") {
      //   const challengeResult = await threeDSecure.challengeWithConfig(
      //     paymentResponse.id,
      //     {
      //       referenceID,
      //       jwtPayload: paymentResponse.jwt_payload,
      //       stepUpUrl: paymentResponse.step_up_url,
      //     }
      //   );
      //   if (!challengeResult.success) {
      //     Alert.alert('3DS Failed', challengeResult.error?.message);
      //   }
      // }
    } catch (error) {
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Payment failed'
      );
    } finally {
      setLoading(false);
    }
  }, [cc, threeDSecure]);

  const handleApplePayComplete = useCallback((result: ApplePayResult) => {
    Alert.alert('Apple Pay Success', `Token: ${result.token.slice(0, 20)}...`);
  }, []);

  const handleGooglePayComplete = useCallback((result: GooglePayResult) => {
    Alert.alert('Google Pay Success', `Token: ${result.token.slice(0, 20)}...`);
  }, []);

  const handleWalletError = useCallback((error: Error) => {
    Alert.alert('Wallet Error', error.message);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Bolt Checkout Demo</Text>

      {/* Credit Card Input */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Credit Card</Text>
        <CreditCard.Component controller={cc} style={styles.cardInput} />
        {cardValid && <Text style={styles.validText}>Card details valid</Text>}
        {fieldError && <Text style={styles.errorText}>{fieldError}</Text>}
      </View>

      {/* 3DS Component (hidden, but must be mounted) */}
      <threeDSecure.Component style={styles.hidden} />

      {/* Pay Button */}
      <TouchableOpacity
        style={[
          styles.payButton,
          (loading || !cardValid) && styles.payButtonDisabled,
        ]}
        onPress={handlePayment}
        disabled={loading || !cardValid}
      >
        <Text style={styles.payButtonText}>
          {loading ? 'Processing...' : 'Pay with Card'}
        </Text>
      </TouchableOpacity>

      {/* Token Result */}
      {tokenResult && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Token Result</Text>
          <Text style={styles.mono}>
            {JSON.stringify(tokenResult, null, 2)}
          </Text>
        </View>
      )}

      {/* Wallet Payments */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Digital Wallets</Text>

        {Platform.OS === 'ios' && (
          <ApplePay
            config={{
              merchantId: 'merchant.com.bolt.example',
              countryCode: 'US',
              currencyCode: 'USD',
              total: { label: 'Demo Store', amount: '9.99' },
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
              totalPrice: '9.99',
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
      <CheckoutScreen />
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
    marginBottom: 24,
    textAlign: 'center',
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
  payButton: {
    backgroundColor: '#5A31F4',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  walletButton: {
    marginTop: 12,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#666',
  },
});
