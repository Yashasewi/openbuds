import Foundation
import Testing

@testable import BudsKit

/// Replays the fixtures in app/tests/fixtures, which the web app's tests (app/tests) replay too. The Buds 4
/// golden frames were recorded from the encoder before profiles existed, so both clients are held to the
/// same bytes. Run with `swift test` inside native/.
struct ProfileTests {
  private let fixtures = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().appendingPathComponent("app/tests/fixtures")

  private func load(_ name: String) throws -> Any {
    try JSONSerialization.jsonObject(with: Data(contentsOf: fixtures.appendingPathComponent(name)))
  }

  private func hexString(_ bytes: Bytes) -> String { bytes.map { String(format: "%02x", $0) }.joined() }

  private func replay(_ file: String, profile: ModelProfile) throws {
    let cases = try #require(load(file) as? [[String: Any]])
    #expect(cases.count > 40)
    for c in cases {
      let command = UInt16(c["command"] as! Int)
      let sequenceValue = c["sequence"] as! Int
      let payload = (c["payload"] as! [Int]).map { UInt8($0) }
      let accepted = (c["accepted"] as? Bool) ?? true
      let want: String? = accepted ? c["hex"] as? String : nil
      let got: String? = UInt8(exactly: sequenceValue).flatMap { try? encode(command, $0, payload, for: profile) }.map(hexString)
      #expect(got == want, "\(hex(command)) seq \(sequenceValue) \(payload)")
    }
  }

  @Test func buds4FramesAreByteIdenticalToThePreProfileEncoder() throws {
    try replay("buds4-golden.json", profile: .buds4)
  }

  @Test func buds3SendsWhatTheOwnerCaptureShowsAndRefusesTheRest() throws {
    try replay("buds3-captured-tx.json", profile: .buds3)
  }

  @Test func buds3RefusesEverythingOutsideItsProfile() {
    let p = ModelProfile.buds3
    #expect(!p.allows(0x0404, holdCyclePayload([.anc])))
    #expect(!p.allows(0x010C, [2, 1]))
    #expect(!p.allows(0x0404, noisePayload(.adaptive)))
    #expect(!p.allows(0x0403, [17, 0]))
    #expect(!p.allows(0x0403, [17, 1]))
    for id: UInt8 in [11, 24, 27, 28, 29, 5, 0] { #expect(!p.allows(0x0403, [id, 1])) }
    #expect(!p.allows(0x010D, [2, 6, 24]))
    #expect(!p.allows(0x0406, [4]))
    #expect(!p.allows(0x0418, [1, 250, 6, 0, 1, 65, 1, 62, 0, 0]))
    #expect(!p.allows(0x041B, [0xFB, 5, 1]))
    for command: UInt16 in [0x0122, 0x0109, 0x0112, 0x0114, 0x0115, 0x0124, 0x0130, 0x040E] { #expect(!p.allows(command, [])) }
    for command: UInt16 in [0x0400, 0x0405] { #expect(!p.allows(command, [1])) }
    #expect(p.allows(0x0404, noisePayload(.smart)))
    #expect(p.allows(0x0403, [6, 1]))
    #expect(p.allows(0x0403, [4, 0]))
    #expect(p.allows(0x010C, [4, 1]))
    #expect(p.allows(0x0406, [3]))
    #expect(throws: (any Error).self) { try encode(0x0403, 9, [17, 0], for: p) }
  }

  @Test func buds3GestureWritesAreOneSlot() throws {
    let slot = { (d: UInt8, a: UInt8, f: UInt8) in GestureSlot(device: d, button: 1, action: a, function: f) }
    let table = [slot(1, 1, 1), slot(1, 2, 6), slot(1, 3, 5), slot(1, 4, 8), slot(1, 5, 7), slot(2, 2, 6)]
    #expect(try gestureTablePayload(.buds3, table, ear: .left, action: 2, function: 3) == [1, 1, 1, 2, 3])
    #expect(throws: (any Error).self) { try gestureTablePayload(.buds3, table, ear: .left, action: 2, function: 17) }
    #expect(throws: (any Error).self) { try callGesturePayload(.buds3, action: 2, function: 29) }
    #expect(try gestureTablePayload(.buds4, table, ear: .left, action: 2, function: 0).count == 1 + table.count * 4)
  }

  @Test func aModelWithoutAProfileCanOnlyReadItsIdentity() {
    let p = ModelProfile.probe
    for command: UInt16 in [0x0100, 0x0103, 0x0105, 0x0200] { #expect(p.allows(command, [])) }
    #expect(p.allows(0x010D, [3, 6, 4, 17]))
    #expect(!p.allows(0x010D, [1, 24]))
    for (command, payload) in [(0x0404, [1, 1, 1]), (0x0403, [6, 1]), (0x0406, [1]), (0x0205, [1, 1]), (0x0108, []), (0x0106, []), (0x010C, [1, 1])]
      as [(UInt16, Bytes)]
    { #expect(!p.allows(command, payload), Comment(rawValue: hex(command))) }
  }

  @Test func profileLookup() {
    #expect(ModelProfile.profile(for: "065414")?.displayName == "OnePlus Buds 4")
    #expect(ModelProfile.profile(for: "063C14")?.displayName == "OnePlus Buds 3")
    #expect(ModelProfile.profile(for: "063c14")?.experimental == true)
    #expect(ModelProfile.profile(for: "063c14")?.testedFirmware == ["127.127.101"])
    #expect(ModelProfile.profile(for: "064414") == nil)
    #expect(ModelProfile.all.count == 2)
  }

  @Test func timeAnswerFrameEchoesTheRequestSequence() throws {
    #expect(timePayload(0x0102_0304) == [0, 4, 3, 2, 1])
    for profile in [ModelProfile.buds4, .buds3, .probe] {
      for seq: UInt8 in [0, 1, 0x2A, 254, 255] {
        #expect(hexString(try encode(0x8500, seq, timePayload(0x0102_0304), for: profile)) == "aa0c00000085" + String(format: "%02x", seq) + "05000004030201")
      }
    }
    #expect(throws: (any Error).self) { try encode(0x8500, 1, [0], for: .buds4) }
    #expect(throws: (any Error).self) { try encode(0x0100, 255, [], for: .buds4) }
    #expect(throws: (any Error).self) { try encode(0x0100, 0, [], for: .buds4) }
  }

  @Test func diagnosticsReportCarriesProtocolRepliesOnly() {
    let info = UnsupportedInfo(productId: "ab1234", firmware: "1.2.3", bitmap: [255, 1], offeredEvents: [1, 2], features: [0, 1, 6, 0])
    #expect(info.report.contains("Product id: ab1234"))
    #expect(info.report.contains("0x8100 bitmap: ff 01"))
    #expect(info.report.contains("0x8200 offered events: 01 02"))
    #expect(info.report.contains("0x810D reply (ids 6, 4, 17): 00 01 06 00"))
  }

  @Test func discoveryNameFallback() {
    #expect(RFCOMMLink.nameLooksLikeBuds("OnePlus Buds 4"))
    #expect(RFCOMMLink.nameLooksLikeBuds("OnePlus Nord Buds 3 Pro"))
    #expect(RFCOMMLink.nameLooksLikeBuds("Sam's OnePlus Buds 3"))
    #expect(!RFCOMMLink.nameLooksLikeBuds("OnePlus 12"))
    #expect(!RFCOMMLink.nameLooksLikeBuds("Sony WH-1000XM5"))
    #expect(!RFCOMMLink.nameLooksLikeBuds(nil))
  }

  /// The same table as ModelProfile in app/src/lib/protocol.ts, through app/tests/fixtures/profiles.json.
  @Test func profilesMatchTheFixtureSharedWithTheWebTests() throws {
    let fixture = try #require(load("profiles.json") as? [String: [String: Any]])
    #expect(Set(fixture.keys) == Set(ModelProfile.all.map(\.productId)))
    for profile in ModelProfile.all {
      let f = try #require(fixture[profile.productId])
      let id = profile.productId
      #expect(f["displayName"] as? String == profile.displayName, Comment(rawValue: id))
      #expect(f["experimental"] as? Bool == profile.experimental, Comment(rawValue: id))
      #expect(f["testedFirmware"] as? [String] == profile.testedFirmware, Comment(rawValue: id))
      #expect(f["noiseModes"] as? [String] == profile.noiseModes.map(\.rawValue), Comment(rawValue: id))
      #expect(f["holdModes"] as? [String] == profile.holdModes.map { String(describing: $0) }, Comment(rawValue: id))
      #expect(Set(f["switchesReadable"] as! [Int]) == Set(profile.switchesReadable.map(Int.init)), Comment(rawValue: id))
      #expect(Set(f["switchesWritable"] as! [Int]) == Set(profile.switchesWritable.map(Int.init)), Comment(rawValue: id))
      #expect((f["eqPresets"] as! [[Any]]).map { "\($0[0])|\($0[1])" } == profile.eqPresets.map { "\($0.id)|\($0.name)" }, Comment(rawValue: id))
      #expect(f["customEq"] as? Bool == profile.customEq, Comment(rawValue: id))
      #expect(f["gestureWrite"] as? String == String(describing: profile.gestureWrite), Comment(rawValue: id))
      #expect(Set(f["gestureFunctions"] as! [Int]) == Set(profile.gestureFunctions.map(Int.init)), Comment(rawValue: id))
      for (name, menus) in [("gestureMenus", profile.gestureMenus), ("callMenus", profile.callMenus)] {
        let want = f[name] as! [String: [Int]]
        #expect(want == Dictionary(uniqueKeysWithValues: menus.map { (String($0.key), $0.value.map(Int.init)) }), Comment(rawValue: "\(id) \(name)"))
      }
      // Both clients allow the same commands. (The shape of each payload is covered by the replays above.)
      #expect(Set(f["commands"] as! [Int]) == Set(profile.allowed.keys.map(Int.init)), Comment(rawValue: id))
      // The macOS app has always also asked for id 9, which the web app does not: a known, unchanged difference.
      if profile.productId != ModelProfile.buds4.productId { #expect(f["featureQuery"] as? [Int] == profile.featureQuery.map(Int.init), Comment(rawValue: id)) }
    }
  }
}
