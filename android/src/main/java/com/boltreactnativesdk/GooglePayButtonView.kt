package com.boltreactnativesdk

import android.content.Context
import android.widget.FrameLayout
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import com.google.android.gms.wallet.button.ButtonConstants
import com.google.android.gms.wallet.button.ButtonOptions
import com.google.android.gms.wallet.button.PayButton

/**
 * FrameLayout that hosts a Google Pay [PayButton].
 * Maps the `buttonType` string prop to [ButtonConstants.ButtonType] values.
 */
class GooglePayButtonView(context: Context) : FrameLayout(context) {

    private var currentButtonType: String = "plain"
    private var currentButtonTheme: String = "dark"
    private var cornerRadiusPx: Int = 0

    init {
        rebuildButton()
    }

    fun updateBorderRadius(radiusPx: Int) {
        if (radiusPx == cornerRadiusPx) return
        cornerRadiusPx = radiusPx
        rebuildButton()
    }

    fun updateButtonType(type: String) {
        if (type == currentButtonType) return
        currentButtonType = type
        rebuildButton()
    }

    fun updateButtonTheme(theme: String) {
        if (theme == currentButtonTheme) return
        currentButtonTheme = theme
        rebuildButton()
    }

    private fun rebuildButton() {
        removeAllViews()

        val button = PayButton(context)
        val options = ButtonOptions.newBuilder()
            .setButtonType(mapButtonType(currentButtonType))
            .setButtonTheme(mapButtonTheme(currentButtonTheme))
            .setCornerRadius(cornerRadiusPx)
            .setAllowedPaymentMethods(ALLOWED_PAYMENT_METHODS)
            .build()
        button.initialize(options)
        button.layoutParams = LayoutParams(
            LayoutParams.MATCH_PARENT,
            LayoutParams.MATCH_PARENT
        )
        button.setOnClickListener {
            val reactContext = context as? ReactContext ?: return@setOnClickListener
            val surfaceId = UIManagerHelper.getSurfaceId(this)
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
            dispatcher?.dispatchEvent(PressEvent(surfaceId, id))
        }

        addView(button)
    }

    private class PressEvent(surfaceId: Int, viewId: Int) : Event<PressEvent>(surfaceId, viewId) {
        override fun getEventName(): String = "topPress"
    }

    companion object {
        fun mapButtonType(type: String): Int = when (type) {
            "buy" -> ButtonConstants.ButtonType.BUY
            "pay" -> ButtonConstants.ButtonType.PAY
            "book" -> ButtonConstants.ButtonType.BOOK
            "checkout" -> ButtonConstants.ButtonType.CHECKOUT
            "donate" -> ButtonConstants.ButtonType.DONATE
            "order" -> ButtonConstants.ButtonType.ORDER
            "subscribe" -> ButtonConstants.ButtonType.SUBSCRIBE
            else -> ButtonConstants.ButtonType.PLAIN
        }

        fun mapButtonTheme(theme: String): Int = when (theme) {
            "light" -> ButtonConstants.ButtonTheme.LIGHT
            else -> ButtonConstants.ButtonTheme.DARK
        }

        // Minimal allowed payment methods JSON required by PayButton.initialize()
        private const val ALLOWED_PAYMENT_METHODS = """
            [{"type":"CARD","parameters":{"allowedAuthMethods":["PAN_ONLY","CRYPTOGRAM_3DS"],"allowedCardNetworks":["VISA","MASTERCARD","AMEX","DISCOVER"]}}]
        """
    }
}
