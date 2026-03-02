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
import { Bolt, BoltProvider } from 'bolt-react-native-sdk';
import {
  CreditCard,
  useThreeDSecure,
  ApplePay,
  GoogleWallet,
} from 'bolt-react-native-sdk/payments';
import type {
  TokenResult,
  ApplePayResult,
  GooglePayResult,
} from 'bolt-react-native-sdk/payments';

// Initialize Bolt with your publishable key
const bolt = new Bolt({
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
  environment: 'sandbox',
});

const CheckoutScreen = () => {
  const cc = CreditCard.useController();
  const threeDSecure = useThreeDSecure();
  const [tokenResult, setTokenResult] = useState<TokenResult | null>(null);
  const [loading, setLoading] = useState(false);

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
      </View>

      {/* 3DS Component (hidden, but must be mounted) */}
      <threeDSecure.Component style={styles.hidden} />

      {/* Pay Button */}
      <TouchableOpacity
        style={[styles.payButton, loading && styles.payButtonDisabled]}
        onPress={handlePayment}
        disabled={loading}
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
