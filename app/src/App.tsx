import { useState } from "react";
import { AsciiStage } from "./ascii/AsciiStage";
import { NowPanel } from "./components/NowPanel";
import { About, Connections, Features } from "./components/Other";
import {
  GitHubMark,
  LandingHeader,
  LandingMacDownload,
  MacDownload,
  SiteFooter,
  WorkspaceHeader,
} from "./components/Site";
import { Sound } from "./components/Sound";
import { Tools } from "./components/Tools";
import { Touch } from "./components/Touch";
import { Button, Dialog, cx } from "./components/ui";
import { MAC_DMG, REPO } from "./lib/links";
import { connect, useBuds, useConfirmRequest } from "./lib/store";

const SECTIONS = [
  ["sound", "Sound"],
  ["touch", "Touch controls"],
  ["features", "Features"],
  ["connections", "Connections"],
  ["tools", "Tools"],
  ["about", "About"],
];

export function App() {
  const { connection, state } = useBuds();
  const [manualApp, setManualApp] = useState(
    () => new URLSearchParams(window.location.search).get("view") === "app",
  );
  const connected = connection === "connected";
  const hasData = !!state.model;
  const showWorkspace = hasData || manualApp;

  function openWorkspace() {
    setManualApp(true);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function backToLanding() {
    setManualApp(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <>
      {showWorkspace ? (
        <div className="min-h-dvh bg-fog text-ink">
          <WorkspaceHeader onBackToLanding={!hasData ? backToLanding : undefined} />
          <div className="mx-auto grid max-w-[78rem] gap-8 px-5 pt-7 pb-16 sm:px-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12 lg:px-12 lg:pt-9">
            <aside className="lg:sticky lg:top-8 lg:self-start">
              <NowPanel />
            </aside>
            <main className="min-w-0">
              <nav
                aria-label="Sections"
                className="mb-6 flex flex-wrap gap-1 rounded-2xl border border-ink/[0.08] bg-sheet p-1.5 text-[0.88rem]"
              >
                {SECTIONS.map(([id, label]) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="rounded-xl px-3 py-1.5 text-ink/65 transition-colors hover:bg-ink/[0.07] hover:text-ink"
                  >
                    {label}
                  </a>
                ))}
              </nav>

              {!connected && (
                <p className="mb-6 rounded-2xl border border-ink/[0.08] bg-sheet px-4 py-3 text-[0.9rem] text-ink/70">
                  {connection === "restarting"
                    ? "The earbuds are restarting their connection. Settings come back when they reconnect."
                    : hasData
                      ? "Disconnected. These are the last values read from your earbuds."
                      : "Not connected yet. Pair your OnePlus Buds 4 in Bluetooth settings, then press Connect earbuds on the left."}
                </p>
              )}

              <div
                inert={!connected}
                className={cx(
                  "flex flex-col gap-9 transition-opacity duration-300",
                  !connected && "opacity-50",
                )}
              >
                <div id="sound">
                  <Sound />
                </div>
                <div id="touch">
                  <Touch />
                </div>
                <div id="features">
                  <Features />
                </div>
                <div id="connections">
                  <Connections />
                </div>
                <div id="tools">
                  <Tools />
                </div>
                <div id="about">
                  <About />
                </div>
              </div>
              <MacDownload compact />
            </main>
          </div>
          <SiteFooter />
        </div>
      ) : (
        <Landing onOpenApp={openWorkspace} />
      )}
      <ConfirmHost />
    </>
  );
}

function Landing({ onOpenApp }: { onOpenApp: () => void }) {
  const { connection, reason } = useBuds();
  const [heroError, setHeroError] = useState<string>();

  async function onHeroConnect() {
    setHeroError(undefined);
    try {
      await connect();
    } catch (error) {
      if ((error as Error).name !== "NotFoundError") setHeroError((error as Error).message);
    }
  }

  const steps = [
    ["Pair with this Mac", "Open Bluetooth settings and connect your OnePlus Buds 4 as usual."],
    [
      "Open in Google Chrome",
      "Chrome talks directly to the earbuds over Web Serial. Other browsers don’t yet.",
    ],
    [
      "Connect earbuds",
      "Press Connect earbuds and pick OnePlus Buds 4. No account, cloud or phone needed.",
    ],
  ];

  const capabilities = [
    [
      "Noise control",
      "Switch between Noise cancelling, Adaptive, Transparency and Off, with Smart, Deep, Medium and Light strength.",
    ],
    [
      "Six-band equalizer",
      "Choose Balanced, Serenade or Bass, build custom presets on the earbuds, and tune BassWave or 3D Audio.",
    ],
    [
      "Touch & call gestures",
      "Assign single, double, triple tap and hold per earbud, plus noise-control cycle and call actions.",
    ],
    [
      "Diagnostics & hearing",
      "Read Left, Right and Case battery live, ring lost earbuds, test tip seal and run the Golden Sound hearing test.",
    ],
  ];

  return (
    <div className="relative isolate min-h-dvh bg-abyss text-ink">
      <AsciiStage className="fixed inset-x-0 top-0 -z-20 h-lvh w-full" />
      <LandingHeader onOpenApp={onOpenApp} />

      <main>
        <section className="relative isolate flex h-svh min-h-[600px] w-full items-center justify-center px-5 pt-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_38%_36%_at_50%_50%,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.55)_58%,transparent_100%)]"
          />
          <div className="flex max-w-[44rem] flex-col items-center gap-6 text-center">
            <h1 className="display-sharp select-none text-[clamp(2.25rem,5.6vw,4.5rem)] leading-[1.02] font-extralight tracking-[-0.025em] text-balance text-ink [text-shadow:0_0_32px_rgba(0,0,0,0.95)]">
              Every setting on your earbuds, from your desk.
            </h1>
            <p className="max-w-[43ch] text-[0.98rem] font-light leading-[1.6] text-pretty text-ink/72 [text-shadow:0_0_20px_rgba(0,0,0,0.98)] sm:text-[1.04rem]">
              Noise control, equalizer, touch gestures and hearing tools for OnePlus Buds 4. Each
              change is read back from the earbuds to confirm.
            </p>

            <div className="mt-1 flex w-full max-w-sm flex-col items-stretch justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:gap-4">
              <button
                type="button"
                disabled={connection === "connecting" || connection === "restarting"}
                onClick={onHeroConnect}
                className="border border-ink bg-ink px-6 py-2.5 text-sm font-medium tracking-tight whitespace-nowrap text-abyss transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connection === "connecting" ? "Connecting…" : "Connect earbuds"}
              </button>
              <a
                href={MAC_DMG}
                className="border border-ink/50 bg-abyss/75 px-6 py-2.5 text-center text-sm font-medium tracking-tight whitespace-nowrap text-ink/95 backdrop-blur-[2px] transition-colors hover:border-ink hover:bg-ink/12 hover:text-ink"
              >
                Download for Mac
              </a>
            </div>

            {(heroError || (connection === "disconnected" && reason)) && (
              <p className="max-w-md border border-amber/45 bg-[#070a0f]/92 px-4 py-2.5 text-[0.84rem] text-warn backdrop-blur-sm">
                {(connection === "disconnected" && reason) || heroError}
              </p>
            )}

            <div className="mt-1 inline-flex items-center gap-5 border border-ink/15 bg-abyss/75 px-3.5 py-1.5 font-mono text-[0.75rem] text-ink/68 backdrop-blur-[2px]">
              <button
                type="button"
                onClick={onOpenApp}
                className="transition-colors hover:text-wake"
              >
                Open web controller
              </button>
              <span aria-hidden className="text-ink/25">
                /
              </span>
              <a
                href={REPO}
                className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
              >
                <GitHubMark className="size-3.5" />
                Open source
              </a>
            </div>
          </div>
        </section>

        <div
          id="how-it-works"
          className="mx-auto max-w-[66rem] scroll-mt-20 px-5 pb-24 sm:px-8 lg:px-12"
        >
          <section
            aria-labelledby="chrome-setup"
            className="border border-ink/32 bg-[#070a0f]/88 backdrop-blur-[2px]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/15 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h2
                  id="chrome-setup"
                  className="display-sharp text-[1.45rem] font-extralight tracking-[-0.02em] text-ink"
                >
                  Use in Chrome, no install
                </h2>
                <p className="mt-1 text-[0.88rem] font-light text-ink/58">
                  Three steps from paired earbuds to a practical desktop control panel.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenApp}
                className="border border-ink/35 bg-abyss/65 px-3.5 py-1.5 font-mono text-[0.76rem] text-ink/85 transition-colors hover:border-wake hover:text-wake"
              >
                Open controller
              </button>
            </div>

            <ol className="grid divide-y divide-ink/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {steps.map(([title, body], i) => (
                <li key={title} className="p-5 sm:p-6">
                  <span className="font-mono text-[1.1rem] text-wake tabular-nums">{i + 1}</span>
                  <h3 className="mt-2.5 text-[0.95rem] font-normal text-ink">{title}</h3>
                  <p className="mt-1.5 text-[0.84rem] font-light leading-relaxed text-ink/58">
                    {body}
                  </p>
                </li>
              ))}
            </ol>

            <div className="grid divide-y divide-ink/15 border-t border-ink/15 sm:grid-cols-2 sm:divide-x">
              {capabilities.map(([title, body], i) => (
                <div
                  key={title}
                  className={cx("p-5 sm:p-6", i >= 2 && "sm:border-t sm:border-ink/15")}
                >
                  <h3 className="text-[0.95rem] font-normal text-ink">{title}</h3>
                  <p className="mt-1.5 text-[0.84rem] font-light leading-relaxed text-ink/56">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <LandingMacDownload />
        </div>
      </main>

      <SiteFooter landing />
    </div>
  );
}

function ConfirmHost() {
  const request = useConfirmRequest();
  return (
    <Dialog open={!!request} onClose={() => request?.resolve(false)} title={request?.title ?? ""}>
      <p className="mt-3 text-[0.95rem] text-ink/70">{request?.body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={() => request?.resolve(false)}>Cancel</Button>
        <Button variant="primary" autoFocus onClick={() => request?.resolve(true)}>
          {request?.action}
        </Button>
      </div>
    </Dialog>
  );
}
