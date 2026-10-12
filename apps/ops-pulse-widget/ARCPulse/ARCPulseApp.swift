import SwiftUI
import AppKit

@main
struct ARCPulseApp: App {
  @NSApplicationDelegateAdaptor(PulseAppDelegate.self) private var appDelegate

  var body: some Scene {
    // No main window — this app only hosts the WidgetKit extension.
    // If macOS opens the host from a widget tap, we bounce to Ops Desk and quit.
    Settings {
      EmptyView()
    }
  }
}

final class PulseAppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    openOpsDeskAndQuit()
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    openOpsDeskAndQuit()
    return false
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    openOpsDeskAndQuit()
  }

  private func openOpsDeskAndQuit() {
    let deepLink = URL(string: "arctenders-ops://open")!
    if !NSWorkspace.shared.open(deepLink) {
      if let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "gr.tekia.arc.tenders.opsdesk") {
        NSWorkspace.shared.openApplication(at: appURL, configuration: NSWorkspace.OpenConfiguration())
      } else {
        NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications/ARC Tenders Ops.app"))
      }
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
      NSApp.terminate(nil)
    }
  }
}
