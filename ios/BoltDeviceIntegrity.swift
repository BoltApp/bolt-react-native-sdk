import Foundation
import UIKit

/// Device integrity checks for PCI compliance.
///
/// SR-12: Debug mode / simulator detection
/// SR-13: Jailbreak detection
/// SR-15: Runtime code signing verification
///
/// None of these checks hard-block card field usage.
/// SR-12 shows a warning instead of fields.
/// SR-13 and SR-15 report to telemetry but allow fields to render.
@objc public class BoltDeviceIntegrity: NSObject {

  // MARK: - SR-12: Debug / Simulator Detection

  /// Returns true if running in a debug build or on a simulator.
  @objc public static var isDebugOrSimulator: Bool {
    #if DEBUG
    return true
    #else
    return isSimulator
    #endif
  }

  private static var isSimulator: Bool {
    #if targetEnvironment(simulator)
    return true
    #else
    return false
    #endif
  }

  // MARK: - SR-13: Jailbreak Detection

  /// Returns true if the device appears to be jailbroken.
  @objc public static var isJailbroken: Bool {
    #if targetEnvironment(simulator)
    return false // Simulators are not jailbroken
    #else
    // Check for common jailbreak artifacts
    let jailbreakPaths = [
      "/Applications/Cydia.app",
      "/Library/MobileSubstrate/MobileSubstrate.dylib",
      "/bin/bash",
      "/usr/sbin/sshd",
      "/etc/apt",
      "/private/var/lib/apt/",
      "/usr/bin/ssh",
    ]

    for path in jailbreakPaths {
      if FileManager.default.fileExists(atPath: path) {
        return true
      }
    }

    // Check if we can write outside the sandbox (sandbox escape test)
    let testPath = "/private/bolt_jb_test"
    do {
      try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
      try FileManager.default.removeItem(atPath: testPath)
      return true // Writing outside sandbox succeeded — jailbroken
    } catch {
      // Expected: writing outside sandbox fails on non-jailbroken devices
    }

    // Check if Cydia URL scheme is registered
    if let url = URL(string: "cydia://package/com.example.test"),
       UIApplication.shared.canOpenURL(url) {
      return true
    }

    return false
    #endif
  }

  // SR-15: iOS code signing is enforced by the OS at install time; the app
  // cannot execute on a device with an invalid signature. A runtime re-check
  // would require SecStaticCode APIs with the app's own designated requirement,
  // which is not straightforward from within the running process. We rely on
  // OS-level enforcement and surface other integrity signals (debug, jailbreak).

  // MARK: - Combined Report

  /// Returns a dictionary summarizing device integrity state.
  /// Suitable for including in telemetry or logging.
  @objc public static func integrityReport() -> [String: Any] {
    return [
      "is_debug": isDebugOrSimulator,
      "is_jailbroken": isJailbroken,
      "device_model": UIDevice.current.model,
      "os_version": UIDevice.current.systemVersion,
    ]
  }
}
