import AppKit
import BudsKit
import Observation
import ServiceManagement
import SwiftUI
import UserNotifications

/// App preferences that live on the Mac rather than the earbuds.
@MainActor
@Observable
final class AppPrefs {
  private(set) var openAtLogin = SMAppService.mainApp.status == .enabled
  private(set) var loginError: String?
  var batteryAlerts = UserDefaults.standard.object(forKey: "batteryAlerts") as? Bool ?? true {
    didSet { UserDefaults.standard.set(batteryAlerts, forKey: "batteryAlerts") }
  }
  var connectCard = UserDefaults.standard.object(forKey: "connectCard") as? Bool ?? true {
    didSet { UserDefaults.standard.set(connectCard, forKey: "connectCard") }
  }

  func setOpenAtLogin(_ on: Bool) {
    loginError = nil
    do {
      if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
    } catch {
      loginError = error.localizedDescription
    }
    openAtLogin = SMAppService.mainApp.status == .enabled
  }
}

/// Re-runs `changed` every time `value` changes, for as long as the app runs.
@MainActor
func track<T: Equatable>(_ value: @escaping @MainActor () -> T, _ changed: @escaping @MainActor (T) -> Void) {
  withObservationTracking { _ = value() } onChange: {
    Task { @MainActor in
      changed(value())
      track(value, changed)
    }
  }
}

/// Things that happen outside the panel: the connect card and low-battery notifications.
@MainActor
final class Companion {
  private let session: BudsSession
  private let prefs: AppPrefs
  private let card = ConnectCard()
  private let notifications = NotificationDelegate()
  private let launched = Date()
  private var cardPending = false
  private var alerted: [Part: Int] = [:]

  init(session: BudsSession, prefs: AppPrefs) {
    self.session = session
    self.prefs = prefs
  }

  func start() {
    UNUserNotificationCenter.current().delegate = notifications
    track({ self.session.isConnected }) { connected in
      // Skip the card for a connection that was already up when the app launched.
      self.cardPending = connected && Date().timeIntervalSince(self.launched) > 5
      if !connected { self.card.hide() }
    }
    track({ self.session.updatedAt }) { _ in
      guard self.cardPending else { return }
      self.cardPending = false
      if self.prefs.connectCard { self.card.show(self.session) }
    }
    track({ self.session.battery }) { battery in self.checkBattery(battery) }
  }

  private func checkBattery(_ battery: [Part: BatteryLevel]) {
    guard session.isConnected, prefs.batteryAlerts else { return }
    var low: [String] = []
    for part in [Part.left, .right] {
      guard let level = battery[part], let percent = level.percent else { continue }
      if level.charging || percent > 25 {
        alerted[part] = nil
        continue
      }
      guard let threshold = [10, 20].first(where: { percent <= $0 }), threshold < alerted[part] ?? 101 else { continue }
      alerted[part] = threshold
      low.append("\(part.label) \(percent)%")
    }
    guard !low.isEmpty else { return }
    let center = UNUserNotificationCenter.current()
    let content = UNMutableNotificationContent()
    content.title = "OnePlus Buds battery low"
    content.body = low.joined(separator: ", ") + ". Put them in the case to charge."
    let request = UNNotificationRequest(identifier: "battery", content: content, trigger: nil)
    Task {
      guard (try? await center.requestAuthorization(options: [.alert, .sound])) == true else { return }
      try? await center.add(request)
    }
  }
}

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate, Sendable {
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification)
    async -> UNNotificationPresentationOptions
  {
    [.banner, .sound]
  }
}

// MARK: Connect card

/// A floating card under the menu bar when the earbuds connect, like AirPods'.
@MainActor
final class ConnectCard {
  private var panel: NSPanel?
  private var hideWork: DispatchWorkItem?

  func show(_ session: BudsSession) {
    let host = NSHostingView(rootView: ConnectCardView(session: session) { [weak self] in self?.hide() })
    let size = host.fittingSize
    let panel = self.panel ?? makePanel()
    self.panel = panel
    panel.contentView = host
    if let screen = NSScreen.main {
      let area = screen.visibleFrame
      panel.setFrame(NSRect(x: area.maxX - size.width - 12, y: area.maxY - size.height - 12, width: size.width, height: size.height), display: true)
    }
    panel.alphaValue = 0
    panel.orderFrontRegardless()
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.25
      panel.animator().alphaValue = 1
    }
    hideWork?.cancel()
    let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.hide() } }
    hideWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 6, execute: work)
  }

  func hide() {
    hideWork?.cancel()
    guard let panel, panel.isVisible else { return }
    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.3
      panel.animator().alphaValue = 0
    } completionHandler: {
      Task { @MainActor in panel.orderOut(nil) }
    }
  }

  private func makePanel() -> NSPanel {
    let panel = NSPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
    panel.isOpaque = false
    panel.backgroundColor = .clear
    panel.hasShadow = false
    panel.level = .statusBar
    panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
    panel.isReleasedWhenClosed = false
    return panel
  }
}

struct ConnectCardView: View {
  let session: BudsSession
  let close: () -> Void

  var body: some View {
    VStack(spacing: 16) {
      HStack(spacing: 10) {
        VStack(alignment: .leading, spacing: 1) {
          Text("OnePlus Buds 4").font(.headline)
          Text("Connected").font(.callout).foregroundStyle(.secondary)
        }
        Spacer()
        Button("Close", systemImage: "xmark", action: close)
          .labelStyle(.iconOnly)
          .buttonStyle(.glass)
          .buttonBorderShape(.circle)
          .controlSize(.small)
      }
      BatteryRow(session: session)
    }
    .padding(18)
    .frame(width: 310)
    .glassEffect(.regular, in: .rect(cornerRadius: 26))
    .padding(16)
    .onTapGesture(perform: close)
  }
}
