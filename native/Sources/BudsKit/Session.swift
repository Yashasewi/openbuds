import Foundation
import IOBluetooth
import Observation

/// Swift port of app/src/lib/session.ts: one request at a time, replies matched by sequence,
/// live pushes applied to state, and every change verified by reading it back.
@MainActor
@Observable
public final class BudsSession {
  public enum Connection: Equatable {
    case searching
    case connecting(String)
    case connected(String)
    case unavailable(String)
  }

  public private(set) var connection: Connection = .searching
  public private(set) var battery: [Part: BatteryLevel] = [:]
  public private(set) var wearing: [Part: WearState] = [:]
  public private(set) var firmware: String?
  public private(set) var noise: NoiseState?
  public private(set) var smartLevel: NoiseMode?
  public private(set) var eq: Int?
  public private(set) var customPresets: [Preset] = []
  public private(set) var holdCycle: Set<HoldMode>?
  public private(set) var gestures: [GestureSlot] = []
  public private(set) var features: [UInt8: UInt8] = [:]
  public private(set) var devices: [HostDevice]?
  public private(set) var codec: Int?
  public private(set) var bass: Int?
  public private(set) var promptVolume: Int?
  public private(set) var golden: GoldenRecord?
  public private(set) var fit: FitResult?
  public private(set) var hearingNote: String?
  public private(set) var updatedAt: Date?
  public private(set) var busy = false
  public private(set) var lastError: String?

  public enum ChangeStatus: Equatable {
    case pending
    case done(String?)
    case failed(String)
  }
  /// Per-control status, keyed by the caller ("noise", "switch-6", "gesture-left-2", …).
  public private(set) var status: [String: ChangeStatus] = [:]

  public var isConnected: Bool { if case .connected = connection { true } else { false } }
  public var presets: [Preset] { Preset.builtIn + customPresets }
  public func isOn(_ s: Switch) -> Bool? { features[s.rawValue].map { $0 == 1 } }
  public func supports(_ command: UInt16) -> Bool { caps?.supports(command) ?? false }
  /// Hi-Res needs LHDC on this link; macOS only offers SBC and AAC.
  public var hiResAvailable: Bool { codec == 7 || codec == 8 }
  /// Lowest earbud level, for the menu-bar icon.
  public var lowestBud: Int? { [battery[.left]?.percent, battery[.right]?.percent].compactMap { $0 }.min() }

  @ObservationIgnored private let link = GATTLink()
  @ObservationIgnored private let watcher = DeviceWatcher()
  @ObservationIgnored private var device: IOBluetoothDevice?
  @ObservationIgnored private var framer = Framer()
  @ObservationIgnored private var caps: Capabilities?
  @ObservationIgnored private var sequence: UInt8 = 1
  @ObservationIgnored private var pending: [UInt32: CheckedContinuation<Bytes, Error>] = [:]
  @ObservationIgnored private var locked = false
  @ObservationIgnored private var lockWaiters: [CheckedContinuation<Void, Never>] = []
  @ObservationIgnored private var userDisconnected = false
  @ObservationIgnored private var connecting = false
  @ObservationIgnored private var batteryTimer: DispatchWorkItem?
  @ObservationIgnored private var retryTimer: DispatchWorkItem?
  @ObservationIgnored private var subscribed: [UInt8] = []
  @ObservationIgnored private var fitWaiter: CheckedContinuation<FitResult, Error>?
  @ObservationIgnored private var statusTimers: [String: DispatchWorkItem] = [:]

  public init() {
    link.onData = { [weak self] bytes in self?.received(bytes) }
    link.onClose = { [weak self] in self?.closed(reason: "They reconnect by themselves when you take them out of the case.") }
    watcher.onConnect = { [weak self] device in
      guard let self, RFCOMMLink.candidates().contains(where: { $0.addressString == device.addressString }) else { return }
      // Give the buds a moment to bring up their services after the baseband connects.
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { MainActor.assumeIsolated { self.autoConnect() } }
    }
    watcher.onDisconnect = { [weak self] _ in
      self?.retryTimer?.cancel()
      self?.link.close()
      self?.closed(reason: "They reconnect by themselves when you take them out of the case.")
    }
  }

  public func start() {
    watcher.start()
    autoConnect()
  }

  private func autoConnect() {
    guard !userDisconnected else { return }
    Task { await connect() }
  }

  public func connect() async {
    userDisconnected = false
    await attempt(retrying: false)
  }

  /// A retry keeps the last error on screen instead of flashing "Connecting" every few seconds.
  private func attempt(retrying: Bool) async {
    guard !isConnected, !connecting, !userDisconnected else { return }
    retryTimer?.cancel()
    guard let target = RFCOMMLink.candidates().first(where: { $0.isConnected() }) else {
      connection = .unavailable("Connect your OnePlus Buds 4 to this Mac in Bluetooth settings.")
      return
    }
    connecting = true
    defer { connecting = false }
    let name = target.name ?? "OnePlus Buds 4"
    if !retrying { connection = .connecting(name) }
    lastError = nil
    do {
      // GATT, not RFCOMM: channel 15 allows one program per Mac, and the website uses it.
      try await link.connect(named: target.name)
      device = target
      watcher.watchDisconnect(of: target)
      framer = Framer()
      caps = try decodeCapabilities(try await query(0x0100))
      let model = try decodeModel(try await query(0x0103))
      guard model == budsModel else { throw BudsError.unrecognized("model \(model); this app supports OnePlus Buds 4 only") }
      connection = .connected(name)
      await refresh()
      try? await subscribeEvents()
    } catch {
      link.close()
      failPending()
      connection = .unavailable(error.localizedDescription)
      // Right after the buds connect, their GATT service can lag behind the audio link,
      // and nothing else would prompt another attempt.
      if (error as? GATTError)?.retries == true { scheduleRetry() }
    }
  }

  private func scheduleRetry() {
    retryTimer?.cancel()
    let work = DispatchWorkItem { [weak self] in
      MainActor.assumeIsolated {
        guard let self else { return }
        Task { await self.attempt(retrying: true) }
      }
    }
    retryTimer = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: work)
  }

  public func disconnect() {
    userDisconnected = true
    retryTimer?.cancel()
    link.close()
    closed(reason: "You disconnected them. Click Connect to reconnect.")
  }

  private func closed(reason: String) {
    guard isConnected || connecting else { return }
    batteryTimer?.cancel()
    failPending()
    device = nil
    connection = .unavailable(reason)
  }

  private func failPending() {
    let waiting = pending
    pending = [:]
    waiting.values.forEach { $0.resume(throwing: BudsError.disconnected) }
    fitWaiter?.resume(throwing: BudsError.disconnected)
    fitWaiter = nil
  }

  // MARK: Requests

  private func lock() async {
    if !locked { locked = true; return }
    await withCheckedContinuation { lockWaiters.append($0) }
  }
  private func unlock() {
    if lockWaiters.isEmpty { locked = false } else { lockWaiters.removeFirst().resume() }
  }

  func query(_ command: UInt16, _ payload: Bytes = [], timeout: Double = 3.5) async throws -> Bytes {
    await lock()
    defer { unlock() }
    let seq = sequence
    sequence = seq == 254 ? 1 : seq + 1
    let bytes = try encode(command, seq, payload)
    let key = UInt32(command | 0x8000) << 8 | UInt32(seq)
    let reply = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bytes, Error>) in
      pending[key] = continuation
      do { try link.write(bytes) } catch {
        pending.removeValue(forKey: key)?.resume(throwing: error)
        return
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
        MainActor.assumeIsolated {
          guard let continuation = self.pending.removeValue(forKey: key) else { return }
          // A frame CoreBluetooth never took is a send failure, not a silent earbud.
          continuation.resume(throwing: self.link.drop(bytes) ? GATTError.notSent(bytes.count) : BudsError.timeout(command))
        }
      }
    }
    try? await Task.sleep(for: .milliseconds(150))
    return reply
  }

  public func refresh() async {
    guard isConnected else { return }
    if let p = try? await query(0x0106), (try? requireSuccess(p, 2)) != nil, let b = decodeBattery(p, status: true) { battery = b }
    if supports(0x0105), let v = try? decodeFirmware(try await query(0x0105)) { firmware = v }
    if supports(0x0109), let p = try? await query(0x0109), let w = decodeWearing(p) { wearing = w }
    if supports(0x010C) {
      if let v = try? decodeNoise(try await query(0x010C, [1, 1])) { noise = v }
      if let v = try? decodeSmartLevel(try await query(0x010C, [4, 1])) { smartLevel = v }
      if let v = try? decodeHoldCycle(try await query(0x010C, [2, 1])) { holdCycle = v }
    }
    if supports(0x010F), let v = try? decodeByte(try await query(0x010F)) { eq = v }
    if supports(0x0122), let v = try? decodeCustomPresets(try await query(0x0122)) { customPresets = v }
    if supports(0x0108), let v = try? decodeGestures(try await query(0x0108)) { gestures = v }
    if let v = try? decodeFeatures(try await query(0x010D, [UInt8(featureQuery.count)] + featureQuery)) { features = v }
    if supports(0x0112), let v = try? decodeDevices(try await query(0x0112)) { devices = v }
    if supports(0x0114), let v = try? decodeByte(try await query(0x0114)) { codec = v }
    if supports(0x0124), let v = try? decodeBass(try await query(0x0124)) { bass = v }
    if supports(0x0130), let v = try? decodeByte(try await query(0x0130)) { promptVolume = v }
    if supports(0x0115), let p = try? await query(0x0115) { golden = decodeGolden(p) }
    updatedAt = Date()
  }

  private func subscribeEvents() async throws {
    let p = try await query(0x0200)
    try requireSuccess(p, 2)
    guard p.count == Int(p[1]) + 2 else { return }
    var wanted: [UInt8] = [1, 2, 3]
    if supports(0x0405) { wanted.append(4) }
    if supports(0x040D) { wanted.append(8) }
    let ids = wanted.filter { p[2...].contains($0) }
    if !ids.isEmpty, supports(0x0205) {
      _ = try await query(0x0205, [UInt8(ids.count)] + ids)
      subscribed = ids
    }
  }

  // MARK: Incoming

  private func received(_ bytes: Bytes) {
    for frame in framer.push(bytes) { handle(frame) }
  }

  private func handle(_ frame: Frame) {
    if let continuation = pending.removeValue(forKey: UInt32(frame.command) << 8 | UInt32(frame.sequence)) {
      continuation.resume(returning: frame.payload)
      return
    }
    let p = frame.payload
    switch frame.command {
    case 0x0204 where p.first == 1:
      if let b = decodeBattery(Array(p.dropFirst()), status: false) { battery.merge(b) { $1 } }
    case 0x0204 where p.first == 2:
      guard let w = decodeWearing(Array(p.dropFirst())) else { return }
      let wasVisible = caseVisible(wearing)
      wearing.merge(w) { $1 }
      // The case reports battery only with its lid open, and opening it does not always push a battery event.
      if caseVisible(wearing) && !wasVisible { rereadBatterySoon() }
    case 0x0204 where p.first == 3 && p.count >= 4:
      let status: Bytes = [0] + p.dropFirst()
      if p[1] == 1, p[2] == 1, let v = try? decodeNoise(status) { noise = v }
      if p[1] == 4, p[2] == 1, let v = try? decodeSmartLevel(status) { smartLevel = v }
      if p[1] == 2, p[2] == 1, let v = try? decodeHoldCycle(status) { holdCycle = v }
    case 0x0204 where p.first == 4:
      let result = decodeFit(Array(p.dropFirst()))
      fit = result
      fitWaiter?.resume(returning: result)
      fitWaiter = nil
    case 0x0204 where p.first == 5 && p.count == 2:
      features[Switch.gameMode.rawValue] = p[1]
    case 0x0204 where p.first == 8 && p.count >= 3:
      hearingNote = [5: "An earbud is out of your ear. Put it back to continue.", 6: "Earbud back in. Continue.",
        7: "The test timed out. Cancel and start again."][Int(p[2])]
    case 0x0504 where p.count == 1:
      eq = Int(p[0])
    case 0x0500:
      // The buds ask for the time; the phone answers 00 <unix seconds u32 LE> (QuickBuds docs/PROTOCOL.md:483, [CAPTURE]).
      let now = UInt32(Date().timeIntervalSince1970)
      if let bytes = try? encode(0x8500, frame.sequence, [0] + (0..<4).map { UInt8(now >> (8 * $0) & 0xFF) }) { try? link.write(bytes) }
    default:
      break
    }
  }

  private func caseVisible(_ w: [Part: WearState]) -> Bool {
    w[.chargingCase]?.lidOpen == true || [Part.left, .right].contains { w[$0]?.inCase == true && w[$0]?.lidOpen == true }
  }

  private func rereadBatterySoon() {
    batteryTimer?.cancel()
    let work = DispatchWorkItem { [weak self] in
      MainActor.assumeIsolated {
        guard let self, self.isConnected else { return }
        Task {
          if let p = try? await self.query(0x0106), let b = decodeBattery(p, status: true) { self.battery = b }
        }
      }
    }
    batteryTimer = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: work)
  }

  // MARK: Changes

  private func setStatus(_ key: String, _ value: ChangeStatus?, clearAfter seconds: Double? = nil) {
    statusTimers[key]?.cancel()
    status[key] = value
    guard let seconds else { return }
    let work = DispatchWorkItem { [weak self] in MainActor.assumeIsolated { self?.status[key] = nil } }
    statusTimers[key] = work
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
  }

  /// Runs one change at a time and records its outcome under `key`.
  @discardableResult
  private func run<T>(_ key: String, success: String? = nil, _ work: () async throws -> T) async -> T? {
    guard isConnected, !busy else { return nil }
    busy = true
    lastError = nil
    setStatus(key, .pending)
    defer { busy = false }
    do {
      let result = try await work()
      setStatus(key, .done(success), clearAfter: success == nil ? 2 : 6)
      return result
    } catch {
      lastError = error.localizedDescription
      setStatus(key, .failed(error.localizedDescription), clearAfter: 9)
      return nil
    }
  }

  private func send(_ name: String, _ command: UInt16, _ payload: Bytes) async throws {
    guard supports(command) else { throw BudsError.notOffered(name) }
    try acknowledged(command, try await query(command, payload))
  }

  /// Sends a change, then reads it back: an acknowledgement alone does not prove a write took.
  private func write(_ name: String, _ command: UInt16, _ payload: Bytes, verify: () async throws -> Bool) async throws {
    try await send(name, command, payload)
    guard try await verify() else { throw BudsError.unverified(name) }
  }

  private func rereadFeatures() async throws -> [UInt8: UInt8] {
    let value = try decodeFeatures(try await query(0x010D, [UInt8(featureQuery.count)] + featureQuery))
    features = value
    return value
  }
  private func rereadGestures() async throws -> [GestureSlot] {
    let value = try decodeGestures(try await query(0x0108))
    gestures = value
    return value
  }
  private func rereadPresets() async throws -> [Preset] {
    let value = try decodeCustomPresets(try await query(0x0122))
    customPresets = value
    return value
  }

  public func setNoise(_ mode: NoiseMode) async {
    await run("noise") {
      try await write("Noise control", 0x0404, noisePayload(mode)) {
        let state = try decodeNoise(try await query(0x010C, [1, 1]))
        noise = state
        if mode == .smart || mode == .anc { smartLevel = try? decodeSmartLevel(try await query(0x010C, [4, 1])) }
        return mode.reports.contains(state.raw)
      }
    }
  }

  public func setEq(_ id: Int) async {
    await run("eq") {
      try await write("Equalizer", 0x0406, [UInt8(id)]) {
        let value = try decodeByte(try await query(0x010F))
        eq = value
        return value == id
      }
    }
  }

  public func setSwitch(_ s: Switch, _ on: Bool) async {
    await run("switch-\(s.rawValue)") {
      if s == .hiRes, !hiResAvailable {
        throw BudsError.notOffered("Hi-Res audio over \(codec.flatMap { codecNames[$0] } ?? "this codec")")
      }
      try await write(s.title, 0x0403, [s.rawValue, on ? 1 : 0]) { try await rereadFeatures()[s.rawValue] == (on ? 1 : 0) }
      if s == .dualConnection {
        // The phone sends this state frame after every toggle (frame captured in QuickBuds docs/PROTOCOL.md:886; the flag meanings are unverified). Observed behavior; TODO: re-verify with a capture.
        try await send("Dual connection follow-up", 0x0413, [8, 0, on ? 0 : 1])
        devices = try? decodeDevices(try await query(0x0112))
      }
    }
  }

  public func setHoldCycle(_ modes: Set<HoldMode>) async {
    await run("holdCycle") {
      guard !modes.isEmpty else { throw BudsError.notOffered("An empty touch-and-hold cycle") }
      try await write("Touch-and-hold cycle", 0x0404, holdCyclePayload(modes)) {
        let value = try decodeHoldCycle(try await query(0x010C, [2, 1]))
        holdCycle = value
        return value == modes
      }
    }
  }

  public func setGesture(_ ear: Ear, action: UInt8, function: UInt8) async {
    await run("gesture-\(ear.rawValue)-\(action)") {
      try await write("\(ear.title) \(Gestures.actions[action] ?? "gesture")", 0x0401,
        try gestureTablePayload(gestures, ear: ear, action: action, function: function)) {
        let slots = try await rereadGestures().filter { $0.device == ear.rawValue && $0.action == action && $0.button != 6 }
        return !slots.isEmpty && slots.allSatisfy { $0.function == function }
      }
    }
  }

  public func setCallGesture(action: UInt8, function: UInt8) async {
    await run("call-\(action)") {
      try await write("Call control", 0x0401, try callGesturePayload(action: action, function: function)) {
        let slots = try await rereadGestures().filter { $0.button == 6 && $0.action == action }
        return !slots.isEmpty && slots.allSatisfy { $0.function == function }
      }
    }
  }

  public func savePreset(_ preset: Preset, isNew: Bool) async {
    await run("preset", success: "\(preset.name) \(isNew ? "created" : "saved") and confirmed") {
      if isNew {
        guard customPresets.count < eqMaxCustom else { throw BudsError.notOffered("More than \(eqMaxCustom) custom presets") }
        // Ids are renumbered after create/delete, so the new preset is found by name among unseen ids.
        let before = Set(customPresets.map(\.id))
        try await write("Create \(preset.name)", 0x0418, customEqPayload(.create, preset)) {
          try await rereadPresets().contains { !before.contains($0.id) && $0.name == preset.name }
        }
      } else {
        try await write("Save \(preset.name)", 0x0418, customEqPayload(.save, preset)) {
          try await rereadPresets().contains { $0.id == preset.id && $0.name == preset.name && $0.bands.map(\.gain) == preset.bands.map(\.gain) }
        }
      }
      eq = try? decodeByte(try await query(0x010F))
    }
  }

  public func deletePreset(_ preset: Preset) async {
    await run("preset", success: "\(preset.name) deleted") {
      let remaining = customPresets.filter { $0.id != preset.id }.count
      try await write("Delete \(preset.name)", 0x0418, customEqPayload(.delete, preset)) {
        let list = try await rereadPresets()
        return list.count == remaining && !list.contains { $0.id == preset.id && $0.name == preset.name }
      }
      eq = try? decodeByte(try await query(0x010F))
    }
  }

  public func setBass(_ level: Int) async {
    await run("bass") {
      try await write("BassWave strength", 0x041B, bassPayload(level)) {
        let value = try decodeBass(try await query(0x0124))
        bass = value
        return value == level
      }
    }
  }

  /// Every prompt-volume write plays a prompt in the ears.
  public func setPromptVolume(_ level: Int) async {
    await run("promptVolume") {
      try await write("Prompt volume", 0x0427, [UInt8(level)]) {
        let value = try decodeByte(try await query(0x0130))
        promptVolume = value
        return value == level
      }
    }
  }

  // MARK: Tools (no persistent state; only the acknowledgement can be checked)

  public func findEarbuds(_ on: Bool) async -> Bool {
    await run("find", success: on ? "Ringing. Stop when you find them." : "Stopped ringing") {
      try await send(on ? "Ring earbuds" : "Stop ringing", 0x0400, [on ? 1 : 0])
    } != nil
  }

  public func fitTest() async {
    await run("fit", success: "Fit check finished") {
      guard subscribed.contains(4) else { throw BudsError.notOffered("Fit-test results") }
      let result = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<FitResult, Error>) in
        fitWaiter = continuation
        Task {
          do { try await send("Fit test", 0x0405, [1]) } catch {
            fitWaiter?.resume(throwing: error)
            fitWaiter = nil
          }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
          MainActor.assumeIsolated {
            self.fitWaiter?.resume(throwing: BudsError.unrecognized("no fit result in time"))
            self.fitWaiter = nil
          }
        }
      }
      try? await send("Fit test stop", 0x0405, [0])
      fit = result
    }
  }

  public func startHearingTest() async throws {
    hearingNote = nil
    try await send("Hearing test", 0x040D, [2, 1])
  }
  public func playTone(step: Int, level: Int) async {
    do {
      try await send("Stop tone", 0x040E, [4])
      try await send("Tone", 0x040E, tonePayload(side: step < 6 ? 1 : 2, frequency: UInt8(step % 6 + 1), value: hearingStops[level]))
    } catch {
      hearingNote = error.localizedDescription
    }
  }
  public func endHearingTest() async {
    guard isConnected else { return }
    try? await send("Stop tone", 0x040E, [4])
    try? await send("Hearing test stop", 0x040D, [2, 0])
  }

  /// Golden Sound apply order: read the filter (gives the enhance type), restore id, record, then the switch on. QuickBuds's apply sequence (docs/PROTOCOL.md section 20) gives restore, record, switch on; the leading filter read is observed behavior; TODO: re-verify with a capture.
  public func applyHearing(levels: [Int]) async {
    await run("hearing", success: "Golden Sound profile applied and confirmed") {
      guard levels.count == 12, supports(0x0116) else { throw BudsError.notOffered("Golden Sound") }
      let values = levels.map { hearingSnap(hearingStops[$0]) }
      let uid = UInt32.random(in: 1...UInt32.max)
      let name = Date().formatted(.verbatim("\(year: .defaultDigits)/\(month: .twoDigits)/\(day: .twoDigits) \(hour: .twoDigits(clock: .twentyFourHour, hourCycle: .zeroBased)):\(minute: .twoDigits)", timeZone: .current, calendar: .current))
      let type = try hearingEnhanceType(try await query(0x0116, hearingFilterPayload(uid: uid, values: values)))
      if type > 0 { try await send("Golden Sound restore", 0x0411, [1, 1, 1, 0, type]) }
      try await write("Golden Sound profile", 0x040E, hearingRecordPayload(uid: uid, name: name, values: values)) {
        let record = decodeGolden(try await query(0x0115))
        golden = record
        return record?.uid == uid && record?.values == values
      }
      try await write("Golden Sound", 0x0403, [Switch.goldenSound.rawValue, 1]) { try await rereadFeatures()[Switch.goldenSound.rawValue] == 1 }
    }
  }
}

