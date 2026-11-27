import CoreBluetooth
import Foundation
import IOBluetooth

/// A Bluetooth peripheral currently connected to this Mac that exposes the earbuds' control service.
public struct ConnectedBudsDevice: Identifiable, Equatable, Hashable, Sendable {
  public let id: UUID
  public let name: String
  public let hasControlService: Bool

  public init(id: UUID, name: String, hasControlService: Bool = true) {
    self.id = id
    self.name = name
    self.hasControlService = hasControlService
  }

  /// Stable 4-character hex suffix shown only when two connected pairs share the exact same Bluetooth name.
  public var shortTag: String {
    "#\(id.uuidString.suffix(4).uppercased())"
  }
}

/// Outcome of deciding which connected peripheral to attach to automatically.
public enum DeviceSelection: Equatable, Sendable {
  case none
  case connect(ConnectedBudsDevice)
  case choose([ConnectedBudsDevice])
}

/// Picks a single target peripheral when unambiguous, or asks the user to choose when multiple pairs are connected.
public nonisolated func resolveBudsSelection(
  available: [ConnectedBudsDevice],
  explicitID: UUID?,
  preferredID: UUID?
) -> DeviceSelection {
  guard !available.isEmpty else { return .none }
  if let explicitID, let picked = available.first(where: { $0.id == explicitID }) {
    return .connect(picked)
  }
  if available.count == 1, let only = available.first {
    return .connect(only)
  }
  if let preferredID, let preferred = available.first(where: { $0.id == preferredID }) {
    return .connect(preferred)
  }
  return .choose(available)
}

/// True when more than one connected pair shares the same Bluetooth name (case-insensitive).
public nonisolated func hasDuplicateBudsName(_ devices: [ConnectedBudsDevice], for device: ConnectedBudsDevice) -> Bool {
  devices.filter { $0.name.caseInsensitiveCompare(device.name) == .orderedSame }.count > 1
}

/// The earbuds' control channel over GATT, attached to the classic connection macOS already has open
/// (bluetoothd reports `transport: classic`). RFCOMM channel 15 stays free for the website.
/// Same frames as RFCOMM: commands go to `0100079A`, replies and pushes arrive on `0200079A`.
@MainActor
final class GATTLink: NSObject {
  var onData: (Bytes) -> Void = { _ in }
  var onClose: () -> Void = {}

  /// Service UUIDs passed when listing connected peripherals. The author's own probe (2026-10-30, output not saved) found the Buds 4 under `0000079A`; TODO: re-verify with a capture. `0000079F` and `000008A4`: TODO: re-verify with a capture.
  static let systemServices = [
    "0000079A-D102-11E1-9B23-00025B00A5A5",
    "0000079F-D102-11E1-9B24-00025B00A5A5",
    "000008A4-0000-1000-8000-00805F9B34FB",
  ].map { CBUUID(string: $0) }
  static let service = CBUUID(string: "0000079A-D102-11E1-9B23-00025B00A5A5")
  static let writeID = CBUUID(string: "0100079A-D102-11E1-9B23-00025B00A5A5")
  static let notifyID = CBUUID(string: "0200079A-D102-11E1-9B23-00025B00A5A5")

  private enum Step: String {
    case power = "Bluetooth"
    case connect = "connecting"
    case services = "services"
    case characteristics = "characteristics"
    case notify = "notifications"
  }

  private var central: CBCentralManager?
  private var peripheral: CBPeripheral?
  private var writer: CBCharacteristic?
  /// Frames CoreBluetooth would not take yet. Sent whole when it is ready; never split.
  private var queue: [Data] = []
  private var step: CheckedContinuation<Void, Error>?
  private var waiting: Step?
  private var stepAttempt = 0

  var activePeripheralID: UUID? { peripheral?.identifier }

  private func ensurePoweredOn() async throws -> CBCentralManager {
    let central = self.central ?? CBCentralManager(delegate: self, queue: .main)
    self.central = central
    switch central.state {
    case .poweredOn: return central
    case .unauthorized: throw GATTError.unauthorized
    case .poweredOff, .unsupported: throw GATTError.poweredOff
    default:
      try await wait(for: .power, timeout: 5) {}
      return central
    }
  }

  /// Queries `0000079A` first so a single pair advertising secondary BLE services (`079F`/`08A4`)
  /// is not miscounted as two devices, falling back to all `systemServices` only if none appear.
  private static func snapshotPeripherals(from central: CBCentralManager) -> (peripherals: [CBPeripheral], primaryIDs: Set<UUID>) {
    let primary = central.retrieveConnectedPeripherals(withServices: [Self.service])
    let primaryIDs = Set(primary.map(\.identifier))
    let source = primary.isEmpty
      ? central.retrieveConnectedPeripherals(withServices: Self.systemServices)
      : primary
    var seen = Set<UUID>()
    let unique = source
      .filter { seen.insert($0.identifier).inserted }
      .sorted { lhs, rhs in
        let l = lhs.name ?? ""
        let r = rhs.name ?? ""
        let cmp = l.localizedCaseInsensitiveCompare(r)
        if cmp != .orderedSame { return cmp == .orderedAscending }
        return lhs.identifier.uuidString < rhs.identifier.uuidString
      }
    return (unique, primaryIDs)
  }

  /// Lists every connected peripheral exposing the earbuds' control service without disturbing an active link.
  func connectedDevices() async throws -> [ConnectedBudsDevice] {
    let central = try await ensurePoweredOn()
    let (peripherals, primaryIDs) = Self.snapshotPeripherals(from: central)
    return peripherals.map { peripheral in
      let trimmed = peripheral.name?.trimmingCharacters(in: .whitespacesAndNewlines)
      let name = (trimmed?.isEmpty == false) ? trimmed! : "OnePlus earbuds"
      return ConnectedBudsDevice(
        id: peripheral.identifier,
        name: name,
        hasControlService: primaryIDs.contains(peripheral.identifier)
      )
    }
  }

  /// Attaches directly to a specific connected peripheral by its CoreBluetooth UUID. Never scans and never opens RFCOMM.
  func connect(peripheralID: UUID) async throws {
    close()
    let central = try await ensurePoweredOn()
    let (listed, _) = Self.snapshotPeripherals(from: central)
    let target = listed.first(where: { $0.identifier == peripheralID })
      ?? central.retrievePeripherals(withIdentifiers: [peripheralID]).first
    guard let target else { throw GATTError.notFound }
    peripheral = target
    target.delegate = self
    try await wait(for: .connect, timeout: 10) {
      central.connect(target, options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true])
    }
    try await wait(for: .services, timeout: 10) { target.discoverServices(nil) }
    guard let service = target.services?.first(where: { $0.uuid == Self.service }) else {
      throw GATTError.missing((target.services ?? []).map(\.uuid.uuidString))
    }
    try await wait(for: .characteristics, timeout: 10) { target.discoverCharacteristics(nil, for: service) }
    let characteristics = service.characteristics ?? []
    guard let writer = characteristics.first(where: { $0.uuid == Self.writeID }),
      let notifier = characteristics.first(where: { $0.uuid == Self.notifyID })
    else { throw GATTError.missing(characteristics.map(\.uuid.uuidString)) }
    try await wait(for: .notify, timeout: 10) { target.setNotifyValue(true, for: notifier) }
    self.writer = writer
  }

  func write(_ bytes: Bytes) throws {
    guard let peripheral, writer != nil, peripheral.state == .connected else { throw BudsError.disconnected }
    let limit = peripheral.maximumWriteValueLength(for: .withoutResponse)
    guard bytes.count <= limit else { throw GATTError.frameTooLong(bytes.count, limit) }
    queue.append(Data(bytes))
    flush()
  }

  /// Takes back a frame CoreBluetooth never accepted. False when it already went out.
  func drop(_ bytes: Bytes) -> Bool {
    guard let i = queue.firstIndex(of: Data(bytes)) else { return false }
    queue.remove(at: i)
    return true
  }

  /// Cancels this app's GATT connection only. The audio route stays up.
  func close() {
    let current = peripheral
    peripheral = nil
    writer = nil
    queue = []
    if let current {
      current.delegate = nil
      central?.cancelPeripheralConnection(current)
    }
    finish(nil, .failure(BudsError.disconnected))
  }

  private func flush() {
    guard let peripheral, let writer else { return }
    while !queue.isEmpty, peripheral.canSendWriteWithoutResponse {
      peripheral.writeValue(queue.removeFirst(), for: writer, type: .withoutResponse)
    }
  }

  private func wait(for s: Step, timeout: Double, _ start: () -> Void) async throws {
    stepAttempt += 1
    let attempt = stepAttempt
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      step = continuation
      waiting = s
      start()
      DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
        MainActor.assumeIsolated {
          guard attempt == self.stepAttempt else { return }
          self.finish(s, .failure(GATTError.timedOut(s.rawValue)))
        }
      }
    }
  }

  /// Resumes the step in flight. `nil` matches any step, for failures that end the whole attempt.
  private func finish(_ s: Step?, _ result: Result<Void, Error>) {
    guard let continuation = step, s == nil || s == waiting else { return }
    step = nil
    waiting = nil
    continuation.resume(with: result)
  }
}

// The central runs on the main queue, so every callback below arrives on the main thread.
extension GATTLink: CBCentralManagerDelegate, CBPeripheralDelegate {
  nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
    let state = central.state
    MainActor.assumeIsolated {
      switch state {
      case .poweredOn: finish(.power, .success(()))
      case .unauthorized: finish(nil, .failure(GATTError.unauthorized))
      case .poweredOff, .unsupported: finish(nil, .failure(GATTError.poweredOff))
      default: break
      }
    }
  }

  nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    nonisolated(unsafe) let peripheral = peripheral
    MainActor.assumeIsolated {
      guard peripheral === self.peripheral else { return }
      finish(.connect, .success(()))
    }
  }

  nonisolated func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    nonisolated(unsafe) let peripheral = peripheral
    let reason = error?.localizedDescription
    MainActor.assumeIsolated {
      guard peripheral === self.peripheral else { return }
      finish(.connect, .failure(GATTError.connectFailed(reason)))
    }
  }

  nonisolated func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    nonisolated(unsafe) let peripheral = peripheral
    MainActor.assumeIsolated {
      // A reconnect gets the same peripheral object back, so the late callback for the
      // connection close() cancelled can land while the new connect is still pending.
      guard peripheral === self.peripheral, waiting != .connect else { return }
      peripheral.delegate = nil
      self.peripheral = nil
      writer = nil
      queue = []
      if step != nil { finish(nil, .failure(BudsError.disconnected)) } else { onClose() }
    }
  }

  // The callbacks below check the peripheral too: one queued before close() must not finish
  // a step of the next connection or feed it old bytes.
  nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    nonisolated(unsafe) let peripheral = peripheral
    let reason = error?.localizedDescription
    MainActor.assumeIsolated {
      guard peripheral === self.peripheral else { return }
      finish(.services, reason.map { .failure(GATTError.connectFailed($0)) } ?? .success(()))
    }
  }

  nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    nonisolated(unsafe) let peripheral = peripheral
    let reason = error?.localizedDescription
    MainActor.assumeIsolated {
      guard peripheral === self.peripheral else { return }
      finish(.characteristics, reason.map { .failure(GATTError.connectFailed($0)) } ?? .success(()))
    }
  }

  nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
    nonisolated(unsafe) let peripheral = peripheral
    let uuid = characteristic.uuid.uuidString
    let on = characteristic.isNotifying
    let reason = error?.localizedDescription
    MainActor.assumeIsolated {
      guard peripheral === self.peripheral, uuid == Self.notifyID.uuidString else { return }
      finish(.notify, on && reason == nil ? .success(()) : .failure(GATTError.notifyFailed(reason)))
    }
  }

  nonisolated func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    guard error == nil, let value = characteristic.value else { return }
    nonisolated(unsafe) let peripheral = peripheral
    let uuid = characteristic.uuid.uuidString
    // Pass every notification through whole; Framer keeps an incomplete frame for the next one.
    let bytes = Array(value)
    MainActor.assumeIsolated {
      guard peripheral === self.peripheral, uuid == Self.notifyID.uuidString else { return }
      onData(bytes)
    }
  }

  nonisolated func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
    MainActor.assumeIsolated { flush() }
  }
}

enum GATTError: LocalizedError {
  case unauthorized
  case poweredOff
  case notFound
  case connectFailed(String?)
  case timedOut(String)
  case missing([String])
  case notifyFailed(String?)
  case frameTooLong(Int, Int)
  case notSent(Int)

  /// Worth another try in a few seconds: the buds may still be bringing up their services.
  var retries: Bool {
    switch self {
    case .notFound, .connectFailed, .timedOut, .notifyFailed, .notSent: true
    default: false
    }
  }

  var errorDescription: String? {
    switch self {
    case .unauthorized: "OpenBuds needs Bluetooth access. Allow it in System Settings › Privacy & Security › Bluetooth."
    case .poweredOff: "Bluetooth is off."
    case .notFound: "The earbuds’ control link isn’t up yet. OpenBuds keeps trying."
    case .connectFailed(let r): "Couldn’t open the earbuds’ control link\(r.map { " (\($0))" } ?? ""). OpenBuds keeps trying."
    case .timedOut(let s): "The earbuds didn’t answer (\(s)). OpenBuds keeps trying."
    case .missing(let ids): "The earbuds don’t offer the control characteristics. Found: \(ids.isEmpty ? "none" : ids.joined(separator: ", "))."
    case .notifyFailed(let r): "The earbuds didn’t turn on replies\(r.map { " (\($0))" } ?? ""). OpenBuds keeps trying."
    case .frameTooLong(let n, let max): "This change is \(n) bytes; the control link takes \(max) at a time."
    case .notSent(let n): "Couldn’t send a \(n)-byte command to the earbuds."
    }
  }
}

/// The earbuds' control channel over classic Bluetooth RFCOMM (the same service Chrome reaches through Web Serial).
/// macOS only opens RFCOMM channels for processes launched as an app bundle, not for bare terminal binaries.
@MainActor
final class RFCOMMLink: NSObject {
  var onData: (Bytes) -> Void = { _ in }
  var onClose: () -> Void = {}
  private var channel: IOBluetoothRFCOMMChannel?
  private var openContinuation: CheckedContinuation<Void, Error>?
  private var openAttempt = 0
  private var sdpContinuation: CheckedContinuation<IOReturn, Never>?

  static let uuid: IOBluetoothSDPUUID = budsServiceUUID.withUnsafeBytes {
    IOBluetoothSDPUUID(bytes: $0.baseAddress, length: 16)
  }

  /// Paired devices that advertise the control service (the 079A SDP record), whatever they are called. When the
  /// record is not cached yet, fall back to the name: it must hold "OnePlus" and "Buds", anywhere, because owners
  /// rename their buds ("Sam's OnePlus Buds 3") and Nord models say "OnePlus Nord Buds 3 Pro". Requiring "Buds"
  /// keeps a paired OnePlus phone or watch out.
  static func candidates() -> [IOBluetoothDevice] {
    let paired = (IOBluetoothDevice.pairedDevices() as? [IOBluetoothDevice]) ?? []
    return paired.filter { $0.getServiceRecord(for: uuid) != nil || nameLooksLikeBuds($0.name) }
  }

  nonisolated static func nameLooksLikeBuds(_ name: String?) -> Bool {
    let name = name ?? ""
    return name.localizedCaseInsensitiveContains("OnePlus") && name.localizedCaseInsensitiveContains("Buds")
  }
}

/// Matches the connected earbuds' Bluetooth output device: prefers an unambiguous exact name match,
/// and falls back to a `"OnePlus Buds"` substring match only when unambiguous (exactly one match).
/// If multiple outputs share the exact same name, returns `nil` rather than controlling the wrong pair.
public nonisolated func matchBudsOutput<T>(_ outputs: [T], named target: String?, name: (T) -> String) -> T? {
  if let target {
    let exact = outputs.filter { name($0) == target }
    if exact.count == 1 { return exact.first }
    if exact.count > 1 { return nil }
  }
  let fallback = outputs.filter { name($0).localizedCaseInsensitiveContains("OnePlus Buds") }
  return fallback.count == 1 ? fallback.first : nil
}

extension RFCOMMLink {

  func channelID(on device: IOBluetoothDevice) async -> BluetoothRFCOMMChannelID? {
    if let id = Self.cachedChannel(device) { return id }
    let status = await withCheckedContinuation { continuation in
      sdpContinuation = continuation
      if device.performSDPQuery(self) != kIOReturnSuccess { finishSDP(kIOReturnError) }
    }
    return status == kIOReturnSuccess ? Self.cachedChannel(device) : nil
  }

  private static func cachedChannel(_ device: IOBluetoothDevice) -> BluetoothRFCOMMChannelID? {
    var id: BluetoothRFCOMMChannelID = 0
    guard let record = device.getServiceRecord(for: uuid), record.getRFCOMMChannelID(&id) == kIOReturnSuccess else { return nil }
    return id
  }

  func open(_ device: IOBluetoothDevice, channel id: BluetoothRFCOMMChannelID) async throws {
    var opened: IOBluetoothRFCOMMChannel?
    openAttempt += 1
    let attempt = openAttempt
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      openContinuation = continuation
      let status = device.openRFCOMMChannelAsync(&opened, withChannelID: id, delegate: self)
      channel = opened
      if status != kIOReturnSuccess { finishOpen(.failure(LinkError.openFailed(status))) }
      // When another process on this Mac holds the channel, bluetoothd refuses it at once but never calls back.
      DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
        MainActor.assumeIsolated {
          guard attempt == self.openAttempt else { return }
          self.finishOpen(.failure(LinkError.openTimedOut))
        }
      }
    }
  }

  func write(_ bytes: Bytes) throws {
    guard let channel, channel.isOpen() else { throw BudsError.disconnected }
    var data = bytes
    let status = channel.writeSync(&data, length: UInt16(data.count))
    guard status == kIOReturnSuccess else { throw LinkError.writeFailed(status) }
  }

  func close() {
    let current = channel
    channel = nil
    current?.setDelegate(nil)
    current?.close()
    finishOpen(.failure(BudsError.disconnected))
  }

  private func finishOpen(_ result: Result<Void, Error>) {
    guard let continuation = openContinuation else { return }
    openContinuation = nil
    if case .failure = result { channel?.setDelegate(nil); channel?.close(); channel = nil }
    continuation.resume(with: result)
  }

  private func finishSDP(_ status: IOReturn) {
    sdpContinuation?.resume(returning: status)
    sdpContinuation = nil
  }

  @objc nonisolated func sdpQueryComplete(_ device: IOBluetoothDevice!, status: IOReturn) {
    onMain { self.finishSDP(status) }
  }
}

/// IOBluetooth calls back on whatever thread it likes (macOS 27 posts connection events off the main thread).
nonisolated func onMain(_ work: @escaping @MainActor () -> Void) {
  if Thread.isMainThread {
    MainActor.assumeIsolated(work)
  } else {
    DispatchQueue.main.async { MainActor.assumeIsolated(work) }
  }
}

extension RFCOMMLink: IOBluetoothRFCOMMChannelDelegate {
  nonisolated func rfcommChannelOpenComplete(_ rfcommChannel: IOBluetoothRFCOMMChannel!, status error: IOReturn) {
    onMain { self.finishOpen(error == kIOReturnSuccess ? .success(()) : .failure(LinkError.openFailed(error))) }
  }
  nonisolated func rfcommChannelData(_ rfcommChannel: IOBluetoothRFCOMMChannel!, data: UnsafeMutableRawPointer!, length: Int) {
    let bytes = Array(UnsafeRawBufferPointer(start: data, count: length).bindMemory(to: UInt8.self))
    onMain { self.onData(bytes) }
  }
  nonisolated func rfcommChannelClosed(_ rfcommChannel: IOBluetoothRFCOMMChannel!) {
    nonisolated(unsafe) let closed = rfcommChannel
    onMain {
      guard closed === self.channel else { return }
      self.channel = nil
      self.onClose()
    }
  }
}

enum LinkError: LocalizedError {
  case openFailed(IOReturn)
  case openTimedOut
  case writeFailed(IOReturn)

  var errorDescription: String? {
    switch self {
    case .openFailed, .openTimedOut:
      "Another app or browser tab on this Mac may be using the earbuds. Close it there; OpenBuds keeps trying and connects by itself. If this keeps happening, turn Bluetooth off and on."
    case .writeFailed(let s): "Couldn’t send to the earbuds (\(String(format: "0x%08x", s)))."
    }
  }
}

/// Bluetooth connect/disconnect notifications, which need an Objective-C target.
@MainActor
final class DeviceWatcher: NSObject {
  var onConnect: (IOBluetoothDevice) -> Void = { _ in }
  var onDisconnect: (IOBluetoothDevice) -> Void = { _ in }
  private var connectNote: IOBluetoothUserNotification?
  private var disconnectNotes: [IOBluetoothUserNotification] = []

  func start() {
    connectNote = IOBluetoothDevice.register(forConnectNotifications: self, selector: #selector(connected(_:device:)))
  }
  func watchDisconnect(of devices: [IOBluetoothDevice]) {
    disconnectNotes.forEach { $0.unregister() }
    disconnectNotes = devices.compactMap {
      $0.register(forDisconnectNotification: self, selector: #selector(disconnected(_:device:)))
    }
  }

  @objc private nonisolated func connected(_ note: IOBluetoothUserNotification, device: IOBluetoothDevice) {
    nonisolated(unsafe) let device = device
    onMain { self.onConnect(device) }
  }
  @objc private nonisolated func disconnected(_ note: IOBluetoothUserNotification, device: IOBluetoothDevice) {
    nonisolated(unsafe) let device = device
    onMain { self.onDisconnect(device) }
  }
}
