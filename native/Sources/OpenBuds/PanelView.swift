import AppKit
import BudsKit
import Observation
import SwiftUI

/// Which page the panel shows, plus the preset being edited (it crosses pages).
@MainActor
@Observable
final class PanelModel {
  enum Page: Hashable { case home, sound, controls, features, tools, preset, hearing, about }

  private(set) var page: Page = .home
  private(set) var forward = true
  private var history: [Page] = []
  var editing: Preset?
  var editingIsNew = false
  var ringing = false
  let updates = UpdateChecker()

  func open(_ next: Page) {
    guard next != page else { return }
    history.append(page)
    forward = true
    withAnimation(.snappy(duration: 0.18)) { page = next }
  }

  func back() {
    let previous = history.popLast() ?? .home
    forward = false
    withAnimation(.snappy(duration: 0.18)) { page = previous }
  }

  func home() {
    history.removeAll()
    forward = false
    page = .home
  }
}

enum Metrics {
  static let width: CGFloat = 320
  static let padding: CGFloat = 10
  static let section: CGFloat = 14
  static let maxScroll: CGFloat = 560
}

/// Unified capsule button style used across every page, card, and banner in OpenBuds.
struct PanelButtonStyle: ButtonStyle {
  enum Variant {
    case prominent(Color = .accentColor)
    case secondary
    case tinted(Color = .accentColor)
    case destructive
  }

  enum Size {
    case regular
    case mini
  }

  let variant: Variant
  var size: Size = .regular
  var fullWidth: Bool = false
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    PanelButtonBody(
      configuration: configuration,
      variant: variant,
      size: size,
      fullWidth: fullWidth,
      isEnabled: isEnabled
    )
  }
}

private struct PanelButtonBody: View {
  let configuration: ButtonStyle.Configuration
  let variant: PanelButtonStyle.Variant
  let size: PanelButtonStyle.Size
  let fullWidth: Bool
  let isEnabled: Bool
  @State private var hovering = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    configuration.label
      .font(size == .mini ? .caption2.weight(.semibold) : .caption.weight(.semibold))
      .lineLimit(1)
      .frame(maxWidth: fullWidth ? .infinity : nil)
      .padding(.horizontal, size == .mini ? 8 : 12)
      .padding(.vertical, size == .mini ? 4 : 7)
      .foregroundStyle(foregroundColor)
      .background(backgroundStyle, in: Capsule(style: .circular))
      .overlay(Capsule(style: .circular).strokeBorder(borderColor, lineWidth: 1))
      .contentShape(Capsule(style: .circular))
      .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.45)
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
      .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: hovering)
      .animation(reduceMotion ? nil : .easeOut(duration: 0.08), value: configuration.isPressed)
      .onHover { hovering = $0 }
  }

  private var foregroundColor: Color {
    switch variant {
    case .prominent: .white
    case .secondary: .primary
    case .tinted(let tint): tint
    case .destructive: .red
    }
  }

  private var backgroundStyle: AnyShapeStyle {
    switch variant {
    case .prominent(let tint):
      AnyShapeStyle(tint.opacity(hovering && isEnabled ? 0.9 : 1).gradient)
    case .secondary:
      AnyShapeStyle(hovering && isEnabled ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.fill.tertiary))
    case .tinted(let tint):
      AnyShapeStyle(tint.opacity(hovering && isEnabled ? 0.22 : 0.14))
    case .destructive:
      AnyShapeStyle(Color.red.opacity(hovering && isEnabled ? 0.22 : 0.14))
    }
  }

  private var borderColor: Color {
    switch variant {
    case .prominent: .clear
    case .secondary: Color.primary.opacity(hovering && isEnabled ? 0.22 : 0.14)
    case .tinted(let tint): tint.opacity(hovering && isEnabled ? 0.45 : 0.32)
    case .destructive: Color.red.opacity(hovering && isEnabled ? 0.48 : 0.34)
    }
  }
}

/// Unified 24×24 circular icon button (Header Disconnect/Quit, SubPage Back, ConnectCard Close).
struct CircleIconButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    CircleIconButtonBody(configuration: configuration, isEnabled: isEnabled)
  }
}

private struct CircleIconButtonBody: View {
  let configuration: ButtonStyle.Configuration
  let isEnabled: Bool
  @State private var hovering = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    configuration.label
      .font(.system(size: 11, weight: .semibold))
      .foregroundStyle(hovering && isEnabled ? .primary : .secondary)
      .frame(width: 24, height: 24)
      .background(hovering && isEnabled ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.fill.tertiary), in: .circle)
      .overlay(Circle().strokeBorder(Color.primary.opacity(hovering && isEnabled ? 0.22 : 0.12), lineWidth: 1))
      .contentShape(.circle)
      .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.45)
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.94 : 1)
      .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: hovering)
      .onHover { hovering = $0 }
  }
}

struct PanelView: View {
  let session: BudsSession
  let audio: OutputAudio
  let prefs: AppPrefs
  var showConnectCard: () -> Void = {}
  @State private var model = PanelModel()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var displayedPage: PanelModel.Page {
    if model.page == .about { return .about }
    return session.isConnected ? model.page : .home
  }

  var body: some View {
    ZStack(alignment: .top) {
      page
        .id(displayedPage)
        .transition(reduceMotion ? .opacity : .push(from: model.forward ? .trailing : .leading))
    }
    .frame(width: Metrics.width)
    .font(.callout)
    .clipped()
    .onChange(of: session.isConnected) { _, connected in
      if !connected {
        model.ringing = false
        if model.page != .about { model.home() }
      }
    }
  }

  @ViewBuilder private var page: some View {
    switch displayedPage {
    case .home: HomePage(session: session, model: model, audio: audio)
    case .sound: SoundPage(session: session, model: model)
    case .controls: ControlsPage(session: session, model: model)
    case .features: FeaturesPage(session: session, model: model, prefs: prefs, showConnectCard: showConnectCard)
    case .tools: ToolsPage(session: session, model: model)
    case .preset: PresetPage(session: session, model: model)
    case .hearing: HearingPage(session: session, model: model)
    case .about: AboutPage(session: session, model: model)
    }
  }
}

// MARK: Home

struct HomePage: View {
  let session: BudsSession
  let model: PanelModel
  let audio: OutputAudio
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      header.padding(.leading, 6).padding(.top, 2)
      if session.isConnected, model.ringing {
        ringingBanner
      }
      switch session.connection {
      case .connected where session.unsupported != nil:
        UnsupportedCard(info: session.unsupported!)
      case .connected:
        PanelSection { BatteryRow(session: session).padding(.vertical, 10) }
        PanelSection { NoiseControl(session: session).padding(.vertical, 9) }
        VolumeSection(session: session, audio: audio)
        let hasTools = [0x0400, 0x0405, 0x040D].contains(where: { session.supports($0) })
        Grid(horizontalSpacing: 8, verticalSpacing: 8) {
          GridRow {
            NavTile(icon: "slider.vertical.3", color: .pink, title: "Sound", value: presetName ?? "Equalizer") { model.open(.sound) }
            NavTile(icon: "hand.tap.fill", color: .blue, title: "Controls", value: "Taps and holds") { model.open(.controls) }
          }
          GridRow {
            NavTile(icon: "switch.2", color: .green, title: "Features", value: featureSummary) { model.open(.features) }
              .gridCellColumns(hasTools ? 1 : 2)
            if hasTools {
              NavTile(icon: "wrench.and.screwdriver.fill", color: .orange, title: "Tools", value: "Find and fit") { model.open(.tools) }
            }
          }
        }
      case .connecting(let name):
        connectingView(title: "Linking \(name)", detail: "Opening the local control channel. Open the case lid or take one bud out.")
      case .searching:
        connectingView(title: "Looking for earbuds", detail: "Checking paired Bluetooth devices on this Mac.")
      case .unavailable(let message):
        unavailableView(message: message)
      }
      if let error = session.lastError, session.isConnected {
        HStack(alignment: .top, spacing: 6) {
          Label(error, systemImage: "exclamationmark.triangle.fill")
            .font(.caption)
            .foregroundStyle(.orange)
            .fixedSize(horizontal: false, vertical: true)
          Spacer(minLength: 4)
          Button("Dismiss", systemImage: "xmark") { session.clearError() }
            .labelStyle(.iconOnly)
            .buttonStyle(.plain)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
            .help("Dismiss error")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.orange.opacity(0.12), in: .rect(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(Color.orange.opacity(0.28), lineWidth: 1))
      }
      AboutFooter(connected: session.isConnected, hasUpdate: hasUpdate) { model.open(.about) }
    }
    .padding(Metrics.padding)
    .background(alignment: .top) {
      RadialGradient(
        colors: [atmosphereTint.opacity(atmosphereStrength), atmosphereTint.opacity(atmosphereStrength * 0.28), .clear],
        center: .top,
        startRadius: 10,
        endRadius: 190
      )
      .frame(height: 190)
      .allowsHitTesting(false)
      .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: atmosphereTint)
    }
  }

  @ViewBuilder
  private func connectingView(title: String, detail: String) -> some View {
    if let last = session.lastKnown, last.hasBattery {
      LastBatterySection(snapshot: last)
    }
    StandbyModule(
      icon: "antenna.radiowaves.left.and.right",
      color: .accentColor,
      title: title,
      detail: detail,
      busy: true,
      step: session.connectionStep.rawValue
    )
  }

  @ViewBuilder
  private func unavailableView(message: String) -> some View {
    switch session.connectionIssue {
    case .bluetoothUnauthorized:
      StandbyModule(
        icon: "lock.fill",
        color: .orange,
        title: "Bluetooth access needed",
        detail: "macOS blocks Bluetooth accessory access until allowed. Everything runs 100% locally on your Mac."
      )
      PanelSection(title: "How to allow") {
        SetupStepRow(step: .number(1), title: "Open Privacy & Security › Bluetooth")
        Divider()
        SetupStepRow(step: .number(2), title: "Turn on OpenBuds, then click Retry")
      }
      HStack(spacing: 8) {
        Button("Open Privacy Settings") {
          NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Bluetooth")!)
        }
        .buttonStyle(PanelButtonStyle(variant: .prominent(), fullWidth: true))
        Button("Retry") { Task { await session.connect() } }
          .buttonStyle(PanelButtonStyle(variant: .secondary))
      }

    case .bluetoothOff:
      if let last = session.lastKnown, last.hasBattery {
        LastBatterySection(snapshot: last)
      }
      StandbyModule(
        icon: "antenna.radiowaves.left.and.right.slash",
        color: .orange,
        title: "Bluetooth is turned off",
        detail: "Turn Bluetooth on in macOS to talk to your earbuds."
      ) {
        Button("Bluetooth Settings") {
          NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.BluetoothSettings")!)
        }
        .buttonStyle(PanelButtonStyle(variant: .prominent()))
        Spacer(minLength: 4)
        Button("Retry") { Task { await session.connect() } }
          .buttonStyle(PanelButtonStyle(variant: .secondary))
      }

    case .retrying:
      if let last = session.lastKnown, last.hasBattery {
        LastBatterySection(snapshot: last)
      }
      StandbyModule(
        icon: "antenna.radiowaves.left.and.right",
        color: .accentColor,
        title: "Waiting for control link",
        detail: "Open the case lid or take one bud out. Retrying automatically every 5s.",
        busy: true,
        step: session.connectionStep.rawValue
      ) {
        Button("Try Now") { Task { await session.connect() } }
          .buttonStyle(PanelButtonStyle(variant: .prominent()))
        Spacer(minLength: 4)
        Button("Bluetooth") {
          NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.BluetoothSettings")!)
        }
        .buttonStyle(PanelButtonStyle(variant: .secondary))
      }

    case .none, .generic:
      if session.pausedByUser {
        if let last = session.lastKnown, last.hasBattery {
          LastBatterySection(snapshot: last)
        }
        StandbyModule(
          icon: "pause.fill",
          color: .blue,
          title: "Control link paused",
          detail: session.pairedAudioConnected
            ? "Audio stays connected on this Mac. Reconnect anytime to adjust settings."
            : "Auto-reconnect is paused until you reconnect."
        ) {
          Button("Reconnect") { Task { await session.connect() } }
            .buttonStyle(PanelButtonStyle(variant: .prominent()))
          Spacer(minLength: 4)
          Button("Bluetooth") {
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.BluetoothSettings")!)
          }
          .buttonStyle(PanelButtonStyle(variant: .secondary))
        }
      } else if session.lastKnown != nil || session.pairedName != nil {
        if let last = session.lastKnown, last.hasBattery {
          LastBatterySection(snapshot: last)
        }
        StandbyModule(
          icon: "airpods.pro.chargingcase.wireless.fill",
          color: .gray,
          title: "Waiting for earbuds",
          detail: session.connectionIssue == .generic
            ? message
            : "Open the case lid or take one bud out — OpenBuds links automatically."
        ) {
          Button("Check Now") { Task { await session.connect() } }
            .buttonStyle(PanelButtonStyle(variant: .tinted()))
          Spacer(minLength: 4)
          Button("Bluetooth") {
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.BluetoothSettings")!)
          }
          .buttonStyle(PanelButtonStyle(variant: .secondary))
        }
      } else {
        StandbyModule(
          icon: "airpods.pro",
          color: .accentColor,
          title: "Connect OnePlus earbuds",
          detail: "Native battery, noise control, and EQ — 100% local, zero accounts."
        )
        PanelSection(title: "Setup") {
          SetupStepRow(step: .done, title: "OpenBuds ready", detail: "Listening locally on this Mac")
          Divider()
          SetupStepRow(step: .number(1), title: "Pair earbuds in Bluetooth Settings", detail: "Hold the case button 2s until the white light pulses.")
          Divider()
          SetupStepRow(step: .number(2), title: "Auto-connects once paired", detail: "Controls appear as soon as the earbuds link.")
        }
        HStack(spacing: 8) {
          Button("Bluetooth Settings") {
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.BluetoothSettings")!)
          }
          .buttonStyle(PanelButtonStyle(variant: .prominent(), fullWidth: true))
          Button("Check") { Task { await session.connect() } }
            .buttonStyle(PanelButtonStyle(variant: .secondary))
        }
      }
    }
  }

  private var ringingBanner: some View {
    HStack(spacing: 8) {
      Image(systemName: "dot.radiowaves.left.and.right")
        .font(.callout.weight(.semibold))
        .foregroundStyle(.red)
        .symbolEffect(.pulse, isActive: !reduceMotion)
      VStack(alignment: .leading, spacing: 1) {
        Text("Earbuds ringing").font(.caption.weight(.semibold))
        Text("Playing loud tone").font(.caption2).foregroundStyle(.secondary)
      }
      Spacer(minLength: 4)
      Button("Stop") {
        Task { if await session.findEarbuds(false) { model.ringing = false } }
      }
      .buttonStyle(PanelButtonStyle(variant: .prominent(.red)))
      .disabled(session.busy)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(Color.red.opacity(0.16), in: .rect(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.red.opacity(0.38), lineWidth: 1))
    .transition(.opacity)
  }

  private var atmosphereTint: Color {
    if session.isConnected {
      if session.unsupported != nil { return .indigo }
      guard let mode = session.noise?.mode else { return .clear }
      if mode.isANC { return .indigo }
      switch mode {
      case .adaptive: return .teal
      case .transparency: return .accentColor
      default: return .clear
      }
    }
    switch session.connection {
    case .searching, .connecting: return .accentColor
    case .unavailable:
      switch session.connectionIssue {
      case .bluetoothUnauthorized, .bluetoothOff: return .orange
      case .retrying: return .accentColor
      case .none, .generic: return .clear
      }
    case .connected: return .clear
    }
  }

  private var atmosphereStrength: Double {
    if session.isConnected { return session.unsupported != nil ? 0.16 : 0.22 }
    switch session.connectionIssue {
    case .bluetoothUnauthorized, .bluetoothOff: return 0.15
    case .retrying: return 0.14
    case .none, .generic:
      if case .searching = session.connection { return 0.14 }
      if case .connecting = session.connection { return 0.14 }
      return 0
    }
  }

  private var hasUpdate: Bool {
    if case .available = model.updates.state { true } else { false }
  }

  private var presetName: String? {
    session.presets.first { $0.id == session.eq }?.name
  }

  private var featureSummary: String {
    let on = [Switch.wearDetection, .gameMode, .dualConnection, .smartVolume].filter { session.isOn($0) == true }.count
    return on == 0 ? "All off" : "\(on) on"
  }

  private var headerTitle: String {
    if session.isConnected {
      return session.profile.isKnown ? session.profile.displayName : "Unsupported earbuds"
    }
    if session.connectionIssue == .bluetoothUnauthorized { return "OpenBuds" }
    return session.lastKnown?.name ?? session.pairedName ?? "OpenBuds"
  }

  private var headerStatus: (dot: Color, text: String)? {
    guard !session.isConnected else { return nil }
    switch session.connection {
    case .searching: return (.accentColor, "Searching…")
    case .connecting: return (.accentColor, "Linking…")
    case .unavailable:
      switch session.connectionIssue {
      case .bluetoothUnauthorized: return (.orange, "Permission needed")
      case .bluetoothOff: return (.orange, "Bluetooth off")
      case .retrying: return (.accentColor, "Waiting for control link")
      case .none, .generic:
        if session.pausedByUser {
          return (.secondary, session.pairedAudioConnected ? "Paused · Audio on Mac" : "Disconnected")
        }
        if let seen = session.lastKnown?.seenAt {
          return (.secondary, "In the case · \(relativeTime(seen))")
        }
        if session.pairedName != nil {
          return (.secondary, "In the case · Auto-connect")
        }
        return (.secondary, "No earbuds paired")
      }
    case .connected: return nil
    }
  }

  private var header: some View {
    HStack(spacing: 6) {
      VStack(alignment: .leading, spacing: 1) {
        Text(headerTitle)
          .font(.headline)
          .lineLimit(1)
        if let subtitle {
          HStack(spacing: 5) {
            if session.profile.experimental, session.profile.isKnown {
              Text("Experimental")
                .font(.caption2.weight(.semibold))
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, 5)
                .padding(.vertical, 1.5)
                .background(.orange.opacity(0.2), in: .capsule)
                .foregroundStyle(.orange)
            }
            Text(subtitle)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
              .truncationMode(.tail)
          }
        } else if let status = headerStatus {
          HStack(spacing: 5) {
            Circle()
              .fill(status.dot)
              .frame(width: 6, height: 6)
            Text(status.text)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(1)
          }
        }
      }
      Spacer(minLength: 4)
      if session.busy { ProgressView().controlSize(.small) }
      if session.isConnected {
        Button { session.disconnect() } label: {
          Image(systemName: "eject")
        }
        .buttonStyle(CircleIconButtonStyle())
        .help("Disconnect from the earbuds")
        .accessibilityLabel("Disconnect from the earbuds")
      }
      Button { NSApplication.shared.terminate(nil) } label: {
        Image(systemName: "power")
      }
      .buttonStyle(CircleIconButtonStyle())
      .help("Quit OpenBuds")
      .accessibilityLabel("Quit OpenBuds")
      .keyboardShortcut("q")
    }
  }

  private var subtitle: String? {
    guard session.isConnected else { return nil }
    var parts: [String] = []
    if let codec = session.codec.flatMap({ codecNames[$0] }) { parts.append(codec) }
    if let firmware = session.firmware, !firmware.isEmpty { parts.append("fw \(firmware)") }
    return parts.isEmpty ? "Connected" : parts.joined(separator: " · ")
  }
}

/// Compact relative time string for last-known standby readings ("Just now", "4m ago", "2h ago").
func relativeTime(_ date: Date, now: Date = Date()) -> String {
  let seconds = max(0, Int(now.timeIntervalSince(date)))
  if seconds < 45 { return "Just now" }
  let minutes = seconds / 60
  if minutes < 60 { return "\(minutes)m ago" }
  let hours = minutes / 60
  if hours < 24 { return "\(hours)h ago" }
  let days = hours / 24
  return days == 1 ? "Yesterday" : "\(days)d ago"
}

/// Muted last-seen battery module shown while earbuds are in the case or paused, preserving continuity.
struct LastBatterySection: View {
  let snapshot: LastKnownBuds

  var body: some View {
    PanelSection {
      VStack(alignment: .leading, spacing: 8) {
        HStack(alignment: .firstTextBaseline) {
          Text("Last battery")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
          Spacer(minLength: 4)
          Text(relativeTime(snapshot.seenAt))
            .font(.caption2.monospacedDigit())
            .foregroundStyle(.tertiary)
        }
        HStack(spacing: 0) {
          ForEach(Part.allCases, id: \.self) { part in
            BatteryGauge(part: part, level: snapshot.level(for: part), wear: nil, muted: true)
              .frame(maxWidth: .infinity)
          }
        }
      }
      .padding(.vertical, 10)
    }
  }
}

/// Native Control Center–aligned status/recovery module used for standby, linking, and permission states.
struct StandbyModule<Actions: View>: View {
  let icon: String
  let color: Color
  let title: String
  let detail: String
  var busy: Bool = false
  var step: Int? = nil
  @ViewBuilder var actions: Actions

  private static var steps: [(Int, String)] {
    [(1, "1. Paired"), (2, "2. Link"), (3, "3. Sync")]
  }

  var body: some View {
    PanelSection {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .top, spacing: 10) {
          IconBadge(icon: icon, color: color)
            .padding(.top, 1)
          VStack(alignment: .leading, spacing: 2) {
            Text(title)
              .font(.callout.weight(.semibold))
              .lineLimit(1)
            Text(detail)
              .font(.caption)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 4)
          if busy {
            ProgressView()
              .controlSize(.small)
              .padding(.top, 2)
          }
        }
        .padding(.vertical, 10)

        if let step {
          HStack(spacing: 5) {
            ForEach(Self.steps, id: \.0) { index, label in
              let done = index < step
              let active = index == step
              Text(done ? "\(label) ✓" : label)
                .font(.caption2.weight(active ? .semibold : .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4.5)
                .padding(.horizontal, 4)
                .foregroundStyle(done ? AnyShapeStyle(Color.green) : active ? AnyShapeStyle(Color.primary) : AnyShapeStyle(.tertiary))
                .background(
                  done ? AnyShapeStyle(Color.green.opacity(0.14))
                    : active ? AnyShapeStyle(Color.accentColor.opacity(0.22))
                    : AnyShapeStyle(.fill.tertiary),
                  in: .rect(cornerRadius: 8)
                )
                .overlay(
                  RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(
                      done ? Color.green.opacity(0.28)
                        : active ? Color.accentColor.opacity(0.45)
                        : Color.primary.opacity(0.06),
                      lineWidth: 1
                    )
                )
            }
          }
          .padding(.bottom, 10)
        }

        if Actions.self != EmptyView.self {
          Divider()
          HStack(spacing: 8) { actions }
            .padding(.vertical, 8)
        }
      }
    }
  }
}

extension StandbyModule where Actions == EmptyView {
  init(icon: String, color: Color, title: String, detail: String, busy: Bool = false, step: Int? = nil) {
    self.init(icon: icon, color: color, title: title, detail: detail, busy: busy, step: step) { EmptyView() }
  }
}

/// Numbered or completed row inside a setup / recovery PanelSection.
struct SetupStepRow: View {
  enum Marker {
    case number(Int)
    case done
  }

  let step: Marker
  let title: String
  var detail: String? = nil

  var body: some View {
    HStack(alignment: detail == nil ? .center : .top, spacing: 9) {
      Group {
        switch step {
        case .done:
          Image(systemName: "checkmark")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 18, height: 18)
            .background(Color.green.gradient, in: .circle)
        case .number(let n):
          Text("\(n)")
            .font(.caption2.weight(.semibold).monospacedDigit())
            .foregroundStyle(.secondary)
            .frame(width: 18, height: 18)
            .background(.fill.tertiary, in: .circle)
            .overlay(Circle().strokeBorder(Color.primary.opacity(0.12), lineWidth: 1))
        }
      }
      .padding(.top, detail == nil ? 0 : 1)
      VStack(alignment: .leading, spacing: 1) {
        Text(title)
          .font(.caption.weight(.medium))
          .fixedSize(horizontal: false, vertical: true)
        if let detail {
          Text(detail)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.vertical, 8)
  }
}

struct VolumeSection: View {
  let session: BudsSession
  let audio: OutputAudio

  var body: some View {
    let name: String? = if case .connected(let n) = session.connection { n } else { nil }
    if let buds = audio.buds(named: name) {
      PanelSection {
        Group {
          if audio.current == buds, let volume = audio.volume {
            HStack(spacing: 8) {
              Image(systemName: "speaker.fill").foregroundStyle(.secondary)
              Slider(value: Binding(get: { volume }, set: { audio.setVolume($0) }), in: 0...1)
                .controlSize(.small)
              Image(systemName: "speaker.wave.3.fill").foregroundStyle(.secondary)
            }
            .imageScale(.small)
          } else {
            HStack {
              Text("Playing on \(audio.current?.name ?? "another output")")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
              Spacer()
              Button("Use Buds") { audio.makeDefault(buds) }
                .buttonStyle(PanelButtonStyle(variant: .secondary))
            }
          }
        }
        .padding(.vertical, 8)
      }
    }
  }
}

// MARK: Building blocks

/// A rounded section of the panel, like a Control Center module.
struct PanelSection<Content: View>: View {
  var title: String?
  var padded = true
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      if let title {
        Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.leading, 8)
      }
      VStack(alignment: .leading, spacing: 0) { content }
        .padding(.horizontal, padded ? 12 : 4)
        .padding(.vertical, padded ? 0 : 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.fill.quaternary, in: .rect(cornerRadius: Metrics.section))
    }
  }
}

struct IconBadge: View {
  let icon: String
  let color: Color

  var body: some View {
    Image(systemName: icon)
      .font(.system(size: 10, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: 22, height: 22)
      .background(color.gradient, in: .circle)
  }
}

/// A Control Center–style tile that opens a page.
struct NavTile: View {
  let icon: String
  let color: Color
  let title: String
  let value: String
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        IconBadge(icon: icon, color: color)
        VStack(alignment: .leading, spacing: 0) {
          Text(title).font(.callout.weight(.medium))
          Text(value).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer(minLength: 0)
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 9)
      .frame(maxWidth: .infinity)
      .background(hovering ? AnyShapeStyle(.fill.tertiary) : AnyShapeStyle(.fill.quaternary), in: .rect(cornerRadius: Metrics.section))
      .contentShape(.rect(cornerRadius: Metrics.section))
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .animation(.easeOut(duration: 0.12), value: hovering)
  }
}

/// Slim footer rendered in every HomePage state. Opens the About page.
struct AboutFooter: View {
  let connected: Bool
  let hasUpdate: Bool
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 6) {
        Text(connected
          ? "OpenBuds \(AppInfo.version) · Local & GPL-3.0"
          : "OpenBuds \(AppInfo.version) · Report a problem")
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
        Spacer(minLength: 4)
        HStack(spacing: 4) {
          if hasUpdate {
            Circle()
              .fill(Color.accentColor)
              .frame(width: 6, height: 6)
              .accessibilityLabel("Update available")
          }
          Text("About")
            .font(.caption2.weight(.medium))
          Image(systemName: "chevron.right")
            .font(.system(size: 9, weight: .semibold))
        }
        .foregroundStyle(hovering ? .primary : .secondary)
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 5)
      .background(hovering ? AnyShapeStyle(.fill.quaternary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 8))
      .contentShape(.rect(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
    .animation(.easeOut(duration: 0.12), value: hovering)
  }
}

struct ToggleRow: View {
  let title: String
  var subtitle: String?
  let isOn: Binding<Bool>
  var disabled = false

  var body: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
        if let subtitle {
          Text(subtitle).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 8)
      Toggle(title, isOn: isOn)
        .labelsHidden()
        .toggleStyle(.switch)
        .controlSize(.mini)
        .disabled(disabled)
    }
    .padding(.vertical, 7)
  }
}

struct StatusLine: View {
  let session: BudsSession
  let key: String
  var inline = false

  var body: some View {
    if let status = session.status[key] {
      Group {
        switch status {
        case .pending:
          HStack(spacing: inline ? 4 : 6) {
            ProgressView().controlSize(.mini)
            Text(inline ? "Confirming…" : "Waiting for the earbuds…")
              .lineLimit(inline ? 1 : nil)
          }
          .foregroundStyle(.secondary)
        case .done(let text):
          Label(text ?? "Confirmed", systemImage: "checkmark.circle.fill")
            .foregroundStyle(.green)
            .contentTransition(.symbolEffect(.replace))
            .lineLimit(inline ? 1 : nil)
        case .failed(let message):
          Label(message, systemImage: "exclamationmark.triangle.fill")
            .foregroundStyle(.orange)
            .contentTransition(.symbolEffect(.replace))
            .lineLimit(inline ? 1 : nil)
            .fixedSize(horizontal: false, vertical: !inline)
        }
      }
      .font(inline ? .caption2 : .caption)
      .padding(.bottom, inline ? 0 : 7)
      .transition(.opacity)
      .onChange(of: session.status[key]) { _, next in
        if case .done = next {
          NSHapticFeedbackManager.defaultPerformer.perform(.alignment, performanceTime: .now)
        }
      }
    }
  }
}

/// A sub-page: glass back button and title, with content that scrolls once it outgrows the panel.
struct SubPage<Content: View>: View {
  let title: String
  let model: PanelModel
  var onBack: (() -> Void)?
  @ViewBuilder let content: Content
  @State private var height: CGFloat = 320

  var body: some View {
    VStack(spacing: 0) {
      ZStack {
        Text(title).font(.headline)
        HStack {
          Button {
            onBack?()
            model.back()
          } label: {
            Image(systemName: "chevron.left")
          }
          .buttonStyle(CircleIconButtonStyle())
          .accessibilityLabel("Back")
          .keyboardShortcut(.cancelAction)
          Spacer()
        }
      }
      .padding(.horizontal, Metrics.padding)
      .padding(.top, Metrics.padding)
      .padding(.bottom, 6)
      ScrollView {
        VStack(alignment: .leading, spacing: 10) { content }
          .padding(.horizontal, Metrics.padding)
          .padding(.bottom, Metrics.padding)
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      }
      .scrollEdgeEffectStyle(.soft, for: .top)
      .frame(height: min(height, Metrics.maxScroll))
    }
  }
}

// MARK: Earbuds status

struct BatteryRow: View {
  let session: BudsSession

  var body: some View {
    HStack(spacing: 0) {
      ForEach(Part.allCases, id: \.self) { part in
        BatteryGauge(part: part, level: session.battery[part], wear: session.wearing[part])
          .frame(maxWidth: .infinity)
      }
    }
  }
}

struct BatteryGauge: View {
  let part: Part
  let level: BatteryLevel?
  let wear: WearState?
  var muted: Bool = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let status = statusInfo
    VStack(spacing: 5) {
      ZStack {
        Circle().stroke(.fill.tertiary, lineWidth: 3.5)
        Circle()
          .trim(from: 0, to: Double(level?.percent ?? 0) / 100)
          .stroke(tint, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .animation(reduceMotion ? nil : .smooth, value: level?.percent)
        Image(systemName: symbol)
          .font(.system(size: 14))
          .foregroundStyle(muted ? AnyShapeStyle(.secondary) : level?.percent == nil ? AnyShapeStyle(.tertiary) : isLow ? AnyShapeStyle(Color.red) : AnyShapeStyle(.primary))
      }
      .frame(width: 40, height: 40)
      HStack(spacing: 2) {
        if !muted, level?.charging == true {
          Image(systemName: "bolt.fill")
            .font(.caption2)
            .foregroundStyle(.green)
        }
        Text(level?.percent.map { "\($0)%" } ?? "–")
          .font(.caption.weight(.semibold).monospacedDigit())
          .foregroundStyle(muted ? AnyShapeStyle(.secondary) : isLow ? AnyShapeStyle(Color.red) : level?.percent == nil ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
          .contentTransition(.numericText())
      }
      HStack(spacing: 4) {
        if let dot = status.dot {
          Circle()
            .fill(dot)
            .frame(width: 5, height: 5)
        }
        Text(status.label)
          .font(.caption2)
          .foregroundStyle(status.textColor)
          .lineLimit(1)
      }
    }
    .opacity(muted ? 0.72 : 1)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(accessibilitySummary(status.label))
  }

  private var isLow: Bool {
    guard !muted, let level, let percent = level.percent, !level.charging else { return false }
    return percent <= 15
  }

  private var symbol: String {
    switch part {
    case .left: "airpods.pro.left"
    case .right: "airpods.pro.right"
    case .chargingCase: "airpods.pro.chargingcase.wireless.fill"
    }
  }

  private var tint: Color {
    guard let level, let percent = level.percent else { return .clear }
    if muted { return .secondary.opacity(0.6) }
    if level.charging { return .green }
    return percent <= 15 ? .red : .primary
  }

  private var statusInfo: (dot: Color?, label: String, textColor: Color) {
    if muted { return (nil, part.label, .secondary) }
    if part == .chargingCase {
      if level?.charging == true { return (.green, "Charging", .green) }
      if isLow { return (.red, "Low", .red) }
      // The case reports its battery only with the lid open and a bud inside.
      if level?.percent != nil { return (nil, "Case", .secondary) }
      return (nil, wear?.lidOpen == true ? "Put a bud in" : "Open lid", .secondary)
    }
    if level?.charging == true { return (.green, "Charging", .green) }
    if isLow { return (.red, "Low", .red) }
    if wear?.inEar == true { return (.green, "In ear", .secondary) }
    if wear?.inCase == true { return (Color.secondary.opacity(0.6), "In case", .secondary) }
    return (nil, part.label, .secondary)
  }

  private func accessibilitySummary(_ statusLabel: String) -> String {
    let pct = level?.percent.map { "\($0) percent" } ?? "unavailable"
    let base = statusLabel == part.label ? "\(part.label), \(pct)" : "\(part.label), \(pct), \(statusLabel)"
    return muted ? "Last known \(base)" : base
  }
}

/// A product id with no profile: nothing is sent but identity reads, and the owner can copy what the earbuds said.
struct UnsupportedCard: View {
  let info: UnsupportedInfo
  @State private var copied = false

  var body: some View {
    StandbyModule(
      icon: "shield.lefthalf.filled",
      color: .indigo,
      title: "Safe read-only mode",
      detail: "No profile for this model yet — nothing is changed on your earbuds."
    )
    PanelSection(title: "Device identity") {
      identityRow("Model ID", value: info.productId, monospaced: true)
      Divider()
      identityRow("Firmware", value: info.firmware ?? "Unknown", monospaced: true)
      Divider()
      identityRow("Report data", value: "Protocol bytes only", valueColor: .green)
    }
    HStack(spacing: 8) {
      Button(copied ? "Copied ✓" : "Copy diagnostics") {
        NSPasteboard.general.clearContents()
        copied = NSPasteboard.general.setString(info.report, forType: .string)
      }
      .buttonStyle(PanelButtonStyle(variant: .prominent(.indigo), fullWidth: true))
      Button("GitHub issue ↗") {
        NSWorkspace.shared.open(AppInfo.issues)
      }
      .buttonStyle(PanelButtonStyle(variant: .secondary))
    }
  }

  private func identityRow(_ label: String, value: String, monospaced: Bool = false, valueColor: Color = .secondary) -> some View {
    HStack {
      Text(label).font(.caption)
      Spacer(minLength: 8)
      Text(value)
        .font(monospaced ? .caption.monospacedDigit() : .caption)
        .foregroundStyle(valueColor)
        .lineLimit(1)
    }
    .padding(.vertical, 7)
  }
}

struct NoiseControl: View {
  let session: BudsSession
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private enum Group: CaseIterable {
    case anc, adaptive, transparency, off
    /// Offered when the model's profile offers any mode in the group.
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
      case .anc: "Noise Cancel"
      case .adaptive: "Adaptive"
      case .transparency: "Transparency"
      case .off: "Off"
      }
    }
    var symbol: String {
      switch self {
      case .anc: "person.and.background.dotted"
      case .adaptive: "sparkles"
      case .transparency: "ear.and.waveform"
      case .off: "circle.slash"
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

  private var current: Group? {
    guard let mode = session.noise?.mode else { return nil }
    if mode.isANC { return .anc }
    return Group.allCases.first { $0.mode == mode }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text("Noise Control").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        Spacer(minLength: 4)
        StatusLine(session: session, key: "noise", inline: true)
      }
      HStack(alignment: .top, spacing: 4) {
        ForEach(Group.allCases.filter { $0.offered(by: session.profile.noiseModes) }, id: \.self) { group in
          let selected = current == group
          Button {
            guard !selected else { return }
            Task { await session.setNoise(group.mode) }
          } label: {
            VStack(spacing: 6) {
              modeBadge(for: group, selected: selected)
              Text(group.title)
                .font(.caption2.weight(selected ? .medium : .regular))
                .foregroundStyle(selected ? .primary : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .disabled(session.busy)
          .accessibilityAddTraits(selected ? .isSelected : [])
        }
      }
      if current == .anc {
        GlassTabs(
          selection: Binding(
            get: { session.noise?.mode ?? .smart },
            set: { mode in if mode != session.noise?.mode { Task { await session.setNoise(mode) } } }
          ),
          options: NoiseMode.ancLevels.filter { session.profile.noiseModes.contains($0) },
          compact: true,
          tint: .indigo
        ) { $0.rawValue.capitalized }
        .disabled(session.busy)
        if session.noise?.mode == .smart, let level = session.smartLevel, level != .smart {
          Text("Smart is using \(Text(level.rawValue).bold()) right now.")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
    }
    .animation(reduceMotion ? nil : .smooth, value: current)
  }

  @ViewBuilder
  private func modeBadge(for group: Group, selected: Bool) -> some View {
    let icon = Image(systemName: group.symbol)
      .font(.system(size: 13, weight: .medium))
      .contentTransition(.symbolEffect(.replace))
      .symbolEffect(.bounce, value: reduceMotion ? false : selected)
      .frame(width: 36, height: 36)

    if selected, let tint = group.tint {
      ZStack {
        Circle()
          .stroke(tint.opacity(0.32), lineWidth: 3)
          .frame(width: 40, height: 40)
        icon
          .foregroundStyle(.white)
          .background(tint.gradient, in: .circle)
      }
      .frame(width: 40, height: 40)
    } else if selected {
      icon
        .foregroundStyle(.primary)
        .background(.fill.secondary, in: .circle)
        .overlay(Circle().strokeBorder(Color.primary.opacity(0.22), lineWidth: 1))
        .frame(width: 40, height: 40)
    } else {
      icon
        .foregroundStyle(.primary)
        .glassEffect(.regular, in: .circle)
        .frame(width: 40, height: 40)
    }
  }
}
