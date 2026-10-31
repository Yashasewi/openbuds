import BudsKit
import Observation
import SwiftUI

struct SwitchRow: View {
  let session: BudsSession
  let item: Switch
  var description: String?
  var unavailable: String?

  var body: some View {
    if session.isOn(item) != nil {
      ToggleRow(
        title: item.title,
        subtitle: unavailable ?? description,
        isOn: Binding(get: { session.isOn(item) ?? false }, set: { on in Task { await session.setSwitch(item, on) } }),
        disabled: session.busy || (unavailable != nil && session.isOn(item) != true)
      )
      StatusLine(session: session, key: "switch-\(item.rawValue)")
    }
  }
}

/// A stepped slider that writes only when released.
struct StepSlider: View {
  let title: String
  let range: ClosedRange<Double>
  let value: Int?
  let format: (Int) -> String
  let commit: (Int) -> Void
  var disabled = false
  @State private var draft: Double?

  var body: some View {
    let shown = draft ?? Double(value ?? Int(range.lowerBound))
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
        Spacer()
        Text(format(Int(shown))).monospacedDigit().foregroundStyle(.secondary)
      }
      Slider(value: Binding(get: { shown }, set: { draft = $0.rounded() }), in: range) { editing in
        guard !editing, let picked = draft else { return }
        draft = nil
        if Int(picked) != value { commit(Int(picked)) }
      }
    }
    .padding(.vertical, 7)
    .disabled(disabled || value == nil)
  }
}

private func signedText(_ n: Int) -> String { n > 0 ? "+\(n)" : "\(n)" }

// MARK: Sound

struct SoundPage: View {
  let session: BudsSession
  let model: PanelModel

  var body: some View {
    SubPage(title: "Sound", model: model) {
      PanelSection(title: "Equalizer", padded: false) {
        ForEach(session.presets) { preset in
          PresetRow(session: session, preset: preset) {
            model.editingIsNew = false
            model.editing = preset
            model.open(.preset)
          }
        }
        if session.supports(0x0418) {
          let full = session.customPresets.count >= eqMaxCustom
          Button {
            model.editingIsNew = true
            model.editing = Preset(id: 0, name: "Custom \(session.customPresets.count + 1)",
              bands: eqBands.map { Band(frequency: $0, gain: 0) })
            model.open(.preset)
          } label: {
            Label(full ? "Up to \(eqMaxCustom) custom presets" : "New preset", systemImage: "plus")
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.horizontal, 10)
              .padding(.vertical, 9)
              .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .foregroundStyle(full ? Color.secondary : Color.accentColor)
          .disabled(session.busy || full)
        }
        Group {
          StatusLine(session: session, key: "eq")
          StatusLine(session: session, key: "preset")
        }
        .padding(.horizontal, 10)
      }
      PanelSection(title: "Enhancements") {
        SwitchRow(session: session, item: .bassWave, description: "Extra bass from the dynamic driver.")
        if session.isOn(.bassWave) == true, session.bass != nil {
          StepSlider(title: "Bass strength", range: -5...5, value: session.bass, format: signedText,
            commit: { level in Task { await session.setBass(level) } }, disabled: session.busy)
          StatusLine(session: session, key: "bass")
        }
        SwitchRow(session: session, item: .goldenSound,
          description: session.golden.map { "Your profile from \($0.name)." } ?? "Take the hearing test in Tools first.")
        SwitchRow(session: session, item: .spatial, description: "Spatial audio.")
        SwitchRow(session: session, item: .hiRes,
          unavailable: session.hiResAvailable ? nil
            : "Needs LHDC. This Mac uses \(session.codec.flatMap { codecNames[$0] } ?? "another codec").")
      }
    }
  }
}

struct PresetRow: View {
  let session: BudsSession
  let preset: Preset
  let edit: () -> Void
  @State private var hovering = false

  var body: some View {
    HStack(spacing: 8) {
      Button {
        if session.eq != preset.id { Task { await session.setEq(preset.id) } }
      } label: {
        HStack {
          VStack(alignment: .leading, spacing: 2) {
            Text(preset.name)
            if preset.isCustom {
              Text(preset.bands.map { signedText($0.gain) }.joined(separator: "  "))
                .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
          }
          Spacer()
          if session.eq == preset.id {
            Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(.tint)
          }
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .disabled(session.busy)
      if preset.isCustom {
        Button("Edit", systemImage: "slider.horizontal.3", action: edit)
          .labelStyle(.iconOnly)
          .buttonStyle(.borderless)
          .help("Edit \(preset.name)")
      }
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 8)
    .background(hovering ? AnyShapeStyle(.fill.tertiary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 12))
    .onHover { hovering = $0 }
  }
}

struct PresetPage: View {
  let session: BudsSession
  let model: PanelModel
  private let preset: Preset
  private let isNew: Bool
  @State private var name: String
  @State private var gains: [Int]

  init(session: BudsSession, model: PanelModel) {
    self.session = session
    self.model = model
    let preset = model.editing ?? Preset(id: 0, name: "Custom", bands: eqBands.map { Band(frequency: $0, gain: 0) })
    self.preset = preset
    isNew = model.editingIsNew
    _name = State(initialValue: preset.name)
    _gains = State(initialValue: preset.bands.map(\.gain))
  }

  var body: some View {
    SubPage(title: isNew ? "New preset" : preset.name, model: model) {
      PanelSection(title: "Name") {
        TextField("Name", text: Binding(get: { name }, set: { name = String($0.prefix(16)) }))
          .textFieldStyle(.plain)
          .padding(.vertical, 8)
      }
      if !validPresetName(name) {
        Text("Use 1 to 16 plain letters, numbers or spaces.").font(.caption).foregroundStyle(.orange).padding(.leading, 8)
      }
      PanelSection(title: "Bands") {
        HStack(alignment: .bottom, spacing: 0) {
          ForEach(Array(preset.bands.enumerated()), id: \.offset) { index, band in
            VStack(spacing: 8) {
              Text(signedText(gains[index])).font(.caption.monospacedDigit())
              Slider(value: Binding(get: { Double(gains[index]) }, set: { gains[index] = Int($0.rounded()) }),
                in: Double(-eqGain)...Double(eqGain))
                .rotationEffect(.degrees(-90))
                .frame(width: 140, height: 24)
                .frame(width: 32, height: 140)
              Text(band.frequency >= 1000 ? "\(band.frequency / 1000)k" : "\(band.frequency)")
                .font(.caption2).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
          }
        }
        .padding(.vertical, 10)
      }
      HStack {
        if !isNew {
          Button("Delete", role: .destructive) {
            model.back()
            Task { await session.deletePreset(preset) }
          }
          .buttonStyle(.glass)
        }
        Button("Flat") { gains = gains.map { _ in 0 } }.buttonStyle(.glass)
        Spacer()
        Button(isNew ? "Create" : "Save") {
          let edited = Preset(id: preset.id, name: name,
            bands: zip(preset.bands, gains).map { Band(frequency: $0.frequency, gain: $1) })
          model.back()
          Task { await session.savePreset(edited, isNew: isNew) }
        }
        .buttonStyle(.glassProminent)
        .keyboardShortcut(.defaultAction)
        .disabled(!validPresetName(name) || session.busy)
      }
    }
  }
}

// MARK: Controls

struct ControlsPage: View {
  let session: BudsSession
  let model: PanelModel
  @State private var ear: Ear = .left

  var body: some View {
    SubPage(title: "Controls", model: model) {
      GlassTabs(selection: $ear, options: Ear.allCases) { $0.title }
      let actions = Gestures.order.filter { slot(ear, $0) != nil }
      PanelSection {
        if actions.isEmpty {
          Text("No controls reported.").foregroundStyle(.secondary).padding(.vertical, 7)
        }
        ForEach(actions, id: \.self) { action in gestureRow(ear, action) }
      }
      .id(ear)
      .transition(.opacity)
      .animation(.snappy(duration: 0.15), value: ear)
      let calls = Gestures.callMenus.keys.sorted().filter { action in
        session.gestures.contains { $0.button == 6 && $0.action == action }
      }
      if !calls.isEmpty {
        PanelSection(title: "During calls") {
          ForEach(calls, id: \.self) { action in
            let current = session.gestures.first { $0.button == 6 && $0.action == action }?.function
            menuRow(action, call: true, menu: Gestures.callMenus[action] ?? [], current: current) { fn in
              Task { await session.setCallGesture(action: action, function: fn) }
            }
            StatusLine(session: session, key: "call-\(action)")
          }
        }
      }
    }
  }

  private func slot(_ ear: Ear, _ action: UInt8) -> GestureSlot? {
    session.gestures.first { $0.device == ear.rawValue && $0.action == action && $0.button != 6 }
  }

  @ViewBuilder
  private func gestureRow(_ ear: Ear, _ action: UInt8) -> some View {
    let current = slot(ear, action)?.function
    menuRow(action, call: false, menu: Gestures.menus[action] ?? [], current: current) { fn in
      Task { await session.setGesture(ear, action: action, function: fn) }
    }
    StatusLine(session: session, key: "gesture-\(ear.rawValue)-\(action)")
    if action == 4, current == 8, let modes = session.holdCycle {
      HoldCycleRow(session: session, modes: modes)
    }
  }

  private func menuRow(_ action: UInt8, call: Bool, menu: [UInt8], current: UInt8?, set: @escaping @Sendable (UInt8) -> Void) -> some View {
    let options = current.map { menu.contains($0) ? menu : [$0] + menu } ?? menu
    return HStack(spacing: 10) {
      Image(systemName: GestureIcons.action(action, call: call))
        .foregroundStyle(.secondary)
        .frame(width: 18)
      Text(Gestures.actions[action] ?? "Action \(action)")
      Spacer(minLength: 8)
      Menu {
        Picker(Gestures.actions[action] ?? "", selection: Binding(get: { current ?? 0 }, set: set)) {
          ForEach(options, id: \.self) { fn in
            Label(Gestures.functions[fn] ?? "Function \(fn)", systemImage: GestureIcons.function(fn)).tag(fn)
          }
        }
        .pickerStyle(.inline)
        .labelsHidden()
      } label: {
        HStack(spacing: 4) {
          Text(current.flatMap { Gestures.functions[$0] } ?? "Unknown")
          Image(systemName: "chevron.up.chevron.down").font(.caption2.weight(.semibold))
        }
        .foregroundStyle(.secondary)
      }
      .menuStyle(.button)
      .buttonStyle(.plain)
      .menuIndicator(.hidden)
      .fixedSize()
      .disabled(session.busy)
    }
    .padding(.vertical, 8)
  }
}

enum GestureIcons {
  static func action(_ action: UInt8, call: Bool) -> String {
    if call { return action == 6 ? "phone.down" : "phone" }
    return switch action {
    case 1: "hand.tap"
    case 2: "2.circle"
    case 3: "3.circle"
    case 4: "hand.point.up.left"
    case 5: "arrow.up.and.down"
    default: "hand.point.up.left.fill"
    }
  }

  static func function(_ fn: UInt8) -> String {
    switch fn {
    case 0: "nosign"
    case 1: "playpause"
    case 3: "mic"
    case 5: "backward"
    case 6: "forward"
    case 7: "speaker.wave.2"
    case 8: "circle.lefthalf.filled"
    case 10: "forward.end.alt"
    case 11: "speaker.plus"
    case 12: "speaker.minus"
    case 13: "arrow.left.arrow.right"
    case 17: "gamecontroller"
    case 28: "phone.down"
    case 29: "phone"
    default: "questionmark"
    }
  }
}

/// A full-width segmented switch in Liquid Glass.
struct GlassTabs<Value: Hashable>: View {
  @Binding var selection: Value
  let options: [Value]
  var compact = false
  let title: (Value) -> String

  var body: some View {
    GlassEffectContainer(spacing: 4) {
      HStack(spacing: 4) {
        ForEach(options, id: \.self) { option in
          let selected = option == selection
          Button {
            withAnimation(.snappy(duration: 0.18)) { selection = option }
          } label: {
            Text(title(option))
              .font(compact ? .caption : nil)
              .fontWeight(selected ? .semibold : .regular)
              .frame(maxWidth: .infinity)
              .padding(.vertical, compact ? 4 : 6)
              .foregroundStyle(selected ? Color.white : Color.primary)
              .glassEffect(selected ? .regular.tint(.accentColor).interactive() : .regular.interactive(), in: .capsule)
              .contentShape(.capsule)
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}

struct HoldCycleRow: View {
  let session: BudsSession
  let modes: Set<HoldMode>

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Modes to cycle through, on both earbuds").font(.caption).foregroundStyle(.secondary)
      GlassEffectContainer(spacing: 8) {
        HStack(alignment: .top, spacing: 2) {
          ForEach(HoldMode.allCases, id: \.self) { mode in
            let on = modes.contains(mode)
            Button {
              Task { await session.setHoldCycle(on ? modes.subtracting([mode]) : modes.union([mode])) }
            } label: {
              VStack(spacing: 5) {
                Image(systemName: icon(mode))
                  .font(.system(size: 12, weight: .medium))
                  .frame(width: 30, height: 30)
                  .foregroundStyle(on ? Color.white : Color.primary)
                  .glassEffect(on ? .regular.tint(.accentColor).interactive() : .regular.interactive(), in: .circle)
                Text(mode == .anc ? "Noise Cancel" : mode.title)
                  .font(.caption2)
                  .foregroundStyle(on ? .primary : .secondary)
                  .lineLimit(1)
                  .minimumScaleFactor(0.85)
              }
              .frame(maxWidth: .infinity)
              .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(session.busy || (on && modes.count == 1))
            .accessibilityAddTraits(on ? .isSelected : [])
          }
        }
      }
      StatusLine(session: session, key: "holdCycle")
    }
    .padding(.bottom, 8)
  }

  private func icon(_ mode: HoldMode) -> String {
    switch mode {
    case .off: "circle.slash"
    case .anc: "person.and.background.dotted"
    case .transparency: "ear.and.waveform"
    case .adaptive: "sparkles"
    }
  }
}

// MARK: Features

struct FeaturesPage: View {
  let session: BudsSession
  let model: PanelModel
  let prefs: AppPrefs

  var body: some View {
    SubPage(title: "Features", model: model) {
      PanelSection(title: "Listening") {
        SwitchRow(session: session, item: .wearDetection, description: "Pause when you take an earbud out.")
        SwitchRow(session: session, item: .smartVolume, description: "Adjust volume to the noise around you.")
        SwitchRow(session: session, item: .gameMode, description: "Lower latency for games and video.")
        if session.promptVolume != nil {
          StepSlider(title: "Prompt volume", range: 1...10, value: session.promptVolume, format: { "\($0)" },
            commit: { level in Task { await session.setPromptVolume(level) } }, disabled: session.busy)
          StatusLine(session: session, key: "promptVolume")
        }
      }
      PanelSection(title: "Connections") {
        SwitchRow(session: session, item: .dualConnection, description: "Stay connected to two devices.")
        ForEach(session.devices ?? []) { device in
          HStack(spacing: 10) {
            Image(systemName: device.thisDevice ? "laptopcomputer" : "iphone")
              .foregroundStyle(device.connected ? .primary : .tertiary)
              .frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
              Text(device.name.isEmpty ? "Unnamed device" : device.name).lineLimit(1)
              Text(deviceState(device)).font(.caption).foregroundStyle(.secondary)
            }
          }
          .padding(.vertical, 8)
        }
      }
      PanelSection(title: "This Mac") {
        ToggleRow(title: "Open at login", isOn: Binding(get: { prefs.openAtLogin }, set: { prefs.setOpenAtLogin($0) }))
        if let error = prefs.loginError {
          Text(error).font(.caption).foregroundStyle(.orange).padding(.bottom, 7)
        }
        ToggleRow(title: "Low battery alerts", subtitle: "Notify at 20% and 10%.",
          isOn: Binding(get: { prefs.batteryAlerts }, set: { prefs.batteryAlerts = $0 }))
        ToggleRow(title: "Show card on connect", isOn: Binding(get: { prefs.connectCard }, set: { prefs.connectCard = $0 }))
      }
    }
  }

  private func deviceState(_ device: HostDevice) -> String {
    var parts = [device.connected ? "Connected" : "Not connected"]
    if device.thisDevice { parts.append("this Mac") }
    if device.playing { parts.append("playing") }
    return parts.joined(separator: ", ")
  }
}

// MARK: Tools

struct ToolsPage: View {
  let session: BudsSession
  let model: PanelModel
  @State private var confirming: String?

  var body: some View {
    SubPage(title: "Tools", model: model) {
      PanelSection {
        if session.supports(0x0400) {
          toolRow(icon: "dot.radiowaves.left.and.right", color: .red, title: "Find earbuds", description: "Ring both earbuds.") {
            Button(model.ringing ? "Stop" : "Ring") {
              if model.ringing {
                Task { if await session.findEarbuds(false) { model.ringing = false } }
              } else {
                confirming = "find"
              }
            }
            .disabled(session.busy || confirming == "find")
          }
          if confirming == "find" {
            confirm("They will play a loud sound. Take them out of your ears first.", action: "Ring") {
              Task { if await session.findEarbuds(true) { model.ringing = true } }
            }
          }
          StatusLine(session: session, key: "find")
        }
        if session.supports(0x0405) {
          Divider()
          toolRow(icon: "ear", color: .teal, title: "Fit test", description: fitText) {
            Button("Check") { confirming = "fit" }.disabled(session.busy || confirming == "fit")
          }
          if confirming == "fit" {
            confirm("Wear both earbuds. A short sound plays for about 10 seconds.", action: "Start") {
              Task { await session.fitTest() }
            }
          }
          StatusLine(session: session, key: "fit")
        }
        if session.supports(0x040D) {
          Divider()
          toolRow(icon: "waveform.path.ecg", color: .yellow, title: "Hearing test",
            description: "Make a Golden Sound profile.") {
            Button("Start") { model.open(.hearing) }.disabled(session.busy)
          }
          StatusLine(session: session, key: "hearing")
        }
      }
    }
    .animation(.smooth, value: confirming)
  }

  private var fitText: String {
    guard let fit = session.fit else { return "Check the ear tip seal." }
    return "Left: \(fit.left ?? "not measured"). Right: \(fit.right ?? "not measured")."
  }

  private func toolRow(icon: String, color: Color, title: String, description: String, @ViewBuilder control: () -> some View) -> some View {
    HStack(spacing: 10) {
      IconBadge(icon: icon, color: color)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
        Text(description).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      control().buttonStyle(.glass).controlSize(.small)
    }
    .padding(.vertical, 9)
  }

  private func confirm(_ text: String, action: String, run: @escaping () -> Void) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(text).font(.callout).fixedSize(horizontal: false, vertical: true)
      HStack {
        Spacer()
        Button("Cancel") { confirming = nil }.buttonStyle(.glass)
        Button(action) {
          confirming = nil
          run()
        }
        .buttonStyle(.glassProminent)
        .keyboardShortcut(.defaultAction)
      }
    }
    .padding(.bottom, 9)
    .transition(.opacity.combined(with: .move(edge: .top)))
  }
}

// MARK: Hearing test

struct HearingPage: View {
  let session: BudsSession
  let model: PanelModel
  @State private var step = -1
  @State private var levels = Array(repeating: hearingStart, count: 12)
  @State private var starting = false
  @State private var note: String?
  @State private var warned = false
  @State private var active = false
  @State private var pendingTone: Task<Void, Never>?

  var body: some View {
    SubPage(title: "Hearing test", model: model, onBack: { Task { await end() } }) {
      PanelSection {
        if step < 0 {
          VStack(alignment: .leading, spacing: 8) {
            Text("Sit somewhere quiet and wear both earbuds. For each tone, move the slider until you can only just hear it.")
              .fixedSize(horizontal: false, vertical: true)
            Text("Your earbuds keep one profile. Finishing replaces the current one.")
              .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
          }
          .padding(.vertical, 10)
        } else {
          VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
              Text("\(step < 6 ? "Left ear" : "Right ear"), \(hearingFrequencies[step % 6])").font(.headline)
              Spacer()
              Text("\(step + 1) of 12").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            HStack(spacing: 3) {
              ForEach(0..<12, id: \.self) { i in
                Capsule()
                  .fill(i < step ? AnyShapeStyle(.tint.secondary) : i == step ? AnyShapeStyle(.tint) : AnyShapeStyle(.fill.tertiary))
                  .frame(height: 4)
                  .padding(.leading, i == 6 ? 6 : 0)
              }
            }
            Slider(value: Binding(get: { Double(levels[step]) }, set: { slide(to: $0) }),
              in: 0...Double(hearingStops.count - 1)) {
              Text("Tone level")
            } minimumValueLabel: {
              Image(systemName: "speaker.fill")
            } maximumValueLabel: {
              Image(systemName: "speaker.wave.3.fill")
            }
            .labelsHidden()
            .foregroundStyle(.secondary)
          }
          .padding(.vertical, 10)
        }
      }
      if let text = session.hearingNote ?? note {
        Text(text).font(.caption).foregroundStyle(.orange).fixedSize(horizontal: false, vertical: true).padding(.leading, 8)
      }
      HStack {
        if step > 0 { Button("Back") { go(step - 1) }.buttonStyle(.glass) }
        Spacer()
        Group {
          if step < 0 {
            Button(starting ? "Starting…" : "Start") { start() }.disabled(starting)
          } else if step < 11 {
            Button("Next") { go(step + 1) }
          } else {
            Button("Finish and apply") { finish() }
          }
        }
        .buttonStyle(.glassProminent)
        .keyboardShortcut(.defaultAction)
      }
    }
    .onChange(of: session.isConnected) { _, connected in if !connected { active = false } }
  }

  private func slide(to value: Double) {
    let index = Int(value.rounded())
    guard index != levels[step] else { return }
    levels[step] = index
    let at = step
    pendingTone?.cancel()
    pendingTone = Task {
      try? await Task.sleep(for: .milliseconds(300))
      if !Task.isCancelled { play(at) }
    }
  }

  private func play(_ at: Int) {
    let level = levels[at]
    if level >= hearingLoud, !warned {
      warned = true
      note = "This level is loud. Lower it if it is uncomfortable."
    }
    Task { await session.playTone(step: at, level: level) }
  }

  private func start() {
    starting = true
    Task {
      do {
        try await session.startHearingTest()
        active = true
        note = nil
        step = 0
        play(0)
      } catch {
        note = error.localizedDescription
      }
      starting = false
    }
  }

  private func go(_ next: Int) {
    step = next
    play(next)
  }

  private func end() async {
    pendingTone?.cancel()
    if active { await session.endHearingTest() }
    active = false
  }

  private func finish() {
    let picked = levels
    model.back()
    Task {
      await end()
      await session.applyHearing(levels: picked)
    }
  }
}
