import Foundation

enum OpsAPIError: LocalizedError {
  case notConfigured
  case badUrl
  case http(Int, String)
  case decode

  var errorDescription: String? {
    switch self {
    case .notConfigured: return "Save token in Ops Desk once"
    case .badUrl: return "Invalid API URL"
    case .http(let code, let body): return "HTTP \(code) \(body)"
    case .decode: return "Bad API JSON"
    }
  }
}

private struct OpsAPIEnvelope<Inner: Decodable>: Decodable {
  let data: Inner
}

struct OpsStatsResponse: Decodable {
  let users: Int?
  let organizations: Int?
  let payingOrgs: Int?
  let payingUsers: Int?
  let logs: Logs?
  struct Logs: Decodable { let errorsInBuffer: Int? }
}

enum OpsAPI {
  static func fetchPulse(apiUrl: String, token: String) async throws -> PulseSnapshot {
    let trimmedUrl = apiUrl.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedToken = token.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedUrl.isEmpty, !trimmedToken.isEmpty else { throw OpsAPIError.notConfigured }

    let stats: OpsStatsResponse = try await get(path: "/admin/ops/stats", apiUrl: trimmedUrl, token: trimmedToken)
    let paying = stats.payingOrgs ?? stats.payingUsers ?? 0
    let errors = stats.logs?.errorsInBuffer ?? 0
    let snap = PulseSnapshot(
      generatedAt: Date().timeIntervalSince1970,
      users: stats.users ?? 0,
      organizations: stats.organizations ?? 0,
      paying: paying,
      errors: errors,
      healthy: true,
      statusText: errors > 0 ? "API OK · \(errors) err" : "API + DB OK"
    )
    PulseCache.save(snap)
    return snap
  }

  private static func get<T: Decodable>(path: String, apiUrl: String, token: String) async throws -> T {
    guard var components = URLComponents(string: apiUrl) else { throw OpsAPIError.badUrl }
    let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let cleanPath = path.hasPrefix("/") ? path : "/\(path)"
    components.path = basePath.isEmpty ? cleanPath : "/\(basePath)\(cleanPath)"
    guard let url = components.url else { throw OpsAPIError.badUrl }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue(token, forHTTPHeaderField: "X-Admin-Token")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.timeoutInterval = 20

    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 20
    config.allowsExpensiveNetworkAccess = true
    config.allowsConstrainedNetworkAccess = true
    let (data, response) = try await URLSession(configuration: config).data(for: request)
    let code = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard (200..<300).contains(code) else {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw OpsAPIError.http(code, String(body.prefix(120)))
    }
    if let env = try? JSONDecoder().decode(OpsAPIEnvelope<T>.self, from: data) {
      return env.data
    }
    do {
      return try JSONDecoder().decode(T.self, from: data)
    } catch {
      throw OpsAPIError.decode
    }
  }
}
