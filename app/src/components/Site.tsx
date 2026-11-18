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
import { useBuds } from "../lib/store";
import { cx } from "./ui";

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="currentColor">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

function BudsMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <g transform="rotate(-8 8 9)">
        <rect x="6.5" y="9.5" width="3" height="9.5" rx="1.5" />
        <circle cx="8" cy="8.5" r="4" />
        <circle cx="9.2" cy="8.2" r="1.5" className="fill-fog" />
      </g>
      <g transform="translate(24 0) scale(-1 1) rotate(-8 8 9)">
        <rect x="6.5" y="9.5" width="3" height="9.5" rx="1.5" />
        <circle cx="8" cy="8.5" r="4" />
        <circle cx="9.2" cy="8.2" r="1.5" className="fill-fog" />
      </g>
    </svg>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} fill="none" stroke="currentColor">
      <path d="M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5" strokeWidth="1.5" strokeLinecap="square" />
      <path d="M4 14.5v2h12v-2" strokeWidth="1.5" strokeLinecap="square" />
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
  const { connection, state } = useBuds();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const hasData = !!state.model;
  const connected = connection === "connected";

  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-30 border-b transition-[background-color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        scrolled || hasData
          ? "border-ink/15 bg-fog/82 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 max-w-[80rem] items-center justify-between gap-4 px-5 sm:px-8 md:h-16 lg:px-12"
      >
        <a href="/" className="flex items-center gap-2.5 text-ink">
          <BudsMark className="size-5 text-ink/90" />
          <span className="display-sharp text-[1.02rem] font-light tracking-[-0.02em]">
            OpenBuds
          </span>
        </a>

        <div className="flex items-center gap-5 sm:gap-6">
          {!hasData && (
            <a
              href="#deck"
              className="hidden text-sm font-light tracking-tight text-ink/60 transition-colors hover:text-ink sm:inline"
            >
              Controls
            </a>
          )}
          <a
            href="#mac-app"
            className="hidden text-sm font-light tracking-tight text-ink/60 transition-colors hover:text-ink md:inline"
          >
            macOS
          </a>
          <a
            href={REPO}
            aria-label="GitHub repository"
            className="inline-flex items-center gap-2 text-sm font-light tracking-tight text-ink/60 transition-colors hover:text-ink"
          >
            <GitHubMark className="size-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>

          <div className="inline-flex h-8 items-stretch border border-ink/35 bg-fog/60 p-[2px] backdrop-blur-[2px]">
            <span
              className={cx(
                "hidden items-center gap-1.5 px-2.5 font-mono text-[12px] sm:inline-flex",
                connected ? "text-tip" : "text-ink/55",
              )}
            >
              <span className={cx("size-1.5", connected ? "bg-tip" : "bg-ink/35")} />
              {connected ? "Live" : "Idle"}
            </span>
            <a
              href={MAC_DMG}
              className="inline-flex items-center gap-1.5 bg-ink px-3 text-[13px] font-medium tracking-tight text-fog transition-colors hover:bg-white"
            >
              <DownloadIcon className="size-3.5" />
              <span>Mac app</span>
              {release && (
                <span className="font-mono text-[11.5px] font-normal text-fog/65 tabular-nums">
                  {release.tag}
                </span>
              )}
            </a>
          </div>
        </div>
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
    "macOS 26+",
  ].filter(Boolean);

  return (
    <section
      aria-labelledby="mac-app-heading"
      id="mac-app"
      className={cx(
        "scroll-mt-20 border border-ink/32 bg-sheet/86 backdrop-blur-[2px]",
        compact ? "mt-10 mb-8" : "mt-8",
      )}
    >
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
        <div
          aria-hidden="true"
          className="flex size-14 shrink-0 flex-col border border-ink/25 bg-fog sm:size-16"
        >
          <div className="flex h-3.5 items-center justify-between border-b border-ink/15 px-1.5">
            <span className="size-1 bg-ink/35" />
            <span className="size-1 bg-tip" />
          </div>
          <div className="grid flex-1 place-items-center">
            <BudsMark className="size-7 text-ink/90 sm:size-8" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="mac-app-heading"
              className="display-sharp text-[1.4rem] font-extralight tracking-[-0.02em] text-ink"
            >
              OpenBuds for Mac
            </h2>
            <p className="font-mono text-[0.76rem] text-ink/48 tabular-nums">{meta.join(" / ")}</p>
          </div>
          <p className="mt-1.5 max-w-[54ch] text-[0.9rem] font-light leading-relaxed text-ink/60">
            Lives in the macOS menu bar with the same earbud controls, plus Mac output volume,
            low-battery alerts and launch at login.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <a
              href={MAC_DMG}
              className="inline-flex h-10 items-center gap-2 border border-ink bg-ink px-4.5 text-[0.88rem] font-medium tracking-tight text-fog transition-colors hover:bg-white"
            >
              <DownloadIcon className="size-4" />
              Download for Mac
            </a>
            <a
              href={release?.url ?? RELEASES}
              className="inline-flex h-10 items-center gap-2 border border-ink/35 bg-fog/60 px-4 text-[0.88rem] font-normal tracking-tight text-ink/90 transition-colors hover:border-ink hover:bg-ink/10 hover:text-ink"
            >
              <GitHubMark className="size-3.5" />
              Release notes
            </a>
            {showBeta && beta && (
              <a
                href={beta.download}
                className="inline-flex h-10 items-center px-2 font-mono text-[0.8rem] text-ink/55 transition-colors hover:text-tip"
              >
                Beta {beta.tag}
              </a>
            )}
          </div>
        </div>
      </div>
      <details className="group border-t border-ink/15 px-5 py-3.5 sm:px-6" open={!compact}>
        <summary className="flex cursor-pointer list-none items-center justify-between text-[0.86rem] font-light text-ink/70 marker:hidden">
          First time opening it on macOS
          <span
            className="font-mono text-xs text-ink/45 transition-transform group-open:rotate-45"
            aria-hidden
          >
            +
          </span>
        </summary>
        <ol className="mt-3.5 grid gap-4 border-t border-ink/10 pt-3.5 text-[0.84rem] font-light leading-relaxed text-ink/58 sm:grid-cols-3">
          {[
            "Open the disk image and drag OpenBuds to Applications.",
            "Launch OpenBuds. macOS warns that the app isn’t notarized; click Done.",
            "Open System Settings, Privacy & Security, and click Open Anyway once.",
          ].map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="grid size-5 shrink-0 place-items-center border border-tip/45 bg-tip/10 font-mono text-[0.72rem] text-tip">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-ink/15 bg-fog/88 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[80rem] flex-col gap-4 px-5 py-7 text-[0.82rem] font-light text-ink/50 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <p className="max-w-[72ch] leading-relaxed">
          Independent project, not affiliated with or endorsed by OnePlus or OPPO. OnePlus and
          OnePlus Buds are trademarks of their owners, used only to identify compatible earbuds.
          GPL-3.0-or-later. Ocean canvas adapted from{" "}
          <a
            href="https://github.com/stackedlol/ascii-sharks"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink/70 underline decoration-ink/25 underline-offset-4 hover:text-tip"
          >
            ascii-sharks
          </a>
          .
        </p>
        <div className="flex shrink-0 items-center gap-5 font-mono text-[0.78rem]">
          <a
            href={REPO}
            className="inline-flex items-center gap-1.5 text-ink/60 transition-colors hover:text-tip"
          >
            <GitHubMark className="size-3.5" />
            Source
          </a>
          <a href={RELEASES} className="text-ink/60 transition-colors hover:text-tip">
            Releases
          </a>
          <a href={ISSUES} className="text-ink/60 transition-colors hover:text-tip">
            Report a problem
          </a>
        </div>
      </div>
    </footer>
  );
}
