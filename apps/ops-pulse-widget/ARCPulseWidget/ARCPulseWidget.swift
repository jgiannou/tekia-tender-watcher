import WidgetKit
import SwiftUI
import AppIntents

struct PulseEntry: TimelineEntry {
  let date: Date
  let snapshot: PulseSnapshot
}

struct PulseProvider: AppIntentTimelineProvider {
  typealias Intent = PulseConfigurationIntent

  func placeholder(in context: Context) -> PulseEntry {
    PulseEntry(date: .now, snapshot: .sample)
  }

  func snapshot(for configuration: PulseConfigurationIntent, in context: Context) async -> PulseEntry {
    if context.isPreview { return PulseEntry(date: .now, snapshot: .sample) }
    return await loadEntry(configuration: configuration, network: true)
  }

  func timeline(for configuration: PulseConfigurationIntent, in context: Context) async -> Timeline<PulseEntry> {
    let entry = await loadEntry(configuration: configuration, network: true)
    return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60)))
  }

  private func loadEntry(configuration: PulseConfigurationIntent, network: Bool) async -> PulseEntry {
    let creds = configuration.resolved()
    PulseCache.writeDebug("intent tokenLen=\(creds.token.count) url=\(creds.apiUrl)")

    if network, !creds.token.isEmpty {
      do {
        let snap = try await OpsAPI.fetchPulse(apiUrl: creds.apiUrl, token: creds.token)
        OpsConfig.save(apiUrl: creds.apiUrl, token: creds.token)
        PulseCache.writeDebug("fetch-ok users=\(snap.users)")
        return PulseEntry(date: snap.date, snapshot: snap)
      } catch {
        PulseCache.writeDebug("fetch-fail \(error.localizedDescription)")
        return PulseEntry(
          date: .now,
          snapshot: PulseSnapshot(
            generatedAt: Date().timeIntervalSince1970,
            users: 0, organizations: 0, paying: 0, errors: 0,
            healthy: false,
            statusText: error.localizedDescription
          )
        )
      }
    }

    return PulseEntry(
      date: .now,
      snapshot: PulseSnapshot(
        generatedAt: Date().timeIntervalSince1970,
        users: 0, organizations: 0, paying: 0, errors: 0,
        healthy: false,
        statusText: "Rebuild widget (missing token)"
      )
    )
  }
}

struct ARCPulseWidget: Widget {
  let kind = "ARCPulseWidget"

  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: kind, intent: PulseConfigurationIntent.self, provider: PulseProvider()) { entry in
      PulseWidgetView(entry: entry)
        .containerBackground(for: .widget) {
          Color(red: 0.04, green: 0.06, blue: 0.07)
        }
    }
    .configurationDisplayName("ARC Tenders Pulse")
    .description("Prod pulse — tap opens Ops Desk, ↻ refreshes.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct PulseWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: PulseEntry

  private let accent = Color(red: 0, green: 0.953, blue: 1)
  private let muted = Color(red: 0.65, green: 0.78, blue: 0.82)
  private let ok = Color(red: 0.3, green: 0.92, blue: 0.75)
  private let bad = Color(red: 1, green: 0.35, blue: 0.48)

  var body: some View {
    // Header row: title (opens Ops) | time | refresh — no ZStack overlap.
    VStack(alignment: .leading, spacing: family == .systemSmall ? 6 : 10) {
      HStack(spacing: 8) {
        Button(intent: OpenOpsDeskIntent()) {
          HStack(spacing: 6) {
            Circle().fill(healthColor).frame(width: 8, height: 8)
            Text(family == .systemSmall ? "PULSE" : "ARC TENDERS PULSE")
              .font(.system(size: family == .systemSmall ? 11 : 11, weight: .bold, design: .monospaced))
              .foregroundStyle(accent)
              .lineLimit(1)
              .minimumScaleFactor(0.75)
            Text(entry.snapshot.healthy ? "LIVE" : "DOWN")
              .font(.system(size: 10, weight: .bold, design: .monospaced))
              .foregroundStyle(healthColor)
          }
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open ARC Tenders Ops")

        Spacer(minLength: 4)

        if family != .systemSmall {
          Text(entry.date, format: .dateTime.hour().minute())
            .font(.system(size: 10, weight: .semibold, design: .monospaced))
            .foregroundStyle(muted)
            .layoutPriority(1)
        }
        refreshButton
      }

      Button(intent: OpenOpsDeskIntent()) {
        Group {
          if family == .systemSmall { smallBody } else { mediumBody }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("Open ARC Tenders Ops")
    }
    .padding(10)
  }

  private var healthColor: Color { entry.snapshot.healthy ? ok : bad }

  private var refreshButton: some View {
    Button(intent: RefreshPulseIntent()) {
      Image(systemName: "arrow.triangle.2.circlepath")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(.black)
        .frame(width: 26, height: 26)
        .background(accent, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Refresh")
  }

  private var smallBody: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("\(entry.snapshot.users)")
        .font(.system(size: 36, weight: .bold, design: .rounded))
        .foregroundStyle(.white)
      Text(entry.snapshot.healthy ? "LIVE · \(entry.snapshot.statusText)" : "DOWN · \(entry.snapshot.statusText)")
        .font(.system(size: 10, weight: .semibold, design: .monospaced))
        .foregroundStyle(muted)
        .lineLimit(2)
    }
  }

  private var mediumBody: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        metric("USERS", entry.snapshot.users, accent)
        metric("ORGS", entry.snapshot.organizations, Color(red: 0.5, green: 0.92, blue: 1))
        metric("PAYING", entry.snapshot.paying, ok)
        metric("ERRORS", entry.snapshot.errors, entry.snapshot.errors > 0 ? bad : muted)
      }
      Text(entry.snapshot.statusText)
        .font(.system(size: 10, weight: .medium, design: .monospaced))
        .foregroundStyle(muted)
        .lineLimit(1)
    }
  }

  private func metric(_ label: String, _ value: Int, _ tint: Color) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label).font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(muted)
      Text("\(value)").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(.white)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(8)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(tint.opacity(0.55), lineWidth: 1)
        .background(RoundedRectangle(cornerRadius: 10).fill(Color.white.opacity(0.06)))
    )
  }
}
