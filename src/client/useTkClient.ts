// Polyfill `crypto.getRandomValues` for React Native — tweetnacl (inside
// @boltpay/tokenizer) calls `randomBytes` during postApplePayToken /
// postGooglePayToken and throws "no PRNG" on Hermes/JSC without this.
// Consumers must install `react-native-get-random-values` as a peer dep so RN
// autolinking wires up the native module.
import 'react-native-get-random-values';
import TkClient, { type FetchFn, type TkEnvironment } from '@boltpay/tokenizer';
import { useBolt } from './useBolt';

// Tokenizer requests share this timeout. 30s matches the PassKit sheet's own
// ceiling, so we fail before iOS starts reporting payment-processing timeouts
// to the user. Stalled requests must bound *somewhere* — without this the
// Apple Pay sheet stays in "processing" indefinitely while the JS promise awaits.
const TOKENIZER_TIMEOUT_MS = 30_000;

// Adapts React Native's global fetch to the FetchFn interface TkClient expects,
// with a request timeout implemented via AbortController.
const rnFetch: FetchFn = async (url, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKENIZER_TIMEOUT_MS);
  try {
    // `init as RequestInit` is safe: @boltpay/tokenizer's IRequestInit is
    // declared as `{ body?: string; headers?: {[k:string]: string}; method?: string }`
    // — a strict subset of the DOM RequestInit shape, so this cast cannot
    // drop fields today. Re-verify against fetch.d.ts on each tokenizer bump;
    // if IRequestInit ever adds custom keys (retry hints, priority), this
    // spread would silently discard them.
    const r = await fetch(url, {
      ...(init as RequestInit),
      signal: controller.signal,
    });
    return {
      status: r.status,
      statusText: r.statusText,
      text: () => r.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

// TkClient eagerly fetches the tokenizer public key and generates a tweetnacl
// keypair in its constructor. Cache one instance per environment so mounting
// both <ApplePay/> and <GoogleWallet/> doesn't duplicate that work.
//
// If the eager public-key fetch fails (network hiccup at app start), the
// rejected publicKey promise is retained on the client forever — every
// subsequent post*Token call awaits it and returns an Error with no retry.
// Self-heal by evicting the broken client from the cache so the next caller
// constructs a fresh one.
const clientCache = new Map<TkEnvironment, TkClient>();

const getTkClient = (environment: TkEnvironment): TkClient => {
  let client = clientCache.get(environment);
  if (!client) {
    client = new TkClient(environment, rnFetch);
    clientCache.set(environment, client);
    const created = client;
    created
      .isPublicKeySet()
      .then((ok) => {
        if (!ok && clientCache.get(environment) === created) {
          clientCache.delete(environment);
        }
      })
      .catch(() => {
        if (clientCache.get(environment) === created) {
          clientCache.delete(environment);
        }
      });
  }
  return client;
};

export const useTkClient = (): TkClient => {
  const { environment } = useBolt();
  return getTkClient(environment);
};
