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
  var editing: Preset?
  var editingIsNew = false
  var ringing = false
  let updates = UpdateChecker()

  func open(_ next: Page) {
    forward = true
    withAnimation(.snappy(duration: 0.18)) { page = next }
  }

  func back() {
    forward = false
    withAnimation(.snappy(duration: 0.18)) { page = parent }
  }

  func home() {
    forward = false
    page = .home
  }

  private var parent: Page {
    switch page {
    case .preset: .sound
    case .hearing: .tools
    default: .home
    }
  }
}

enum Metrics {
  static let width: CGFloat = 300
  static let padding: CGFloat = 10
  static let section: CGFloat = 14
  static let maxScroll: CGFloat = 480
}

struct PanelView: View {
  let session: BudsSession
  let audio: OutputAudio
  let prefs: AppPrefs
  @State private var model = PanelModel()

  var body: some View {
    ZStack(alignment: .top) {
      page
        .id(session.isConnected ? model.page : .home)
        .transition(.push(from: model.forward ? .trailing : .leading))
    }
    .frame(width: Metrics.width)
    .font(.callout)
    .clipped()
    .onChange(of: session.isConnected) { _, connected in if !connected { model.home() } }
  }

  @ViewBuilder private var page: some View {
    switch session.isConnected ? model.page : .home {
    case .home: HomePage(session: session, model: model, audio: audio)
    case .sound: SoundPage(session: session, model: model)
    case .controls: ControlsPage(session: session, model: model)
    case .features: FeaturesPage(session: session, model: model, prefs: prefs)
    case .tools: ToolsPage(session: session, model: model)
    case .preset: PresetPage(session: session, model: model)
    case .hearing: HearingPage(session: session, model: model)
    case .about: AboutPage(model: model)
    }
  }
}

// MARK: Home

struct HomePage: View {
  let session: BudsSession
  let model: PanelModel
  let audio: OutputAudio

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      header.padding(.leading, 6).padding(.top, 2)
      switch session.connection {
      case .connected:
        PanelSection { BatteryRow(session: session).padding(.vertical, 10) }
        PanelSection { NoiseControl(session: session).padding(.vertical, 9) }
        VolumeSection(session: session, audio: audio)
        Grid(horizontalSpacing: 8, verticalSpacing: 8) {
          GridRow {
            NavTile(icon: "slider.vertical.3", color: .pink, title: "Sound", value: presetName ?? "Equalizer") { model.open(.sound) }
            NavTile(icon: "hand.tap.fill", color: .blue, title: "Controls", value: "Taps and holds") { model.open(.controls) }
          }
          GridRow {
            NavTile(icon: "switch.2", color: .green, title: "Features", value: featureSummary) { model.open(.features) }
            NavTile(icon: "wrench.and.screwdriver.fill", color: .orange, title: "Tools", value: "Find and fit") { model.open(.tools) }
          }
        }
        AboutRow { model.open(.about) }
      case .connecting(let name):
        ConnectionCard(title: "Connecting…", message: name, busy: true)
      case .searching:
        ConnectionCard(title: "Looking for your earbuds", message: "This takes a moment.", busy: true)
      case .unavailable(let message):
        ConnectionCard(title: "Not connected", message: message, busy: false) {
          Button("Connect") { Task { await session.connect() } }
            .buttonStyle(.glassProminent)
          Button("Bluetooth Settings") {
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.BluetoothSettings")!)
          }
          .buttonStyle(.glass)
        }
      }
      if let error = session.lastError, session.isConnected {
        Label(error, systemImage: "exclamationmark.triangle.fill")
          .font(.caption)
          .foregroundStyle(.orange)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.horizontal, 6)
      }
    }
    .padding(Metrics.padding)
  }

  private var presetName: String? {
    session.presets.first { $0.id == session.eq }?.name
  }

  private var featureSummary: String {
    let on = [Switch.wearDetection, .gameMode, .dualConnection, .smartVolume].filter { session.isOn($0) == true }.count
    return on == 0 ? "All off" : "\(on) on"
  }

  private var header: some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 1) {
        Text(session.isConnected ? "OnePlus Buds 4" : "OpenBuds").font(.headline)
        if let subtitle { Text(subtitle).font(.caption).foregroundStyle(.secondary) }
      }
      Spacer()
      if session.busy { ProgressView().controlSize(.small) }
      if session.isConnected {
        Toggle("Connected", isOn: Binding(get: { session.isConnected }, set: { if !$0 { session.disconnect() } }))
          .labelsHidden()
          .toggleStyle(.switch)
          .controlSize(.mini)
          .help("Disconnect from the earbuds")
      }
      Button("Quit OpenBuds", systemImage: "power") { NSApplication.shared.terminate(nil) }
        .labelStyle(.iconOnly)
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .controlSize(.small)
        .help("Quit OpenBuds")
        .keyboardShortcut("q")
    }
  }

  private var subtitle: String? {
    guard session.isConnected else { return nil }
    if let codec = session.codec.flatMap({ codecNames[$0] }) { return "Connected with \(codec)" }
    return "Connected"
  }
}

/// The panel when there is nothing to control yet: what is happening and what to do.
struct ConnectionCard<Actions: View>: View {
  let title: String
  let message: String
  let busy: Bool
  @ViewBuilder var actions: Actions

  var body: some View {
    VStack(spacing: 12) {
      ZStack {
        Image(systemName: "airpods.pro")
          .font(.system(size: 24, weight: .regular))
          .foregroundStyle(busy ? .secondary : .primary)
          .symbolEffect(.pulse, isActive: busy)
          .frame(width: 60, height: 60)
          .glassEffect(.regular, in: .circle)
        if busy {
          TimelineView(.animation) { context in
            let turn = context.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1.1) / 1.1
            Circle()
              .trim(from: 0, to: 0.3)
              .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
              .rotationEffect(.degrees(turn * 360))
          }
          .frame(width: 68, height: 68)
          .transition(.opacity)
        }
      }
      .frame(width: 70, height: 70)
      .animation(.easeOut(duration: 0.2), value: busy)
      .padding(.top, 6)
      VStack(spacing: 4) {
        Text(title).font(.headline)
        Text(message)
          .font(.caption)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .fixedSize(horizontal: false, vertical: true)
      }
      .padding(.horizontal, 12)
      HStack(spacing: 8) { actions }
        .controlSize(.small)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 14)
    .background(.fill.quaternary, in: .rect(cornerRadius: Metrics.section))
  }
}

extension ConnectionCard where Actions == EmptyView {
  init(title: String, message: String, busy: Bool) {
    self.init(title: title, message: message, busy: busy) { EmptyView() }
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
              Button("Use Buds") { audio.makeDefault(buds) }.buttonStyle(.glass).controlSize(.small)
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

/// Full-width row under the four home tiles. Opens the About page.
struct AboutRow: View {
  let action: () -> Void
  @State private var hovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        GitHubBadge()
        VStack(alignment: .leading, spacing: 0) {
          Text("About OpenBuds").font(.callout.weight(.medium))
          Text("Version \(AppInfo.version) · Open source on GitHub")
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(.tertiary)
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

  var body: some View {
    if let status = session.status[key] {
      Group {
        switch status {
        case .pending:
          HStack(spacing: 6) {
            ProgressView().controlSize(.mini)
            Text("Waiting for the earbuds…")
          }
          .foregroundStyle(.secondary)
        case .done(let text):
          Label(text ?? "Confirmed", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        case .failed(let message):
          Label(message, systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      .font(.caption)
      .padding(.bottom, 7)
      .transition(.opacity)
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
            Image(systemName: "chevron.left").font(.callout.weight(.semibold)).frame(width: 14, height: 14)
          }
          .buttonStyle(.glass)
          .buttonBorderShape(.circle)
          .controlSize(.small)
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

  var body: some View {
    VStack(spacing: 5) {
      ZStack {
        Circle().stroke(.fill.tertiary, lineWidth: 3.5)
        Circle()
          .trim(from: 0, to: Double(level?.percent ?? 0) / 100)
          .stroke(tint, style: StrokeStyle(lineWidth: 3.5, lineCap: .round))
          .rotationEffect(.degrees(-90))
          .animation(.smooth, value: level?.percent)
        Image(systemName: symbol)
          .font(.system(size: 14))
          .foregroundStyle(level?.percent == nil ? .tertiary : .primary)
      }
      .frame(width: 40, height: 40)
      HStack(spacing: 2) {
        if level?.charging == true { Image(systemName: "bolt.fill").font(.caption2).foregroundStyle(.green) }
        Text(level?.percent.map { "\($0)%" } ?? "–").font(.caption.weight(.medium).monospacedDigit())
      }
      Text(note).font(.caption2).foregroundStyle(.secondary)
    }
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
    if level.charging { return .green }
    return percent <= 15 ? .red : .primary
  }
  private var note: String {
    if part == .chargingCase {
      // The case reports its battery only with the lid open and a bud inside.
      if level?.percent != nil { return "Case" }
      return wear?.lidOpen == true ? "Put a bud in" : "Open the lid"
    }
    guard let wear else { return part.label }
    return wear.inEar ? "\(part.label), in ear" : wear.inCase ? "\(part.label), in case" : part.label
  }
}

struct NoiseControl: View {
  let session: BudsSession

  private enum Group: CaseIterable {
    case anc, adaptive, transparency, off
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
  }

  private var current: Group? {
    guard let mode = session.noise?.mode else { return nil }
    if mode.isANC { return .anc }
    return Group.allCases.first { $0.mode == mode }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Noise Control").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
      HStack(alignment: .top, spacing: 4) {
        ForEach(Group.allCases, id: \.self) { group in
          let selected = current == group
          Button {
            guard !selected else { return }
            Task { await session.setNoise(group.mode) }
          } label: {
            VStack(spacing: 7) {
              Image(systemName: group.symbol)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(selected ? Color.white : Color.primary)
                .frame(width: 36, height: 36)
                .glassEffect(selected ? .regular.tint(.accentColor) : .regular, in: .circle)
              Text(group.title)
                .font(.caption2)
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
          options: NoiseMode.ancLevels,
          compact: true
        ) { $0.rawValue.capitalized }
        .disabled(session.busy)
        if session.noise?.mode == .smart, let level = session.smartLevel, level != .smart {
          Text("Smart is using \(level.rawValue) right now.").font(.caption).foregroundStyle(.secondary)
        }
      }
      StatusLine(session: session, key: "noise")
    }
    .animation(.smooth, value: current)
  }
}
