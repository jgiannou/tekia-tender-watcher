import AppIntents
import AppKit

struct OpenOpsDeskIntent: AppIntent {
  static var title: LocalizedStringResource = "Open ARC Tenders Ops"
  static var openAppWhenRun = false
  static var isDiscoverable = false

  @MainActor
  func perform() async throws -> some IntentResult {
    let deepLink = URL(string: "arctenders-ops://open")!
    if NSWorkspace.shared.open(deepLink) {
      return .result()
    }

    let bundleId = "gr.tekia.arc.tenders.opsdesk"
    if let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId) {
      let config = NSWorkspace.OpenConfiguration()
      config.activates = true
      _ = try? await NSWorkspace.shared.openApplication(at: appURL, configuration: config)
      return .result()
    }

    let fallback = URL(fileURLWithPath: "/Applications/ARC Tenders Ops.app")
    let config = NSWorkspace.OpenConfiguration()
    config.activates = true
    _ = try? await NSWorkspace.shared.openApplication(at: fallback, configuration: config)
    return .result()
  }
}
