// Settings beyond noise and EQ; ports of app/src/lib/protocol.ts.
import Foundation

// MARK: Switches (0x0403 <id> <0/1>, read with 0x010D)

public enum Switch: UInt8, CaseIterable, Sendable {
  case wearDetection = 4, gameMode = 6, goldenSound = 11, dualConnection = 17, hiRes = 24, spatial = 27, smartVolume = 28, bassWave = 29
  static let allIDs = Set(allCases.map(\.rawValue))
  public var title: String {
    switch self {
    case .wearDetection: "Wear detection"
    case .gameMode: "Game mode"
    case .goldenSound: "Golden Sound"
    case .dualConnection: "Dual connection"
    case .hiRes: "Hi-Res audio"
    case .spatial: "3D Audio"
    case .smartVolume: "Smart volume"
    case .bassWave: "BassWave"
    }
  }
}
// The ids this firmware's 0x010D reply answers for.
let featureQuery: Bytes = [9, 5, 4, 11, 17, 24, 6, 27, 29, 28]

func decodeFeatures(_ p: Bytes) throws -> [UInt8: UInt8] {
  try requireSuccess(p, 2)
  guard p.count == 2 + Int(p[1]) * 2 else { throw BudsError.unrecognized("feature count") }
  var result: [UInt8: UInt8] = [:]
  for i in stride(from: 2, to: p.count, by: 2) {
    guard result[p[i]] == nil else { throw BudsError.unrecognized("duplicate feature") }
    result[p[i]] = p[i + 1]
  }
  return result
}

// MARK: Touch-and-hold noise cycle (0x0404 02 01 <minimal LE mask>)

public enum HoldMode: Int, CaseIterable, Sendable {
  case off = 0, anc = 1, transparency = 2, adaptive = 11
  public var title: String {
    switch self {
    case .off: "Off"
    case .anc: "Noise cancelling"
    case .transparency: "Transparency"
    case .adaptive: "Adaptive"
    }
  }
}
private let holdMask = HoldMode.allCases.reduce(0) { $0 | 1 << $1.rawValue }

func holdCyclePayload(_ modes: Set<HoldMode>) -> Bytes { [2, 1] + minimalLE(holdCycleMask(modes)) }
func holdCycleMask(_ modes: Set<HoldMode>) -> Int { modes.reduce(0) { $0 | 1 << $1.rawValue } }
func validHoldCycle(_ p: Bytes) -> Bool {
  guard p.count >= 3, p.count <= 6, p[0] == 2, p[1] == 1 else { return false }
  let mask = le(p[2...])
  return mask > 0 && mask & ~holdMask == 0 && Array(p[2...]) == minimalLE(mask)
}
func decodeHoldCycle(_ p: Bytes) throws -> Set<HoldMode> {
  try requireSuccess(p, 4)
  guard p[1] == 2, p[2] == 1, p.count <= 7 else { throw BudsError.unrecognized("hold cycle") }
  let mask = le(p[3...])
  return Set(HoldMode.allCases.filter { mask & 1 << $0.rawValue != 0 })
}

// MARK: Gestures (read 0x0108, write the whole table with 0x0401)

public enum Ear: UInt8, CaseIterable, Sendable {
  case left = 1, right = 2
  public var title: String { self == .left ? "Left" : "Right" }
}

public struct GestureSlot: Equatable, Sendable {
  public let device: UInt8  // 1 left, 2 right, 4 both
  public let button: UInt8  // 6 is the call group
  public let action: UInt8
  public var function: UInt8
}

public enum Gestures {
  public static let actions: [UInt8: String] = [1: "Single tap", 2: "Double tap", 3: "Triple tap", 4: "Touch and hold", 5: "Slide", 6: "Long hold"]
  public static let functions: [UInt8: String] = [
    0: "Nothing", 1: "Play or pause", 3: "Voice assistant", 5: "Previous track", 6: "Next track", 7: "Volume",
    8: "Cycle noise modes", 10: "Change track", 11: "Volume up", 12: "Volume down", 13: "Switch devices", 17: "Game mode",
    28: "Decline call", 29: "Answer or end call",
  ]
  // Buds 4 gesture and call menus, mapped to measured function bytes. Call menus: QuickBuds captures (docs/PROTOCOL.md:1009). Gesture lists: no independent source; QuickBuds' Buds 4 menu entry (line 1013) is a comparison with the vendor app, not a capture. TODO: re-verify each list with a capture.
  public static let menus: [UInt8: [UInt8]] = [1: [0, 1], 2: [0, 1, 5, 6, 3, 17], 3: [0, 5, 6, 3, 17], 5: [0, 7, 10], 4: [0, 8]]
  public static let callMenus: [UInt8: [UInt8]] = [2: [0, 29], 6: [0, 28]]
  public static let order: [UInt8] = [1, 2, 3, 5, 4]
  static let known: Set<UInt8> = [0, 1, 3, 5, 6, 7, 8, 10, 11, 12, 17, 28, 29]
}

func decodeGestures(_ p: Bytes) throws -> [GestureSlot] {
  try requireSuccess(p, 2)
  guard p[1] <= 64, p.count == 2 + Int(p[1]) * 4 else { throw BudsError.unrecognized("gesture table") }
  return try stride(from: 2, to: p.count, by: 4).map { i in
    guard [1, 2, 4].contains(p[i]) else { throw BudsError.unrecognized("gesture side") }
    return GestureSlot(device: p[i], button: p[i + 1], action: p[i + 2], function: p[i + 3])
  }
}

func validGestureTable(_ p: Bytes) -> Bool {
  guard let n = p.first, (1...64).contains(n), p.count == 1 + Int(n) * 4 else { return false }
  for index in stride(from: 1, to: p.count, by: 4) {
    let device = p[index]
    let button = p[index + 1]
    let action = p[index + 2]
    let function = p[index + 3]
    let deviceOK = device == 1 || device == 2 || device == 4
    let buttonOK = (1...6).contains(button)
    let actionOK = (1...6).contains(action)
    let functionOK = Gestures.known.contains(function)
    if !deviceOK || !buttonOK || !actionOK || !functionOK { return false }
  }
  return true
}

// Writes every slot the table has for (side, action) outside the call group; the table's shape varies between reads.
func gestureTablePayload(_ table: [GestureSlot], ear: Ear, action: UInt8, function: UInt8) throws -> Bytes {
  guard Gestures.menus[action]?.contains(function) == true else { throw BudsError.notOffered("That function") }
  var matched = false
  let entries = table.map { g -> Bytes in
    if g.device == ear.rawValue, g.action == action, g.button != 6 { matched = true; return [g.device, g.button, g.action, function] }
    return [g.device, g.button, g.action, g.function]
  }
  guard matched else { throw BudsError.notOffered("This gesture") }
  return [UInt8(entries.count)] + entries.flatMap { $0 }
}

func callGesturePayload(action: UInt8, function: UInt8) throws -> Bytes {
  guard Gestures.callMenus[action]?.contains(function) == true else { throw BudsError.notOffered("That function") }
  return [1, 4, 6, action, function]
}

// MARK: Custom EQ (0x0418 <1 create, 2 save, 3 delete> FA 06 <id> <name> <bands>)

public let eqBands = [62, 250, 1000, 4000, 8000, 16000]
public let eqGain = 6
public let eqMaxCustom = 3

enum PresetAction: UInt8 { case create = 1, save = 2, delete = 3 }

func customEqPayload(_ action: PresetAction, _ preset: Preset) -> Bytes {
  let name = Array(preset.name.utf8)
  return [action.rawValue, UInt8(bitPattern: Int8(-eqGain)), UInt8(eqGain), action == .create ? 0 : UInt8(preset.id),
    UInt8(name.count)] + name + [UInt8(preset.bands.count)]
    + preset.bands.flatMap { [UInt8($0.frequency & 255), UInt8($0.frequency >> 8), UInt8(bitPattern: Int8($0.gain))] }
}

func validCustomEq(_ p: Bytes) -> Bool {
  guard p.count >= 6, [1, 2, 3].contains(p[0]), p[1] == UInt8(bitPattern: Int8(-eqGain)), p[2] == UInt8(eqGain) else { return false }
  let nameLength = Int(p[4])
  guard nameLength > 0, nameLength <= 16, p.count > 5 + nameLength,
    p[5..<(5 + nameLength)].allSatisfy({ (32..<127).contains($0) })
  else { return false }
  let count = Int(p[5 + nameLength]), bands = p[(6 + nameLength)...]
  guard (1...10).contains(count), bands.count == count * 3 else { return false }
  guard stride(from: bands.startIndex, to: bands.endIndex, by: 3).allSatisfy({ abs(signed(bands[$0 + 2])) <= eqGain }) else { return false }
  return p[0] == 1 ? p[3] == 0 : p[3] > 2
}

public func validPresetName(_ name: String) -> Bool {
  (1...16).contains(name.count) && name.unicodeScalars.allSatisfy { (32..<127).contains($0.value) }
}

// MARK: BassWave level, codec, connected devices

func bassPayload(_ level: Int) -> Bytes { [0xFB, 5, UInt8(bitPattern: Int8(level))] }
func decodeBass(_ p: Bytes) throws -> Int {
  try requireSuccess(p, 4)
  guard p.count == 4, p[1] == 0xFB, p[2] == 5 else { throw BudsError.unrecognized("BassWave") }
  return signed(p[3])
}

public let codecNames: [Int: String] = [1: "SBC", 2: "AAC", 3: "LDAC", 4: "aptX", 5: "aptX HD", 6: "aptX Adaptive", 7: "LHDC", 8: "LHDC V5"]

public struct HostDevice: Equatable, Sendable, Identifiable {
  public let id: Int
  public let name: String
  public let connected: Bool
  public let thisDevice: Bool
  public let playing: Bool
}

func decodeDevices(_ p: Bytes) throws -> [HostDevice] {
  try requireSuccess(p, 2)
  guard p[1] <= 10 else { throw BudsError.unrecognized("device count") }
  var cursor = 2, result: [HostDevice] = []
  for i in 0..<Int(p[1]) {
    guard cursor + 10 <= p.count else { throw BudsError.unrecognized("truncated device") }
    let length = Int(p[cursor + 6]), state = p[cursor + 7], flags = p[cursor + 8], n = Int(p[cursor + 9])
    guard length == 3 + n, cursor + 10 + n <= p.count else { throw BudsError.unrecognized("device name length") }
    let name = String(decoding: p[(cursor + 10)..<(cursor + 10 + n)], as: UTF8.self)
    result.append(HostDevice(id: i, name: name, connected: state == 2, thisDevice: flags & 1 != 0, playing: flags & 4 != 0))
    cursor += 10 + n
  }
  guard cursor == p.count else { throw BudsError.unrecognized("device suffix") }
  return result
}

// MARK: Fit test (push 04 <dev> <status>…)

public struct FitResult: Equatable, Sendable {
  public var left: String?
  public var right: String?
}

func decodeFit(_ p: Bytes) -> FitResult {
  var result = FitResult()
  for i in stride(from: 0, to: p.count - 1, by: 2) {
    let text = [1: "Good seal", 0: "Average seal", 6: "Poor seal"][Int(p[i + 1])] ?? "Not measured"
    if p[i] == 1 { result.left = text }
    if p[i] == 2 { result.right = text }
  }
  return result
}

// MARK: Golden Sound hearing test

public let hearingStops = [-120, -88, -55, -52, -49, -45, -41, -38, -35, -30, -25, -22, -19, -15, -11, -8, -5, -1, 3, 5, 7, 10, 13, 15, 17]
let hearingResults = [-55, -49, -41, -35, -25, -19, -11, -5, 3, 7, 13, 17]
public let hearingStart = 9
public let hearingLoud = 21
public let hearingFrequencies = ["250 Hz", "500 Hz", "1 kHz", "2 kHz", "4 kHz", "8 kHz"]

func hearingSnap(_ v: Int) -> Int { hearingResults.min { abs($0 - v) < abs($1 - v) }! }
private func hearingInfo(_ values: [Int]) -> Bytes {
  values.enumerated().flatMap { (i: Int, v: Int) -> Bytes in [UInt8(i / 6 + 1), UInt8(i % 6 + 1), UInt8(bitPattern: Int8(v))] }
}
private func be32(_ n: UInt32) -> Bytes { [UInt8(n >> 24 & 255), UInt8(n >> 16 & 255), UInt8(n >> 8 & 255), UInt8(n & 255)] }

func validHearingInfo(_ p: Bytes) -> Bool {
  guard p.count == 36 else { return false }
  return (0..<12).allSatisfy { (i: Int) -> Bool in
    let side = UInt8(i / 6 + 1), frequency = UInt8(i % 6 + 1)
    return p[i * 3] == side && p[i * 3 + 1] == frequency && hearingResults.contains(signed(p[i * 3 + 2]))
  }
}
func validTone(_ p: Bytes) -> Bool {
  p.count == 5 && p[0] == 3 && p[1] == 1 && [1, 2].contains(p[2]) && (1...6).contains(p[3]) && hearingStops.contains(signed(p[4]))
}
func validRecord(_ p: Bytes) -> Bool {
  p.count >= 42 && p[0] == 3 && p[1] == 12 && validHearingInfo(Array(p[2..<38])) && p[42...].allSatisfy { (32..<127).contains($0) }
}

func tonePayload(side: UInt8, frequency: UInt8, value: Int) -> Bytes { [3, 1, side, frequency, UInt8(bitPattern: Int8(value))] }
func hearingFilterPayload(uid: UInt32, values: [Int]) -> Bytes { [12] + hearingInfo(values) + be32(uid) }
func hearingRecordPayload(uid: UInt32, name: String, values: [Int]) -> Bytes { [3, 12] + hearingInfo(values) + be32(uid) + Array(name.utf8) }
func hearingEnhanceType(_ p: Bytes) throws -> UInt8 {
  try requireSuccess(p, 10)
  guard p[5] == 4 else { throw BudsError.unrecognized("hearing filter") }
  return p[9]
}

public struct GoldenRecord: Equatable, Sendable {
  public let values: [Int]
  public let uid: UInt32
  public let name: String
}

func decodeGolden(_ p: Bytes) -> GoldenRecord? {
  guard p.count >= 43, p[0] == 0, p[1] == 3, p[2] == 12 else { return nil }
  let values = stride(from: 3, to: 39, by: 3).map { signed(p[$0 + 2]) }
  let uid = UInt32(p[39]) << 24 | UInt32(p[40]) << 16 | UInt32(p[41]) << 8 | UInt32(p[42])
  return GoldenRecord(values: values, uid: uid, name: String(decoding: p[43...], as: UTF8.self))
}
