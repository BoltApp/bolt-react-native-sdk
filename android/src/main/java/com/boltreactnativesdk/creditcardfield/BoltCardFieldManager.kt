package com.boltreactnativesdk.creditcardfield

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.BoltCreditCardFieldManagerDelegate
import com.facebook.react.viewmanagers.BoltCreditCardFieldManagerInterface

/**
 * Fabric ViewManager for the native credit card input.
 *
 * The @ReactModule name MUST exactly match the string passed to
 * codegenNativeComponent('BoltCreditCardField') in the TypeScript spec.
 */
@ReactModule(name = BoltCardFieldManager.NAME)
class BoltCardFieldManager :
    SimpleViewManager<BoltCardFieldView>(),
    BoltCreditCardFieldManagerInterface<BoltCardFieldView> {

    companion object {
        const val NAME = "BoltCreditCardField"
    }

    private val delegate = BoltCreditCardFieldManagerDelegate(this)

    override fun getDelegate(): ViewManagerDelegate<BoltCardFieldView> = delegate

    override fun getName(): String = NAME

    override fun createViewInstance(context: ThemedReactContext): BoltCardFieldView {
        return BoltCardFieldView(context)
    }

    @ReactProp(name = "publishableKey")
    override fun setPublishableKey(view: BoltCardFieldView, key: String?) {
        // Stored for use by the companion TurboModule during tokenize
    }

    @ReactProp(name = "showPostalCode", defaultBoolean = false)
    override fun setShowPostalCode(view: BoltCardFieldView, show: Boolean) {
        view.updateShowPostalCode(show)
    }

    // Style props
    @ReactProp(name = "styleTextColor")
    override fun setStyleTextColor(view: BoltCardFieldView, color: String?) {
        view.applyStyleTextColor(color)
    }

    @ReactProp(name = "styleFontSize", defaultFloat = 0f)
    override fun setStyleFontSize(view: BoltCardFieldView, size: Float) {
        view.applyStyleFontSize(size)
    }

    @ReactProp(name = "stylePlaceholderColor")
    override fun setStylePlaceholderColor(view: BoltCardFieldView, color: String?) {
        view.applyStylePlaceholderColor(color)
    }

    @ReactProp(name = "styleBorderColor")
    override fun setStyleBorderColor(view: BoltCardFieldView, color: String?) {
        view.applyStyleBorderColor(color)
    }

    @ReactProp(name = "styleBorderWidth", defaultFloat = 0f)
    override fun setStyleBorderWidth(view: BoltCardFieldView, width: Float) {
        view.applyStyleBorderWidth(width)
    }

    @ReactProp(name = "styleBorderRadius", defaultFloat = 0f)
    override fun setStyleBorderRadius(view: BoltCardFieldView, radius: Float) {
        view.applyStyleBorderRadius(radius)
    }

    @ReactProp(name = "styleBackgroundColor")
    override fun setStyleBackgroundColor(view: BoltCardFieldView, color: String?) {
        view.applyStyleBackgroundColor(color)
    }

    @ReactProp(name = "styleFontFamily")
    override fun setStyleFontFamily(view: BoltCardFieldView, family: String?) {
        view.applyStyleFontFamily(family)
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? {
        return mapOf(
            "topCardValid" to mapOf("registrationName" to "onCardValid"),
            "topCardError" to mapOf("registrationName" to "onCardError"),
            "topCardFocus" to mapOf("registrationName" to "onCardFocus"),
            "topCardBlur"  to mapOf("registrationName" to "onCardBlur"),
        )
    }
}
