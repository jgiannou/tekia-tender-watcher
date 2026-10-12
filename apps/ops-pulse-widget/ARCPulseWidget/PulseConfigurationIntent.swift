import AppIntents
import WidgetKit

struct PulseConfigurationIntent: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "ARC Tenders Pulse"
  static var description = IntentDescription("Prod pulse from ADMIN_TOKEN (bundled or Edit Widget).")

  @Parameter(
    title: "API base URL",
    default: "http://gfjv662rudc5mhwwyvj2zcvh.169.58.65.199.sslip.io"
  )
  var apiUrl: String

  @Parameter(title: "ADMIN_TOKEN (optional override)")
  var adminToken: String?

  static var parameterSummary: some ParameterSummary {
    Summary("ARC Pulse") {
      \.$apiUrl
      \.$adminToken
    }
  }

  func resolved() -> (apiUrl: String, token: String) {
    let intentUrl = apiUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    let intentToken = (adminToken ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let bundled = OpsConfig.loadBundled()
    let stored = OpsConfig.loadStored()

    let url =
      !intentUrl.isEmpty ? intentUrl
      : (bundled?.apiUrl.isEmpty == false ? bundled!.apiUrl
        : (stored?.apiUrl.isEmpty == false ? stored!.apiUrl : OpsConfig.defaultApiUrl))

    let token =
      !intentToken.isEmpty ? intentToken
      : (bundled?.adminToken ?? stored?.adminToken ?? "")

    return (url, token)
  }
}
