import Foundation

enum OpsConfig {
  /// Personal Team requires `group.<TEAM_ID>.…` — free Apple IDs reject custom group.* names for extensions.
  static let appGroupId = "group.37ZNXDS49B.arc.tenders.pulse"
  static let defaultApiUrl = "http://gfjv662rudc5mhwwyvj2zcvh.169.58.65.199.sslip.io"

  private static let apiUrlKey = "apiUrl"
  private static let tokenKey = "adminToken"
  private static let fileName = "pulse-config.json"
  private static let legacyGroupId = "group.gr.tekia.arc.tenders.pulse"

  struct Stored: Codable, Equatable {
    var apiUrl: String
    var adminToken: String
  }

  /// Credentials baked into the appex at build time (sandbox-readable).
  static func loadBundled() -> Stored? {
    let bundles = [Bundle.main, Bundle(for: BundleToken.self)].compactMap { $0 }
    for bundle in bundles {
      guard let url = bundle.url(forResource: "Secrets.generated", withExtension: "json")
              ?? bundle.url(forResource: "Secrets", withExtension: "json")
      else { continue }
      guard let data = try? Data(contentsOf: url),
            let stored = try? JSONDecoder().decode(Stored.self, from: data),
            !stored.adminToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      else { continue }
      return stored
    }
    return nil
  }

  static var containerURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
  }

  private static var configFileURL: URL? {
    containerURL?.appendingPathComponent(fileName)
  }

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  private final class BundleToken {}

  static func loadStored() -> Stored? {
    if let bundled = loadBundled() {
      return bundled
    }

    if let defaults {
      defaults.synchronize()
      let url = defaults.string(forKey: apiUrlKey) ?? ""
      let token = defaults.string(forKey: tokenKey) ?? ""
      if !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return Stored(apiUrl: url.isEmpty ? defaultApiUrl : url, adminToken: token)
      }
    }

    if let url = configFileURL,
       let data = try? Data(contentsOf: url),
       let stored = try? JSONDecoder().decode(Stored.self, from: data),
       !stored.adminToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      persist(stored) // normalize so UserDefaults + widget agree
      return stored
    }

    // Direct plist read (Ops Desk / `defaults write` often visible here when suite API is empty).
    if let fromPlist = loadFromGroupPlist(),
       !fromPlist.adminToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      persist(fromPlist)
      return fromPlist
    }

    if let legacy = loadLegacyGroup(),
       !legacy.adminToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      persist(legacy)
      return legacy
    }

    return nil
  }

  private static func loadFromGroupPlist() -> Stored? {
    guard let dir = containerURL else { return nil }
    let plist = dir
      .appendingPathComponent("Library/Preferences")
      .appendingPathComponent("\(appGroupId).plist")
    guard let dict = NSDictionary(contentsOf: plist) as? [String: Any] else { return nil }
    let url = (dict[apiUrlKey] as? String) ?? ""
    let token = (dict[tokenKey] as? String) ?? ""
    guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return Stored(apiUrl: url.isEmpty ? defaultApiUrl : url, adminToken: token)
  }

  private static func loadLegacyGroup() -> Stored? {
    if let url = FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: legacyGroupId)?
      .appendingPathComponent(fileName),
       let data = try? Data(contentsOf: url),
       let stored = try? JSONDecoder().decode(Stored.self, from: data)
    {
      return stored
    }
    if let legacyDefaults = UserDefaults(suiteName: legacyGroupId) {
      let url = legacyDefaults.string(forKey: apiUrlKey) ?? ""
      let token = legacyDefaults.string(forKey: tokenKey) ?? ""
      if !token.isEmpty { return Stored(apiUrl: url, adminToken: token) }
    }
    // Absolute path fallback for migration (host process).
    let home = FileManager.default.homeDirectoryForCurrentUser
    let plist = home
      .appendingPathComponent("Library/Group Containers")
      .appendingPathComponent(legacyGroupId)
      .appendingPathComponent("Library/Preferences/\(legacyGroupId).plist")
    if let dict = NSDictionary(contentsOf: plist) as? [String: Any] {
      let url = dict[apiUrlKey] as? String ?? ""
      let token = dict[tokenKey] as? String ?? ""
      if !token.isEmpty { return Stored(apiUrl: url, adminToken: token) }
    }
    let json = home
      .appendingPathComponent("Library/Group Containers")
      .appendingPathComponent(legacyGroupId)
      .appendingPathComponent(fileName)
    if let data = try? Data(contentsOf: json),
       let stored = try? JSONDecoder().decode(Stored.self, from: data),
       !stored.adminToken.isEmpty
    {
      return stored
    }
    return nil
  }

  static func persist(_ stored: Stored) {
    let trimmed = Stored(
      apiUrl: stored.apiUrl.trimmingCharacters(in: .whitespacesAndNewlines),
      adminToken: stored.adminToken.trimmingCharacters(in: .whitespacesAndNewlines)
    )

    if let defaults {
      defaults.set(trimmed.apiUrl, forKey: apiUrlKey)
      defaults.set(trimmed.adminToken, forKey: tokenKey)
      defaults.synchronize()
    }

    if let url = configFileURL, let data = try? JSONEncoder().encode(trimmed) {
      try? FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try? data.write(to: url, options: [.atomic])
    }
  }

  static var apiUrl: String {
    get {
      let value = loadStored()?.apiUrl.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      return value.isEmpty ? defaultApiUrl : value
    }
    set {
      var stored = loadStored() ?? Stored(apiUrl: defaultApiUrl, adminToken: "")
      stored.apiUrl = newValue
      persist(stored)
    }
  }

  static var token: String {
    get { loadStored()?.adminToken.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    set {
      var stored = loadStored() ?? Stored(apiUrl: defaultApiUrl, adminToken: "")
      stored.adminToken = newValue
      persist(stored)
    }
  }

  static var hasToken: Bool { !token.isEmpty }

  static func save(apiUrl: String, token: String) {
    persist(Stored(apiUrl: apiUrl, adminToken: token))
  }

  /// Diagnostic string for settings UI / widget status.
  static var shareDiagnostics: String {
    let container = containerURL?.path ?? "nil"
    let fileOk = (configFileURL.flatMap { try? Data(contentsOf: $0) } != nil)
    let defaultsOk = !(defaults?.string(forKey: tokenKey) ?? "").isEmpty
    return "group=\(container != "nil" ? "ok" : "missing") defaults=\(defaultsOk ? "ok" : "no") file=\(fileOk ? "ok" : "no")"
  }
}
