// Per-model profiles: Swift twin of ModelProfile in app/src/lib/protocol.ts.
// What each model may be sent, and how its values are read. Anything a profile does not list is refused.
// app/tests/fixtures/*.json are replayed against both implementations (native/Tests/BudsKitTests).
import Foundation

public enum GestureWrite: Sendable {
  /// 0x0401 carries every slot of the table (Buds 4).
  case table
  /// 0x0401 carries only the changed slot, the form captured on Buds 3 (01 01 01 02 03).
  case slot
}

public struct ModelProfile: Sendable {
  /// Six hex digits from the 0x8103 reply, e.g. "065414".
  public let productId: String
  public let displayName: String
  /// No owner has verified every write path yet; the UI says so.
  public let experimental: Bool
  public let testedFirmware: [String]
  public let noiseModes: [NoiseMode]
  /// Empty: the model has no touch-and-hold cycle, so none is read, written or shown.
  public let holdModes: [HoldMode]
  /// Switch ids the model reports in 0x010D (shown) and the subset that may be written (0x0403).
  public let switchesReadable: Set<UInt8>
  public let switchesWritable: Set<UInt8>
  /// Ids sent in 0x010D; the count byte is prepended (see `featurePayload`).
  public let featureQuery: Bytes
  public let eqPresets: [Preset]
  public let customEq: Bool
  public let gestureMenus: [UInt8: [UInt8]]
  public let callMenus: [UInt8: [UInt8]]
  public let gestureWrite: GestureWrite
  /// Function bytes a gesture table may carry.
  public let gestureFunctions: Set<UInt8>
  let allowed: [UInt16: @Sendable (Bytes) -> Bool]

  public var featurePayload: Bytes { [UInt8(featureQuery.count)] + featureQuery }
  public var isKnown: Bool { !productId.isEmpty }

  /// Whether this exact command and payload may be sent to this model.
  public func allows(_ command: UInt16, _ payload: Bytes = []) -> Bool { allowed[command]?(payload) ?? false }
  public func allows(command: UInt16) -> Bool { allowed[command] != nil }

  public static func profile(for productId: String) -> ModelProfile? {
    all.first { $0.productId == productId.lowercased() }
  }
  public static let all = [buds4, buds3]
}

// MARK: Allow-list builder

private struct Shape {
  let commands: [UInt16]
  /// 0x010C kinds that may be read: 1 noise, 2 hold cycle, 4 Smart level.
  let noiseReads: [UInt8]
  /// Restricts the ids of a 0x010D read. nil: any id (Buds 4 today).
  let featureReadIds: Set<UInt8>?
  /// Highest preset id 0x0406 may set.
  let eqMaxId: UInt8
}

// Payload shapes that do not vary by model. A model's allow-list picks from these by command.
private let fixedShapes: [UInt16: @Sendable (Bytes) -> Bool] = [
  0x0100: \.isEmpty, 0x0103: \.isEmpty, 0x0105: \.isEmpty, 0x0106: \.isEmpty, 0x0108: \.isEmpty, 0x0109: \.isEmpty,
  0x010F: \.isEmpty, 0x0112: \.isEmpty, 0x0114: \.isEmpty, 0x0115: \.isEmpty, 0x0122: \.isEmpty, 0x0124: \.isEmpty,
  0x0130: \.isEmpty, 0x0200: \.isEmpty,
  0x0116: { $0.count == 41 && $0[0] == 12 && validHearingInfo(Array($0[1..<37])) },
  0x0205: { p in
    p.count >= 2 && Int(p[0]) == p.count - 1 && p.dropFirst().allSatisfy { [1, 2, 3, 4, 8].contains($0) }
      && Set(p.dropFirst()).count == p.count - 1
  },
  0x0400: { $0 == [0] || $0 == [1] },
  0x0405: { $0 == [0] || $0 == [1] },
  0x040D: { $0 == [2, 0] || $0 == [2, 1] },
  0x040E: { $0 == [4] || validTone($0) || validRecord($0) },
  0x0411: { $0.count == 5 && Array($0[0..<4]) == [1, 1, 1, 0] && $0[4] > 0 },
  0x0413: { $0 == [8, 0, 0] || $0 == [8, 0, 1] },
  0x0418: { validCustomEq($0) },
  0x041B: { $0.count == 3 && $0[0] == 0xFB && $0[1] == 5 && abs(signed($0[2])) <= 5 },
  0x0427: { $0.count == 1 && (1...10).contains($0[0]) },
  // Our answer to the buds' 0x0500 time request: 00 <unix seconds u32 LE>.
  0x8500: { $0.count == 5 && $0[0] == 0 },
]

// Every command and payload shape a model may be sent. Firmware/OTA, resets, pairing, ear scans, cloud
// features and anything not documented for the model are absent and therefore rejected.
private func allowList(
  noiseModes: [NoiseMode], holdModes: [HoldMode], switchesWritable: Set<UInt8>, gestureFunctions: Set<UInt8>, shape: Shape
) -> [UInt16: @Sendable (Bytes) -> Bool] {
  let noisePayloads = noiseModes.map { noisePayload($0) }
  let holdMask = holdModes.reduce(0) { $0 | 1 << $1.rawValue }
  let reads = shape.noiseReads, readIds = shape.featureReadIds, maxEq = shape.eqMaxId
  let varying: [UInt16: @Sendable (Bytes) -> Bool] = [
    0x010C: { $0.count == 2 && reads.contains($0[0]) && $0[1] == 1 },
    0x010D: { p in
      p.count > 1 && Int(p[0]) == p.count - 1 && (readIds.map { ids in p.dropFirst().allSatisfy { ids.contains($0) } } ?? true)
    },
    0x0401: { validGestureTable($0, known: gestureFunctions) },
    0x0403: { $0.count == 2 && switchesWritable.contains($0[0]) && $0[1] <= 1 },
    0x0404: { p in noisePayloads.contains(p) || (holdMask != 0 && validHoldCycle(p, mask: holdMask)) },
    0x0406: { $0.count == 1 && $0[0] <= maxEq },
  ]
  var result: [UInt16: @Sendable (Bytes) -> Bool] = [:]
  for command in shape.commands {
    guard let valid = varying[command] ?? fixedShapes[command] else { fatalError("No payload check for \(hex(command))") }
    result[command] = valid
  }
  return result
}

private func makeProfile(
  productId: String, displayName: String, experimental: Bool, testedFirmware: [String], noiseModes: [NoiseMode],
  holdModes: [HoldMode], switchesReadable: Set<UInt8>, switchesWritable: Set<UInt8>, featureQuery: Bytes, eqPresets: [Preset],
  customEq: Bool, gestureMenus: [UInt8: [UInt8]], callMenus: [UInt8: [UInt8]], gestureWrite: GestureWrite,
  gestureFunctions: Set<UInt8>, shape: Shape
) -> ModelProfile {
  ModelProfile(
    productId: productId, displayName: displayName, experimental: experimental, testedFirmware: testedFirmware,
    noiseModes: noiseModes, holdModes: holdModes, switchesReadable: switchesReadable, switchesWritable: switchesWritable,
    featureQuery: featureQuery, eqPresets: eqPresets, customEq: customEq, gestureMenus: gestureMenus, callMenus: callMenus,
    gestureWrite: gestureWrite, gestureFunctions: gestureFunctions,
    allowed: allowList(
      noiseModes: noiseModes, holdModes: holdModes, switchesWritable: switchesWritable,
      gestureFunctions: gestureFunctions, shape: shape))
}

// MARK: Profiles

extension ModelProfile {
  /// OnePlus Buds 4. Every value is what OpenBuds sent before profiles existed (PROTOCOL.md, "Per-model differences").
  public static let buds4 = makeProfile(
    productId: "065414", displayName: "OnePlus Buds 4", experimental: false, testedFirmware: ["138.138.105"],
    noiseModes: NoiseMode.allCases, holdModes: HoldMode.allCases,
    switchesReadable: Switch.allIDs, switchesWritable: Switch.allIDs,
    // The macOS app has always asked for id 9 as well; the web app does not. Kept as is.
    featureQuery: [9, 5, 4, 11, 17, 24, 6, 27, 29, 28],
    eqPresets: [Preset(id: 0, name: "Balanced"), Preset(id: 1, name: "Serenade"), Preset(id: 2, name: "Bass")],
    customEq: true,
    // Call menus: QuickBuds captures (docs/PROTOCOL.md:1009). Gesture lists: no independent source; QuickBuds' Buds 4 menu entry (line 1013) is a comparison with the vendor app, not a capture. TODO: re-verify each list with a capture.
    gestureMenus: [1: [0, 1], 2: [0, 1, 5, 6, 3, 17], 3: [0, 5, 6, 3, 17], 5: [0, 7, 10], 4: [0, 8]],
    callMenus: [2: [0, 29], 6: [0, 28]],
    gestureWrite: .table,
    // Measured Buds 4 function bytes; a whole-table write can carry any of them back unchanged.
    gestureFunctions: [0, 1, 3, 5, 6, 7, 8, 10, 11, 12, 17, 28, 29],
    shape: Shape(
      commands: [
        0x0100, 0x0103, 0x0105, 0x0106, 0x0108, 0x0109, 0x010C, 0x010D, 0x010F, 0x0112, 0x0114, 0x0115, 0x0122, 0x0124,
        0x0130, 0x0200, 0x0116, 0x0205, 0x0400, 0x0401, 0x0403, 0x0404, 0x0405, 0x0406, 0x040D, 0x040E, 0x0411, 0x0413,
        0x0418, 0x041B, 0x0427, 0x8500,
      ],
      noiseReads: [1, 2, 4], featureReadIds: nil, eqMaxId: 15))

  /// OnePlus Buds 3. Source for every entry: owner capture, OnePlus Buds 3 fw 127.127.101, 2026-10-12
  /// (RFCOMM channel 15, SDP 0000079A), by Himanshu Singh. Nothing is copied from another project or app.
  /// Anything that capture did not exercise is absent, so it cannot be sent.
  public static let buds3 = makeProfile(
    productId: "063c14", displayName: "OnePlus Buds 3", experimental: true, testedFirmware: ["127.127.101"],
    // Set and read back in the capture: Off 0, ANC 1, Transparency 2, Deep 4, Medium 5, Light 6, Smart 7.
    // Adaptive (bit 11) was never tried, so it is not offered.
    noiseModes: [.off, .anc, .transparency, .deep, .medium, .light, .smart],
    // Hold cycle (0x010C 02 01, 0x0404 02 01) was never captured.
    holdModes: [],
    // 0x010D answered for ids 6, 4 and 17. 6 and 4 were written and read back; 17 (dual connection) was not
    // written, because it could drop the link.
    switchesReadable: [Switch.gameMode.rawValue, Switch.wearDetection.rawValue, Switch.dualConnection.rawValue],
    switchesWritable: [Switch.gameMode.rawValue, Switch.wearDetection.rawValue],
    featureQuery: [6, 4, 17],
    // 0x0406 ids 0..3 were each acknowledged and read back through 0x010F. The preset names are not taken
    // from any vendor app, so these labels are neutral. TODO: owner to confirm names from the phone app.
    eqPresets: (0...3).map { Preset(id: $0, name: "Preset \($0 + 1)") },
    // Custom EQ (0x0122, 0x0418) was never captured.
    customEq: false,
    // Same menus as Buds 4 without function 17 (game mode), which the capture did not show on this model.
    gestureMenus: [1: [0, 1], 2: [0, 1, 5, 6, 3], 3: [0, 5, 6, 3], 5: [0, 7, 10], 4: [0, 8]],
    // The 0x0108 table has no button-6 (call) entries on Buds 3.
    callMenus: [:],
    // Write captured as 0x0401 01 01 01 02 03: one slot, acknowledged and read back.
    gestureWrite: .slot,
    gestureFunctions: [0, 1, 3, 5, 6, 7, 8, 10],
    // Handshake, identity, firmware, offered events and subscription, battery, noise, EQ, switches and gestures.
    // 0x0109 (wear) was never queried; wear arrives by push. 0x0400, 0x0405 etc. were not exercised.
    shape: Shape(
      commands: [0x0100, 0x0103, 0x0105, 0x0106, 0x0108, 0x010C, 0x010D, 0x010F, 0x0200, 0x0205, 0x0401, 0x0403, 0x0404, 0x0406, 0x8500],
      // 1 noise (captured). 4 Smart level: only seen as a push (0204 03 04 01), never queried; read-only.
      noiseReads: [1, 4], featureReadIds: [6, 4, 17], eqMaxId: 3))

  /// Before the model is known, and for models with no profile: identity and diagnostics reads only.
  public static let probe = makeProfile(
    productId: "", displayName: "Unsupported model", experimental: true, testedFirmware: [], noiseModes: [],
    holdModes: [], switchesReadable: [], switchesWritable: [], featureQuery: [6, 4, 17], eqPresets: [], customEq: false,
    gestureMenus: [:], callMenus: [:], gestureWrite: .slot, gestureFunctions: [],
    shape: Shape(commands: [0x0100, 0x0103, 0x0105, 0x0200, 0x010D, 0x8500], noiseReads: [], featureReadIds: [6, 4, 17], eqMaxId: 0))
}

// MARK: Unsupported models

/// Read-only report for a model with no profile. Protocol replies only: no names, addresses or serial numbers.
public struct UnsupportedInfo: Equatable, Sendable {
  public var productId: String
  public var firmware: String?
  public var bitmap: Bytes = []
  public var offeredEvents: Bytes?
  public var features: Bytes?

  public var report: String {
    func hexBytes(_ b: Bytes?) -> String { b.map { $0.map { String(format: "%02x", $0) }.joined(separator: " ") } ?? "n/a" }
    return [
      "OpenBuds diagnostics (no personal data)",
      "Product id: \(productId)",
      "Firmware: \(firmware ?? "n/a")",
      "0x8100 bitmap: \(hexBytes(bitmap))",
      "0x8200 offered events: \(hexBytes(offeredEvents))",
      "0x810D reply (ids 6, 4, 17): \(hexBytes(features))",
    ].joined(separator: "\n")
  }
}

/// Our answer to the buds' 0x0500 request: 00 <unix seconds u32 LE> (QuickBuds docs/PROTOCOL.md:483, [CAPTURE]).
public func timePayload(_ unixSeconds: UInt32) -> Bytes {
  [0] + (0..<4).map { UInt8(unixSeconds >> (8 * UInt32($0)) & 0xFF) }
}
