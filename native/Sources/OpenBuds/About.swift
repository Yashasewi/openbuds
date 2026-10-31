import AppKit
import Observation
import SwiftUI

enum AppInfo {
  static let repository = URL(string: "https://github.com/Yashasewi/openbuds")!
  static let website = URL(string: "https://openbuds.yashasewi.me")!
  static let issues = URL(string: "https://github.com/Yashasewi/openbuds/issues/new/choose")!
  static let releases = URL(string: "https://github.com/Yashasewi/openbuds/releases")!
  static let download = URL(string: "https://github.com/Yashasewi/openbuds/releases/latest/download/OpenBuds.dmg")!
  static let latestAPI = URL(string: "https://api.github.com/repos/Yashasewi/openbuds/releases/latest")!
  static let releasesAPI = URL(string: "https://api.github.com/repos/Yashasewi/openbuds/releases?per_page=30")!

  /// Set only by the beta packaging step. Stable builds leave the key unset.
  static var isBeta: Bool {
    switch Bundle.main.object(forInfoDictionaryKey: "OpenBudsBeta") {
    case let value as Bool: return value
    case let value as NSNumber: return value.boolValue
    default: return false
    }
  }

  static var version: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.3"
  }

  static var build: String {
    Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
  }

  /// Matches the release tags, `v<short version>.<build>`.
  static var tag: String { "v\(version).\(build)" }
}

struct UpdateOffer: Equatable {
  var tag: String
  var download: URL
  var beta: Bool
}

/// Asks GitHub for the newest release. Runs only when the About page opens.
/// Stable builds look at the latest full release. Beta builds also consider prereleases.
@MainActor
@Observable
final class UpdateChecker {
  enum State: Equatable {
    case idle, checking, current
    case available(UpdateOffer)
    case failed
  }

  private(set) var state: State = .idle
  private var checkedAt: Date?

  func check() async {
    if state == .checking { return }
    if let checkedAt, Date().timeIntervalSince(checkedAt) < 600, state != .failed { return }
    state = .checking
    do {
      let data = try await Self.fetch(AppInfo.isBeta ? AppInfo.releasesAPI : AppInfo.latestAPI)
      checkedAt = Date()
      let offer = try AppInfo.isBeta ? Self.bestBeta(in: data) : Self.latestStable(in: data)
      state = offer.map { .available($0) } ?? .current
    } catch {
      state = .failed
    }
  }

  private static func fetch(_ url: URL) async throws -> Data {
    var request = URLRequest(url: url, timeoutInterval: 10)
    request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw URLError(.badServerResponse)
    }
    return data
  }

  private static func latestStable(in data: Data) throws -> UpdateOffer? {
    let release = try JSONDecoder().decode(Release.self, from: data)
    guard isNewer(release.tag_name, than: AppInfo.tag) else { return nil }
    return release.offer
  }

  /// The higher of a newer prerelease and a newer full release.
  private static func bestBeta(in data: Data) throws -> UpdateOffer? {
    let releases = try JSONDecoder().decode([Release].self, from: data)
    return releases.reduce(nil) { best, release in
      guard isNewer(release.tag_name, than: AppInfo.tag), let offer = release.offer else { return best }
      guard let best else { return offer }
      return isNewer(offer.tag, than: best.tag) ? offer : best
    }
  }

  private struct Release: Decodable {
    let tag_name: String
    let prerelease: Bool?
    let assets: [Asset]?

    struct Asset: Decodable {
      let name: String
      let browser_download_url: String
    }

    var offer: UpdateOffer? {
      let raw = assets?.first { $0.name == "OpenBuds.dmg" }?.browser_download_url
      let fallback = "https://github.com/Yashasewi/openbuds/releases/download/\(tag_name)/OpenBuds.dmg"
      guard let download = URL(string: raw ?? fallback) else { return nil }
      return UpdateOffer(tag: tag_name, download: download, beta: prerelease == true)
    }
  }

  static func isNewer(_ tag: String, than current: String) -> Bool {
    func parts(_ s: String) -> [Int] {
      s.trimmingCharacters(in: CharacterSet(charactersIn: "v")).split(separator: ".").map { Int($0) ?? 0 }
    }
    let a = parts(tag), b = parts(current)
    for i in 0..<max(a.count, b.count) {
      let x = i < a.count ? a[i] : 0, y = i < b.count ? b[i] : 0
      if x != y { return x > y }
    }
    return false
  }
}

struct AboutPage: View {
  let model: PanelModel

  var body: some View {
    SubPage(title: "About", model: model) {
      VStack(spacing: 6) {
        Image(nsImage: NSApp.applicationIconImage)
          .resizable()
          .frame(width: 64, height: 64)
        Text("OpenBuds").font(.title3.weight(.semibold))
        Text(AppInfo.isBeta
          ? "Version \(AppInfo.version) (\(AppInfo.build)) Beta"
          : "Version \(AppInfo.version) (\(AppInfo.build))")
          .font(.caption)
          .foregroundStyle(.secondary)
          .textSelection(.enabled)
        Text("Free, open-source controls for OnePlus Buds 4.")
          .font(.caption)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 6)

      PanelSection { update.padding(.vertical, 9) }

      PanelSection {
        LinkRow(title: "Source code", detail: "github.com/Yashasewi/openbuds", url: AppInfo.repository) {
          GitHubBadge()
        }
        Divider()
        LinkRow(title: "Website", detail: "openbuds.yashasewi.me", url: AppInfo.website) {
          IconBadge(icon: "globe", color: .blue)
        }
        Divider()
        LinkRow(title: "Release notes", detail: "Every version on GitHub", url: AppInfo.releases) {
          IconBadge(icon: "sparkles", color: .purple)
        }
        Divider()
        LinkRow(title: "Report a problem", detail: "Open an issue", url: AppInfo.issues) {
          IconBadge(icon: "exclamationmark.bubble.fill", color: .orange)
        }
      }

      Text("Independent, not affiliated with or endorsed by OnePlus or OPPO. OnePlus and OnePlus Buds are trademarks of their owners, used only to identify compatible earbuds. GPL-3.0-or-later. No warranty.")
        .font(.caption2)
        .foregroundStyle(.tertiary)
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
    }
    .task { await model.updates.check() }
  }

  @ViewBuilder private var update: some View {
    HStack(spacing: 10) {
      switch model.updates.state {
      case .idle, .checking:
        ProgressView().controlSize(.small).frame(width: 22, height: 22)
        Text("Checking for updates…").foregroundStyle(.secondary)
        Spacer(minLength: 0)
      case .current:
        IconBadge(icon: "checkmark", color: .green)
        VStack(alignment: .leading, spacing: 1) {
          Text("You’re up to date")
          Text(AppInfo.isBeta ? "\(AppInfo.tag) is the latest beta." : "\(AppInfo.tag) is the latest release.")
            .font(.caption).foregroundStyle(.secondary)
        }
        Spacer(minLength: 0)
      case .available(let offer):
        IconBadge(icon: "arrow.down", color: .blue)
        VStack(alignment: .leading, spacing: 1) {
          Text("Update available")
          Text(offer.beta ? "\(offer.tag) beta is ready to download." : "\(offer.tag) is ready to download.")
            .font(.caption).foregroundStyle(.secondary)
        }
        Spacer(minLength: 8)
        Button("Download") { NSWorkspace.shared.open(offer.download) }
          .buttonStyle(.glassProminent)
          .controlSize(.small)
      case .failed:
        IconBadge(icon: "wifi.exclamationmark", color: .gray)
        VStack(alignment: .leading, spacing: 1) {
          Text("Couldn’t check for updates")
          Text("GitHub didn’t answer.").font(.caption).foregroundStyle(.secondary)
        }
        Spacer(minLength: 8)
        Button("Retry") { Task { await model.updates.check() } }
          .buttonStyle(.glass)
          .controlSize(.small)
      }
    }
    .animation(.smooth, value: model.updates.state)
  }
}

private struct LinkRow<Badge: View>: View {
  let title: String
  let detail: String
  let url: URL
  @ViewBuilder let badge: Badge
  @State private var hovering = false

  var body: some View {
    Button { NSWorkspace.shared.open(url) } label: {
      HStack(spacing: 10) {
        badge
        VStack(alignment: .leading, spacing: 1) {
          Text(title)
          Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
        }
        Spacer(minLength: 8)
        Image(systemName: "arrow.up.right")
          .font(.caption.weight(.semibold))
          .foregroundStyle(hovering ? .secondary : .tertiary)
      }
      .padding(.vertical, 8)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .onHover { hovering = $0 }
  }
}

/// The GitHub mark in the same round badge as the SF Symbol icons.
struct GitHubBadge: View {
  private static let mark: NSImage = {
    let svg = """
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#000" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>
      """
    let image = NSImage(data: Data(svg.utf8)) ?? NSImage(systemSymbolName: "link", accessibilityDescription: nil)!
    image.isTemplate = true
    return image
  }()

  var body: some View {
    Image(nsImage: Self.mark)
      .resizable()
      .frame(width: 13, height: 13)
      .foregroundStyle(.white)
      .frame(width: 22, height: 22)
      .background(Color(white: 0.16).gradient, in: .circle)
  }
}
