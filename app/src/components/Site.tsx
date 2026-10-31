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
import { cx } from "./ui";

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor">
      <path
        d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function useRelease() {
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

export function SiteHeader() {
  const { release } = useRelease();
  return (
    <header className="mx-auto flex max-w-[80rem] items-center justify-between gap-4 px-5 pt-5 sm:px-8 lg:px-12">
      <a href="/" className="flex items-center gap-2.5 rounded-lg">
        <img src="/icon.svg" alt="" className="size-8 rounded-[0.55rem] shadow-sm" />
        <span className="text-[1.08rem] font-semibold tracking-[-0.02em]">OpenBuds</span>
      </a>
      <nav className="flex items-center gap-2">
        <a
          href={REPO}
          className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-[0.9rem] text-ink/70 transition-colors hover:bg-ink/[0.06] hover:text-ink"
        >
          <GitHubMark className="size-4" />
          <span className="hidden sm:inline">GitHub</span>
        </a>
        <a
          href={MAC_DMG}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[0.9rem] text-sheet transition-colors hover:bg-ink/85"
        >
          <DownloadIcon className="size-4" />
          <span>
            Mac app
            {release && <span className="ml-1.5 text-sheet/60 tabular-nums">{release.tag}</span>}
          </span>
        </a>
      </nav>
    </header>
  );
}

export function MacDownload({ compact }: { compact?: boolean }) {
  const { release, settled } = useRelease();
  const beta = useBeta();
  const showBeta = settled && Boolean(beta && (!release || isNewerTag(beta.tag, release.tag)));
  const meta = [
    release?.tag,
    release && shortDate(release.date),
    release?.size && megabytes(release.size),
    "macOS 26 or later",
  ].filter(Boolean);

  return (
    <section
      aria-labelledby="mac-app"
      className={cx(
        "overflow-hidden rounded-[1.6rem] border border-ink/10 bg-sheet/70 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset,0_20px_50px_-30px_rgb(21_28_51/0.35)] backdrop-blur",
        compact ? "mb-10" : "mt-14",
      )}
    >
      <div className="flex gap-4 p-5 sm:gap-5 sm:p-6">
        <img
          src="/icon.svg"
          alt=""
          className="size-14 shrink-0 rounded-[1rem] shadow-md sm:size-16 sm:rounded-[1.1rem]"
        />
        <div className="min-w-0 flex-1">
          <h2 id="mac-app" className="text-[1.2rem] font-medium tracking-[-0.01em]">
            OpenBuds for Mac
          </h2>
          <p className="mt-0.5 text-[0.92rem] text-ink/60">
            A menu bar app with the same controls, plus Mac volume, battery alerts and open at
            login.
          </p>
          <p className="mt-2 text-[0.82rem] text-ink/45 tabular-nums">{meta.join(" · ")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={MAC_DMG}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-tip px-4.5 text-[0.95rem] text-sheet transition-colors hover:bg-tip/90"
            >
              <DownloadIcon className="size-4.5" />
              Download for Mac
            </a>
            <a
              href={release?.url ?? RELEASES}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink/[0.06] px-4 text-[0.95rem] transition-colors hover:bg-ink/10"
            >
              <GitHubMark className="size-4" />
              Release notes
            </a>
            {showBeta && beta && (
              <a
                href={beta.download}
                className="inline-flex h-11 items-center rounded-xl px-3 text-[0.92rem] text-ink/55 transition-colors hover:text-tip"
              >
                Download beta
                <span className="ml-1.5 tabular-nums text-ink/40">{beta.tag}</span>
              </a>
            )}
          </div>
        </div>
      </div>
      <details className="group border-t border-ink/10 px-5 py-3.5 sm:px-6" open={!compact}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-[0.9rem] text-ink/70 marker:hidden">
          First time opening it
          <span className="text-ink/40 transition-transform group-open:rotate-180" aria-hidden>
            ⌄
          </span>
        </summary>
        <ol className="mt-3 grid gap-3 text-[0.86rem] text-ink/60 sm:grid-cols-3">
          {[
            "Open the disk image and drag OpenBuds to Applications.",
            "Open it. macOS says it can’t verify the app, because it isn’t notarized. Click Done.",
            "In System Settings, Privacy & Security, click Open Anyway. macOS remembers this.",
          ].map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="numeral grid size-5.5 shrink-0 place-items-center rounded-full bg-tip/10 text-[0.75rem] font-medium text-tip">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[80rem] px-5 pb-10 sm:px-8 lg:px-12">
      <div className="flex flex-col gap-3 border-t border-ink/10 pt-6 text-[0.85rem] text-ink/50 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Independent, not affiliated with or endorsed by OnePlus or OPPO. OnePlus and OnePlus Buds
          are trademarks of their owners, used only to identify compatible earbuds.
          GPL-3.0-or-later. No warranty.
        </p>
        <div className="flex gap-4">
          <a href={REPO} className="inline-flex items-center gap-1.5 hover:text-tip">
            <GitHubMark className="size-3.5" />
            Source
          </a>
          <a href={RELEASES} className="hover:text-tip">
            Releases
          </a>
          <a href={ISSUES} className="hover:text-tip">
            Report a problem
          </a>
        </div>
      </div>
    </footer>
  );
}
