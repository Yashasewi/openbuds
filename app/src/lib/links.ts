export const REPO = "https://github.com/Yashasewi/openbuds";
export const RELEASES = `${REPO}/releases`;
export const ISSUES = `${REPO}/issues/new/choose`;
export const MAC_DMG = `${REPO}/releases/latest/download/OpenBuds.dmg`;
const LATEST_API = "https://api.github.com/repos/Yashasewi/openbuds/releases/latest";
const RELEASES_API = "https://api.github.com/repos/Yashasewi/openbuds/releases?per_page=30";
const ACCEPT = { Accept: "application/vnd.github+json" };

export type Release = {
  tag: string;
  date: Date;
  size?: number;
  /** Release notes page. */
  url: string;
  /** Disk image for this release. */
  download: string;
};

type GithubAsset = { name: string; size: number; browser_download_url: string };
type GithubRelease = {
  tag_name?: string;
  published_at?: string;
  html_url?: string;
  prerelease?: boolean;
  assets?: GithubAsset[];
};

function toRelease(json: GithubRelease): Release | undefined {
  if (!json.tag_name || !json.published_at || !json.html_url) return undefined;
  const dmg = json.assets?.find((asset) => asset.name === "OpenBuds.dmg");
  return {
    tag: json.tag_name,
    date: new Date(json.published_at),
    size: dmg?.size,
    url: json.html_url,
    download:
      dmg?.browser_download_url ?? `${REPO}/releases/download/${json.tag_name}/OpenBuds.dmg`,
  };
}

/** Numeric tag order, `v0.3.41` above `v0.3.40`. A non-numeric suffix counts as 0. */
export function isNewerTag(tag: string, than: string) {
  const parts = (value: string) =>
    value
      .replace(/^v/i, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = parts(tag);
  const right = parts(than);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

let cached: Promise<Release | undefined> | undefined;

/** The newest full GitHub release. Prereleases are excluded by this endpoint. */
export function latestRelease() {
  cached ??= fetch(LATEST_API, { headers: ACCEPT })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((json: GithubRelease | undefined) => (json ? toRelease(json) : undefined))
    .catch(() => undefined);
  return cached;
}

let cachedBeta: Promise<Release | undefined> | undefined;

/** The newest prerelease, by the time GitHub published it. */
export function latestBeta() {
  cachedBeta ??= fetch(RELEASES_API, { headers: ACCEPT })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((json: GithubRelease[] | undefined) => {
      const betas = (json ?? [])
        .filter((release) => release.prerelease)
        .map(toRelease)
        .filter((release): release is Release => release !== undefined);
      return betas.sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    })
    .catch(() => undefined);
  return cachedBeta;
}
