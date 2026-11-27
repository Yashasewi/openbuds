import AppKit
import BudsKit
import Observation
import SwiftUI

struct SwitchRow: View {
  let session: BudsSession
  let item: Switch
  var description: String?
  var unavailable: String?
  var confirmOff: (message: String, action: String)?
  @State private var confirmingOff = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if let current = session.isOn(item) {
      // Readable but not writable for this model (e.g. dual connection on Buds 3): shown, never sent.
      let readOnly = !session.profile.switchesWritable.contains(item.rawValue)
      VStack(alignment: .leading, spacing: 0) {
        ToggleRow(
          title: item.title,
          subtitle: unavailable ?? (readOnly ? [description, "Change it from your phone."].compactMap { $0 }.joined(separator: " ") : description),
          isOn: Binding(
            get: { current },
            set: { on in
              if !on, current, confirmOff != nil {
                confirmingOff = true
              } else {
                confirmingOff = false
                Task { await session.setSwitch(item, on) }
              }
            }
          ),
          disabled: session.busy || readOnly || confirmingOff || (unavailable != nil && !current)
        )
        if confirmingOff, let prompt = confirmOff {
          InlineConfirmStrip(
            message: prompt.message,
            actionTitle: prompt.action,
            destructive: true,
            confirmDisabled: session.busy,
            cancel: { confirmingOff = false },
            confirm: {
              Task {
                if await session.setSwitch(item, false) {
                  confirmingOff = false
                }
              }
            }
          )
          .padding(.bottom, 8)
        }
        StatusLine(session: session, key: "switch-\(item.rawValue)")
      }
      .animation(reduceMotion ? nil : .smooth, value: confirmingOff)
      .onChange(of: current) { _, on in if !on { confirmingOff = false } }
    }
  }
}

/// Inline confirmation banner used before destructive or disconnecting actions.
struct InlineConfirmStrip: View {
  let message: String
  let actionTitle: String
  var destructive = false
  var confirmDisabled = false
  let cancel: () -> Void
  let confirm: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(message)
        .font(.caption)
        .fixedSize(horizontal: false, vertical: true)
      HStack(spacing: 8) {
        Spacer()
        Button("Cancel", action: cancel)
          .buttonStyle(PanelButtonStyle(variant: .secondary))
        Button(actionTitle, role: destructive ? .destructive : nil, action: confirm)
          .buttonStyle(PanelButtonStyle(variant: .prominent(destructive ? .red : .accentColor)))
          .disabled(confirmDisabled)
      }
    }
    .padding(10)
    .background(
      (destructive ? Color.red : Color.orange).opacity(0.12),
      in: .rect(cornerRadius: 10)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 10)
        .strokeBorder((destructive ? Color.red : Color.orange).opacity(0.28), lineWidth: 1)
    )
    .transition(.opacity)
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
    .padding(.vertical, 6)
    .disabled(disabled || value == nil)
  }
}

private func signedText(_ n: Int) -> String { n > 0 ? "+\(n)" : "\(n)" }

/// Smooth EQ response curve with a 0 dB centerline and translucent fill to baseline.
struct EQCurveView: View {
  let gains: [Int]
  var maxGain: Int = eqGain
  var dashedCenter = false
  var lineWidth: CGFloat = 2.0
  var color: Color = .accentColor
  var alignToBandCenters = false
  var showDots = false
  var autoScale = false

  var body: some View {
    GeometryReader { geo in
      let w = geo.size.width
      let h = geo.size.height
      let midY = h / 2
      let padX: CGFloat = alignToBandCenters ? 0 : 2
      let padY: CGFloat = showDots ? 4 : 2
      let usableW = max(1, w - padX * 2)
      let usableH = max(1, midY - padY)
      let count = gains.count
      let peak = gains.map { abs($0) }.max() ?? 0
      let scaleMax: CGFloat = autoScale
        ? CGFloat(max(3, min(maxGain, peak + 1)))
        : CGFloat(max(1, maxGain))

      let points: [CGPoint] = gains.enumerated().map { index, gain in
        let clamped = max(-maxGain, min(maxGain, gain))
        let x: CGFloat = if alignToBandCenters, count > 0 {
          (CGFloat(index) + 0.5) / CGFloat(count) * w
        } else if count > 1 {
          padX + (CGFloat(index) / CGFloat(count - 1)) * usableW
        } else {
          w / 2
        }
        let y = midY - (CGFloat(clamped) / scaleMax) * usableH
        return CGPoint(x: x, y: max(padY, min(h - padY, y)))
      }

      ZStack {
        Path { path in
          path.move(to: CGPoint(x: padX, y: midY))
          path.addLine(to: CGPoint(x: w - padX, y: midY))
        }
        .stroke(
          Color.primary.opacity(0.18),
          style: StrokeStyle(lineWidth: 1, dash: dashedCenter ? [3, 3] : [])
        )

        if points.count >= 2 {
          let curve = smoothPath(points: points, minY: padY, maxY: h - padY)

          Path { fillPath in
            fillPath.addPath(curve)
            if let last = points.last, let first = points.first {
              fillPath.addLine(to: CGPoint(x: last.x, y: midY))
              fillPath.addLine(to: CGPoint(x: first.x, y: midY))
              fillPath.closeSubpath()
            }
          }
          .fill(
            LinearGradient(
              colors: [color.opacity(0.24), color.opacity(0.04), color.opacity(0.24)],
              startPoint: .top,
              endPoint: .bottom
            )
          )

          curve
            .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
        } else if let only = points.first {
          Path { path in
            path.move(to: CGPoint(x: padX, y: only.y))
            path.addLine(to: CGPoint(x: w - padX, y: only.y))
          }
          .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        }

        if showDots {
          ForEach(Array(points.enumerated()), id: \.offset) { _, pt in
            Circle()
              .fill(color)
              .frame(width: 5.5, height: 5.5)
              .position(pt)
          }
        }
      }
      .frame(width: w, height: h)
    }
    .accessibilityHidden(true)
  }

  private func smoothPath(points: [CGPoint], minY: CGFloat, maxY: CGFloat) -> Path {
    Path { path in
      guard let first = points.first else { return }
      path.move(to: first)
      guard points.count >= 2 else { return }
      if points.count == 2 {
        path.addLine(to: points[1])
        return
      }
      for i in 0..<(points.count - 1) {
        let p0 = i > 0 ? points[i - 1] : points[0]
        let p1 = points[i]
        let p2 = points[i + 1]
        let p3 = i + 2 < points.count ? points[i + 2] : points[points.count - 1]
        let cp1 = CGPoint(
          x: p1.x + (p2.x - p0.x) / 6,
          y: max(minY, min(maxY, p1.y + (p2.y - p0.y) / 6))
        )
        let cp2 = CGPoint(
          x: p2.x - (p3.x - p1.x) / 6,
          y: max(minY, min(maxY, p2.y - (p3.y - p1.y) / 6))
        )
        path.addCurve(to: p2, control1: cp1, control2: cp2)
      }
    }
  }
}

// MARK: Sound

struct SoundPage: View {
  let session: BudsSession
  let model: PanelModel

  var body: some View {
    SubPage(title: "Sound", model: model) {
      PanelSection(title: "Equalizer", padded: false) {
        ForEach(Array(session.presets.enumerated()), id: \.element.id) { index, preset in
          if index > 0 {
            Divider().padding(.horizontal, 10)
          }
          PresetRow(session: session, preset: preset) {
            model.editingIsNew = false
            model.editing = preset
            model.open(.preset)
          }
        }
        if session.supports(0x0418) {
          if !session.presets.isEmpty {
            Divider().padding(.horizontal, 10)
          }
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
      // None of these exist on Buds 3; skip the section rather than show an empty box.
      let hasBass = session.isOn(.bassWave) != nil
      let hasGolden = session.isOn(.goldenSound) != nil
      let hasSpatial = session.isOn(.spatial) != nil
      let hasHiRes = session.isOn(.hiRes) != nil
      if hasBass || hasGolden || hasSpatial || hasHiRes {
        PanelSection(title: "Enhancements") {
          if hasBass {
            SwitchRow(session: session, item: .bassWave, description: "Extra bass from the dynamic driver.")
            if session.isOn(.bassWave) == true, session.bass != nil {
              StepSlider(title: "Bass strength", range: -5...5, value: session.bass, format: signedText,
                commit: { level in Task { await session.setBass(level) } }, disabled: session.busy)
              StatusLine(session: session, key: "bass")
            }
          }
          if hasGolden {
            if hasBass { Divider() }
            goldenSoundRow
          }
          if hasSpatial {
            if hasBass || hasGolden { Divider() }
            SwitchRow(session: session, item: .spatial, description: "Spatial sound. Can't be on together with Hi-Res audio.")
          }
          if hasHiRes {
            if hasBass || hasGolden || hasSpatial { Divider() }
            SwitchRow(session: session, item: .hiRes,
              unavailable: session.hiResAvailable ? nil
                : "Needs LHDC. This Mac uses \(session.codec.flatMap { codecNames[$0] } ?? "another codec").")
          }
        }
      }
    }
  }

  @ViewBuilder
  private var goldenSoundRow: some View {
    if let current = session.isOn(.goldenSound) {
      let readOnly = !session.profile.switchesWritable.contains(Switch.goldenSound.rawValue)
      if let golden = session.golden {
        VStack(alignment: .leading, spacing: 0) {
          HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
              Text(Switch.goldenSound.title)
              Text(readOnly ? "Your profile from \(golden.name). Change it from your phone." : "Your profile from \(golden.name).")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            Button("Profile ›") { model.open(.hearing) }
              .buttonStyle(PanelButtonStyle(variant: .tinted(), size: .mini))
              .disabled(session.busy)
            Toggle(
              Switch.goldenSound.title,
              isOn: Binding(get: { current }, set: { on in Task { await session.setSwitch(.goldenSound, on) } })
            )
            .labelsHidden()
            .toggleStyle(.switch)
            .controlSize(.mini)
            .disabled(session.busy || readOnly)
          }
          .padding(.vertical, 7)
          StatusLine(session: session, key: "switch-\(Switch.goldenSound.rawValue)")
        }
      } else if session.supports(0x040D), !current {
        HStack(spacing: 10) {
          VStack(alignment: .leading, spacing: 2) {
            Text(Switch.goldenSound.title)
            Text("No hearing profile yet.")
              .font(.caption)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
          Spacer(minLength: 8)
          Button("Start test ›") { model.open(.hearing) }
            .buttonStyle(PanelButtonStyle(variant: .prominent()))
            .disabled(session.busy)
        }
        .padding(.vertical, 7)
      } else {
        SwitchRow(
          session: session,
          item: .goldenSound,
          description: session.supports(0x040D)
            ? "No hearing profile yet."
            : "These earbuds don’t offer a hearing test."
        )
        if session.supports(0x040D) {
          HStack {
            Spacer()
            Button("Start test ›") { model.open(.hearing) }
              .buttonStyle(PanelButtonStyle(variant: .tinted(), size: .mini))
              .disabled(session.busy)
          }
          .padding(.bottom, 7)
        }
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
    let selected = session.eq == preset.id
    HStack(spacing: 8) {
      Button {
        if !selected { Task { await session.setEq(preset.id) } }
      } label: {
        HStack(spacing: 8) {
          Text(preset.name)
            .lineLimit(1)
            .truncationMode(.tail)
          Spacer(minLength: 4)
          if preset.isCustom {
            EQCurveView(
              gains: preset.bands.map(\.gain),
              lineWidth: 2.0,
              color: selected ? .accentColor : .accentColor.opacity(0.85),
              autoScale: true
            )
            .frame(width: 78, height: 22)
          }
          if selected {
            Image(systemName: "checkmark").fontWeight(.semibold).foregroundStyle(.tint)
          }
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .disabled(session.busy)
      .accessibilityValue(preset.isCustom ? gainSummary : "")
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

  private var gainSummary: String {
    preset.bands.map { $0.gain > 0 ? "+\($0.gain)" : "\($0.gain)" }.joined(separator: ", ")
  }
}

private struct StarterEQ: Identifiable {
  let name: String
  let gains: [Int]
  var id: String { name }
}

private let starterEQs: [StarterEQ] = [
  StarterEQ(name: "Flat", gains: [0, 0, 0, 0, 0, 0]),
  StarterEQ(name: "Vocal", gains: [2, 1, 0, 3, 2, -1]),
  StarterEQ(name: "Podcast", gains: [-2, 0, 3, 3, 1, -2]),
  StarterEQ(name: "Warm", gains: [3, 2, 0, -1, -1, -2]),
]

struct PresetPage: View {
  let session: BudsSession
  let model: PanelModel
  private let preset: Preset
  private let isNew: Bool
  @State private var name: String
  @State private var gains: [Int]
  @State private var confirmingDelete = false
  @State private var clipboardNote: (text: String, isError: Bool)?
  @State private var clipboardTask: Task<Void, Never>?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
        VStack(alignment: .leading, spacing: 8) {
          HStack(spacing: 6) {
            Text("Starters")
              .font(.caption2.weight(.semibold))
              .foregroundStyle(.secondary)
            Spacer(minLength: 4)
            if let note = clipboardNote {
              Text(note.text)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(note.isError ? .orange : .green)
                .transition(.opacity)
            }
            Button("Copy EQ") { copyEQ() }
              .buttonStyle(PanelButtonStyle(variant: .tinted(), size: .mini))
            Button("Paste EQ") { pasteEQ() }
              .buttonStyle(PanelButtonStyle(variant: .tinted(), size: .mini))
          }
          HStack(spacing: 5) {
            ForEach(starterEQs) { starter in
              let active = gains == starter.gains
              Button {
                if gains.count == starter.gains.count {
                  if reduceMotion {
                    gains = starter.gains
                  } else {
                    withAnimation(.snappy(duration: 0.16)) { gains = starter.gains }
                  }
                }
              } label: {
                Text(starter.name)
                  .font(.caption2.weight(active ? .semibold : .medium))
                  .frame(maxWidth: .infinity)
                  .padding(.vertical, 5)
                  .foregroundStyle(active ? Color.accentColor : Color.secondary)
                  .background(
                    active ? AnyShapeStyle(Color.accentColor.opacity(0.18)) : AnyShapeStyle(.fill.tertiary),
                    in: .capsule
                  )
                  .overlay(
                    Capsule()
                      .strokeBorder(active ? Color.accentColor.opacity(0.5) : Color.primary.opacity(0.08), lineWidth: 1)
                  )
                  .contentShape(.capsule)
              }
              .buttonStyle(.plain)
            }
          }
          EQCurveView(
            gains: gains,
            dashedCenter: true,
            lineWidth: 2.4,
            color: .accentColor,
            alignToBandCenters: true,
            showDots: true
          )
          .frame(height: 54)
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
        }
        .padding(.vertical, 10)
      }
      if confirmingDelete {
        InlineConfirmStrip(
          message: "Delete \(preset.name) from the earbuds?",
          actionTitle: "Delete",
          destructive: true,
          cancel: { confirmingDelete = false },
          confirm: {
            confirmingDelete = false
            model.back()
            Task { await session.deletePreset(preset) }
          }
        )
      }
      HStack {
        if !isNew {
          Button("Delete", role: .destructive) {
            confirmingDelete = true
          }
          .buttonStyle(PanelButtonStyle(variant: .destructive))
          .disabled(confirmingDelete || session.busy)
        }
        Spacer()
        saveButton
      }
    }
    .animation(reduceMotion ? nil : .smooth, value: confirmingDelete)
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: clipboardNote?.text)
    .onDisappear { clipboardTask?.cancel() }
  }

  @ViewBuilder
  private var saveButton: some View {
    let btn = Button(isNew ? "Create" : "Save") {
      let edited = Preset(id: preset.id, name: name,
        bands: zip(preset.bands, gains).map { Band(frequency: $0.frequency, gain: $1) })
      model.back()
      Task { await session.savePreset(edited, isNew: isNew) }
    }
    .buttonStyle(PanelButtonStyle(variant: .prominent()))
    .disabled(!validPresetName(name) || session.busy || confirmingDelete)

    if confirmingDelete {
      btn
    } else {
      btn.keyboardShortcut(.defaultAction)
    }
  }

  private func copyEQ() {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let label = trimmed.isEmpty ? "Custom" : trimmed
    let values = gains.map(signedText).joined(separator: " ")
    let text = "OpenBuds EQ · \(label): \(values)"
    NSPasteboard.general.clearContents()
    if NSPasteboard.general.setString(text, forType: .string) {
      flashClipboard("Copied", isError: false)
    } else {
      flashClipboard("Copy failed", isError: true)
    }
  }

  private func pasteEQ() {
    guard let text = NSPasteboard.general.string(forType: .string),
      let parsed = Self.parseEQGains(text, count: gains.count)
    else {
      flashClipboard("No \(gains.count)-band EQ", isError: true)
      return
    }
    if reduceMotion {
      gains = parsed
    } else {
      withAnimation(.snappy(duration: 0.16)) { gains = parsed }
    }
    flashClipboard("Pasted", isError: false)
  }

  private func flashClipboard(_ text: String, isError: Bool) {
    clipboardTask?.cancel()
    clipboardNote = (text, isError)
    clipboardTask = Task {
      try? await Task.sleep(for: .seconds(1.8))
      guard !Task.isCancelled else { return }
      clipboardNote = nil
    }
  }

  private static func parseEQGains(_ text: String, count: Int) -> [Int]? {
    let candidate: Substring
    if let colon = text.lastIndex(of: ":") {
      candidate = text[text.index(after: colon)...]
    } else {
      candidate = text[...]
    }
    let separators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ",;|"))
    let tokens = candidate.components(separatedBy: separators).filter { !$0.isEmpty }
    guard tokens.count == count else { return nil }
    var values: [Int] = []
    values.reserveCapacity(count)
    for token in tokens {
      guard token.range(of: #"^[+-]?\d+$"#, options: .regularExpression) != nil,
        let value = Int(token)
      else { return nil }
      values.append(max(-eqGain, min(eqGain, value)))
    }
    return values
  }
}

// MARK: Controls

struct ControlsPage: View {
  let session: BudsSession
  let model: PanelModel
  @State private var ear: Ear = .left
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    SubPage(title: "Controls", model: model) {
      GlassTabs(selection: $ear, options: Ear.allCases) { $0.title }
      let actions = Gestures.order.filter { slot(ear, $0) != nil }
      PanelSection {
        if actions.isEmpty {
          Text("No controls reported.").foregroundStyle(.secondary).padding(.vertical, 7)
        }
        ForEach(Array(actions.enumerated()), id: \.element) { index, action in
          if index > 0 { Divider() }
          gestureRow(ear, action)
        }
      }
      .id(ear)
      .transition(.opacity)
      .animation(reduceMotion ? nil : .snappy(duration: 0.15), value: ear)
      let calls = session.profile.callMenus.keys.sorted().filter { action in
        session.gestures.contains { $0.button == 6 && $0.action == action }
      }
      if !calls.isEmpty {
        PanelSection(title: "During calls") {
          ForEach(Array(calls.enumerated()), id: \.element) { index, action in
            if index > 0 { Divider() }
            let current = session.gestures.first { $0.button == 6 && $0.action == action }?.function
            menuRow(action, call: true, otherEarHint: nil, menu: session.profile.callMenus[action] ?? [], current: current) { fn in
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

  private func shortFunctionName(_ fn: UInt8) -> String {
    switch fn {
    case 1: "Play / pause"
    case 3: "Assistant"
    case 5: "Prev track"
    case 8: "Cycle modes"
    case 29: "Answer / end"
    default: Gestures.functions[fn] ?? "Unknown"
    }
  }

  @ViewBuilder
  private func gestureRow(_ ear: Ear, _ action: UInt8) -> some View {
    let current = slot(ear, action)?.function
    let otherEar: Ear = ear == .left ? .right : .left
    let otherHint: String? = slot(otherEar, action).map { other in
      "\(otherEar.title): \(shortFunctionName(other.function))"
    }
    menuRow(action, call: false, otherEarHint: otherHint, menu: session.profile.gestureMenus[action] ?? [], current: current) { fn in
      Task { await session.setGesture(ear, action: action, function: fn) }
    }
    StatusLine(session: session, key: "gesture-\(ear.rawValue)-\(action)")
    if action == 4, current == 8, !session.profile.holdModes.isEmpty, let modes = session.holdCycle {
      HoldCycleRow(session: session, modes: modes)
    }
  }

  private func menuRow(_ action: UInt8, call: Bool, otherEarHint: String?, menu: [UInt8], current: UInt8?, set: @escaping @Sendable (UInt8) -> Void) -> some View {
    let options = current.map { menu.contains($0) ? menu : [$0] + menu } ?? menu
    return HStack(spacing: 8) {
      Image(systemName: GestureIcons.action(action, call: call))
        .foregroundStyle(.secondary)
        .frame(width: 16)
      VStack(alignment: .leading, spacing: 1) {
        Text(Gestures.actions[action] ?? "Action \(action)")
          .lineLimit(1)
        if let otherEarHint {
          Text(otherEarHint)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
        }
      }
      Spacer(minLength: 4)
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

/// A full-width segmented switch with vivid active tint.
struct GlassTabs<Value: Hashable>: View {
  @Binding var selection: Value
  let options: [Value]
  var compact = false
  var tint: Color = .accentColor
  let title: (Value) -> String
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    HStack(spacing: 4) {
      ForEach(options, id: \.self) { option in
        let selected = option == selection
        Button {
          if reduceMotion {
            selection = option
          } else {
            withAnimation(.snappy(duration: 0.18)) { selection = option }
          }
        } label: {
          Text(title(option))
            .font(compact ? .caption : nil)
            .fontWeight(selected ? .semibold : .medium)
            .frame(maxWidth: .infinity)
            .padding(.vertical, compact ? 5 : 6)
            .foregroundStyle(selected ? Color.white : Color.secondary)
            .background(
              selected ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(.fill.tertiary),
              in: .capsule
            )
            .overlay(
              Capsule()
                .strokeBorder(selected ? Color.clear : Color.primary.opacity(0.08), lineWidth: 1)
            )
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
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
      HStack(alignment: .top, spacing: 4) {
        ForEach(session.profile.holdModes, id: \.self) { mode in
          let on = modes.contains(mode)
          let tint = semanticTint(mode)
          Button {
            Task { await session.setHoldCycle(on ? modes.subtracting([mode]) : modes.union([mode])) }
          } label: {
            VStack(spacing: 5) {
              ZStack {
                if on, let tint {
                  Circle()
                    .stroke(tint.opacity(0.3), lineWidth: 2.5)
                    .frame(width: 34, height: 34)
                }
                Image(systemName: icon(mode))
                  .font(.system(size: 12, weight: .medium))
                  .frame(width: 30, height: 30)
                  .foregroundStyle(on ? (tint != nil ? Color.white : Color.primary) : Color.secondary)
                  .background(circleFill(on: on, tint: tint), in: .circle)
                  .overlay(
                    Circle()
                      .strokeBorder(circleBorder(on: on, tint: tint), lineWidth: 1)
                  )
              }
              .frame(width: 34, height: 34)
              Text(shortLabel(mode))
                .font(.system(size: 10, weight: on ? .medium : .regular))
                .foregroundStyle(on ? .primary : .secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .disabled(session.busy || (on && modes.count == 1))
          .accessibilityAddTraits(on ? .isSelected : [])
        }
      }
      StatusLine(session: session, key: "holdCycle")
    }
    .padding(.bottom, 8)
  }

  private func shortLabel(_ mode: HoldMode) -> String {
    switch mode {
    case .anc: "Noise Cancel"
    case .transparency: "Transp."
    case .adaptive: "Adaptive"
    case .off: "Off"
    }
  }

  private func semanticTint(_ mode: HoldMode) -> Color? {
    switch mode {
    case .anc: .indigo
    case .adaptive: .teal
    case .transparency: .accentColor
    case .off: nil
    }
  }

  private func circleFill(on: Bool, tint: Color?) -> AnyShapeStyle {
    guard on else { return AnyShapeStyle(.fill.tertiary) }
    if let tint { return AnyShapeStyle(tint.gradient) }
    return AnyShapeStyle(.fill.secondary)
  }

  private func circleBorder(on: Bool, tint: Color?) -> Color {
    guard on else { return Color.primary.opacity(0.08) }
    return tint == nil ? Color.primary.opacity(0.28) : .clear
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
  var showConnectCard: () -> Void = {}

  var body: some View {
    SubPage(title: "Features", model: model) {
      let hasWear = session.isOn(.wearDetection) != nil
      let hasSmart = session.isOn(.smartVolume) != nil
      let hasGame = session.isOn(.gameMode) != nil
      let hasPrompt = session.promptVolume != nil
      if hasWear || hasSmart || hasGame || hasPrompt {
        PanelSection(title: "Listening") {
          if hasWear {
            SwitchRow(session: session, item: .wearDetection, description: "Pause when you take an earbud out.")
          }
          if hasSmart {
            if hasWear { Divider() }
            SwitchRow(session: session, item: .smartVolume, description: "Adjust volume to the noise around you.")
          }
          if hasGame {
            if hasWear || hasSmart { Divider() }
            SwitchRow(session: session, item: .gameMode, description: "Lower latency for games and video.")
          }
          if hasPrompt {
            if hasWear || hasSmart || hasGame { Divider() }
            StepSlider(title: "Prompt volume", range: 1...10, value: session.promptVolume, format: { "\($0)" },
              commit: { level in Task { await session.setPromptVolume(level) } }, disabled: session.busy)
            StatusLine(session: session, key: "promptVolume")
          }
        }
      }
      let hasDual = session.isOn(.dualConnection) != nil
      let hostDevices = session.devices ?? []
      if hasDual || !hostDevices.isEmpty {
        PanelSection(title: "Connections") {
          if hasDual {
            SwitchRow(
              session: session,
              item: .dualConnection,
              description: "Stay connected to two devices.",
              confirmOff: (
                message: "Turn off dual connection? Your other device may disconnect.",
                action: "Turn off"
              )
            )
          }
          ForEach(Array(hostDevices.enumerated()), id: \.element.id) { index, device in
            if hasDual || index > 0 { Divider() }
            HStack(spacing: 10) {
              IconBadge(
                icon: device.thisDevice ? "laptopcomputer" : "iphone",
                color: device.connected ? .blue : .gray
              )
              VStack(alignment: .leading, spacing: 2) {
                Text(device.name.isEmpty ? "Unnamed device" : device.name).lineLimit(1)
                HStack(spacing: 5) {
                  Circle()
                    .fill(device.connected ? Color.green : Color.secondary.opacity(0.4))
                    .frame(width: 6, height: 6)
                  Text(deviceState(device))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                }
              }
              Spacer(minLength: 0)
            }
            .padding(.vertical, 6)
          }
        }
      }
      PanelSection(title: "This Mac") {
        ToggleRow(title: "Open at login", isOn: Binding(get: { prefs.openAtLogin }, set: { prefs.setOpenAtLogin($0) }))
        if let error = prefs.loginError {
          Text(error).font(.caption).foregroundStyle(.orange).padding(.bottom, 6)
        }
        Divider()
        ToggleRow(title: "Low battery alerts", subtitle: "Notify at 20% and 10%.",
          isOn: Binding(get: { prefs.batteryAlerts }, set: { prefs.batteryAlerts = $0 }))
        Divider()
        HStack(spacing: 8) {
          VStack(alignment: .leading, spacing: 1) {
            Text("Show card on connect")
            Text("Floating quick-control popup.")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          Spacer(minLength: 4)
          if session.isConnected {
            Button("Preview") { showConnectCard() }
              .buttonStyle(PanelButtonStyle(variant: .tinted(), size: .mini))
              .help("Preview the floating connect card now")
          }
          Toggle("Show card on connect", isOn: Binding(get: { prefs.connectCard }, set: { prefs.connectCard = $0 }))
            .labelsHidden()
            .toggleStyle(.switch)
            .controlSize(.small)
        }
        .padding(.vertical, 7)
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
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    SubPage(title: "Tools", model: model) {
      let hasFind = session.supports(0x0400)
      let hasFit = session.supports(0x0405)
      let hasHearing = session.supports(0x040D)
      PanelSection {
        if hasFind {
          toolRow(icon: "dot.radiowaves.left.and.right", color: .red, title: "Find earbuds", description: "Ring both earbuds.") {
            Button(model.ringing ? "Stop" : "Ring") {
              if model.ringing {
                Task { if await session.findEarbuds(false) { model.ringing = false } }
              } else {
                confirming = "find"
              }
            }
            .buttonStyle(PanelButtonStyle(variant: model.ringing ? .prominent(.red) : .secondary))
            .disabled(session.busy || confirming == "find")
          }
          if confirming == "find" {
            confirm("They will play a loud sound. Take them out of your ears first.", action: "Ring", destructive: true) {
              Task { if await session.findEarbuds(true) { model.ringing = true } }
            }
          }
          StatusLine(session: session, key: "find")
        }
        if hasFit {
          if hasFind { Divider() }
          toolRow(icon: "ear", color: .teal, title: "Fit test",
            description: session.fit == nil ? "Check the ear tip seal." : "Latest seal check.") {
            Button("Check") { confirming = "fit" }
              .buttonStyle(PanelButtonStyle(variant: .secondary))
              .disabled(session.busy || confirming == "fit")
          }
          if let fit = session.fit {
            HStack(spacing: 8) {
              FitSealPill(side: "Left", result: fit.left)
              FitSealPill(side: "Right", result: fit.right)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.bottom, 9)
          }
          if confirming == "fit" {
            confirm("Wear both earbuds. A short sound plays for about 10 seconds.", action: "Start") {
              Task { await session.fitTest() }
            }
          }
          StatusLine(session: session, key: "fit")
        }
        if hasHearing {
          if hasFind || hasFit { Divider() }
          toolRow(
            icon: "waveform.path.ecg",
            color: .yellow,
            title: "Hearing test",
            description: session.golden.map { "Profile from \($0.name)" } ?? "Make a Golden Sound profile."
          ) {
            Button(session.golden == nil ? "Start" : "View") { model.open(.hearing) }
              .buttonStyle(PanelButtonStyle(variant: .secondary))
              .disabled(session.busy)
          }
          if let golden = session.golden, golden.values.count == 12 {
            Button {
              model.open(.hearing)
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                HStack {
                  Text("Saved audiogram")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(.secondary)
                  Spacer()
                  AudiogramLegend()
                }
                AudiogramView(
                  left: Array(golden.values.prefix(6)),
                  right: Array(golden.values.suffix(6)),
                  compact: true
                )
                .frame(height: 52)
              }
              .padding(.horizontal, 10)
              .padding(.vertical, 8)
              .background(.fill.tertiary, in: .rect(cornerRadius: 11))
              .contentShape(.rect(cornerRadius: 11))
            }
            .buttonStyle(.plain)
            .disabled(session.busy)
            .padding(.bottom, 9)
          }
          StatusLine(session: session, key: "hearing")
        }
      }
    }
    .animation(reduceMotion ? nil : .smooth, value: confirming)
  }

  private func toolRow(icon: String, color: Color, title: String, description: String, @ViewBuilder control: () -> some View) -> some View {
    HStack(spacing: 10) {
      IconBadge(icon: icon, color: color)
      VStack(alignment: .leading, spacing: 2) {
        Text(title)
        Text(description).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 8)
      control()
    }
    .padding(.vertical, 9)
  }

  private func confirm(_ text: String, action: String, destructive: Bool = false, run: @escaping () -> Void) -> some View {
    InlineConfirmStrip(
      message: text,
      actionTitle: action,
      destructive: destructive,
      cancel: { confirming = nil },
      confirm: {
        confirming = nil
        run()
      }
    )
    .padding(.bottom, 9)
  }
}

private struct FitSealPill: View {
  let side: String
  let result: String?

  private var isGood: Bool { result == "Good seal" }
  private var isWarning: Bool { result == "Average seal" || result == "Poor seal" }

  private var shortLabel: String {
    switch result {
    case "Good seal": "Good"
    case "Average seal": "Average"
    case "Poor seal": "Poor"
    default: "Not measured"
    }
  }

  private var hint: String {
    if isGood { return "Optimal ANC seal" }
    if isWarning { return "Adjust or try another tip" }
    return "Wear earbud to measure"
  }

  private var iconName: String {
    if isGood { return "checkmark.circle.fill" }
    if isWarning { return "exclamationmark.triangle.fill" }
    return "minus.circle"
  }

  private var tint: Color {
    if isGood { return .green }
    if isWarning { return .orange }
    return .secondary
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack(spacing: 4) {
        Image(systemName: iconName)
          .font(.caption2.weight(.semibold))
        Text("\(side) · \(shortLabel)")
          .font(.caption.weight(.semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.9)
      }
      .foregroundStyle(tint)
      Text(hint)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.horizontal, 9)
    .padding(.vertical, 8)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(
      (isGood || isWarning ? tint.opacity(0.13) : Color.primary.opacity(0.06)),
      in: .rect(cornerRadius: 11)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 11)
        .strokeBorder(isGood || isWarning ? tint.opacity(0.32) : Color.primary.opacity(0.12), lineWidth: 1)
    )
  }
}

// MARK: Hearing test

struct HearingPage: View {
  let session: BudsSession
  let model: PanelModel
  @State private var step = -1
  @State private var levels = Array(repeating: hearingStart, count: 12)
  @State private var starting = false
  @State private var cancelledStart = false
  @State private var note: String?
  @State private var warned = false
  @State private var active = false
  @State private var pendingTone: Task<Void, Never>?
  @State private var completed = false
  @State private var retaking = false
  @State private var applying = false
  @State private var finishedValues: [Int] = []
  @State private var applyError: String?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var showingProfile: Bool {
    completed || (!retaking && !active && step < 0 && session.golden != nil)
  }

  var body: some View {
    SubPage(
      title: showingProfile ? "Your Golden Sound" : "Hearing test",
      model: model,
      onBack: {
        if starting { cancelledStart = true }
        if active {
          Task { await end() }
        }
      }
    ) {
      if showingProfile {
        completionBody
      } else {
        testBody
      }
    }
    .animation(reduceMotion ? nil : .smooth, value: showingProfile)
    .animation(reduceMotion ? nil : .smooth, value: applying)
    .onChange(of: session.isConnected) { _, connected in if !connected { active = false } }
  }

  @ViewBuilder
  private var testBody: some View {
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
      if step > 0 {
        Button("Back") { go(step - 1) }.buttonStyle(PanelButtonStyle(variant: .secondary))
      } else if retaking, session.golden != nil {
        Button("Cancel") { cancelRetake() }.buttonStyle(PanelButtonStyle(variant: .secondary))
      }
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
      .buttonStyle(PanelButtonStyle(variant: .prominent()))
      .keyboardShortcut(.defaultAction)
    }
  }

  @ViewBuilder
  private var completionBody: some View {
    if applying {
      PanelSection {
        HStack(spacing: 10) {
          ProgressView().controlSize(.small)
          Text("Saving your Golden Sound profile to the earbuds…")
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 14)
      }
    } else if let error = applyError {
      PanelSection {
        VStack(alignment: .leading, spacing: 8) {
          Label("Couldn't apply profile", systemImage: "exclamationmark.triangle.fill")
            .font(.callout.weight(.semibold))
            .foregroundStyle(.orange)
          Text(error)
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 10)
      }
      HStack {
        Button("Retry") { applyPickedLevels() }
          .buttonStyle(PanelButtonStyle(variant: .secondary))
          .disabled(session.busy)
        Spacer()
        Button("Done") { model.back() }
          .buttonStyle(PanelButtonStyle(variant: .prominent()))
          .keyboardShortcut(.defaultAction)
      }
    } else {
      let values = finishedValues.count == 12 ? finishedValues : (session.golden?.values ?? [])
      let leftValues = Array(values.prefix(6))
      let rightValues = Array(values.suffix(6))
      let goldenOn = session.isOn(.goldenSound) ?? true
      let canToggle = session.profile.switchesWritable.contains(Switch.goldenSound.rawValue)

      PanelSection {
        VStack(alignment: .leading, spacing: 10) {
          HStack(alignment: .firstTextBaseline) {
            if completed {
              Label("Hearing Profile Saved", systemImage: "checkmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
            } else if let name = session.golden?.name {
              Label("Saved \(name)", systemImage: "checkmark.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
                .lineLimit(1)
            } else {
              Text("Hearing Profile")
                .font(.caption.weight(.semibold))
            }
            Spacer(minLength: 6)
            AudiogramLegend()
          }

          AudiogramView(left: leftValues, right: rightValues)
            .frame(height: 88)

          if session.isOn(.goldenSound) != nil {
            VStack(alignment: .leading, spacing: 4) {
              HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                  Text(goldenOn ? "Golden Sound: On" : "Golden Sound: Off (Original)")
                    .font(.callout.weight(.semibold))
                  Text("Play music and toggle to hear the difference")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Toggle(
                  "Golden Sound",
                  isOn: Binding(
                    get: { goldenOn },
                    set: { on in Task { await session.setSwitch(.goldenSound, on) } }
                  )
                )
                .labelsHidden()
                .toggleStyle(.switch)
                .controlSize(.mini)
                .disabled(session.busy || !canToggle)
              }
              .padding(10)
              .background(Color.accentColor.opacity(0.12), in: .rect(cornerRadius: 12))
              .overlay(
                RoundedRectangle(cornerRadius: 12)
                  .strokeBorder(Color.accentColor.opacity(0.32), lineWidth: 1)
              )
              StatusLine(session: session, key: "switch-\(Switch.goldenSound.rawValue)")
            }
          }
        }
        .padding(.vertical, 10)
      }
      HStack {
        if session.supports(0x040D) {
          Button("Retake test") {
            retaking = true
            completed = false
            step = -1
            levels = Array(repeating: hearingStart, count: 12)
            note = nil
            warned = false
            applyError = nil
          }
          .buttonStyle(PanelButtonStyle(variant: .secondary))
          .disabled(session.busy)
        }
        Spacer()
        Button("Done") { model.back() }
          .buttonStyle(PanelButtonStyle(variant: .prominent()))
          .keyboardShortcut(.defaultAction)
      }
    }
  }

  private func slide(to value: Double) {
    guard active else { return }
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
    guard active else { return }
    let level = levels[at]
    if level >= hearingLoud, !warned {
      warned = true
      note = "This level is loud. Lower it if it is uncomfortable."
    }
    Task { await session.playTone(step: at, level: level) }
  }

  private func start() {
    starting = true
    cancelledStart = false
    Task {
      do {
        try await session.startHearingTest()
        if cancelledStart {
          await session.endHearingTest()
        } else {
          active = true
          note = nil
          step = 0
          play(0)
        }
      } catch {
        if !cancelledStart {
          note = error.localizedDescription
        }
      }
      starting = false
    }
  }

  private func cancelRetake() {
    if starting {
      cancelledStart = true
      step = -1
      note = nil
      retaking = false
      return
    }
    if active {
      Task {
        await end()
        step = -1
        note = nil
        retaking = false
      }
      return
    }
    step = -1
    note = nil
    retaking = false
  }

  private func go(_ next: Int) {
    guard active else { return }
    step = next
    play(next)
  }

  private func end() async {
    pendingTone?.cancel()
    if active {
      active = false
      await session.endHearingTest()
    }
  }

  private func finish() {
    finishedValues = levels.map { hearingStops[$0] }
    retaking = false
    completed = true
    applyPickedLevels()
  }

  private func applyPickedLevels() {
    let picked = levels
    applying = true
    applyError = nil
    Task {
      await end()
      await session.applyHearing(levels: picked)
      if let saved = session.golden?.values, saved.count == 12 {
        finishedValues = saved
      }
      if case .failed(let message) = session.status["hearing"] {
        applyError = message
      }
      applying = false
    }
  }
}

private struct AudiogramLegend: View {
  var body: some View {
    HStack(spacing: 8) {
      HStack(spacing: 4) {
        Capsule().fill(Color.accentColor).frame(width: 10, height: 2.5)
        Text("L")
      }
      HStack(spacing: 4) {
        Rectangle()
          .fill(.clear)
          .frame(width: 10, height: 2.5)
          .overlay(
            Path { p in
              p.move(to: CGPoint(x: 0, y: 1.25))
              p.addLine(to: CGPoint(x: 10, y: 1.25))
            }
            .stroke(Color.green, style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [3, 2.5]))
          )
        Text("R")
      }
    }
    .font(.caption2.weight(.medium))
    .foregroundStyle(.secondary)
  }
}

private struct AudiogramView: View {
  let left: [Int]
  let right: [Int]
  var compact = false

  private static let labels = ["250", "500", "1k", "2k", "4k", "8k"]
  private static let minValue: CGFloat = -55
  private static let maxValue: CGFloat = 17

  var body: some View {
    VStack(spacing: compact ? 2 : 4) {
      GeometryReader { geo in
        let w = geo.size.width
        let h = geo.size.height
        let padY: CGFloat = compact ? 4 : 6
        let plotH = max(1, h - padY * 2)
        let leftPts = points(values: left, width: w, padY: padY, plotH: plotH)
        let rightPts = points(values: right, width: w, padY: padY, plotH: plotH)

        ZStack {
          // Subtle top, mid, and bottom reference lines
          ForEach([0.0, 0.5, 1.0], id: \.self) { frac in
            let y = padY + CGFloat(frac) * plotH
            Path { path in
              path.move(to: CGPoint(x: 6, y: y))
              path.addLine(to: CGPoint(x: max(6, w - 6), y: y))
            }
            .stroke(
              Color.primary.opacity(frac == 0.5 ? 0.16 : 0.08),
              style: StrokeStyle(lineWidth: 1, dash: frac == 0.5 ? [] : [2, 3])
            )
          }

          linePath(points: leftPts)
            .stroke(
              Color.accentColor,
              style: StrokeStyle(lineWidth: compact ? 1.8 : 2.2, lineCap: .round, lineJoin: .round)
            )

          linePath(points: rightPts)
            .stroke(
              Color.green,
              style: StrokeStyle(lineWidth: compact ? 1.8 : 2.2, lineCap: .round, lineJoin: .round, dash: [4, 3])
            )

          if !compact {
            ForEach(Array(leftPts.enumerated()), id: \.offset) { _, pt in
              Circle()
                .fill(Color.accentColor)
                .frame(width: 4.5, height: 4.5)
                .position(pt)
            }
            ForEach(Array(rightPts.enumerated()), id: \.offset) { _, pt in
              Circle()
                .fill(Color.green)
                .frame(width: 4.5, height: 4.5)
                .position(pt)
            }
          }
        }
        .frame(width: w, height: h)
      }
      HStack(spacing: 0) {
        ForEach(Self.labels, id: \.self) { label in
          Text(label)
            .font(.system(size: compact ? 8.5 : 9.5).monospacedDigit())
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity)
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Left and right ear hearing profile from 250 Hz to 8 kHz")
  }

  private func points(values: [Int], width: CGFloat, padY: CGFloat, plotH: CGFloat) -> [CGPoint] {
    guard !values.isEmpty else { return [] }
    let span = Self.maxValue - Self.minValue
    return values.enumerated().map { index, raw in
      let clamped = max(Self.minValue, min(Self.maxValue, CGFloat(raw)))
      let norm = (clamped - Self.minValue) / span
      let x = (CGFloat(index) + 0.5) / CGFloat(values.count) * width
      let y = padY + (1 - norm) * plotH
      return CGPoint(x: x, y: y)
    }
  }

  private func linePath(points: [CGPoint]) -> Path {
    Path { path in
      guard let first = points.first, points.count >= 2 else { return }
      path.move(to: first)
      for pt in points.dropFirst() {
        path.addLine(to: pt)
      }
    }
  }
}
