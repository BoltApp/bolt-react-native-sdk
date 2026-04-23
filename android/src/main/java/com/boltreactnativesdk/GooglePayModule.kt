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

/**
 * TurboModule implementation for Google Pay via PaymentsClient.
 *
 * Handles:
 * 1. Checking Google Pay readiness
 * 2. Presenting the Google Pay payment sheet
 * 3. Returning raw payment data to JS for tokenization via @boltpay/tokenizer
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
        promise: Promise
    ) {
        try {
            val config = JSONObject(configJson)
            pendingPromise = promise

            val paymentDataRequest = buildPaymentDataRequest(config)
            val request = PaymentDataRequest.fromJson(paymentDataRequest.toString())

            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                pendingPromise = null
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
     * Extracts raw Google Pay payment data and forwards it to JS for tokenization
     * via @boltpay/tokenizer's TkClient.postGooglePayToken().
     */
    private fun handlePaymentResult(resultCode: Int, paymentData: PaymentData?) {
        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK || paymentData == null) {
            promise.reject("CANCELLED", "Google Pay was cancelled or failed")
            return
        }

        try {
            val paymentInfo = JSONObject(paymentData.toJson())
            val result = JSONObject()

            val paymentMethodData = paymentInfo.optJSONObject("paymentMethodData")

            // Extract the raw Google Pay token for JS-side tokenization.
            // tokenizationData.token is a JSON string matching IPostGooglePayTokenRequest.
            // Reject explicitly when it's missing so the caller sees schema drift as an
            // actionable error rather than an opaque tokenizer 400 later.
            val tokenString = paymentMethodData
                ?.optJSONObject("tokenizationData")
                ?.optString("token", "")
            if (tokenString.isNullOrEmpty()) {
                promise.reject(
                    "MISSING_TOKEN",
                    "Google Pay response missing paymentMethodData.tokenizationData.token"
                )
                return
            }
            val googlePayToken = try {
                JSONObject(tokenString)
            } catch (e: org.json.JSONException) {
                promise.reject(
                    "MALFORMED_TOKEN",
                    "Google Pay tokenizationData.token is not valid JSON",
                    e
                )
                return
            }
            result.put("googlePayToken", googlePayToken)

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

            val email = paymentInfo.optString("email", "")
            if (email.isNotEmpty()) {
                result.put("email", email)
            }

            promise.resolve(result.toString())
        } catch (e: Exception) {
            promise.reject("GOOGLE_PAY_ERROR", e.message, e)
        }
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

}
