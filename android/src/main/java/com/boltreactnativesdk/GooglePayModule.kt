package com.boltreactnativesdk

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.wallet.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * TurboModule implementation for Google Pay via PaymentsClient.
 *
 * Handles:
 * 1. Checking Google Pay readiness
 * 2. Presenting the Google Pay payment sheet
 * 3. Tokenizing the result via Bolt's tokenizer API
 *
 * The merchant/gateway configuration (tokenization spec, merchant ID, etc.)
 * is fetched from Bolt's /v1/apm_config/googlepay endpoint on the JS side
 * and passed down in the config JSON.
 */
class GooglePayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext),
    ActivityEventListener {

    init {
        reactContext.addActivityEventListener(this)
    }

    companion object {
        const val NAME = "BoltGooglePay"
        private const val LOAD_PAYMENT_DATA_REQUEST_CODE = 991
    }

    override fun getName(): String = NAME

    private var pendingPromise: Promise? = null
    private var pendingTokenizerUrl: String = ""
    private var pendingTokenizerFallbackUrl: String = ""

    private fun getPaymentsClient(activity: Activity, walletEnv: Int): PaymentsClient {
        val walletOptions = Wallet.WalletOptions.Builder()
            .setEnvironment(walletEnv)
            .build()
        return Wallet.getPaymentsClient(activity, walletOptions)
    }

    /**
     * Maps the JS-side googlePayEnvironment string ("PRODUCTION" | "TEST") to
     * the matching WalletConstants value. Defaults to ENVIRONMENT_TEST so that
     * staging / sandbox traffic never hits the production Google Pay endpoint.
     */
    private fun walletEnvFromConfig(configJson: String): Int {
        return try {
            if (JSONObject(configJson).optString("googlePayEnvironment") == "PRODUCTION")
                WalletConstants.ENVIRONMENT_PRODUCTION
            else
                WalletConstants.ENVIRONMENT_TEST
        } catch (e: Exception) {
            WalletConstants.ENVIRONMENT_TEST
        }
    }

    override fun invalidate() {
        reactApplicationContext.removeActivityEventListener(this)
        super.invalidate()
    }

    @ReactMethod
    fun isReadyToPay(configJson: String, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            val isReadyToPayRequest = IsReadyToPayRequest.fromJson(buildIsReadyToPayRequest().toString())
            getPaymentsClient(activity, walletEnvFromConfig(configJson)).isReadyToPay(isReadyToPayRequest)
                .addOnCompleteListener { task ->
                    promise.resolve(task.isSuccessful && task.result == true)
                }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPayment(
        configJson: String,
        tokenizerUrl: String,
        tokenizerFallbackUrl: String,
        promise: Promise
    ) {
        try {
            val config = JSONObject(configJson)
            pendingPromise = promise
            pendingTokenizerUrl = tokenizerUrl
            pendingTokenizerFallbackUrl = tokenizerFallbackUrl

            val paymentDataRequest = buildPaymentDataRequest(config)
            val request = PaymentDataRequest.fromJson(paymentDataRequest.toString())

            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                pendingPromise = null
                pendingTokenizerUrl = ""
                pendingTokenizerFallbackUrl = ""
                promise.reject("NO_ACTIVITY", "No current activity")
                return
            }

            AutoResolveHelper.resolveTask(
                getPaymentsClient(activity, walletEnvFromConfig(configJson)).loadPaymentData(request),
                activity,
                LOAD_PAYMENT_DATA_REQUEST_CODE
            )
        } catch (e: Exception) {
            promise.reject("GOOGLE_PAY_ERROR", e.message, e)
        }
    }

    // ActivityEventListener — receives onActivityResult forwarded by React Native
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == LOAD_PAYMENT_DATA_REQUEST_CODE) {
            val paymentData = data?.let { PaymentData.getFromIntent(it) }
            handlePaymentResult(resultCode, paymentData)
        }
    }

    override fun onNewIntent(intent: Intent) {}

    /**
     * Processes the Google Pay payment data and tokenizes via Bolt.
     */
    private fun handlePaymentResult(resultCode: Int, paymentData: PaymentData?) {
        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK || paymentData == null) {
            promise.reject("CANCELLED", "Google Pay was cancelled or failed")
            return
        }

        // Snapshot URLs into locals before dispatching to the background thread so a
        // concurrent requestPayment() cannot race and redirect this tokenize call to
        // a different host.
        val tokenizerUrl = pendingTokenizerUrl
        val tokenizerFallbackUrl = pendingTokenizerFallbackUrl

        Thread {
            try {
                val paymentInfo = JSONObject(paymentData.toJson())
                val tokenResult = try {
                    tokenizePayment(paymentInfo, tokenizerUrl, tokenizerFallbackUrl)
                } catch (e: TokenizerHttpError) {
                    promise.reject("TOKENIZE_FAILED", e.message, e)
                    return@Thread
                }

                val result = JSONObject()
                result.put("token", tokenResult.optString("token", ""))

                val paymentMethodData = paymentInfo.optJSONObject("paymentMethodData")
                val billingAddress = paymentMethodData
                    ?.optJSONObject("info")
                    ?.optJSONObject("billingAddress")
                if (billingAddress != null) {
                    val address = JSONObject()
                    address.put("name", billingAddress.optString("name", ""))
                    address.put("address1", billingAddress.optString("address1", ""))
                    address.put("address2", billingAddress.optString("address2", ""))
                    address.put("locality", billingAddress.optString("locality", ""))
                    address.put("administrativeArea", billingAddress.optString("administrativeArea", ""))
                    address.put("postalCode", billingAddress.optString("postalCode", ""))
                    address.put("countryCode", billingAddress.optString("countryCode", ""))
                    address.put("phoneNumber", billingAddress.optString("phoneNumber", ""))
                    result.put("billingAddress", address)
                }

                // Email is at the top level of the payment response
                val email = paymentInfo.optString("email", "")
                if (email.isNotEmpty()) {
                    result.put("email", email)
                }

                // Bolt reference from tokenize response (used for add-card API)
                val boltReference = tokenResult.optString("bolt_reference", "")
                if (boltReference.isNotEmpty()) {
                    result.put("boltReference", boltReference)
                }

                promise.resolve(result.toString())
            } catch (e: Exception) {
                promise.reject("TOKENIZE_ERROR", e.message, e)
            }
        }.start()
    }

    private fun buildIsReadyToPayRequest(): JSONObject {
        val params = JSONObject()
        params.put("apiVersion", 2)
        params.put("apiVersionMinor", 0)

        val cardParams = JSONObject()
        cardParams.put("allowedAuthMethods", JSONArray(listOf("PAN_ONLY", "CRYPTOGRAM_3DS")))
        cardParams.put("allowedCardNetworks", JSONArray(listOf("VISA", "MASTERCARD", "AMEX", "DISCOVER")))

        val allowedPaymentMethod = JSONObject()
        allowedPaymentMethod.put("type", "CARD")
        allowedPaymentMethod.put("parameters", cardParams)

        params.put("allowedPaymentMethods", JSONArray(listOf(allowedPaymentMethod)))
        return params
    }

    private fun buildPaymentDataRequest(config: JSONObject): JSONObject {
        val params = JSONObject()
        params.put("apiVersion", 2)
        params.put("apiVersionMinor", 0)

        // Card payment method
        val cardParams = JSONObject()
        cardParams.put("allowedAuthMethods", JSONArray(listOf("PAN_ONLY", "CRYPTOGRAM_3DS")))
        cardParams.put("allowedCardNetworks", JSONArray(listOf("VISA", "MASTERCARD", "AMEX", "DISCOVER")))

        // Billing address
        val billingFormat = config.optString("billingAddressFormat", "FULL")
        if (billingFormat != "NONE") {
            cardParams.put("billingAddressRequired", true)
            val billingAddressParams = JSONObject()
            billingAddressParams.put("format", billingFormat)
            billingAddressParams.put("phoneNumberRequired", true)
            cardParams.put("billingAddressParameters", billingAddressParams)
        }

        // Tokenization spec from Bolt API config
        val tokenSpecConfig = config.optJSONObject("tokenizationSpecification")
        val tokenSpec = if (tokenSpecConfig != null) {
            // Use the tokenization spec from Bolt's apm_config API
            tokenSpecConfig
        } else {
            // Fallback: shouldn't happen in normal flow
            val spec = JSONObject()
            spec.put("type", "PAYMENT_GATEWAY")
            val tokenParams = JSONObject()
            tokenParams.put("gateway", "bolt")
            spec.put("parameters", tokenParams)
            spec
        }

        val cardMethod = JSONObject()
        cardMethod.put("type", "CARD")
        cardMethod.put("parameters", cardParams)
        cardMethod.put("tokenizationSpecification", tokenSpec)

        params.put("allowedPaymentMethods", JSONArray(listOf(cardMethod)))

        // Transaction info
        val transactionInfo = JSONObject()
        transactionInfo.put("totalPrice", config.optString("totalPrice", "0.00"))
        transactionInfo.put("totalPriceStatus", config.optString("totalPriceStatus", "FINAL"))
        transactionInfo.put("currencyCode", config.optString("currencyCode", "USD"))
        params.put("transactionInfo", transactionInfo)

        // Merchant info from Bolt API config
        val merchantInfo = JSONObject()
        merchantInfo.put("merchantId", config.optString("merchantId", ""))
        merchantInfo.put("merchantName", config.optString("merchantName", ""))
        params.put("merchantInfo", merchantInfo)
        params.put("emailRequired", true)

        return params
    }

    /**
     * Tokenize the Google Pay payment token via Bolt's tokenizer service.
     *
     * The Google Pay SDK returns `paymentMethodData.tokenizationData.token` as a
     * JSON string matching `IPostGooglePayTokenRequest`:
     *   { intermediateSigningKey, signature, signedMessage, protocolVersion }
     *
     * We POST that parsed object directly (no wrapping, no Authorization header —
     * the tokenizer service is unauthenticated; trust comes from the signed payload)
     * to `$tokenizerUrl/token/googlepay`, falling back to the alternative host on
     * any non-2xx / transport failure (matches @boltpay/tokenizer client behavior).
     */
    private fun tokenizePayment(
        paymentInfo: JSONObject,
        tokenizerUrl: String,
        tokenizerFallbackUrl: String
    ): JSONObject {
        // Throw (not return null) on schema drift so the promise rejection carries the
        // real shape mismatch instead of falling through to the generic "Failed to tokenize".
        val paymentMethodData = paymentInfo.optJSONObject("paymentMethodData")
            ?: throw TokenizerHttpError("Google Pay response missing paymentMethodData")
        val tokenData = paymentMethodData.optJSONObject("tokenizationData")
            ?: throw TokenizerHttpError("Google Pay response missing tokenizationData")
        val tokenString = tokenData.optString("token", "")
        if (tokenString.isEmpty()) throw TokenizerHttpError("Google Pay tokenizationData.token is empty")

        // The Google Pay token is itself JSON — send as-is to the tokenizer.
        val body = try {
            JSONObject(tokenString)
        } catch (e: Exception) {
            throw TokenizerHttpError("Malformed Google Pay token payload: ${e.message}")
        }

        val primary = "$tokenizerUrl/token/googlepay"
        val fallback = "$tokenizerFallbackUrl/token/googlepay"

        val (response, primaryError) = postJson(primary, body)
        if (response != null) return response

        val (fallbackResponse, fallbackError) = postJson(fallback, body)
        if (fallbackResponse != null) return fallbackResponse

        throw TokenizerHttpError(
            "Google Pay tokenize failed. primary=$primaryError; fallback=$fallbackError"
        )
    }

    /**
     * POST JSON to a tokenizer URL. Returns (parsed body, null) on 2xx, or
     * (null, "HTTP N: <error body>") on non-2xx or transport failure.
     */
    private fun postJson(urlString: String, body: JSONObject): Pair<JSONObject?, String?> {
        val connection = try {
            (URL(urlString).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                connectTimeout = 15_000
                readTimeout = 15_000
            }
        } catch (e: Exception) {
            return null to "connect error: ${e.message}"
        }

        return try {
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(body.toString())
                writer.flush()
            }
            val code = connection.responseCode
            if (code in 200..299) {
                val text = BufferedReader(InputStreamReader(connection.inputStream)).use { it.readText() }
                JSONObject(text) to null
            } else {
                val errText = connection.errorStream
                    ?.let { BufferedReader(InputStreamReader(it)).use { r -> r.readText() } }
                    ?: ""
                null to "HTTP $code: ${errText.take(500)}"
            }
        } catch (e: Exception) {
            null to "request error: ${e.message}"
        } finally {
            connection.disconnect()
        }
    }

    /** Thrown when tokenization fails at the HTTP layer so the caller can reject with a real message. */
    private class TokenizerHttpError(message: String) : Exception(message)
}
