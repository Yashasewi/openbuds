import { useEffect, useRef } from "react";
import { ResonanceRenderer } from "./resonanceRenderer";
import { ResonanceWorld, type ResonanceMode } from "./resonanceWorld";

const STEP = 1 / 60;
const MAX_STEPS = 4;
const FRAME_INTERVAL = 1000 / 30;

class ResonanceEngine {
  private canvas: HTMLCanvasElement;
  private world: ResonanceWorld;
  private renderer: ResonanceRenderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private warmed = false;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, initialMode: ResonanceMode) {
    this.canvas = canvas;
    this.world = new ResonanceWorld();
    this.world.mode = initialMode;
    this.renderer = new ResonanceRenderer(canvas);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    window.addEventListener("pointerup", this.onPointerUp, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    this.resize();
    void document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed) this.renderer.render(this.world, STEP);
    });
    this.schedule();
  }

  setMode(mode: ResonanceMode) {
    this.world.setMode(mode);
    if (this.reducedMotion.matches) this.renderer.render(this.world, STEP);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(rect.width, rect.height, dpr);
    this.world.resize(rect.width, rect.height);
    if (!this.warmed) {
      this.warmed = true;
      for (let i = 0; i < 90; i++) {
        this.world.step(STEP);
        this.renderer.warmStep(this.world, STEP);
      }
    }
    this.renderer.render(this.world, STEP);
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    if (this.disposed || !this.visible || this.reducedMotion.matches) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (now - this.last < FRAME_INTERVAL) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.world.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.renderer.render(this.world, dt);
  };

  private onMotionPreference = () => {
    if (this.reducedMotion.matches) {
      cancelAnimationFrame(this.raf);
      this.renderer.render(this.world, STEP);
    } else {
      this.schedule();
    }
  };

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return {
      x,
      y,
      nx: rect.width > 0 ? (x / rect.width) * 2 - 1 : 0,
      ny: rect.height > 0 ? (y / rect.height) * 2 - 1 : 0,
      inside,
    };
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y, nx, ny, inside } = this.toLocal(e);
    const p = this.world.pointer;
    p.x = x;
    p.y = y;
    p.nx = nx;
    p.ny = ny;
    p.active = inside && e.pointerType !== "touch";
  };

  private onPointerDown = (e: PointerEvent) => {
    const { x, y, inside } = this.toLocal(e);
    this.world.pointer.down = true;
    // Only strike when clicking open stage or canvas (don't hijack button clicks unnecessarily)
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, summary")) return;
    if (inside && !this.reducedMotion.matches) this.world.strike(x, y);
  };

  private onPointerUp = () => {
    this.world.pointer.down = false;
  };

  private onPointerLeave = () => {
    this.world.pointer.active = false;
    this.world.pointer.down = false;
  };
}

export function AsciiResonanceStage({
  className,
  mode = "anc",
}: {
  className?: string;
  mode?: ResonanceMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ResonanceEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new ResonanceEngine(canvas, mode);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // Mount once per canvas; mode syncs via engine.setMode() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setMode(mode);
  }, [mode]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`font-mono ${className ?? ""}`} />;
}
