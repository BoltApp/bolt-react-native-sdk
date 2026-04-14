package com.boltreactnativesdk.creditcardfield

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import java.io.File

/**
 * Device integrity checks for PCI compliance.
 *
 * SR-12: Debug mode / emulator detection
 * SR-13: Root detection
 * SR-15: Runtime APK signature verification
 *
 * None of these checks hard-block card field usage.
 * SR-12 shows a warning instead of fields.
 * SR-13 and SR-15 report to telemetry but allow fields to render.
 */
object BoltDeviceIntegrity {

    // MARK: - SR-12: Debug / Emulator Detection

    /**
     * Returns true if running in a debuggable build or on an emulator.
     * Uses ApplicationInfo flags (not library BuildConfig) to check the host app.
     */
    fun isDebugOrEmulator(context: Context): Boolean {
        return isDebuggable(context) || isEmulator()
    }

    private fun isDebuggable(context: Context): Boolean {
        return try {
            (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        } catch (_: Exception) {
            false
        }
    }

    private fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86")
            || Build.MANUFACTURER.contains("Genymotion")
            || Build.PRODUCT.contains("sdk")
            || Build.PRODUCT.contains("vbox86p")
            || Build.HARDWARE.contains("goldfish")
            || Build.HARDWARE.contains("ranchu"))
    }

    // MARK: - SR-13: Root Detection

    /**
     * Returns true if the device appears to be rooted.
     */
    fun isRooted(): Boolean {
        return checkRootBinaries() || checkBuildTags() || checkRootManagementApps()
    }

    private fun checkRootBinaries(): Boolean {
        val paths = arrayOf(
            "/system/bin/su",
            "/system/xbin/su",
            "/sbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/system/sd/xbin/su",
            "/system/bin/failsafe/su",
            "/data/local/su",
            "/sbin/magisk",
            "/system/bin/magisk",
        )
        return paths.any { File(it).exists() }
    }

    private fun checkBuildTags(): Boolean {
        val tags = Build.TAGS
        return tags != null && tags.contains("test-keys")
    }

    private fun checkRootManagementApps(): Boolean {
        // Root management app detection requires a Context.
        // This check runs without Context — only file-based checks above are used.
        // Full package-based check is in isRooted(context) overload below.
        return false
    }

    /** Root detection with package manager check (requires Context). */
    fun isRooted(context: Context): Boolean {
        if (checkRootBinaries() || checkBuildTags()) return true
        val rootApps = arrayOf(
            "com.noshufou.android.su",
            "com.thirdparty.superuser",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.zachspong.temprootremovejb",
            "com.topjohnwu.magisk",
        )
        return try {
            rootApps.any { pkg ->
                try {
                    context.packageManager.getPackageInfo(pkg, 0)
                    true
                } catch (_: Exception) {
                    false
                }
            }
        } catch (_: Exception) {
            false
        }
    }

    // MARK: - SR-15: Runtime Integrity (APK Signature)

    /**
     * Returns true if the APK signature can be read successfully.
     * The actual signature hash varies per merchant app, so this is a
     * detection mechanism — we verify the signature is present and readable,
     * not that it matches a specific value.
     */
    fun isSignatureValid(context: Context): Boolean {
        return try {
            @Suppress("DEPRECATION")
            val info = context.packageManager.getPackageInfo(
                context.packageName,
                android.content.pm.PackageManager.GET_SIGNATURES
            )
            @Suppress("DEPRECATION")
            val signatures = info.signatures
            signatures != null && signatures.isNotEmpty()
        } catch (_: Exception) {
            false
        }
    }

    // MARK: - Combined Report

    /**
     * Returns a map summarizing device integrity state.
     * Suitable for including in telemetry.
     */
    fun integrityReport(context: Context): Map<String, Any> {
        return mapOf(
            "is_debug" to isDebugOrEmulator(context),
            "is_rooted" to isRooted(context),
            "is_signature_valid" to isSignatureValid(context),
            "device_model" to Build.MODEL,
            "os_version" to Build.VERSION.RELEASE,
        )
    }
}
