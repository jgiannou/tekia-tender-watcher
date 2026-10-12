import Foundation

struct PulseSnapshot: Codable, Hashable {
  var generatedAt: TimeInterval
  var users: Int
  var organizations: Int
  var paying: Int
  var errors: Int
  var healthy: Bool
  var statusText: String

  var date: Date {
    generatedAt > 1_000_000_000 ? Date(timeIntervalSince1970: generatedAt) : Date()
  }

  static let sample = PulseSnapshot(
    generatedAt: Date().timeIntervalSince1970,
    users: 12,
    organizations: 8,
    paying: 3,
    errors: 0,
    healthy: true,
    statusText: "API + DB OK"
  )
}

enum PulseCache {
  private static let fileName = "pulse-cache.json"

  static var groupDir: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: OpsConfig.appGroupId)
  }

  private static var fileURL: URL? {
    groupDir?.appendingPathComponent(fileName)
  }

  private static var defaults: UserDefaults? {
    UserDefaults(suiteName: OpsConfig.appGroupId)
  }

  static func load() -> PulseSnapshot? {
    if let url = fileURL, let data = try? Data(contentsOf: url),
       let snap = try? JSONDecoder().decode(PulseSnapshot.self, from: data)
    {
      return snap
    }
    guard let defaults, defaults.object(forKey: "pulseUsers") != nil else { return nil }
    let generated = defaults.double(forKey: "pulseGeneratedAt")
    return PulseSnapshot(
      generatedAt: generated > 0 ? generated : Date().timeIntervalSince1970,
      users: defaults.integer(forKey: "pulseUsers"),
      organizations: defaults.integer(forKey: "pulseOrgs"),
      paying: defaults.integer(forKey: "pulsePaying"),
      errors: defaults.integer(forKey: "pulseErrors"),
      healthy: defaults.object(forKey: "pulseHealthy") as? Bool ?? defaults.bool(forKey: "pulseHealthy"),
      statusText: defaults.string(forKey: "pulseStatus") ?? "Cached"
    )
  }

  static func save(_ snapshot: PulseSnapshot) {
    guard let url = fileURL else { return }
    if let data = try? JSONEncoder().encode(snapshot) {
      try? data.write(to: url, options: [.atomic])
    }
    defaults?.set(snapshot.users, forKey: "pulseUsers")
    defaults?.set(snapshot.organizations, forKey: "pulseOrgs")
    defaults?.set(snapshot.paying, forKey: "pulsePaying")
    defaults?.set(snapshot.errors, forKey: "pulseErrors")
    defaults?.set(snapshot.healthy, forKey: "pulseHealthy")
    defaults?.set(snapshot.statusText, forKey: "pulseStatus")
    defaults?.set(snapshot.generatedAt, forKey: "pulseGeneratedAt")
  }

  static func writeDebug(_ line: String) {
    let dirs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    guard let docs = dirs.first else { return }
    let url = docs.appendingPathComponent("pulse-debug.txt")
    let text = "\(ISO8601DateFormatter().string(from: Date())) \(line)\n"
    if let existing = try? String(contentsOf: url, encoding: .utf8) {
      try? (existing + text).write(to: url, atomically: true, encoding: .utf8)
    } else {
      try? text.write(to: url, atomically: true, encoding: .utf8)
    }
    if let group = groupDir {
      try? text.write(to: group.appendingPathComponent("widget-ran.txt"), atomically: true, encoding: .utf8)
    }
  }
}
