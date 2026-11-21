/**
 * Acoustic Resonance & Sympathetic Tuning-Fork World for OpenBuds:
 *
 * - Three monumental brushed-chrome 3D tuning forks (A4 · E5 · A5 octave triad)
 *   floating in zero-gravity diagonal tension framing the centered hero headline.
 * - Real sympathetic resonance: strike one fork (click anywhere or sweep over its
 *   tines) and a finite-speed cyan acoustic wavefront travels across the void; when
 *   it hits another fork, that fork catches the wave and sings back!
 * - Cursor "ANC Silence Radius": moving your pointer across the shimmering standing-wave
 *   interference field carves a real-time pocket of crystal-clear digital silence.
 * - Directly reacts to OpenBuds's 4 real noise modes: ANC, Adaptive, Transparency, Off.
 */
import type { NoiseMode } from "../lib/protocol";
import { forkToWorld, type ForkPose } from "./forkGeometry";
import { TAU, clamp, current, rand } from "./math";

export type ResonanceMode = "anc" | "adaptive" | "transparency" | "off";

export function toResonanceMode(mode: NoiseMode | null | undefined): ResonanceMode {
  if (!mode) return "anc";
  if (mode === "transparency") return "transparency";
  if (mode === "adaptive") return "adaptive";
  if (mode === "off") return "off";
  return "anc";
}

export interface ForkEntity {
  id: number;
  label: string;
  /** Normalized anchor position in viewport [0..1]. */
  anchorX: number;
  anchorY: number;
  /** Relative scale factor. */
  size: number;
  /** Base tilt angle in radians. */
  baseRot: number;
  /** Visual depth (0.62 distant -> 1.0 hero foreground). */
  depth: number;
  /** Metallic RGB tint multipliers. */
  tint: readonly [number, number, number];
  /** Acoustic spatial wave number (higher pitch = tighter interference fringes). */
  waveK: number;
  /** Visual vibration frequency (rad/s) for tine oscillation. */
  vibOmega: number;
  /** Current 0..1 ringing energy. */
  energy: number;
  /** Current phase for harmonic oscillation. */
  phase: number;
  /** Ambient float phase offset. */
  driftPhase: number;
  /** Computed live pose in CSS px. */
  pose: ForkPose;
  /** World coordinates of the midpoint between the two singing tine tips. */
  emitterX: number;
  emitterY: number;
}

export interface AcousticWavefront {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
  strength: number;
  /** Fork id that originated this ring (so it sympathetically excites OTHER forks). */
  sourceForkId: number;
  /** Bitmask of fork IDs already sympathetically struck by this ring. */
  struckMask: number;
  /** True draws a twin 2× octave harmonic inner ring. */
  harmonic: boolean;
}

export interface AmbientGrain {
  x: number;
  y: number;
  vx: number;
  vy: number;
  depth: number;
  pitch: number;
  energy: number;
}

export class ResonanceWorld {
  width = 0;
  height = 0;
  time = 0;
  mode: ResonanceMode = "anc";
  bassBoost = 0;

  forks: ForkEntity[] = [];
  waves: AcousticWavefront[] = [];
  grains: AmbientGrain[] = [];
  pointer = { x: 0, y: 0, nx: 0, ny: 0, active: false, down: false };
  smoothPtr = { nx: 0, ny: 0 };

  /** Smoothed 0..1 active cursor silence bubble strength (fades gently in/out). */
  silenceBubble = 0;
  /** Current silence bubble radius in CSS px. */
  silenceRadius = 128;

  private nextAutoStrike = 0.4;
  private hoverCooldown = 0;
  private tmpCur = { x: 0, y: 0 };

  constructor() {
    this.initForks();
  }

  private initForks() {
    // Twin monumental brushed-chrome cathedral tuning forks (A4 · E5 harmonic fifth)
    // poised vertically with subtle asymmetric elevation & gentle zero-gravity sway
    this.forks = [
      {
        id: 1,
        label: "A4 · 440 Hz",
        anchorX: 0.145,
        anchorY: 0.535,
        size: 1.0,
        baseRot: 0.045, // +2.5° proud cathedral poise (stem dead-center under U-bowl)
        depth: 1.0,
        tint: [0.92, 0.96, 1.06],
        waveK: 0.056,
        vibOmega: 26,
        energy: 0.88,
        phase: 0,
        driftPhase: 0.4,
        pose: {
          cx: 0,
          cy: 0,
          scale: 310,
          rot: 0.045,
          energy: 0.88,
          flex: 0,
          depth: 1,
          id: 1,
          tint: [0.92, 0.96, 1.06],
        },
        emitterX: 0,
        emitterY: 0,
      },
      {
        id: 2,
        label: "E5 · 659 Hz",
        anchorX: 0.855,
        anchorY: 0.465,
        size: 0.94,
        baseRot: -0.05, // -2.8° subtle asymmetric counterpoint
        depth: 0.94,
        tint: [0.86, 0.94, 1.12],
        waveK: 0.072,
        vibOmega: 34,
        energy: 0.82,
        phase: 1.7,
        driftPhase: 2.3,
        pose: {
          cx: 0,
          cy: 0,
          scale: 292,
          rot: -0.05,
          energy: 0.82,
          flex: 0,
          depth: 0.94,
          id: 2,
          tint: [0.86, 0.94, 1.12],
        },
        emitterX: 0,
        emitterY: 0,
      },
    ];
  }

  setMode(next: ResonanceMode) {
    if (this.mode === next) return;
    this.mode = next;
    // Emit a tactile transition resonance pulse when switching modes
    if (this.width > 0) {
      if (next === "anc") {
        // Phase-cancel burst from center sanctuary outward
        this.waves.push({
          x: this.width * 0.5,
          y: this.height * 0.5,
          radius: 18,
          maxRadius: Math.min(this.width, this.height) * 0.58,
          speed: 320,
          strength: 1.15,
          sourceForkId: 0,
          struckMask: 0xff,
          harmonic: false,
        });
      } else {
        this.strikeFork(this.forks[0], 0.92);
      }
    }
  }

  resize(width: number, height: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.silenceRadius = clamp(Math.min(width, height) * 0.16, 86, 154);
    this.updateForkPoses();

    if (first || this.grains.length === 0) {
      this.seedGrains();
      // Launch two initial sympathetic wavefronts so frame 1 is alive with crisp interference
      if (this.forks.length >= 2) {
        this.waves.push(
          {
            x: this.forks[0].emitterX,
            y: this.forks[0].emitterY,
            radius: Math.min(width, height) * 0.18,
            maxRadius: Math.hypot(width, height) * 0.82,
            speed: 220,
            strength: 0.95,
            sourceForkId: 1,
            struckMask: 1 << 1,
            harmonic: true,
          },
          {
            x: this.forks[1].emitterX,
            y: this.forks[1].emitterY,
            radius: Math.min(width, height) * 0.28,
            maxRadius: Math.hypot(width, height) * 0.82,
            speed: 220,
            strength: 0.82,
            sourceForkId: 2,
            struckMask: 1 << 2,
            harmonic: true,
          },
        );
      }
    } else {
      for (const g of this.grains) {
        g.x = clamp(g.x, 0, width);
        g.y = clamp(g.y, 0, height);
      }
    }
  }

  private seedGrains() {
    const { width: W, height: H } = this;
    const count = clamp(Math.round((W * H) / 7200), 65, 190);
    this.grains = [];
    for (let i = 0; i < count; i++) {
      this.grains.push({
        x: rand(0, W),
        y: rand(0, H),
        vx: rand(-26, 26),
        vy: rand(-14, 14),
        depth: rand(0.5, 1),
        pitch: i % 16,
        energy: rand(0.1, 0.5),
      });
    }
  }

  /** Click anywhere: emit a harmonic clap & strike any nearby fork to trigger sympathetic resonance. */
  strike(x: number, y: number) {
    let hitFork: ForkEntity | null = null;
    let bestD = Infinity;
    for (const f of this.forks) {
      const d = Math.hypot(x - f.emitterX, y - f.emitterY);
      if (d < f.pose.scale * 0.95 && d < bestD) {
        bestD = d;
        hitFork = f;
      }
    }

    if (hitFork) {
      this.strikeFork(hitFork, 1.0);
    } else {
      this.waves.push({
        x,
        y,
        radius: 6,
        maxRadius: Math.hypot(this.width, this.height) * 0.72,
        speed: 290,
        strength: 1.25,
        sourceForkId: 0,
        struckMask: 0,
        harmonic: true,
      });
    }

    // Excite nearby ambient acoustic grains
    const r = 240;
    for (const g of this.grains) {
      const dx = g.x - x;
      const dy = g.y - y;
      const d = Math.hypot(dx, dy);
      if (d < r && d > 1e-3) {
        const push = (1 - d / r) * 160;
        g.vx += (dx / d) * push;
        g.vy += (dy / d) * push;
        g.energy = 1;
      }
    }
  }

  strikeFork(fork: ForkEntity, amount: number) {
    fork.energy = clamp(Math.max(fork.energy, amount), 0, 1);
    this.waves.push({
      x: fork.emitterX,
      y: fork.emitterY,
      radius: fork.pose.scale * 0.14,
      maxRadius: Math.hypot(this.width, this.height) * 0.86,
      speed: 245,
      strength: 0.72 + amount * 0.45,
      sourceForkId: fork.id,
      struckMask: 1 << fork.id,
      harmonic: true,
    });
  }

  private updateForkPoses() {
    const { width: W, height: H, time } = this;
    if (W === 0 || H === 0) return;
    const minSide = Math.min(W, H);
    const narrow = W < 760;
    const baseScale = narrow
      ? clamp(minSide * 0.34, 125, 220)
      : clamp(minSide * 0.43, 215, 375);

    const px = this.smoothPtr.nx * (narrow ? 4 : 10);
    const py = this.smoothPtr.ny * (narrow ? 3 : 8);

    for (const f of this.forks) {
      const scale = baseScale * f.size;
      const bobY = Math.sin(time * 0.65 + f.driftPhase) * (narrow ? 4 : 9) * f.depth;
      const sway = Math.sin(time * 0.45 + f.driftPhase * 1.3) * 0.022;

      const ax = narrow ? (f.anchorX < 0.5 ? 0.06 : 0.94) : f.anchorX;

      f.pose.cx = W * ax + px * f.depth;
      f.pose.cy = H * f.anchorY + bobY + py * f.depth;
      f.pose.scale = scale;
      f.pose.rot = f.baseRot + sway + this.smoothPtr.nx * 0.025 * f.depth;
      f.pose.energy = f.energy;
      f.pose.flex = f.energy * Math.sin(f.phase);

      // Midpoint between the two singing tine tips
      const tip = forkToWorld(0, -0.64, f.pose);
      f.emitterX = tip.x;
      f.emitterY = tip.y;
    }
  }

  step(dt: number) {
    this.time += dt;
    const { width: W, height: H, time } = this;
    if (W === 0 || H === 0) return;

    // Smooth parallax & cursor ANC silence bubble envelope
    const tNx = this.pointer.active ? this.pointer.nx : 0;
    const tNy = this.pointer.active ? this.pointer.ny : 0;
    this.smoothPtr.nx += (tNx - this.smoothPtr.nx) * Math.min(1, dt * 4.5);
    this.smoothPtr.ny += (tNy - this.smoothPtr.ny) * Math.min(1, dt * 4.5);

    const targetBubble =
      this.pointer.active && (this.mode === "anc" || this.mode === "adaptive") ? 1 : 0;
    this.silenceBubble += (targetBubble - this.silenceBubble) * Math.min(1, dt * 6);

    // Subtle pointer hover brush over a fork's tines makes it hum
    this.hoverCooldown = Math.max(0, this.hoverCooldown - dt);
    if (this.pointer.active && this.hoverCooldown <= 0) {
      for (const f of this.forks) {
        const d = Math.hypot(this.pointer.x - f.emitterX, this.pointer.y - f.emitterY);
        if (d < f.pose.scale * 0.36 && f.energy < 0.72) {
          this.strikeFork(f, 0.85);
          this.hoverCooldown = 0.85;
          break;
        }
      }
    }

    // Periodic ambient excitation so the cathedral always breathes sympathetically
    const strikePeriod =
      this.mode === "anc" ? 3.8 : this.mode === "adaptive" ? 3.0 : this.mode === "transparency" ? 2.5 : 2.2;
    if (time >= this.nextAutoStrike) {
      this.nextAutoStrike = time + strikePeriod;
      const idx = Math.floor(time * 0.7) % this.forks.length;
      const target = this.forks[idx];
      const strength =
        this.mode === "anc"
          ? 0.68
          : this.mode === "adaptive"
            ? 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.6))
            : 0.92;
      this.strikeFork(target, strength);
    }

    // Update fork vibration energy & phase
    const damping =
      this.mode === "anc" ? 0.38 : this.mode === "adaptive" ? 0.3 : this.mode === "transparency" ? 0.22 : 0.18;
    const minIdleHum =
      this.mode === "anc" ? 0.48 : this.mode === "adaptive" ? 0.54 : 0.64;
    for (const f of this.forks) {
      f.phase = (f.phase + dt * f.vibOmega) % TAU;
      f.energy = Math.max(minIdleHum, f.energy * Math.exp(-dt * damping));
    }

    this.updateForkPoses();

    // Advance traveling acoustic wavefronts & trigger sympathetic resonance on impact!
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const prevR = w.radius;
      w.radius += w.speed * dt;
      if (w.radius >= w.maxRadius) {
        this.waves.splice(i, 1);
        continue;
      }

      // Check sympathetic strike on every other fork as the wavefront passes its tines
      for (const f of this.forks) {
        const bit = 1 << f.id;
        if (w.struckMask & bit) continue;
        const dist = Math.hypot(f.emitterX - w.x, f.emitterY - w.y);
        if (prevR <= dist && w.radius >= dist) {
          w.struckMask |= bit;
          const remaining = 1 - w.radius / w.maxRadius;
          const answer = clamp(w.strength * remaining * 0.92, 0.35, 0.92);
          f.energy = clamp(Math.max(f.energy, answer), 0, 1);
          if (this.waves.length < 7 && answer > 0.45) {
            this.waves.push({
              x: f.emitterX,
              y: f.emitterY,
              radius: f.pose.scale * 0.12,
              maxRadius: Math.hypot(W, H) * 0.72,
              speed: 235,
              strength: answer * 0.72,
              sourceForkId: f.id,
              struckMask: bit | (w.sourceForkId ? 1 << w.sourceForkId : 0),
              harmonic: false,
            });
          }
        }
      }
    }

    // Advance drifting acoustic grains (they freeze inside the cursor ANC silence bubble!)
    const cur = this.tmpCur;
    const ptrActive = this.silenceBubble > 0.08;
    const bubbleR = this.silenceRadius * (this.mode === "adaptive" ? 0.85 + 0.25 * Math.sin(time * 1.4) : 1);

    for (const g of this.grains) {
      let freeze = 0;
      if (ptrActive) {
        const dp = Math.hypot(g.x - this.pointer.x, g.y - this.pointer.y);
        if (dp < bubbleR) {
          freeze = clamp(1 - dp / bubbleR, 0, 1) * this.silenceBubble;
        }
      }

      current(g.x, g.y, time, cur);
      const speedMul = 1 - freeze * 0.95;
      g.vx = (g.vx * 0.96 + cur.x * 0.14 * dt) * speedMul;
      g.vy = (g.vy * 0.96 + cur.y * 0.14 * dt) * speedMul;

      const s = Math.hypot(g.vx, g.vy);
      if (s > 90) {
        g.vx = (g.vx / s) * 90;
        g.vy = (g.vy / s) * 90;
      }

      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (g.x < -12) g.x = W + 12;
      else if (g.x > W + 12) g.x = -12;
      if (g.y < -12) g.y = H + 12;
      else if (g.y > H + 12) g.y = -12;

      g.energy = Math.max(0.12, g.energy * Math.exp(-dt * 1.1) * (1 - freeze * 0.85));
    }
  }
}
