// Renders the OpenBuds icon from app/public/icon.svg into Support/AppIcon.icns
// and the web app's favicon.ico, PNG icons, and social preview.
//   swift scripts/make-icon.swift   (run from native/, with Xcode selected or DEVELOPER_DIR set)
import AppKit
import SwiftUI

let artwork = NSImage(contentsOf: URL(fileURLWithPath: "../app/public/icon.svg"))!
let panel = NSImage(contentsOf: URL(fileURLWithPath: "../assets/panel.png"))!

/// The macOS app icon: the artwork inset on a 1024 canvas, with a soft shadow.
struct AppIcon: View {
  var body: some View {
    Image(nsImage: artwork)
      .resizable()
      .frame(width: 824, height: 824)
      .shadow(color: .black.opacity(0.28), radius: 22, y: 12)
      .frame(width: 1024, height: 1024)
  }
}

/// Full-bleed artwork, for favicons and the home-screen icon.
struct WebIcon: View {
  var body: some View {
    Image(nsImage: artwork).resizable().frame(width: 1024, height: 1024)
  }
}

/// 1200 × 630 link preview.
struct SocialCard: View {
  var body: some View {
    ZStack {
      LinearGradient(colors: [Color(red: 0.93, green: 0.95, blue: 0.99), Color(red: 0.82, green: 0.88, blue: 0.98)],
        startPoint: .topLeading, endPoint: .bottomTrailing)
      HStack(spacing: 56) {
        VStack(alignment: .leading, spacing: 22) {
          Image(nsImage: artwork).resizable().frame(width: 132, height: 132)
            .shadow(color: .black.opacity(0.18), radius: 14, y: 8)
          Text("OpenBuds").font(.system(size: 86, weight: .bold)).tracking(-2)
          Text("Every setting on your OnePlus Buds 4, from a Mac menu bar or Chrome.")
            .font(.system(size: 34, weight: .regular))
            .foregroundStyle(.black.opacity(0.62))
            .fixedSize(horizontal: false, vertical: true)
          Text("Free and open source · No account")
            .font(.system(size: 26, weight: .medium))
            .foregroundStyle(Color(red: 0.13, green: 0.25, blue: 0.78))
        }
        .frame(width: 600, alignment: .leading)
        Image(nsImage: panel).resizable().aspectRatio(contentMode: .fit)
          .frame(height: 560)
          .shadow(color: .black.opacity(0.3), radius: 30, y: 18)
      }
      .foregroundStyle(Color(red: 0.07, green: 0.09, blue: 0.14))
    }
    .frame(width: 1200, height: 630)
  }
}

@MainActor func png(_ view: some View, scale: CGFloat) -> Data {
  let renderer = ImageRenderer(content: view)
  renderer.scale = scale
  guard let image = renderer.cgImage,
    let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])
  else { fatalError("render failed") }
  return data
}

/// A favicon.ico holding PNG images. Browsers ask for /favicon.ico on their own and cache what they get.
func ico(_ images: [(size: Int, png: Data)]) -> Data {
  var out = Data()
  func u16(_ v: Int) { out.append(contentsOf: [UInt8(v & 0xFF), UInt8(v >> 8 & 0xFF)]) }
  func u32(_ v: Int) { u16(v & 0xFFFF); u16(v >> 16) }
  u16(0); u16(1); u16(images.count)
  var offset = 6 + 16 * images.count
  for image in images {
    out.append(contentsOf: [UInt8(image.size & 0xFF), UInt8(image.size & 0xFF), 0, 0])
    u16(1); u16(32); u32(image.png.count); u32(offset)
    offset += image.png.count
  }
  for image in images { out.append(image.png) }
  return out
}

let iconset = URL(fileURLWithPath: ".build/AppIcon.iconset")
try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

MainActor.assumeIsolated {
  for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
      let name = scale == 1 ? "icon_\(size)x\(size).png" : "icon_\(size)x\(size)@2x.png"
      try! png(AppIcon(), scale: CGFloat(size * scale) / 1024).write(to: iconset.appendingPathComponent(name))
    }
  }
  try! png(WebIcon(), scale: 180.0 / 1024).write(to: URL(fileURLWithPath: "../app/public/apple-touch-icon.png"))
  try! png(WebIcon(), scale: 512.0 / 1024).write(to: URL(fileURLWithPath: "../app/public/icon-512.png"))
  try! png(WebIcon(), scale: 32.0 / 1024).write(to: URL(fileURLWithPath: "../app/public/favicon-32.png"))
  try! ico([16, 32, 48].map { ($0, png(WebIcon(), scale: CGFloat($0) / 1024)) })
    .write(to: URL(fileURLWithPath: "../app/public/favicon.ico"))
  let card = NSBitmapImageRep(data: png(SocialCard(), scale: 1))!
  try! card.representation(using: .jpeg, properties: [.compressionFactor: 0.86])!
    .write(to: URL(fileURLWithPath: "../app/public/og.jpg"))
}

let task = Process()
task.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
task.arguments = ["-c", "icns", iconset.path, "-o", "Support/AppIcon.icns"]
try task.run()
task.waitUntilExit()
print(task.terminationStatus == 0 ? "Wrote Support/AppIcon.icns and the web icons" : "iconutil failed")
