import AppKit
import BudsKit
import SwiftUI

@main
struct OpenBudsApp: App {
  @State private var session: BudsSession
  @State private var audio = OutputAudio()
  @State private var prefs: AppPrefs
  private let companion: Companion

  init() {
    let session = BudsSession()
    let prefs = AppPrefs()
    let audio = OutputAudio()
    let companion = Companion(session: session, prefs: prefs, audio: audio)
    _session = State(initialValue: session)
    _prefs = State(initialValue: prefs)
    _audio = State(initialValue: audio)
    self.companion = companion
    DispatchQueue.main.async {
      session.start()
      audio.start()
      companion.start()
    }
  }

  var body: some Scene {
    MenuBarExtra {
      PanelView(session: session, audio: audio, prefs: prefs, showConnectCard: { companion.previewCard() })
    } label: {
      MenuBarLabel(session: session)
    }
    .menuBarExtraStyle(.window)
  }
}

struct MenuBarLabel: View {
  let session: BudsSession

  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: "airpods.pro")
      if session.isConnected, let level = session.lowestBud {
        Text("\(level)%")
          .monospacedDigit()
          .contentTransition(.numericText())
      }
    }
    .foregroundStyle(isLow ? AnyShapeStyle(Color.red) : AnyShapeStyle(.primary))
    .opacity(session.isConnected ? 1 : 0.65)
    .accessibilityLabel(summary)
    .help(summary)
  }

  private var isLow: Bool {
    guard session.isConnected else { return false }
    return [Part.left, .right].contains { part in
      guard let level = session.battery[part], let percent = level.percent else { return false }
      return !level.charging && percent <= 15
    }
  }

  private var summary: String {
    guard session.isConnected else { return "OpenBuds · Not connected" }
    let name = session.profile.isKnown ? session.profile.displayName : "OpenBuds"
    var parts: [String] = [name]
    let levels = [
      session.battery[.left]?.percent.map { "L \($0)%" },
      session.battery[.right]?.percent.map { "R \($0)%" },
      session.battery[.chargingCase]?.percent.map { "Case \($0)%" },
    ].compactMap { $0 }
    if !levels.isEmpty {
      parts.append(levels.joined(separator: ", "))
    }
    if let mode = session.noise?.mode {
      parts.append(noiseLabel(mode))
    }
    return parts.count == 1 ? "\(name) · Connected" : parts.joined(separator: " · ")
  }

  private func noiseLabel(_ mode: NoiseMode) -> String {
    switch mode {
    case .anc: "Noise Cancel"
    case .smart: "Noise Cancel (Smart)"
    case .deep: "Noise Cancel (Deep)"
    case .medium: "Noise Cancel (Medium)"
    case .light: "Noise Cancel (Light)"
    case .adaptive: "Adaptive"
    case .transparency: "Transparency"
    case .off: "Off"
    }
  }
}
