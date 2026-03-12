package com.boltreactnativesdk

import android.app.Activity
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
 */
class GooglePayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "BoltGooglePay"
        private const val LOAD_PAYMENT_DATA_REQUEST_CODE = 991
    }

    override fun getName(): String = NAME

    private var paymentsClient: PaymentsClient? = null
    private var pendingPromise: Promise? = null
    private var pendingPublishableKey: String = ""
    private var pendingBaseUrl: String = ""

    private fun getPaymentsClient(): PaymentsClient {
        if (paymentsClient == null) {
            val walletOptions = Wallet.WalletOptions.Builder()
                .setEnvironment(WalletConstants.ENVIRONMENT_TEST)
                .build()
            paymentsClient = Wallet.getPaymentsClient(reactApplicationContext, walletOptions)
        }
        return paymentsClient!!
    }

    @ReactMethod
    fun isReadyToPay(configJson: String, promise: Promise) {
        try {
            val isReadyToPayRequest = IsReadyToPayRequest.fromJson(buildIsReadyToPayRequest().toString())
            getPaymentsClient().isReadyToPay(isReadyToPayRequest)
                .addOnCompleteListener { task ->
                    promise.resolve(task.isSuccessful && task.result == true)
                }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPayment(configJson: String, publishableKey: String, baseUrl: String, promise: Promise) {
        try {
            val config = JSONObject(configJson)
            pendingPromise = promise
            pendingPublishableKey = publishableKey
            pendingBaseUrl = baseUrl

            val paymentDataRequest = buildPaymentDataRequest(config)
            val request = PaymentDataRequest.fromJson(paymentDataRequest.toString())

            val activity = reactApplicationContext.currentActivity
            if (activity == null) {
                promise.reject("NO_ACTIVITY", "No current activity")
                return
            }

            AutoResolveHelper.resolveTask(
                getPaymentsClient().loadPaymentData(request),
                activity,
                LOAD_PAYMENT_DATA_REQUEST_CODE
            )
        } catch (e: Exception) {
            promise.reject("GOOGLE_PAY_ERROR", e.message, e)
        }
    }

    /**
     * Called from the Activity's onActivityResult.
     * Processes the Google Pay payment data and tokenizes via Bolt.
     */
    fun handlePaymentResult(resultCode: Int, paymentData: PaymentData?) {
        val promise = pendingPromise ?: return
        pendingPromise = null

        if (resultCode != Activity.RESULT_OK || paymentData == null) {
            promise.reject("CANCELLED", "Google Pay was cancelled or failed")
            return
        }

        Thread {
            try {
                val paymentInfo = JSONObject(paymentData.toJson())
                val tokenResult = tokenizePayment(paymentInfo)

                if (tokenResult != null) {
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
                } else {
                    promise.reject("TOKENIZE_FAILED", "Failed to tokenize Google Pay payment")
                }
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
        cardParams.put("billingAddressRequired", true)
        val billingAddressParams = JSONObject()
        billingAddressParams.put("format", "FULL")
        billingAddressParams.put("phoneNumberRequired", true)
        cardParams.put("billingAddressParameters", billingAddressParams)

        val tokenSpec = JSONObject()
        tokenSpec.put("type", "PAYMENT_GATEWAY")
        val tokenParams = JSONObject()
        tokenParams.put("gateway", "bolt")
        tokenParams.put("gatewayMerchantId", config.optString("merchantId", ""))
        tokenSpec.put("parameters", tokenParams)

        val cardMethod = JSONObject()
        cardMethod.put("type", "CARD")
        cardMethod.put("parameters", cardParams)
        cardMethod.put("tokenizationSpecification", tokenSpec)

        params.put("allowedPaymentMethods", JSONArray(listOf(cardMethod)))

        // Transaction info
        val transactionInfo = JSONObject()
        transactionInfo.put("totalPrice", config.optString("totalPrice", "0.00"))
        transactionInfo.put("totalPriceStatus", config.optString("totalPriceStatus", "FINAL"))
        transactionInfo.put("countryCode", config.optString("countryCode", "US"))
        transactionInfo.put("currencyCode", config.optString("currencyCode", "USD"))
        params.put("transactionInfo", transactionInfo)

        // Merchant info
        val merchantInfo = JSONObject()
        merchantInfo.put("merchantId", config.optString("merchantId", ""))
        merchantInfo.put("merchantName", config.optString("merchantName", ""))
        params.put("merchantInfo", merchantInfo)
        params.put("emailRequired", true)

        return params
    }

    /**
     * Tokenize the Google Pay payment token via Bolt's tokenizer API.
     */
    private fun tokenizePayment(paymentInfo: JSONObject): JSONObject? {
        val paymentMethodData = paymentInfo.optJSONObject("paymentMethodData") ?: return null
        val tokenData = paymentMethodData.optJSONObject("tokenizationData") ?: return null
        val token = tokenData.optString("token", "")

        val url = URL("$pendingBaseUrl/v1/googlepay/tokenize")
        val connection = url.openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $pendingPublishableKey")
            connection.doOutput = true

            val body = JSONObject()
            body.put("payment_token", token)

            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(body.toString())
                writer.flush()
            }

            if (connection.responseCode == 200) {
                val reader = BufferedReader(InputStreamReader(connection.inputStream))
                val response = reader.readText()
                reader.close()
                JSONObject(response)
            } else {
                null
            }
        } catch (e: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }
}
