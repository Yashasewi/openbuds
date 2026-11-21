import { useState } from "react";
import { AsciiJellyfishStage } from "./ascii/AsciiJellyfishStage";
import { NowPanel } from "./components/NowPanel";
import { About, Connections, Features } from "./components/Other";
import { GitHubMark, MacDownload, SiteFooter, SiteHeader } from "./components/Site";
import { Sound } from "./components/Sound";
import { Tools } from "./components/Tools";
import { Touch } from "./components/Touch";
import { Button, Dialog, cx } from "./components/ui";
import { MAC_DMG, REPO } from "./lib/links";
import {
  connect,
  enterPreview,
  exitPreview,
  useBuds,
  useConfirmRequest,
  usePreview,
} from "./lib/store";

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
  const inPreview = usePreview();
  const connected = connection === "connected";
  const hasData = !!state.model;

  return (
    <div className="relative isolate min-h-dvh text-ink">
      <AsciiJellyfishStage className="fixed inset-x-0 top-0 -z-20 h-lvh w-full" />
      <SiteHeader />

      {hasData ? (
        <div className="mx-auto grid max-w-[80rem] gap-8 px-5 pt-22 pb-16 sm:px-8 lg:grid-cols-[minmax(0,23.5rem)_minmax(0,1fr)] lg:gap-12 lg:px-12 lg:pt-24">
          <aside className="lg:sticky lg:top-22 lg:self-start">
            <NowPanel />
          </aside>
          <main className="min-w-0">
            {inPreview && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-tip/45 bg-sheet/90 px-4 py-3 text-[0.86rem] backdrop-blur-[2px]">
                <p className="font-light text-ink/85">
                  <span className="font-normal text-tip">Interactive preview</span> — simulated
                  OnePlus Buds 4. Every setting applies locally.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    className="h-8 px-3 text-[0.8rem]"
                    onClick={() => void connect().catch(() => {})}
                  >
                    Connect earbuds
                  </Button>
                  <Button
                    variant="quiet"
                    className="h-8 px-3 text-[0.8rem]"
                    onClick={exitPreview}
                  >
                    Exit preview
                  </Button>
                </div>
              </div>
            )}
            <nav
              aria-label="Sections"
              className="mb-6 flex flex-wrap gap-1 border border-ink/25 bg-sheet/85 p-1 text-[0.84rem] backdrop-blur-[2px]"
            >
              {SECTIONS.map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="px-3 py-1.5 font-light text-ink/65 transition-colors hover:bg-ink/10 hover:text-tip"
                >
                  {label}
                </a>
              ))}
            </nav>
            {!connected && (
              <p className="mb-6 border border-ink/25 bg-sheet/88 px-4 py-3 text-[0.88rem] font-light text-ink/75">
                {connection === "restarting"
                  ? "The earbuds are restarting their connection. Settings come back when they reconnect."
                  : "Disconnected. These are the last values read from your earbuds."}
              </p>
            )}
            <div
              inert={!connected}
              className={cx(
                "flex flex-col gap-8 transition-opacity duration-300",
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
      ) : (
        <Landing />
      )}

      <ConfirmHost />
      <SiteFooter />
    </div>
  );
}

function Landing() {
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
    <main>
      <section className="relative isolate flex h-svh min-h-[600px] w-full items-center justify-center px-5 pt-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_42%_38%_at_50%_50%,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.56)_58%,transparent_100%)]"
        />
        <div className="flex max-w-[46rem] flex-col items-center gap-6 text-center">
          <h1 className="display-sharp select-none text-[clamp(2.25rem,5.8vw,4.6rem)] leading-[1.02] font-extralight tracking-[-0.025em] text-balance text-ink [text-shadow:0_0_32px_rgba(0,0,0,0.95)]">
            Every setting on your earbuds, from your desk.
          </h1>
          <p className="max-w-[44ch] text-[0.98rem] font-light leading-[1.6] text-pretty text-ink/72 [text-shadow:0_0_20px_rgba(0,0,0,0.98)] sm:text-[1.04rem]">
            Noise control, equalizer, touch gestures and hearing tools for OnePlus Buds 4. Each
            change is read back from the earbuds to confirm.
          </p>

          <div className="mt-1 flex w-full max-w-sm flex-col items-stretch justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row sm:gap-4">
            <button
              type="button"
              disabled={connection === "connecting" || connection === "restarting"}
              onClick={onHeroConnect}
              className="border border-ink bg-ink px-6 py-2.5 text-sm font-medium tracking-tight whitespace-nowrap text-fog transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connection === "connecting" ? "Connecting…" : "Connect earbuds"}
            </button>
            <a
              href={MAC_DMG}
              className="border border-ink/50 bg-fog/75 px-6 py-2.5 text-center text-sm font-medium tracking-tight whitespace-nowrap text-ink/95 backdrop-blur-[2px] transition-colors hover:border-ink hover:bg-ink/12 hover:text-ink"
            >
              Download for Mac
            </a>
          </div>

          {(heroError || (connection === "disconnected" && reason)) && (
            <p className="max-w-md border border-amber/45 bg-sheet/90 px-4 py-2.5 text-[0.84rem] text-warn backdrop-blur-sm">
              {(connection === "disconnected" && reason) || heroError}
            </p>
          )}

          <div className="mt-1 inline-flex items-center gap-5 border border-ink/15 bg-fog/70 px-3.5 py-1.5 font-mono text-[0.75rem] text-ink/68 backdrop-blur-[2px]">
            <a href="#deck" className="transition-colors hover:text-tip">
              Preview controls
            </a>
            <span aria-hidden className="text-ink/25">
              /
            </span>
            <button
              type="button"
              onClick={enterPreview}
              className="transition-colors hover:text-tip"
            >
              Try interactive demo
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
        id="deck"
        className="mx-auto grid max-w-[80rem] scroll-mt-20 gap-8 px-5 pb-20 sm:px-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-10 lg:px-12"
      >
        <aside className="lg:sticky lg:top-22 lg:self-start">
          <NowPanel />
        </aside>

        <div className="min-w-0">
          <section
            aria-labelledby="chrome-setup"
            className="border border-ink/32 bg-sheet/86 backdrop-blur-[2px]"
          >
            <div className="border-b border-ink/15 px-5 py-4 sm:px-6 sm:py-5">
              <h2
                id="chrome-setup"
                className="display-sharp text-[1.45rem] font-extralight tracking-[-0.02em] text-ink"
              >
                Use in Chrome, no install
              </h2>
              <p className="mt-1 text-[0.88rem] font-light text-ink/58">
                Three steps from paired earbuds to every setting on screen.
              </p>
            </div>

            <ol className="grid divide-y divide-ink/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {steps.map(([title, body], i) => (
                <li key={title} className="p-5 sm:p-6">
                  <span className="font-mono text-[1.1rem] text-tip tabular-nums">{i + 1}</span>
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

          <MacDownload />
        </div>
      </div>
    </main>
  );
}

function ConfirmHost() {
  const request = useConfirmRequest();
  return (
    <Dialog open={!!request} onClose={() => request?.resolve(false)} title={request?.title ?? ""}>
      <p className="mt-3 text-[0.9rem] font-light leading-relaxed text-ink/70">{request?.body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button onClick={() => request?.resolve(false)}>Cancel</Button>
        <Button variant="primary" autoFocus onClick={() => request?.resolve(true)}>
          {request?.action}
        </Button>
      </div>
    </Dialog>
  );
}
