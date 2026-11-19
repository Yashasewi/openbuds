import { useEffect, useState } from "react";
import {
  ISSUES,
  MAC_DMG,
  RELEASES,
  REPO,
  isNewerTag,
  latestBeta,
  latestRelease,
  type Release,
} from "../lib/links";
import { ConnectionBadge } from "./NowPanel";
import { SectionHeader, cx } from "./ui";
import { useBuds } from "../lib/store";

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

export function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor">
      <path
        d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function useRelease() {
  const [release, setRelease] = useState<Release>();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let live = true;
    void latestRelease().then((next) => {
      if (!live) return;
      setRelease(next);
      setSettled(true);
    });
    return () => {
      live = false;
    };
  }, []);
  return { release, settled };
}

function useBeta() {
  const [beta, setBeta] = useState<Release>();
  useEffect(() => {
    let live = true;
    void latestBeta().then((r) => live && setBeta(r));
    return () => {
      live = false;
    };
  }, []);
  return beta;
}

const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;
const shortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/**
 * Compact mobile/tablet top bar (hidden on desktop where the sticky left rail leads).
 */
export function MobileHeader() {
  const { release } = useRelease();
  const { connection } = useBuds();
  return (
    <header className="mx-auto flex max-w-[46rem] items-center justify-between gap-3 border-b border-ink/10 px-5 py-3.5 sm:px-8 lg:hidden">
      <a href="/" className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-tip" aria-hidden />
        <span className="text-[0.95rem] font-semibold tracking-[-0.01em] text-ink">OpenBuds</span>
        <ConnectionBadge connection={connection} />
      </a>
      <nav className="flex items-center gap-2">
        <a
          href={REPO}
          className="inline-flex h-8 items-center gap-1.5 rounded px-2 text-[0.82rem] text-muted hover:text-ink"
        >
          <GitHubMark className="size-3.5" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <a
          href={MAC_DMG}
          className="inline-flex h-8 items-center gap-1.5 rounded bg-ink px-2.5 text-[0.82rem] text-sheet hover:bg-ink/85"
        >
          <DownloadIcon className="size-3.5" />
          <span>
            Mac app
            {release && <span className="ml-1 text-sheet/65 tabular-nums">{release.tag}</span>}
          </span>
        </a>
      </nav>
    </header>
  );
}

/**
 * Sticky left architectural navigation rail (inspired by skills.wheresryan.sh/anatomy).
 */
export function LeftRail({
  navItems,
  showSheetToggle,
  previewActive,
  onTogglePreview,
}: {
  navItems: { id: string; label: string }[];
  showSheetToggle?: boolean;
  previewActive?: boolean;
  onTogglePreview?: () => void;
}) {
  const { release } = useRelease();
  const { connection } = useBuds();

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-12 flex flex-col gap-7 text-[0.84rem]">
        <div>
          <a href="/" className="group inline-flex items-center gap-2 text-ink">
            <span
              aria-hidden
              className={cx(
                "size-2 rounded-full transition-colors",
                connection === "connected" ? "bg-tip" : "bg-ink/75 group-hover:bg-tip",
              )}
            />
            <span className="text-[0.92rem] font-semibold tracking-[-0.015em]">OpenBuds</span>
          </a>
          <div className="mt-1 pl-4 text-[0.76rem] text-muted">
            {connection === "connected" ? "Connected · live" : "OnePlus Buds 4"}
          </div>
        </div>

        <nav aria-label="Page sections" className="flex flex-col gap-1.5 pl-4">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="py-0.5 text-muted transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {showSheetToggle && onTogglePreview && (
          <div className="pl-4">
            <button
              type="button"
              onClick={onTogglePreview}
              className={cx(
                "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[0.78rem] transition-colors",
                previewActive
                  ? "bg-mint text-tip font-medium"
                  : "bg-sheet text-muted ring-1 ring-ink/12 hover:text-ink",
              )}
            >
              {previewActive ? "Viewing sample controls" : "Inspect control sheet"}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1.5 border-t border-ink/10 pt-4 pl-4 text-[0.78rem] text-muted">
          <a href={MAC_DMG} className="inline-flex items-center gap-1.5 hover:text-ink">
            <DownloadIcon className="size-3.5 text-tip" />
            <span>
              Download .dmg
              {release && <span className="ml-1 text-muted/80 tabular-nums">{release.tag}</span>}
            </span>
          </a>
          <a href={REPO} className="inline-flex items-center gap-1.5 hover:text-ink">
            <GitHubMark className="size-3.5" />
            <span>GitHub · GPL-3.0</span>
          </a>
        </div>
      </div>
    </aside>
  );
}

export function MacDownload({
  compact,
  sectionIndex,
}: {
  compact?: boolean;
  sectionIndex?: string;
}) {
  const { release, settled } = useRelease();
  const beta = useBeta();
  const showBeta = settled && Boolean(beta && (!release || isNewerTag(beta.tag, release.tag)));
  const meta = [
    release?.tag,
    release && shortDate(release.date),
    release?.size && megabytes(release.size),
    "macOS 26+",
  ].filter(Boolean);

  return (
    <section
      id="mac-app"
      aria-labelledby="mac-app-heading"
      className={cx("scroll-mt-8", compact ? "mt-10" : "")}
    >
      <SectionHeader
        id="mac-app-heading"
        title="OpenBuds for Mac"
        meta={sectionIndex ?? release?.tag}
        serifMeta={Boolean(sectionIndex)}
        description="Native macOS menu bar utility with the same read-back controls, plus Mac output volume, low-battery alerts and launch at login."
      />

      <div className="overflow-hidden rounded-[4px] border border-ink/12 bg-sheet">
        <div className="flex flex-col gap-4 p-4.5 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-3.5">
            <img
              src="/icon.svg"
              alt=""
              className="size-12 shrink-0 rounded-lg ring-1 ring-ink/10"
            />
            <div>
              <div className="text-[0.9rem] font-medium text-ink">
                Menu bar app for Apple silicon
              </div>
              <div className="mt-0.5 text-[0.78rem] text-muted tabular-nums">
                {meta.join(" · ")}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={MAC_DMG}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-tip px-3.5 text-[0.85rem] font-medium text-white transition-colors hover:bg-tip/90"
            >
              <DownloadIcon className="size-4" />
              Download .dmg
            </a>
            <a
              href={release?.url ?? RELEASES}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-sheet px-3 text-[0.85rem] text-ink ring-1 ring-ink/14 transition-colors hover:bg-ink/[0.025]"
            >
              <GitHubMark className="size-3.5" />
              Release notes
            </a>
            {showBeta && beta && (
              <a
                href={beta.download}
                className="inline-flex h-9 items-center rounded-md px-2.5 text-[0.82rem] text-muted hover:text-tip"
              >
                Beta <span className="ml-1 tabular-nums">{beta.tag}</span>
              </a>
            )}
          </div>
        </div>

        <details className="group border-t border-ink/[0.08] px-4.5 py-3 sm:px-5" open={!compact}>
          <summary className="flex cursor-pointer list-none items-center justify-between text-[0.82rem] font-medium text-ink/80 marker:hidden">
            First time opening it on macOS
            <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>
              ⌄
            </span>
          </summary>
          <ol className="mt-3 grid gap-3 text-[0.8rem] leading-relaxed text-muted sm:grid-cols-3">
            {[
              "Open OpenBuds.dmg and drag OpenBuds to Applications.",
              "Launch it once. macOS warns because the build is ad-hoc signed rather than notarized; click Done.",
              "Open System Settings → Privacy & Security and click Open Anyway. macOS remembers your choice.",
            ].map((step, i) => (
              <li key={step} className="flex gap-2">
                <span className="numeral font-mono text-[0.74rem] font-medium text-tip">
                  {i + 1}.
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-ink/10 pt-6 pb-12 text-[0.78rem] leading-relaxed text-muted">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-[62ch]">
          Independent community project, not affiliated with or endorsed by OnePlus or OPPO. OnePlus
          and OnePlus Buds are trademarks of their respective owners, used solely to state device
          compatibility. Licensed under GPL-3.0-or-later without warranty.
        </p>
        <div className="flex shrink-0 gap-4">
          <a href={REPO} className="inline-flex items-center gap-1.5 hover:text-ink">
            <GitHubMark className="size-3.5" />
            Source
          </a>
          <a href={RELEASES} className="hover:text-ink">
            Releases
          </a>
          <a href={ISSUES} className="hover:text-ink">
            Issues
          </a>
        </div>
      </div>
    </footer>
  );
}
