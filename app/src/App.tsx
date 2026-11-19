import { useState } from "react";
import { BudsAnatomy, type Subsystem } from "./components/BudsAnatomy";
import { MarginTelemetry, WorkbenchBar } from "./components/NowPanel";
import { About, Connections, Features } from "./components/Other";
import { LeftRail, MacDownload, MobileHeader, SiteFooter } from "./components/Site";
import { Sound } from "./components/Sound";
import { Tools } from "./components/Tools";
import { Touch } from "./components/Touch";
import { Button, Dialog, SectionHeader, cx } from "./components/ui";
import { EQ_BANDS } from "./lib/protocol";
import { PreviewControlsContext, session, useBuds, useConfirmRequest } from "./lib/store";

const OVERVIEW_NAV = [
  { id: "anatomy", label: "Anatomy" },
  { id: "connect", label: "Connect" },
  { id: "drivers", label: "Dual drivers" },
  { id: "silence", label: "Smarter silence" },
  { id: "stem", label: "Stem & link" },
  { id: "mac-app", label: "Mac menu bar" },
];

const CONTROL_NAV = [
  { id: "anatomy", label: "Anatomy" },
  { id: "noise", label: "Noise & battery" },
  { id: "sound", label: "Sound & EQ" },
  { id: "touch", label: "Stem controls" },
  { id: "features", label: "Features" },
  { id: "connections", label: "Connections" },
  { id: "tools", label: "Diagnostic tools" },
  { id: "about", label: "Device & firmware" },
  { id: "mac-app", label: "Mac menu bar" },
];

export function App() {
  const [previewControls, setPreviewControls] = useState(false);
  const [subsystem, setSubsystem] = useState<Subsystem>("all");

  return (
    <PreviewControlsContext.Provider value={previewControls}>
      <AppSurface
        subsystem={subsystem}
        onSubsystemChange={setSubsystem}
        previewControls={previewControls}
        onTogglePreview={() => setPreviewControls((v) => !v)}
      />
    </PreviewControlsContext.Provider>
  );
}

function AppSurface({
  subsystem,
  onSubsystemChange,
  previewControls,
  onTogglePreview,
}: {
  subsystem: Subsystem;
  onSubsystemChange: (next: Subsystem) => void;
  previewControls: boolean;
  onTogglePreview: () => void;
}) {
  const { connection } = useBuds();
  const realConnected = session.snapshot.connection === "connected";
  const hasRealData = !!session.snapshot.state.model;
  const showControls = hasRealData || previewControls;

  const focusSubsystem = (target: Subsystem) => {
    onSubsystemChange(target);
    document.getElementById("anatomy")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <MobileHeader />

      <div className="mx-auto grid max-w-[76rem] gap-10 px-5 pt-7 pb-8 sm:px-8 lg:grid-cols-[11.5rem_minmax(0,43rem)] lg:gap-12 lg:px-10 lg:pt-12 xl:grid-cols-[11.5rem_minmax(0,43rem)_13.5rem]">
        {/* Left Sticky Navigation Rail */}
        <LeftRail
          navItems={showControls ? CONTROL_NAV : OVERVIEW_NAV}
          showSheetToggle={!hasRealData}
          previewActive={previewControls}
          onTogglePreview={onTogglePreview}
        />

        {/* Center Editorial & Workbench Column */}
        <main className="min-w-0">
          {/* Masthead */}
          <header className="mb-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.86rem]">
              <p className="text-muted">
                <strong className="font-semibold text-ink">OpenBuds</strong> · controls for OnePlus
                Buds 4
              </p>
              <span className="font-mono text-[0.72rem] text-muted">
                065414 · Web Serial &amp; macOS
              </span>
            </div>

            <h1 className="mt-3 max-w-[34ch] font-serif text-[1.72rem] leading-[1.2] font-normal tracking-[-0.01em] text-ink sm:text-[1.95rem]">
              Every setting on your OnePlus Buds 4, read and confirmed from the hardware.
            </h1>

            <p className="mt-3 max-w-[60ch] text-[0.89rem] leading-[1.65] text-muted">
              An open-source desk controller for noise cancellation, 6-band custom EQ, Golden Sound,
              stem swipe gestures and ear-fit diagnostics. Runs directly in Chrome over Bluetooth or
              from the native macOS menu bar, with no account, cloud or phone app in between.
            </p>
          </header>

          {/* Interactive Isometric Hardware Figure (FIG 01) */}
          <BudsAnatomy subsystem={subsystem} onSubsystemChange={onSubsystemChange} />

          {/* Primary Connect / Live Noise Control Bar */}
          <div className="mt-6">
            <WorkbenchBar onTogglePreview={onTogglePreview} />
          </div>

          {/* Body: Live/Sample Control Sheet OR Hardware & Control Architecture Atlas */}
          {showControls ? (
            <div className="mt-10">
              {previewControls && !hasRealData && (
                <div className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-tip/30 bg-mint/40 px-4 py-2.5 text-[0.82rem] text-ink">
                  <span>
                    <strong className="font-medium text-tip">Sample control sheet:</strong> showing
                    representative OnePlus Buds 4 settings. Connect your earbuds above to read and
                    write hardware.
                  </span>
                  <button
                    type="button"
                    onClick={onTogglePreview}
                    className="shrink-0 font-medium text-tip underline underline-offset-2 hover:text-ink"
                  >
                    Return to overview
                  </button>
                </div>
              )}

              {hasRealData && !realConnected && (
                <p className="mb-7 rounded-[4px] border border-ink/12 bg-sheet px-4 py-2.5 text-[0.83rem] text-muted">
                  {connection === "restarting"
                    ? "The earbuds are restarting their link. Controls unlock as soon as they reconnect."
                    : "Disconnected. Showing the last values read back from your earbuds."}
                </p>
              )}

              <div
                inert={!realConnected && !previewControls}
                className={cx(
                  "flex flex-col gap-10 transition-opacity duration-200",
                  hasRealData && !realConnected && "opacity-55",
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
            </div>
          ) : (
            <HardwareAtlas onFocusSubsystem={focusSubsystem} onInspectControls={onTogglePreview} />
          )}

          <SiteFooter />
        </main>

        {/* Right Margin Column: Telemetry + Footnotes (matches Anatomy editorial margin) */}
        <aside className="hidden xl:flex xl:flex-col xl:pt-[10.5rem]">
          <MarginTelemetry />

          <div className="mt-16 space-y-6 border-t border-ink/10 pt-5 text-[0.75rem] leading-relaxed text-muted">
            <p>
              <span className="mr-1.5 font-mono text-[0.7rem] text-ink">1</span>
              Every setting change sends a framed RFCOMM command, waits for the earbud
              acknowledgment, and reads the register back before marking it done.
            </p>
            <p>
              <span className="mr-1.5 font-mono text-[0.7rem] text-ink">2</span>
              OnePlus Buds 4 hold one control link at a time. OpenBuds releases its Web Serial port
              after 30 seconds in a hidden tab so your Mac app or phone is never locked out.
            </p>
            <p>
              <span className="mr-1.5 font-mono text-[0.7rem] text-ink">3</span>
              macOS transmits audio over AAC rather than LHDC 5.0; Hi-Res stays stored independently
              on the earbuds for Android devices.
            </p>
          </div>
        </aside>

        <ConfirmHost />
      </div>
    </>
  );
}

function HardwareAtlas({
  onFocusSubsystem,
  onInspectControls,
}: {
  onFocusSubsystem: (target: Subsystem) => void;
  onInspectControls: () => void;
}) {
  return (
    <div className="mt-12 flex flex-col gap-12">
      {/* 01 — Coaxial Dual Drivers & Sound Master DSP */}
      <section id="drivers" className="scroll-mt-8">
        <SectionHeader
          title="Coaxial dual drivers & Sound Master EQ"
          meta="01"
          serifMeta
          description="An 11 mm 30-layer ceramic-metal woofer and a 6 mm flat-diaphragm tweeter sit on one acoustic axis, each fed by its own dedicated DAC."
        />

        <div className="rounded-[4px] border border-ink/12 bg-sheet p-4.5 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              [
                "11 mm + 6 mm",
                "Coaxial transducers",
                "Ceramic-metal dome woofer paired coaxially with a flat micro-tweeter.",
              ],
              [
                "Twin DACs",
                "Independent conversion",
                "Separate digital-to-analog paths eliminate inter-driver crossover drift.",
              ],
              [
                "LHDC 5.0 · 192 kHz",
                "24-bit / 1 Mbps wireless",
                "Studio-grade Hi-Res transport alongside OnePlus 3D Audio and BassWave 2.0.",
              ],
            ].map(([stat, title, copy]) => (
              <div key={title} className="border-l border-ink/12 pl-3.5">
                <div className="numeral text-[0.95rem] font-semibold text-ink tabular-nums">
                  {stat}
                </div>
                <div className="mt-0.5 text-[0.82rem] font-medium text-ink/85">{title}</div>
                <p className="mt-1 text-[0.78rem] leading-relaxed text-muted">{copy}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-ink/[0.08] pt-3.5 text-[0.8rem]">
            <div className="flex flex-wrap items-center gap-1.5 text-muted">
              <span className="text-ink font-medium">Custom EQ bands:</span>
              {EQ_BANDS.map((hz) => (
                <span
                  key={hz}
                  className="rounded bg-fog px-1.5 py-0.5 font-mono text-[0.72rem] text-ink/80 ring-1 ring-ink/8"
                >
                  {hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}
                </span>
              ))}
              <span className="ml-1 text-[0.76rem]">(±6 dB, stored on earbuds)</span>
            </div>
            <button
              type="button"
              onClick={() => onFocusSubsystem("drivers")}
              className="text-[0.78rem] font-medium text-tip hover:underline"
            >
              Highlight drivers in Fig 01
            </button>
          </div>
        </div>
      </section>

      {/* 02 — Smarter Silence: 55 dB Dynamic ANC & 3-Mic Clear Call */}
      <section id="silence" className="scroll-mt-8">
        <SectionHeader
          title="Smarter silence: 55 dB Dynamic ANC & 3-mic array"
          meta="02"
          serifMeta
          description="Real-time cancellation recalculates 800 times per second across a 5,500 Hz bandwidth, balancing full seal, Adaptive gating and Transparency."
        />

        <div className="divide-y divide-ink/[0.08] rounded-[4px] border border-ink/12 bg-sheet px-4.5 sm:px-5">
          {[
            [
              "Feed-forward microphone",
              "Upper outer shell vent",
              "Samples external street, metro and office noise at 800×/s to generate the primary anti-phase wave.",
            ],
            [
              "Feed-back microphone",
              "Inner acoustic duct ahead of nozzle",
              "Measures residual ear-canal pressure up to 5,500 Hz (55 dB peak attenuation) and powers the ear-tip seal test.",
            ],
            [
              "Stem talk microphone",
              "Base of vertical stem",
              "Works with the AI Clear Call 3-mic beamformer to isolate speech from wind and room chatter.",
            ],
            [
              "Adaptive & 4 ANC depths",
              "Smart · Deep · Medium · Light",
              "OpenBuds switches modes directly and reads back the live Smart depth chosen by the earbuds.",
            ],
          ].map(([name, loc, desc]) => (
            <div
              key={name}
              className="grid gap-1 py-3.5 sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:gap-5"
            >
              <div>
                <div className="text-[0.86rem] font-medium text-ink">{name}</div>
                <div className="text-[0.75rem] text-muted">{loc}</div>
              </div>
              <p className="text-[0.83rem] leading-relaxed text-muted">{desc}</p>
            </div>
          ))}
          <div className="flex items-center justify-between py-3 text-[0.8rem]">
            <span className="text-muted">TÜV Rheinland High Performance Noise Cancellation</span>
            <button
              type="button"
              onClick={() => onFocusSubsystem("anc")}
              className="font-medium text-tip hover:underline"
            >
              Highlight 3-mic loop in Fig 01
            </button>
          </div>
        </div>
      </section>

      {/* 03 — Capacitive Stems, Diagnostics & Dual-Device Link */}
      <section id="stem" className="scroll-mt-8">
        <SectionHeader
          title="Capacitive swipe stems, diagnostics & Bluetooth 5.4"
          meta="03"
          serifMeta
          description="Every physical gesture, multipoint switch and on-bud calibration tool exposed without installing a mobile companion app."
        />

        <div className="divide-y divide-ink/[0.08] rounded-[4px] border border-ink/12 bg-sheet px-4.5 sm:px-5">
          {[
            [
              "Stem gestures & swipe",
              "Configure single, double and triple taps, vertical volume slide, call controls and which noise modes stay in the long-hold cycle.",
            ],
            [
              "Golden Sound & Fit test",
              "Run the 12-tone per-ear hearing calibration (250 Hz – 8 kHz) to write a custom Golden Sound profile, or verify ear-tip seal in 10 seconds.",
            ],
            [
              "Steady Connect & 45 h case",
              "Manage Bluetooth 5.4 dual-device pairing, 47 ms Game Mode, wear detection, Find My Earbuds ring, and per-bud + pebble case battery.",
            ],
          ].map(([title, body]) => (
            <div
              key={title}
              className="grid gap-1 py-3.5 sm:grid-cols-[12.5rem_minmax(0,1fr)] sm:gap-5"
            >
              <div className="text-[0.86rem] font-medium text-ink">{title}</div>
              <p className="text-[0.83rem] leading-relaxed text-muted">{body}</p>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-[0.8rem]">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => onFocusSubsystem("stem")}
                className="font-medium text-tip hover:underline"
              >
                Highlight stem &amp; DACs
              </button>
              <button
                type="button"
                onClick={() => onFocusSubsystem("case")}
                className="font-medium text-tip hover:underline"
              >
                Highlight pebble case
              </button>
            </div>
            <button
              type="button"
              onClick={onInspectControls}
              className="font-medium text-ink underline underline-offset-2 hover:text-tip"
            >
              Preview full control sheet
            </button>
          </div>
        </div>
      </section>

      {/* 04 — Native macOS App */}
      <MacDownload sectionIndex="04" />
    </div>
  );
}

function ConfirmHost() {
  const request = useConfirmRequest();
  return (
    <Dialog open={!!request} onClose={() => request?.resolve(false)} title={request?.title ?? ""}>
      <p className="mt-3 text-[0.88rem] leading-relaxed text-muted">{request?.body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={() => request?.resolve(false)}>Cancel</Button>
        <Button variant="primary" autoFocus onClick={() => request?.resolve(true)}>
          {request?.action}
        </Button>
      </div>
    </Dialog>
  );
}
