package com.boltreactnativesdk.creditcardfield

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.Event

/**
 * DirectEventHandler events for BoltCreditCardField.
 * ADR-4: Use direct events (not bubbling) for component-scoped state signals.
 *
 * Event names use the "top" prefix convention required by Fabric.
 */

class OnValidEvent(surfaceId: Int, viewId: Int) : Event<OnValidEvent>(surfaceId, viewId) {
    override fun getEventName(): String = "topCardValid"
    override fun getEventData(): WritableMap = Arguments.createMap()
}

class OnErrorEvent(surfaceId: Int, viewId: Int, private val message: String) :
    Event<OnErrorEvent>(surfaceId, viewId) {
    override fun getEventName(): String = "topCardError"
    override fun getEventData(): WritableMap = Arguments.createMap().apply {
        putString("message", message)
    }
}

class OnFocusEvent(surfaceId: Int, viewId: Int) : Event<OnFocusEvent>(surfaceId, viewId) {
    override fun getEventName(): String = "topCardFocus"
    override fun getEventData(): WritableMap = Arguments.createMap()
}

class OnBlurEvent(surfaceId: Int, viewId: Int) : Event<OnBlurEvent>(surfaceId, viewId) {
    override fun getEventName(): String = "topCardBlur"
    override fun getEventData(): WritableMap = Arguments.createMap()
}
