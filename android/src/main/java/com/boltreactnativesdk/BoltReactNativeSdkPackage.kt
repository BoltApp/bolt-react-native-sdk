package com.boltreactnativesdk

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.boltreactnativesdk.creditcardfield.BoltCardFieldManager
import com.boltreactnativesdk.creditcardfield.BoltCardFieldModule

class BoltReactNativeSdkPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return when (name) {
      BoltReactNativeSdkModule.NAME -> BoltReactNativeSdkModule(reactContext)
      GooglePayModule.NAME -> GooglePayModule(reactContext)
      NetworkingModule.NAME -> NetworkingModule(reactContext)
      BoltCardFieldModule.NAME -> BoltCardFieldModule(reactContext)
      else -> null
    }
  }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      BoltReactNativeSdkModule.NAME to ReactModuleInfo(
        name = BoltReactNativeSdkModule.NAME,
        className = BoltReactNativeSdkModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = true
      ),
      GooglePayModule.NAME to ReactModuleInfo(
        name = GooglePayModule.NAME,
        className = GooglePayModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = false
      ),
      NetworkingModule.NAME to ReactModuleInfo(
        name = NetworkingModule.NAME,
        className = NetworkingModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = false
      ),
      BoltCardFieldModule.NAME to ReactModuleInfo(
        name = BoltCardFieldModule.NAME,
        className = BoltCardFieldModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = false
      )
    )
  }

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> {
    return listOf(GooglePayButtonViewManager(), BoltCardFieldManager())
  }
}
