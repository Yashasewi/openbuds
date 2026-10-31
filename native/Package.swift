// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "BudsNative",
  platforms: [.macOS(.v26)],
  products: [
    .executable(name: "OpenBuds", targets: ["OpenBuds"]),
  ],
  targets: [
    .target(
      name: "BudsKit",
      path: "Sources/BudsKit",
      linkerSettings: [.linkedFramework("IOBluetooth"), .linkedFramework("CoreBluetooth")]
    ),
    .executableTarget(
      name: "OpenBuds",
      dependencies: ["BudsKit"],
      path: "Sources/OpenBuds"
    ),
  ]
)
