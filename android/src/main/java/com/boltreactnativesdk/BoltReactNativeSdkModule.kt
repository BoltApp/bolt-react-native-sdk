package com.boltreactnativesdk

import com.facebook.react.bridge.ReactApplicationContext

class BoltReactNativeSdkModule(reactContext: ReactApplicationContext) :
  NativeBoltReactNativeSdkSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

companion object {
    const val NAME = NativeBoltReactNativeSdkSpec.NAME
  }
}
