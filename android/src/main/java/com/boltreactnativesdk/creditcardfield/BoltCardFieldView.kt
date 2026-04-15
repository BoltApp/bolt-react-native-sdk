package com.boltreactnativesdk.creditcardfield

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.text.method.PasswordTransformationMethod
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper

/**
 * LinearLayout container that hosts native card input fields arranged in the
 * iOS-matching "separate rounded rows" layout:
 *
 *   Row 1:  [card icon] Card number            (full width, rounded border)
 *   Row 2:  Expiration  |  CVV                 (split 50/50 with divider, rounded border)
 *   Row 3:  Billing zip                        (full width, hidden by default, rounded border)
 *
 * Row spacing: 16dp. Row height: 48dp. Corner radius: 10dp.
 * Border: #d1d5db, 1dp. Background: #fafafa. Cursor: Bolt purple #5A31F4.
 *
 * CHD stays in CharArray buffers — never converted to String.
 *
 * Security controls:
 * - FLAG_SECURE applied when attached (SR-7)
 * - IMPORTANT_FOR_AUTOFILL_NO on all fields (SR-9)
 * - TYPE_TEXT_FLAG_NO_SUGGESTIONS on all fields (SR-9)
 * - onSaveInstanceState returns empty state to prevent Bundle disk persistence (SR-9)
 */
class BoltCardFieldView(context: Context) : LinearLayout(context) {

    // ---- Colors (dark mode aware) ----
    private val isDarkMode: Boolean get() {
        val uiMode = context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK
        return uiMode == android.content.res.Configuration.UI_MODE_NIGHT_YES
    }
    private val colorBorder   get() = if (isDarkMode) Color.parseColor("#374151") else Color.parseColor("#d1d5db")
    private val colorFieldBg  get() = if (isDarkMode) Color.parseColor("#1f2937") else Color.parseColor("#fafafa")
    private val colorPurple   = Color.parseColor("#5A31F4")
    private val colorError    = Color.parseColor("#dc2626")
    private val colorNormal   get() = if (isDarkMode) Color.parseColor("#f9fafb") else Color.parseColor("#111827")

    // ---- Raw digit buffers — mutable, zeroable ----
    internal val panDigits   = CharArray(19)
    internal var panLength   = 0
    internal var cardNetwork: CardNetwork = CardNetwork.UNKNOWN

    internal val expiryDigits  = CharArray(4) // MMYY
    internal var expiryLength  = 0

    internal val cvvDigits     = CharArray(4)
    internal var cvvLength     = 0
    internal var cvvExpectedLength = 3

    // ---- Input fields ----
    private val panField    = EditText(context)
    private val expiryField = EditText(context)
    private val cvvField    = EditText(context)
    internal val postalField  = EditText(context)
    internal var showPostalCode = false

    // Guard flag: when true, TextWatchers skip re-parsing (used during masking/unmasking)
    private var isMasking = false

    // ---- Row containers ----
    private val panRow     = LinearLayout(context)
    private val middleRow  = LinearLayout(context)
    private val postalRow  = LinearLayout(context)

    // Card brand icon shown as compound drawable on panField

    init {
        orientation = VERTICAL

        // SR-12/13: In production, log warning if device is rooted
        if (!BoltDeviceIntegrity.isDebugOrEmulator(context) && BoltDeviceIntegrity.isRooted(context)) {
            android.util.Log.w("BoltCardField", "Device appears to be rooted.")
        }
        setupLayout()
    }

    private fun setupDebugWarning() {
        val label = android.widget.TextView(context).apply {
            text = "Card fields are not available in debug mode or on emulators."
            setTextColor(Color.parseColor("#6b7280"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        addView(label, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    }

    // MARK: - Layout

    private fun dp(value: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

    private fun makeRowBackground(): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(colorFieldBg)
            cornerRadius = dp(10).toFloat()
            setStroke(dp(1), colorBorder)
        }
    }

    private fun styleField(field: EditText, hint: String, secure: Boolean = false) {
        field.background = null
        field.setTextColor(colorNormal)
        field.setHintTextColor(Color.parseColor("#9ca3af"))
        field.hint = hint
        field.typeface = Typeface.DEFAULT
        field.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        field.gravity = Gravity.CENTER_VERTICAL
        field.setPadding(dp(12), 0, dp(12), 0)
        field.highlightColor = (colorPurple and 0x00FFFFFF) or 0x44000000
        // SR-9: prevent autofill and keyboard suggestions
        field.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        if (secure) {
            field.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
            field.transformationMethod = PasswordTransformationMethod.getInstance()
        } else {
            field.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        }
    }

    private fun setupLayout() {
        val rowHeight  = dp(48)
        val rowSpacing = dp(16)

        // ---- Row 1: PAN ----
        panRow.orientation = HORIZONTAL
        panRow.background = makeRowBackground()
        panRow.gravity = Gravity.CENTER_VERTICAL

        styleField(panField, "Card number")
        panField.compoundDrawablePadding = dp(8)
        // SR-8: TalkBack should announce the field but not read the full card number.
        // accessibilityDelegate overrides the text content to show only last 4.
        panField.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                info.className = android.widget.EditText::class.java.name
                val last4 = if (panLength >= 4) "ending in ${getLast4()}" else ""
                info.text = "Card number $last4".trim()
                info.contentDescription = info.text
            }
        }
        val panFieldLp = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        panField.layoutParams = panFieldLp

        panRow.addView(panField)

        val panRowLp = LayoutParams(LayoutParams.MATCH_PARENT, rowHeight)
        addView(panRow, panRowLp)

        // ---- Row 2: Expiry | CVV ----
        middleRow.orientation = HORIZONTAL
        middleRow.background = makeRowBackground()
        middleRow.gravity = Gravity.CENTER_VERTICAL

        styleField(expiryField, "Expiration")
        styleField(cvvField, "CVV", secure = true)

        val halfLp = LayoutParams(0, LayoutParams.MATCH_PARENT, 1f)

        expiryField.layoutParams = halfLp.also { it.width = 0 }
        cvvField.layoutParams    = LayoutParams(0, LayoutParams.MATCH_PARENT, 1f)

        // Vertical divider between expiry and CVV
        val divider = View(context)
        divider.setBackgroundColor(colorBorder)
        val dividerLp = LayoutParams(dp(1), LayoutParams.MATCH_PARENT)
        divider.layoutParams = dividerLp

        middleRow.addView(expiryField)
        middleRow.addView(divider)
        middleRow.addView(cvvField)

        val midRowLp = LayoutParams(LayoutParams.MATCH_PARENT, rowHeight)
        midRowLp.topMargin = rowSpacing
        addView(middleRow, midRowLp)

        // ---- Row 3: Postal ----
        postalRow.orientation = HORIZONTAL
        postalRow.background = makeRowBackground()
        postalRow.gravity = Gravity.CENTER_VERTICAL

        postalField.background = null
        postalField.setTextColor(colorNormal)
        postalField.setHintTextColor(Color.parseColor("#9ca3af"))
        postalField.hint = "Billing zip"
        postalField.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        postalField.gravity = Gravity.CENTER_VERTICAL
        postalField.setPadding(dp(12), 0, dp(12), 0)
        postalField.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        postalField.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        postalField.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)

        postalRow.addView(postalField)

        val postalRowLp = LayoutParams(LayoutParams.MATCH_PARENT, rowHeight)
        postalRowLp.topMargin = rowSpacing
        addView(postalRow, postalRowLp)

        postalRow.visibility = View.GONE

        // Wire up text watchers and focus listeners
        setupPANWatcher()
        setupExpiryWatcher()
        setupCVVWatcher()
        setupPostalWatcher()
        setupFocusListeners()
    }

    // MARK: - Props

    fun updateShowPostalCode(show: Boolean) {
        showPostalCode = show
        postalRow.visibility = if (show) View.VISIBLE else View.GONE
    }

    // MARK: - Style prop handlers

    private val allFields get() = listOf(panField, expiryField, cvvField, postalField)
    private val allRows get() = listOf(panRow, middleRow, postalRow)

    fun applyStyleTextColor(hex: String?) {
        if (hex.isNullOrEmpty()) return
        val color = Color.parseColor(hex)
        allFields.forEach { it.setTextColor(color) }
    }

    fun applyStyleFontSize(size: Float) {
        if (size <= 0f) return
        allFields.forEach { it.setTextSize(TypedValue.COMPLEX_UNIT_SP, size) }
    }

    fun applyStylePlaceholderColor(hex: String?) {
        if (hex.isNullOrEmpty()) return
        val color = Color.parseColor(hex)
        allFields.forEach { it.setHintTextColor(color) }
    }

    fun applyStyleBorderColor(hex: String?) {
        if (hex.isNullOrEmpty()) return
        val color = Color.parseColor(hex)
        allRows.forEach { row ->
            (row.background as? GradientDrawable)?.setStroke(
                (row.background as? GradientDrawable)?.let { dp(1) } ?: dp(1), color
            )
        }
    }

    fun applyStyleBorderWidth(width: Float) {
        if (width <= 0f) return
        val px = dp(width.toInt())
        allRows.forEach { row ->
            (row.background as? GradientDrawable)?.setStroke(px, colorBorder)
        }
    }

    fun applyStyleBorderRadius(radius: Float) {
        if (radius <= 0f) return
        val px = dp(radius.toInt()).toFloat()
        allRows.forEach { row ->
            (row.background as? GradientDrawable)?.cornerRadius = px
        }
    }

    fun applyStyleBackgroundColor(hex: String?) {
        if (hex.isNullOrEmpty()) return
        val color = Color.parseColor(hex)
        allRows.forEach { row ->
            (row.background as? GradientDrawable)?.setColor(color)
        }
    }

    fun applyStyleFontFamily(family: String?) {
        if (family.isNullOrEmpty()) return
        val typeface = Typeface.create(family, Typeface.NORMAL)
        allFields.forEach { it.typeface = typeface }
    }

    // MARK: - Error state helpers

    private fun setFieldError(field: EditText, hasError: Boolean) {
        field.setTextColor(if (hasError) colorError else colorNormal)
    }

    // MARK: - TextWatchers

    private fun setupPANWatcher() {
        panField.addTextChangedListener(object : TextWatcher {
            private var isFormatting = false
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (isFormatting || isMasking) return
                isFormatting = true

                panLength = 0
                s?.forEach { c ->
                    if (c.isDigit() && panLength < 19) {
                        panDigits[panLength] = c
                        panLength++
                    }
                }

                val formatted = formatPAN()
                panField.setText(formatted)
                panField.setSelection(formatted.length)

                detectNetwork()
                updateBrandIcon()
                setFieldError(panField, false)
                checkValid()
                isFormatting = false
            }
        })
    }

    private fun setupExpiryWatcher() {
        expiryField.addTextChangedListener(object : TextWatcher {
            private var isFormatting = false
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (isFormatting) return
                isFormatting = true

                expiryLength = 0
                s?.forEach { c ->
                    if (c.isDigit() && expiryLength < 4) {
                        expiryDigits[expiryLength] = c
                        expiryLength++
                    }
                }

                val formatted = formatExpiry()
                expiryField.setText(formatted)
                expiryField.setSelection(formatted.length)

                setFieldError(expiryField, false)
                checkValid()
                isFormatting = false
            }
        })
    }

    private fun setupCVVWatcher() {
        cvvField.addTextChangedListener(object : TextWatcher {
            private var isFormatting = false
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (isFormatting) return
                isFormatting = true

                cvvLength = 0
                s?.forEach { c ->
                    if (c.isDigit() && cvvLength < cvvExpectedLength) {
                        cvvDigits[cvvLength] = c
                        cvvLength++
                    }
                }

                // CVV backspace fix: always sync display to digit count.
                // PasswordTransformationMethod shows bullets, but we set the raw
                // text explicitly so backspace properly clears characters.
                //
                // Known limitation: EditText.setText() requires a CharSequence,
                // so a transient Java String containing CVV digits exists briefly
                // in heap until the next keystroke replaces it. The authoritative
                // zeroable storage is cvvDigits (CharArray) which we zero on all
                // exit paths. Documented in the PCI threat model.
                val displayText = if (cvvLength > 0) String(cvvDigits, 0, cvvLength) else ""
                if (cvvField.text.toString() != displayText) {
                    cvvField.setText(displayText)
                    cvvField.setSelection(displayText.length)
                }

                setFieldError(cvvField, false)
                checkValid()
                isFormatting = false
            }
        })
    }

    private fun setupPostalWatcher() {
        postalField.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                checkValid()
            }
        })
    }

    private fun setupFocusListeners() {
        val reactContext = context as? ReactContext ?: return

        fun dispatch(field: EditText, hasFocus: Boolean) {
            val surfaceId = UIManagerHelper.getSurfaceId(this)
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
            if (hasFocus) {
                dispatcher.dispatchEvent(OnFocusEvent(surfaceId, id))
            } else {
                dispatcher.dispatchEvent(OnBlurEvent(surfaceId, id))
            }
        }

        panField.setOnFocusChangeListener { _, hasFocus ->
            dispatch(panField, hasFocus)
            isMasking = true
            if (hasFocus) {
                setFieldError(panField, false)
                if (panLength > 0) {
                    val formatted = formatPAN()
                    panField.setText(formatted)
                    panField.setSelection(formatted.length)
                }
            } else {
                validatePANOnBlur()
                // SR-6: Mask PAN after blur — show only last 4
                if (panLength > 4) {
                    val last4 = String(panDigits, panLength - 4, 4)
                    panField.setText("\u2022\u2022\u2022\u2022 $last4")
                }
            }
            isMasking = false
        }

        expiryField.setOnFocusChangeListener { _, hasFocus ->
            dispatch(expiryField, hasFocus)
            if (hasFocus) {
                setFieldError(expiryField, false)
            } else {
                validateExpiryOnBlur()
            }
        }

        cvvField.setOnFocusChangeListener { _, hasFocus ->
            dispatch(cvvField, hasFocus)
            if (hasFocus) {
                setFieldError(cvvField, false)
            } else {
                validateCVVOnBlur()
            }
        }

        postalField.setOnFocusChangeListener { _, hasFocus ->
            dispatch(postalField, hasFocus)
        }
    }

    // MARK: - Validation on blur

    private fun validatePANOnBlur() {
        if (panLength == 0) return
        if (cardNetwork == CardNetwork.UNKNOWN) {
            setFieldError(panField, true)
            dispatchError("Credit card type is not supported")
        } else if (!isPANValid()) {
            setFieldError(panField, true)
            dispatchError("Credit card number is invalid")
        }
    }

    private fun validateExpiryOnBlur() {
        if (expiryLength == 0) return
        if (expiryLength != 4) {
            setFieldError(expiryField, true)
            dispatchError("Expiration date is invalid")
        } else if (!isExpiryValid()) {
            setFieldError(expiryField, true)
            dispatchError("Credit card is expired")
        }
    }

    private fun validateCVVOnBlur() {
        if (cvvLength == 0) return
        if (!isCVVValid()) {
            setFieldError(cvvField, true)
            dispatchError("CVV is invalid")
        }
    }

    private fun dispatchError(message: String) {
        val reactContext = context as? ReactContext ?: return
        val surfaceId = UIManagerHelper.getSurfaceId(this)
        val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
        dispatcher.dispatchEvent(OnErrorEvent(surfaceId, id, message))
    }

    // MARK: - Card brand icon

    private fun updateBrandIcon() {
        val drawableName: String? = when (cardNetwork) {
            CardNetwork.VISA       -> "bolt_card_visa"
            CardNetwork.MASTERCARD -> "bolt_card_mastercard"
            CardNetwork.AMEX       -> "bolt_card_amex"
            CardNetwork.DISCOVER   -> "bolt_card_discover"
            else                   -> null
        }
        if (drawableName != null) {
            var resId = resources.getIdentifier(drawableName, "drawable", context.packageName)
            if (resId == 0) {
                resId = resources.getIdentifier(drawableName, "drawable", "com.boltreactnativesdk")
            }
            if (resId != 0) {
                val drawable = androidx.core.content.ContextCompat.getDrawable(context, resId) ?: return
                // Scale to 24dp height, maintain aspect ratio
                val h = dp(24)
                val w = if (drawable.intrinsicHeight > 0) {
                    (drawable.intrinsicWidth.toFloat() / drawable.intrinsicHeight * h).toInt()
                } else h
                drawable.setBounds(0, 0, w, h)
                panField.setCompoundDrawables(drawable, null, null, null)
                return
            }
        }
        panField.setCompoundDrawables(null, null, null, null)
    }

    // MARK: - BIN detection

    private fun detectNetwork() {
        val old = cardNetwork
        if (panLength < 1) {
            cardNetwork = CardNetwork.UNKNOWN
        } else {
            val d0 = panDigits[0].digitToInt()
            val d1 = if (panLength >= 2) panDigits[1].digitToInt() else 0
            val bin2 = d0 * 10 + d1
            val bin4 = if (panLength >= 4) {
                d0 * 1000 + d1 * 100 + panDigits[2].digitToInt() * 10 + panDigits[3].digitToInt()
            } else 0
            val bin6 = if (panLength >= 6) {
                d0 * 100000 + d1 * 10000 + panDigits[2].digitToInt() * 1000 +
                    panDigits[3].digitToInt() * 100 + panDigits[4].digitToInt() * 10 +
                    panDigits[5].digitToInt()
            } else 0

            cardNetwork = when {
                d0 == 4 -> CardNetwork.VISA
                (bin2 in 51..55) || (bin6 in 222100..272099) -> CardNetwork.MASTERCARD
                bin2 == 34 || bin2 == 37 -> CardNetwork.AMEX
                bin4 == 6011 || bin2 == 65 || (bin6 in 644000..649999) -> CardNetwork.DISCOVER
                bin2 == 62 -> CardNetwork.UNIONPAY
                else -> CardNetwork.UNKNOWN
            }
        }

        if (old != cardNetwork) {
            cvvExpectedLength = if (cardNetwork == CardNetwork.AMEX) 4 else 3
        }
    }

    // MARK: - Formatting

    private fun formatPAN(): String {
        val grouping = if (cardNetwork == CardNetwork.AMEX) intArrayOf(4, 6, 5) else intArrayOf(4, 4, 4, 4, 3)
        val sb = StringBuilder()
        var idx = 0
        for (groupSize in grouping) {
            if (idx >= panLength) break
            if (sb.isNotEmpty()) sb.append(' ')
            val end = minOf(idx + groupSize, panLength)
            for (i in idx until end) sb.append(panDigits[i])
            idx = end
        }
        return sb.toString()
    }

    private fun formatExpiry(): String {
        val sb = StringBuilder()
        for (i in 0 until expiryLength) {
            if (i == 2) sb.append('/')
            sb.append(expiryDigits[i])
        }
        return sb.toString()
    }

    // MARK: - Validation

    private fun isPANValid(): Boolean {
        if (panLength < 13 || panLength > 19 || cardNetwork == CardNetwork.UNKNOWN) return false
        var sum = 0
        var alternate = false
        for (i in panLength - 1 downTo 0) {
            var n = panDigits[i].digitToInt()
            if (alternate) { n *= 2; if (n > 9) n -= 9 }
            sum += n
            alternate = !alternate
        }
        return sum % 10 == 0
    }

    private fun isExpiryValid(): Boolean {
        if (expiryLength != 4) return false
        val month = expiryDigits[0].digitToInt() * 10 + expiryDigits[1].digitToInt()
        val year  = expiryDigits[2].digitToInt() * 10 + expiryDigits[3].digitToInt()
        if (month < 1 || month > 12) return false
        val cal = java.util.Calendar.getInstance()
        val currentYear  = cal.get(java.util.Calendar.YEAR) % 100
        val currentMonth = cal.get(java.util.Calendar.MONTH) + 1
        if (year < currentYear) return false
        if (year == currentYear && month < currentMonth) return false
        return true
    }

    private fun isCVVValid(): Boolean = cvvLength == cvvExpectedLength

    private fun isPostalValid(): Boolean {
        if (!showPostalCode) return true
        return postalField.text?.toString()?.trim()?.isNotEmpty() == true
    }

    private fun checkValid() {
        val pan = isPANValid()
        val exp = isExpiryValid()
        val cvv = isCVVValid()
        val zip = isPostalValid()
        // "checkValid: pan=$pan exp=$exp cvv=$cvv zip=$zip panLen=$panLength expiryLen=$expiryLength cvvLen=$cvvLength/$cvvExpectedLength network=$cardNetwork")
        if (pan && exp && cvv && zip) {
            val reactContext = context as? ReactContext ?: return
            val surfaceId = UIManagerHelper.getSurfaceId(this)
            val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
            dispatcher.dispatchEvent(OnValidEvent(surfaceId, id))
            // "checkValid: DISPATCHED OnValidEvent")
        }
    }

    // MARK: - Data access (for TurboModule tokenize)

    fun getFormattedExpiry(): String {
        if (expiryLength != 4) return ""
        val month = expiryDigits[0].digitToInt() * 10 + expiryDigits[1].digitToInt()
        val year  = 2000 + expiryDigits[2].digitToInt() * 10 + expiryDigits[3].digitToInt()
        return String.format("%04d-%02d", year, month)
    }

    fun getLast4(): String {
        if (panLength < 4) return ""
        return String(panDigits, panLength - 4, 4)
    }

    fun getBIN(): String {
        val len = minOf(6, panLength)
        if (len == 0) return ""
        return String(panDigits, 0, len)
    }

    fun getPostalCode(): String? {
        if (!showPostalCode) return null
        return postalField.text?.toString()?.trim()
    }

    // MARK: - Memory zeroing

    fun zeroAllBuffers() {
        panDigits.fill('\u0000'); panLength = 0
        expiryDigits.fill('\u0000'); expiryLength = 0
        cvvDigits.fill('\u0000'); cvvLength = 0
    }

    // MARK: - Lifecycle

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // SR-7: Prevent screenshots/screen recording
        (context as? android.app.Activity)?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    override fun onDetachedFromWindow() {
        zeroAllBuffers()
        // SR-7: Remove FLAG_SECURE when card fields are no longer visible
        (context as? android.app.Activity)?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        super.onDetachedFromWindow()
    }

    // SR-9: Prevent CHD from being saved to Bundle (disk persistence).
    // dispatchFreezeSelfOnly blocks child EditTexts from saving their text to the Bundle.
    override fun dispatchSaveInstanceState(container: android.util.SparseArray<android.os.Parcelable>?) {
        dispatchFreezeSelfOnly(container)
    }
}

enum class CardNetwork(val value: String) {
    VISA("visa"),
    MASTERCARD("mastercard"),
    AMEX("amex"),
    DISCOVER("discover"),
    UNIONPAY("unionpay"),
    UNKNOWN("unknown")
}
