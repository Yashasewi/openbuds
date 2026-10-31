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
    let companion = Companion(session: session, prefs: prefs)
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
      PanelView(session: session, audio: audio, prefs: prefs)
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
        Text("\(level)%").monospacedDigit()
      }
    }
    .accessibilityLabel(session.isConnected ? "OpenBuds, \(session.lowestBud.map { "\($0)%" } ?? "connected")" : "OpenBuds, not connected")
  }
}
