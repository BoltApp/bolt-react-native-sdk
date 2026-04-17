package com.boltreactnativesdk.creditcardfield

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.UIManagerHelper
import org.json.JSONObject

/**
 * Companion TurboModule for the BoltCreditCardField Fabric component.
 *
 * Provides tokenize(viewTag, publishableKey, apiUrl) which:
 * 1. Looks up the native BoltCardFieldView by React view tag
 * 2. Reads raw card data from CharArray buffers (never String for PAN/CVV)
 * 3. Derives the tokenizer environment from apiUrl
 * 4. Encrypts card data via BoltTokenizer (NaCl crypto_box)
 * 5. Zeros all card buffers on every exit path (FR-3.4)
 * 6. Resolves the Promise with JSON-encoded TokenResult
 */
class BoltCardFieldModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    @ReactMethod
    fun tokenize(viewTag: Double, publishableKey: String /* reserved for future use */, apiUrl: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                val cardData = readCardData(viewTag.toInt())
                if (cardData == null) {
                    promise.reject("E_VIEW_NOT_FOUND", "BoltCardFieldView not found")
                    return@runOnUiThread
                }

                // Run tokenization off main thread
                Thread {
                    performTokenize(cardData, apiUrl, promise)
                }.start()
            } catch (e: Exception) {
                promise.reject("E_TOKENIZE_FAILED", e.message ?: "Unknown error", e)
            }
        }
    }

    /**
     * Snapshot of card data captured on the UI thread.
     * CharArray copies — caller must zero them after use.
     */
    private data class CardData(
        val panDigits: CharArray,
        val panLength: Int,
        val cvvDigits: CharArray,
        val cvvLength: Int,
        val expiry: String,
        val postalCode: String?,
        val network: String,
        val last4: String,
        val bin: String,
        val zeroViewBuffers: () -> Unit
    )

    private fun readCardData(viewTag: Int): CardData? {
        val uiManager = UIManagerHelper.getUIManager(reactApplicationContext, viewTag) ?: return null
        val view = uiManager.resolveView(viewTag)
        val cardFieldView = findCardFieldView(view) ?: return null

        // Copy raw CharArrays before leaving UI thread
        val pan = cardFieldView.panDigits.copyOf(cardFieldView.panLength)
        val cvv = cardFieldView.cvvDigits.copyOf(cardFieldView.cvvLength)

        return CardData(
            panDigits      = pan,
            panLength      = cardFieldView.panLength,
            cvvDigits      = cvv,
            cvvLength      = cardFieldView.cvvLength,
            expiry         = cardFieldView.getFormattedExpiry(),
            postalCode     = cardFieldView.getPostalCode(),
            network        = cardFieldView.cardNetwork.value,
            last4          = cardFieldView.getLast4(),
            bin            = cardFieldView.getBIN(),
            zeroViewBuffers = { cardFieldView.zeroAllBuffers() }
        )
    }

    private fun performTokenize(cardData: CardData, apiUrl: String, promise: Promise) {
        try {
            val environment = BoltTokenizer.environmentFromApiUrl(apiUrl)
            val tokenizer = BoltTokenizer(environment)

            val result = tokenizer.tokenize(
                panDigits = cardData.panDigits,
                panLength = cardData.panLength,
                cvvDigits = cardData.cvvDigits,
                cvvLength = cardData.cvvLength
            )

            // Zero the CharArray copies now that tokenization succeeded
            cardData.panDigits.fill('\u0000')
            cardData.cvvDigits.fill('\u0000')

            // Zero the view buffers on the UI thread
            UiThreadUtil.runOnUiThread { cardData.zeroViewBuffers() }

            val tokenResult = JSONObject().apply {
                put("token",       result.token)
                put("last4",       result.last4.ifEmpty { cardData.last4 })
                put("bin",         result.bin.ifEmpty { cardData.bin })
                put("network",     cardData.network)
                put("expiration",  cardData.expiry)
                if (!cardData.postalCode.isNullOrEmpty()) {
                    put("postal_code", cardData.postalCode)
                }
            }

            promise.resolve(tokenResult.toString())
        } catch (e: Exception) {
            promise.reject("E_TOKENIZE_FAILED", e.message ?: "Unknown error", e)
        } finally {
            // Ensure CharArrays are zeroed even on exception
            cardData.panDigits.fill('\u0000')
            cardData.cvvDigits.fill('\u0000')
            UiThreadUtil.runOnUiThread { cardData.zeroViewBuffers() }
        }
    }

    private fun findCardFieldView(view: android.view.View?): BoltCardFieldView? {
        if (view is BoltCardFieldView) return view
        if (view is android.view.ViewGroup) {
            for (i in 0 until view.childCount) {
                val found = findCardFieldView(view.getChildAt(i))
                if (found != null) return found
            }
        }
        return null
    }

    companion object {
        const val NAME = "BoltCardField"
    }
}
