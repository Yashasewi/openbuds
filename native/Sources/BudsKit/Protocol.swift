// Swift port of app/src/lib/protocol.ts (the subset the menu-bar app uses).
// Protocol facts: PROTOCOL.md.
import Foundation

public typealias Bytes = [UInt8]

public let budsServiceUUID: Bytes = [
  0x00, 0x00, 0x07, 0x9A, 0xD1, 0x02, 0x11, 0xE1, 0x9B, 0x23, 0x00, 0x02, 0x5B, 0x00, 0xA5, 0xA5,
]
public let budsModel = "065414"

public enum BudsError: LocalizedError, Equatable {
  case notAllowed(UInt16)
  case timeout(UInt16)
  case refused(UInt16, UInt8)
  case declined(UInt8)
  case unrecognized(String)
  case disconnected
  case unverified(String)
  case notOffered(String)

  public var errorDescription: String? {
    switch self {
    case .notAllowed(let c): "Command \(hex(c)) is outside the allowed scope."
    case .timeout(let c): "No reply from the earbuds (\(hex(c)))."
    case .refused(_, 14): "Put at least one earbud in your ear, then try again."
    case .refused(_, let s): "The earbuds refused the change (status \(s))."
    case .declined(let s): "The earbuds declined the request (status \(s))."
    case .unrecognized(let what): "Unrecognized reply: \(what)."
    case .disconnected: "The earbuds disconnected."
    case .unverified(let name): "\(name): the earbuds accepted it but still report the old value."
    case .notOffered(let name): "\(name) is not offered by these earbuds."
    }
  }
}

func hex(_ command: UInt16) -> String { String(format: "%04x", command) }
func signed(_ b: UInt8) -> Int { Int(Int8(bitPattern: b)) }
func le(_ bytes: some Collection<UInt8>) -> Int { bytes.enumerated().reduce(0) { $0 | Int($1.element) << (8 * $1.offset) } }
func minimalLE(_ value: Int) -> Bytes {
  var out: Bytes = [], v = value
  repeat { out.append(UInt8(v & 255)); v >>= 8 } while v > 0
  return out
}

// MARK: Noise control

public enum NoiseMode: String, CaseIterable, Sendable {
  case off, anc, transparency, deep, medium, light, smart, adaptive
  // Buds 4 SET bits for 0x0404 01 01; reports use NOISE_REPORTS.
  var setBit: Int {
    switch self {
    case .off: 0
    case .anc: 1
    case .transparency: 2
    case .deep: 4
    case .medium: 5
    case .light: 6
    case .smart: 7
    case .adaptive: 11
    }
  }
  // What 0x810C 01 01 reports after each SET; any ANC level satisfies a plain `anc` SET.
  var reports: [Int] {
    switch self {
    case .off: [8]
    case .transparency: [256, 512]
    case .adaptive: [2048]
    case .deep: [16]
    case .medium: [32]
    case .light: [64]
    case .smart: [128]
    case .anc: [2, 16, 32, 64, 128]
    }
  }
  public static let ancLevels: [NoiseMode] = [.smart, .deep, .medium, .light]
  public var isANC: Bool { self == .anc || Self.ancLevels.contains(self) }
  static func of(raw: Int) -> NoiseMode? {
    if raw == 2 { return .anc }
    return allCases.first { $0 != .anc && $0.reports.contains(raw) }
  }
}

public struct NoiseState: Equatable, Sendable {
  public let raw: Int
  public let mode: NoiseMode?
}

func noisePayload(_ mode: NoiseMode) -> Bytes { [1, 1] + minimalLE(1 << mode.setBit) }

func decodeNoise(_ p: Bytes) throws -> NoiseState {
  try requireSuccess(p, 4)
  guard p[1] == 1, p[2] == 1, p.count <= 7 else { throw BudsError.unrecognized("noise") }
  let raw = le(p[3...])
  return NoiseState(raw: raw, mode: NoiseMode.of(raw: raw))
}

func decodeSmartLevel(_ p: Bytes) throws -> NoiseMode? {
  try requireSuccess(p, 4)
  guard p[1] == 4, p[2] == 1, p.count <= 7 else { throw BudsError.unrecognized("smart level") }
  let mask = le(p[3...])
  return NoiseMode.allCases.first { mask == 1 << $0.setBit }
}

// MARK: Allowlist and framing

// Every command and payload shape this client may send. Writes outside it are rejected before encoding.
// Firmware/OTA, resets, pairing, ear scans, cloud features and anything undocumented for Buds 4 are absent.
private let allowed: [UInt16: @Sendable (Bytes) -> Bool] = [
  0x0100: \.isEmpty, 0x0103: \.isEmpty, 0x0105: \.isEmpty, 0x0106: \.isEmpty, 0x0108: \.isEmpty, 0x0109: \.isEmpty,
  0x010F: \.isEmpty, 0x0112: \.isEmpty, 0x0114: \.isEmpty, 0x0115: \.isEmpty, 0x0122: \.isEmpty, 0x0124: \.isEmpty,
  0x0130: \.isEmpty, 0x0200: \.isEmpty,
  0x010C: { $0.count == 2 && [1, 2, 4].contains($0[0]) && $0[1] == 1 },
  0x010D: { $0.count > 1 && Int($0[0]) == $0.count - 1 },
  0x0116: { $0.count == 41 && $0[0] == 12 && validHearingInfo(Array($0[1..<37])) },
  0x0205: { p in
    p.count >= 2 && Int(p[0]) == p.count - 1 && p.dropFirst().allSatisfy { [1, 2, 3, 4, 8].contains($0) }
      && Set(p.dropFirst()).count == p.count - 1
  },
  0x0400: { $0 == [0] || $0 == [1] },
  0x0401: validGestureTable,
  0x0403: { $0.count == 2 && Switch.allIDs.contains($0[0]) && $0[1] <= 1 },
  0x0404: { p in NoiseMode.allCases.contains { noisePayload($0) == p } || validHoldCycle(p) },
  0x0405: { $0 == [0] || $0 == [1] },
  0x0406: { $0.count == 1 && $0[0] <= 15 },
  0x040D: { $0 == [2, 0] || $0 == [2, 1] },
  0x040E: { $0 == [4] || validTone($0) || validRecord($0) },
  0x0411: { $0.count == 5 && Array($0[0..<4]) == [1, 1, 1, 0] && $0[4] > 0 },
  0x0413: { $0 == [8, 0, 0] || $0 == [8, 0, 1] },
  0x0418: validCustomEq,
  0x041B: { $0.count == 3 && $0[0] == 0xFB && $0[1] == 5 && abs(signed($0[2])) <= 5 },
  0x0427: { $0.count == 1 && (1...10).contains($0[0]) },
  0x8500: { $0.count == 5 && $0[0] == 0 },
]

public func encode(_ command: UInt16, _ sequence: UInt8, _ payload: Bytes = []) throws -> Bytes {
  guard let valid = allowed[command], valid(payload), (1...254).contains(sequence) || command == 0x8500 else {
    throw BudsError.notAllowed(command)
  }
  var size = 7 + payload.count
  var length: Bytes = []
  repeat {
    var byte = UInt8(size & 127)
    size >>= 7
    if size > 0 { byte |= 128 }
    length.append(byte)
  } while size > 0
  return [0xAA] + length + [0, 0, UInt8(command & 0xFF), UInt8(command >> 8), sequence,
    UInt8(payload.count & 0xFF), UInt8(payload.count >> 8)] + payload
}

public struct Frame: Sendable {
  public let command: UInt16
  public let sequence: UInt8
  public let payload: Bytes
}

public struct Framer {
  private var buffer: Bytes = []
  public init() {}
  public mutating func push(_ chunk: Bytes) -> [Frame] {
    if buffer.count + chunk.count > 65536 { buffer = []; return [] }
    buffer += chunk
    var frames: [Frame] = []
    while !buffer.isEmpty {
      if buffer[0] != 0xAA { buffer.removeFirst(); continue }
      var size = 0, count = 0, complete = false, i = 1
      while i < buffer.count && i <= 3 {
        size += Int(buffer[i] & 127) << (7 * count)
        count += 1
        if buffer[i] & 128 == 0 { complete = true; break }
        i += 1
      }
      if !complete { if buffer.count >= 4 { buffer.removeFirst(); continue } else { break } }
      if size < 7 || size > 8192 { buffer.removeFirst(); continue }
      let prefix = 1 + count, total = prefix + size
      if buffer.count < total { break }
      let bytes = Array(buffer[0..<total])
      buffer.removeFirst(total)
      let n = Int(bytes[prefix + 5]) | Int(bytes[prefix + 6]) << 8
      guard bytes[prefix] == 0, bytes[prefix + 1] == 0, n == size - 7 else { continue }
      frames.append(Frame(
        command: UInt16(bytes[prefix + 2]) | UInt16(bytes[prefix + 3]) << 8,
        sequence: bytes[prefix + 4],
        payload: Array(bytes[(prefix + 7)...])))
    }
    return frames
  }
}

func requireSuccess(_ p: Bytes, _ minimum: Int = 1) throws {
  guard p.count >= minimum else { throw BudsError.unrecognized("incomplete reply") }
  guard p[0] == 0 else { throw BudsError.declined(p[0]) }
}

func acknowledged(_ command: UInt16, _ p: Bytes) throws {
  guard let status = p.first else { throw BudsError.unrecognized("empty acknowledgement") }
  guard status == 0 else { throw BudsError.refused(command, status) }
}

// MARK: Capabilities

// Bit n of the 0x8100 bitmap enables these commands (QuickBuds desktop/src/types.rs:205 BIT_COMMANDS; QuickBuds labels it [VENDOR], docs/PROTOCOL.md:265). TODO: re-verify with a capture.
private let bitCommands: [[UInt16]] = [
  [0x0105], [0x0106], [0x0107], [0x0108, 0x0401, 0x0416], [0x0109], [0x0400], [0x0402], [0x0403],
  [0x010C, 0x0404], [0x0405], [0x0406, 0x010F], [0x0407], [], [0x0408], [0x0409], [], [],
  [0x0114], [], [0x040E, 0x040D, 0x0115, 0x0116], [0x040F], [0x0410, 0x0119], [0x0205], [0x0F00],
  [], [0x0118, 0x0411], [0x011A, 0x0412], [0x011C, 0x0413], [], [0x0112, 0x040B],
  [0x011E, 0x011F, 0x0415], [0x040D], [], [0x0121, 0x0417], [0x0122, 0x0418], [],
  [0x011D, 0x0414], [0x0123, 0x041A], [0x0124, 0x041B], [0x0125, 0x041C, 0x0127, 0x041D, 0x041F],
  [0x0421, 0x0023, 0x0024, 0x0022, 0x0126, 0x0129], [0xEF01], [0xEF02], [0xEF03, 0x041E], [0x0420],
  [0x001C], [], [0x0422, 0x012A], [0xEF04], [0x0423, 0x012B], [], [0x0424], [0xEF06], [], [],
  [0x0425, 0x012E, 0x0426], [0x012F], [0x0427, 0x0130], [0x0131, 0x0428], [0x0429, 0x0132], [0x0014],
  [0x042D, 0x0133], [0x042E], [0xEF07], [0xEF08], [0xEF09], [0x0431, 0x0134],
]
private let always: Set<UInt16> = [0x0100, 0x0101, 0x0102, 0x0103, 0x0104, 0x0106, 0x010B, 0x010D, 0x0200, 0x0F00, 0x0F03, 0x0F04]

public struct Capabilities: Sendable {
  let offered: Set<UInt16>
  public func supports(_ command: UInt16) -> Bool { offered.contains(command) }
}

func decodeCapabilities(_ p: Bytes) throws -> Capabilities {
  try requireSuccess(p, 2)
  var offered = always
  for (bit, commands) in bitCommands.enumerated() where bit < (p.count - 1) * 8 && (p[1 + bit >> 3] >> (bit & 7)) & 1 == 1 {
    offered.formUnion(commands)
  }
  return Capabilities(offered: offered)
}

// MARK: Battery and wearing

public enum Part: Int, CaseIterable, Sendable {
  case left = 1, right, chargingCase
  public var label: String {
    switch self {
    case .left: "Left"
    case .right: "Right"
    case .chargingCase: "Case"
    }
  }
}

public struct BatteryLevel: Equatable, Sendable {
  public let percent: Int?
  public let charging: Bool
}

public struct WearState: Equatable, Sendable {
  public let raw: UInt8
  public var inEar: Bool { raw & 2 != 0 }
  public var inCase: Bool { raw & 1 == 0 }
  public var lidOpen: Bool { raw & 4 != 0 }
}

// <count> (<id> <value>)*, optionally after a status byte; ids 1 left, 2 right, 3 case.
func pairs(_ p: Bytes, status: Bool) -> [(Part, UInt8)]? {
  for offset in status ? [1] : [0, 1] {
    if offset == 1 && p.first != 0 { continue }
    guard p.count > offset else { continue }
    let count = Int(p[offset])
    guard count <= 3, p.count == offset + 1 + 2 * count else { continue }
    var result: [(Part, UInt8)] = []
    for i in 0..<count {
      guard let part = Part(rawValue: Int(p[offset + 1 + i * 2])), !result.contains(where: { $0.0 == part }) else { return nil }
      result.append((part, p[offset + 2 + i * 2]))
    }
    return result
  }
  return nil
}

func decodeBattery(_ p: Bytes, status: Bool) -> [Part: BatteryLevel]? {
  guard let list = pairs(p, status: status), list.allSatisfy({ $0.1 & 127 <= 100 }) else { return nil }
  return Dictionary(uniqueKeysWithValues: list.map { part, v in
    (part, BatteryLevel(percent: v & 127 == 0 ? nil : Int(v & 127), charging: v & 128 != 0))
  })
}

func decodeWearing(_ p: Bytes) -> [Part: WearState]? {
  guard let list = pairs(p, status: false) else { return nil }
  return Dictionary(uniqueKeysWithValues: list.map { ($0.0, WearState(raw: $0.1)) })
}

// MARK: Identity, EQ

func decodeModel(_ p: Bytes) throws -> String {
  try requireSuccess(p, 4)
  guard p.count == 4 else { throw BudsError.unrecognized("model") }
  return String(format: "%06x", Int(p[1]) | Int(p[2]) << 8 | Int(p[3]) << 16)
}

func decodeFirmware(_ p: Bytes) throws -> String {
  try requireSuccess(p, 3)
  let parts = String(decoding: p[2...], as: UTF8.self).split(separator: ",", omittingEmptySubsequences: false)
  guard parts.count % 3 == 0 else { throw BudsError.unrecognized("firmware") }
  let versions = stride(from: 0, to: parts.count, by: 3)
    .filter { parts[$0 + 1].trimmingCharacters(in: .whitespaces) == "2" }
    .map { parts[$0 + 2].trimmingCharacters(in: .whitespaces) }
  guard !versions.isEmpty, versions.allSatisfy({ $0.allSatisfy(\.isNumber) }) else { throw BudsError.unrecognized("firmware") }
  return versions.joined(separator: ".")
}

func decodeByte(_ p: Bytes) throws -> Int {
  try requireSuccess(p, 2)
  guard p.count == 2 else { throw BudsError.unrecognized("byte reply") }
  return Int(p[1])
}

public struct Band: Equatable, Sendable {
  public let frequency: Int
  public var gain: Int
  public init(frequency: Int, gain: Int) { self.frequency = frequency; self.gain = gain }
}

public struct Preset: Identifiable, Equatable, Sendable {
  public let id: Int
  public var name: String
  public var bands: [Band]
  public var isCustom: Bool { !bands.isEmpty }
  public init(id: Int, name: String, bands: [Band] = []) { self.id = id; self.name = name; self.bands = bands }
  public static let builtIn = [Preset(id: 0, name: "Balanced"), Preset(id: 1, name: "Serenade"), Preset(id: 2, name: "Bass")]
}

func decodeCustomPresets(_ p: Bytes) throws -> [Preset] {
  try requireSuccess(p, 2)
  guard p[1] <= 10 else { throw BudsError.unrecognized("preset count") }
  var cursor = 2, result: [Preset] = []
  for _ in 0..<p[1] {
    guard cursor + 5 <= p.count else { throw BudsError.unrecognized("truncated preset") }
    let id = Int(p[cursor + 3]), nameLength = Int(p[cursor + 4])
    cursor += 5
    guard cursor + nameLength + 1 <= p.count else { throw BudsError.unrecognized("truncated preset name") }
    let name = String(decoding: p[cursor..<(cursor + nameLength)], as: UTF8.self)
    cursor += nameLength
    let count = Int(p[cursor])
    cursor += 1
    guard count <= 16, cursor + count * 3 <= p.count else { throw BudsError.unrecognized("truncated preset bands") }
    let bands = (0..<count).map { i in
      Band(frequency: Int(p[cursor + i * 3]) | Int(p[cursor + i * 3 + 1]) << 8, gain: signed(p[cursor + i * 3 + 2]))
    }
    cursor += count * 3
    result.append(Preset(id: id, name: name, bands: bands))
  }
  guard cursor == p.count else { throw BudsError.unrecognized("preset suffix") }
  return result
}
