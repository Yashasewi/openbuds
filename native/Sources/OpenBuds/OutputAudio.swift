import AudioToolbox
import CoreAudio
import Observation

/// The Mac's default output device and its volume, through CoreAudio.
@MainActor
@Observable
final class OutputAudio {
  struct Device: Equatable, Identifiable {
    let id: AudioObjectID
    let name: String
    let bluetooth: Bool
  }

  private(set) var current: Device?
  private(set) var volume: Double?
  private(set) var outputs: [Device] = []

  @ObservationIgnored private var watched: AudioObjectID = 0
  @ObservationIgnored private var volumeListener: AudioObjectPropertyListenerBlock?

  private static let system = AudioObjectID(kAudioObjectSystemObject)
  private static var defaultOutput = address(kAudioHardwarePropertyDefaultOutputDevice)
  private static var deviceList = address(kAudioHardwarePropertyDevices)
  private static var mainVolume = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, kAudioDevicePropertyScopeOutput)

  func start() {
    let changed: AudioObjectPropertyListenerBlock = { [weak self] _, _ in MainActor.assumeIsolated { self?.refresh() } }
    AudioObjectAddPropertyListenerBlock(Self.system, &Self.defaultOutput, .main, changed)
    AudioObjectAddPropertyListenerBlock(Self.system, &Self.deviceList, .main, changed)
    refresh()
  }

  /// The output device for the earbuds the session is talking to, if CoreAudio has one.
  func buds(named name: String?) -> Device? {
    outputs.first { $0.bluetooth && ($0.name == name || $0.name.localizedCaseInsensitiveContains("OnePlus Buds")) }
  }

  func setVolume(_ value: Double) {
    guard watched != 0 else { return }
    var level = Float32(min(max(value, 0), 1))
    AudioObjectSetPropertyData(watched, &Self.mainVolume, 0, nil, UInt32(MemoryLayout<Float32>.size), &level)
    volume = Double(level)
  }

  func makeDefault(_ device: Device) {
    var id = device.id
    AudioObjectSetPropertyData(Self.system, &Self.defaultOutput, 0, nil, UInt32(MemoryLayout<AudioObjectID>.size), &id)
  }

  private func refresh() {
    outputs = Self.allDevices().compactMap { id in
      guard Self.hasOutput(id), let name = Self.name(of: id) else { return nil }
      let transport: UInt32 = Self.read(id, address(kAudioDevicePropertyTransportType)) ?? 0
      return Device(id: id, name: name, bluetooth: transport == kAudioDeviceTransportTypeBluetooth || transport == kAudioDeviceTransportTypeBluetoothLE)
    }
    let id: AudioObjectID = Self.read(Self.system, Self.defaultOutput) ?? 0
    current = outputs.first { $0.id == id }
    watchVolume(of: id)
  }

  private func watchVolume(of id: AudioObjectID) {
    if watched != id {
      if watched != 0, let volumeListener {
        AudioObjectRemovePropertyListenerBlock(watched, &Self.mainVolume, .main, volumeListener)
      }
      volumeListener = nil
      watched = id
      if id != 0, AudioObjectHasProperty(id, &Self.mainVolume) {
        let listener: AudioObjectPropertyListenerBlock = { [weak self] _, _ in MainActor.assumeIsolated { self?.readVolume() } }
        AudioObjectAddPropertyListenerBlock(id, &Self.mainVolume, .main, listener)
        volumeListener = listener
      }
    }
    readVolume()
  }

  private func readVolume() {
    var settable: DarwinBoolean = false
    guard watched != 0, AudioObjectIsPropertySettable(watched, &Self.mainVolume, &settable) == noErr, settable.boolValue,
      let level: Float32 = Self.read(watched, Self.mainVolume)
    else { volume = nil; return }
    volume = Double(level)
  }

  // MARK: CoreAudio helpers

  private static func read<T>(_ id: AudioObjectID, _ address: AudioObjectPropertyAddress) -> T? {
    var address = address
    var size = UInt32(MemoryLayout<T>.size)
    let value = UnsafeMutablePointer<T>.allocate(capacity: 1)
    defer { value.deallocate() }
    guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, value) == noErr else { return nil }
    return value.pointee
  }

  private static func allDevices() -> [AudioObjectID] {
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(system, &deviceList, 0, nil, &size) == noErr else { return [] }
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(system, &deviceList, 0, nil, &size, &ids) == noErr else { return [] }
    return ids
  }

  private static func hasOutput(_ id: AudioObjectID) -> Bool {
    var streams = address(kAudioDevicePropertyStreams, kAudioDevicePropertyScopeOutput)
    var size: UInt32 = 0
    return AudioObjectGetPropertyDataSize(id, &streams, 0, nil, &size) == noErr && size > 0
  }

  private static func name(of id: AudioObjectID) -> String? {
    var address = address(kAudioObjectPropertyName)
    var name: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &address, 0, nil, &size, &name) == noErr else { return nil }
    return name?.takeRetainedValue() as String?
  }
}

private func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal)
  -> AudioObjectPropertyAddress
{
  AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}
