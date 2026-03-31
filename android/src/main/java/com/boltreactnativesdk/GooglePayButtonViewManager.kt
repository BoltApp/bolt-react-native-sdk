package com.boltreactnativesdk

import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.PixelUtil
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.BoltGooglePayButtonManagerDelegate
import com.facebook.react.viewmanagers.BoltGooglePayButtonManagerInterface

/**
 * Fabric ViewManager for the Google Pay native button.
 * Delegates prop handling to the codegen'd [BoltGooglePayButtonManagerDelegate].
 */
@ReactModule(name = GooglePayButtonViewManager.NAME)
class GooglePayButtonViewManager :
    SimpleViewManager<GooglePayButtonView>(),
    BoltGooglePayButtonManagerInterface<GooglePayButtonView> {

    companion object {
        const val NAME = "BoltGooglePayButton"
    }

    private val delegate = BoltGooglePayButtonManagerDelegate(this)

    override fun getDelegate(): ViewManagerDelegate<GooglePayButtonView> = delegate

    override fun getName(): String = NAME

    override fun createViewInstance(context: ThemedReactContext): GooglePayButtonView {
        return GooglePayButtonView(context)
    }

    @ReactProp(name = "buttonType")
    override fun setButtonType(view: GooglePayButtonView, type: String?) {
        view.updateButtonType(type ?: "plain")
    }

    @ReactProp(name = "buttonTheme")
    override fun setButtonTheme(view: GooglePayButtonView, theme: String?) {
        view.updateButtonTheme(theme ?: "dark")
    }

    @ReactProp(name = "borderRadius", defaultFloat = 0f)
    override fun setBorderRadius(view: GooglePayButtonView, borderRadius: Float) {
        view.updateBorderRadius(PixelUtil.toPixelFromDIP(borderRadius))
    }
}
