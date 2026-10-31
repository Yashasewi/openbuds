import { NowPanel } from "./components/NowPanel";
import { MacDownload, SiteFooter, SiteHeader } from "./components/Site";
import { About, Connections, Features } from "./components/Other";
import { Sound } from "./components/Sound";
import { Tools } from "./components/Tools";
import { Touch } from "./components/Touch";
import { Button, Dialog, cx } from "./components/ui";
import { useBuds, useConfirmRequest } from "./lib/store";

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
  const connected = connection === "connected";
  const hasData = !!state.model;

  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid max-w-[80rem] gap-12 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-16 lg:px-12 lg:pt-10">
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <NowPanel />
        </aside>
        <main className="min-w-0">
          {hasData ? (
            <>
              <nav
                aria-label="Sections"
                className="mb-8 flex flex-wrap gap-x-5 gap-y-2 text-[0.92rem] text-ink/55"
              >
                {SECTIONS.map(([id, label]) => (
                  <a key={id} href={`#${id}`} className="rounded transition-colors hover:text-tip">
                    {label}
                  </a>
                ))}
              </nav>
              {!connected && (
                <p className="mb-8 rounded-2xl bg-ink/[0.06] px-4 py-3 text-[0.92rem] text-ink/70">
                  {connection === "restarting"
                    ? "The earbuds are restarting their connection. Settings come back when they reconnect."
                    : "Disconnected. These are the last values read from your earbuds."}
                </p>
              )}
              <div
                inert={!connected}
                className={cx(
                  "flex flex-col gap-12 transition-opacity duration-300",
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
            </>
          ) : (
            <Intro />
          )}
        </main>
        <ConfirmHost />
      </div>
      <SiteFooter />
    </>
  );
}

function Intro() {
  const steps = [
    [
      "Pair them with this Mac",
      "Open Bluetooth settings and connect your OnePlus Buds 4 as usual.",
    ],
    [
      "Use Google Chrome",
      "Chrome can talk to the earbuds over Bluetooth. Other browsers can’t yet.",
    ],
    ["Connect", "Press Connect earbuds and choose OnePlus Buds 4 from the list."],
  ];
  return (
    <div className="lg:pt-16">
      <h1 className="max-w-[18ch] text-[2.4rem] leading-[1.08] font-medium tracking-[-0.03em] text-balance sm:text-[3rem]">
        Every setting on your earbuds, from your desk.
      </h1>
      <p className="mt-4 max-w-[48ch] text-[1.05rem] text-ink/60">
        Noise control, sound, touch controls and tools. Each change is confirmed by reading it back
        from the earbuds.
      </p>
      <ol className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
        {steps.map(([title, body], i) => (
          <li key={title} className="border-t border-ink/15 pt-4">
            <span className="numeral text-[1.6rem] font-medium text-tip tabular-nums">{i + 1}</span>
            <h2 className="mt-2 text-[1rem] font-medium">{title}</h2>
            <p className="mt-1 text-[0.9rem] text-ink/60">{body}</p>
          </li>
        ))}
      </ol>
      <MacDownload />
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
