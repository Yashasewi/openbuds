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
  private let audio: OutputAudio
  private let card = ConnectCard()
  private let notifications = NotificationDelegate()
  private let launched = Date()
  private var cardPending = false
  private var alerted: [Part: Int] = [:]

  init(session: BudsSession, prefs: AppPrefs, audio: OutputAudio) {
    self.session = session
    self.prefs = prefs
    self.audio = audio
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
      if self.prefs.connectCard { self.card.show(self.session, audio: self.audio) }
    }
    track({ self.session.battery }) { battery in self.checkBattery(battery) }
  }

  func previewCard() {
    guard session.isConnected else { return }
    card.show(session, audio: audio)
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
  private var hovering = false

  func show(_ session: BudsSession, audio: OutputAudio) {
    hovering = false
    let host = NSHostingView(
      rootView: ConnectCardView(
        session: session,
        audio: audio,
        close: { [weak self] in self?.hide() },
        onHoverChange: { [weak self] inside in self?.setHovering(inside) }
      )
    )
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
    scheduleHide(after: 6)
  }

  private func setHovering(_ inside: Bool) {
    hovering = inside
    if inside {
      hideWork?.cancel()
      hideWork = nil
    } else if panel?.isVisible == true {
      scheduleHide(after: 3)
    }
  }

  private func scheduleHide(after seconds: Double) {
    hideWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      MainActor.assumeIsolated {
        guard let self, !self.hovering else { return }
        self.hide()
      }
    }
    hideWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  func hide() {
    hovering = false
    hideWork?.cancel()
    hideWork = nil
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
  let audio: OutputAudio
  let close: () -> Void
  let onHoverChange: (Bool) -> Void
  @State private var switchedAudio = false

  private enum PillGroup: CaseIterable {
    case anc, adaptive, transparency, off

    func offered(by modes: [NoiseMode]) -> Bool {
      switch self {
      case .anc: modes.contains { $0.isANC }
      default: modes.contains(mode)
      }
    }

    var mode: NoiseMode {
      switch self {
      case .anc: .anc
      case .adaptive: .adaptive
      case .transparency: .transparency
      case .off: .off
      }
    }

    var title: String {
      switch self {
      case .anc: "ANC"
      case .adaptive: "Adaptive"
      case .transparency: "Transp."
      case .off: "Off"
      }
    }

    var tint: Color? {
      switch self {
      case .anc: .indigo
      case .adaptive: .teal
      case .transparency: .accentColor
      case .off: nil
      }
    }
  }

  private var offeredGroups: [PillGroup] {
    PillGroup.allCases.filter { $0.offered(by: session.profile.noiseModes) }
  }

  private var currentGroup: PillGroup? {
    guard let mode = session.noise?.mode else { return nil }
    if mode.isANC { return .anc }
    return PillGroup.allCases.first { $0.mode == mode }
  }

  private var connectedName: String? {
    if case .connected(let name) = session.connection { name } else { nil }
  }

  var body: some View {
    VStack(spacing: 14) {
      HStack(spacing: 10) {
        VStack(alignment: .leading, spacing: 1) {
          Text(session.profile.isKnown ? session.profile.displayName : "OnePlus earbuds").font(.headline)
          Text(session.codec.flatMap { codecNames[$0] }.map { "Connected · \($0)" } ?? "Connected")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Button(action: close) {
          Image(systemName: "xmark")
        }
        .buttonStyle(CircleIconButtonStyle())
        .help("Close")
        .accessibilityLabel("Close")
      }

      BatteryRow(session: session)

      if !offeredGroups.isEmpty {
        HStack(spacing: 5) {
          ForEach(offeredGroups, id: \.self) { group in
            let selected = currentGroup == group
            Button {
              guard !selected else { return }
              Task { await session.setNoise(group.mode) }
            } label: {
              noisePill(for: group, selected: selected)
            }
            .buttonStyle(.plain)
            .disabled(session.busy)
            .accessibilityAddTraits(selected ? .isSelected : [])
          }
        }
      }

      if let buds = audio.buds(named: connectedName), audio.current != buds || switchedAudio {
        HStack(spacing: 8) {
          if audio.current == buds {
            Label("Playing on \(buds.name)", systemImage: "checkmark.circle.fill")
              .font(.caption)
              .foregroundStyle(.green)
              .lineLimit(1)
            Spacer(minLength: 4)
            Text("Default output")
              .font(.caption2)
              .foregroundStyle(.secondary)
          } else {
            Text("Audio on \(audio.current?.name ?? "another output")")
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
            Spacer(minLength: 4)
            Button("Use Buds") {
              switchedAudio = true
              audio.makeDefault(buds)
            }
            .buttonStyle(PanelButtonStyle(variant: .secondary))
          }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.fill.quaternary, in: .rect(cornerRadius: 12))
      }
    }
    .padding(16)
    .frame(width: Metrics.width)
    .glassEffect(.regular, in: .rect(cornerRadius: 26))
    .onHover(perform: onHoverChange)
    .padding(16)
  }

  @ViewBuilder
  private func noisePill(for group: PillGroup, selected: Bool) -> some View {
    let label = Text(group.title)
      .font(.caption2.weight(selected ? .semibold : .medium))
      .lineLimit(1)
      .minimumScaleFactor(0.85)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 5)
      .contentShape(.capsule)

    if selected, let tint = group.tint {
      label
        .foregroundStyle(.white)
        .background(tint.gradient, in: .capsule)
    } else if selected {
      label
        .foregroundStyle(.primary)
        .background(.fill.secondary, in: .capsule)
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.24), lineWidth: 1))
    } else {
      label
        .foregroundStyle(.secondary)
        .background(.fill.quaternary, in: .capsule)
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.12), lineWidth: 1))
    }
  }
}
