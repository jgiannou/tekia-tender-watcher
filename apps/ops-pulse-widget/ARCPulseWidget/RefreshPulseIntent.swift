import AppIntents
import WidgetKit

struct RefreshPulseIntent: AppIntent {
  static var title: LocalizedStringResource = "Refresh ARC Pulse"
  static var openAppWhenRun = false
  static var isDiscoverable = false

  func perform() async throws -> some IntentResult {
    // Timeline reload re-runs provider with the widget's configured token.
    WidgetCenter.shared.reloadTimelines(ofKind: "ARCPulseWidget")
    return .result()
  }
}
