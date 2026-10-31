import { useEffect, useId, useRef, type ReactNode } from "react";
import type { ActionState } from "../lib/store";

export function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(" ");
}

export function Switch({
  label,
  on,
  disabled,
  onChange,
}: {
  label: string;
  on: boolean | undefined;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on === undefined ? "mixed" : on}
      disabled={disabled || on === undefined}
      onClick={() => onChange(!on)}
      className={cx(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40",
        on ? "bg-tip" : "bg-ink/15",
      )}
    >
      <span
        className={cx(
          "absolute top-1 left-1 size-5 rounded-full bg-sheet shadow-[0_1px_2px_rgb(21_28_51/0.25)] transition-transform duration-200",
          on && "translate-x-5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
  size = "md",
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
  size?: "md" | "sm";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "gap-1 bg-ink/[0.06] p-1",
        size === "md" ? "flex rounded-2xl" : "grid rounded-xl",
      )}
      style={
        size === "sm"
          ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
          : undefined
      }
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => !selected && onChange(o.value)}
            className={cx(
              "rounded-xl px-2 text-center leading-tight transition-colors duration-200 disabled:cursor-not-allowed",
              size === "md"
                ? "min-h-12 flex-auto px-2.5 py-2 text-[0.88rem] whitespace-nowrap"
                : "min-h-9 rounded-lg py-1.5 text-sm",
              selected
                ? "bg-sheet text-ink shadow-[0_1px_3px_rgb(21_28_51/0.12)]"
                : "text-ink/65 hover:text-ink disabled:hover:text-ink/65",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: number | undefined;
  options: { value: number; label: string }[];
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 appearance-none rounded-xl bg-ink/[0.06] py-0 pr-9 pl-3.5 text-[0.95rem] text-ink transition-colors hover:bg-ink/10 disabled:opacity-50"
      >
        {value !== undefined && !options.some((o) => o.value === value) && (
          <option value={value}>Other ({value})</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-ink/60"
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function Range({
  label,
  min,
  max,
  value,
  disabled,
  onCommit,
  format = String,
}: {
  label: string;
  min: number;
  max: number;
  value: number | undefined;
  disabled?: boolean;
  onCommit: (v: number) => void;
  format?: (v: number) => string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const out = useRef<HTMLOutputElement>(null);
  const shown = value ?? min;
  useEffect(() => {
    if (ref.current) ref.current.value = String(shown);
    if (out.current) out.current.textContent = value === undefined ? "–" : format(shown);
  }, [shown, value, format]);
  const fill = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="flex w-full items-center gap-4">
      <input
        ref={ref}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={1}
        defaultValue={shown}
        disabled={disabled || value === undefined}
        style={{ "--fill": fill(shown) } as React.CSSProperties}
        onInput={(e) => {
          const v = Number(e.currentTarget.value);
          e.currentTarget.style.setProperty("--fill", fill(v));
          if (out.current) out.current.textContent = format(v);
        }}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (v !== value) onCommit(v);
        }}
        className="range min-w-0 flex-1"
      />
      <output ref={out} className="numeral w-10 text-right text-lg tabular-nums">
        {value === undefined ? "–" : format(shown)}
      </output>
    </div>
  );
}

export function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="scroll-mt-6">
      <div className="mb-3 px-1">
        <h2 id={id} className="text-[1.35rem] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 max-w-[56ch] text-[0.92rem] text-ink/60">{description}</p>
        )}
      </div>
      <div className="divide-y divide-ink/[0.08] rounded-[1.4rem] bg-sheet px-5 shadow-[0_1px_0_rgb(21_28_51/0.04)]">
        {children}
      </div>
    </section>
  );
}

export function Row({
  title,
  description,
  control,
  status,
  children,
  stack,
}: {
  title: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  status?: ActionState;
  children?: ReactNode;
  stack?: boolean;
}) {
  return (
    <div className="py-4">
      <div
        className={cx("flex gap-x-6 gap-y-3", stack ? "flex-col" : "items-center justify-between")}
      >
        <div className="min-w-0">
          <div className="text-[1rem] text-ink">{title}</div>
          {description && (
            <div className="mt-0.5 max-w-[52ch] text-[0.88rem] leading-snug text-ink/60">
              {description}
            </div>
          )}
        </div>
        {control && <div className={cx("shrink-0", stack && "w-full")}>{control}</div>}
      </div>
      {children}
      <Status status={status} />
    </div>
  );
}

export function Status({ status }: { status?: ActionState }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {status?.phase === "pending" && (
        <p className="mt-2.5 flex items-center gap-2 text-[0.85rem] text-tip">
          <span className="pulse size-1.5 rounded-full bg-tip" />
          Waiting for the earbuds to confirm
        </p>
      )}
      {status?.phase === "done" && (
        <p className="mt-2.5 flex items-center gap-2 text-[0.85rem] text-tip">
          <svg aria-hidden viewBox="0 0 12 12" className="size-3">
            <path
              d="m2.5 6.2 2.3 2.3 4.7-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {status.message ?? "Confirmed by the earbuds"}
        </p>
      )}
      {status?.phase === "error" && (
        <p className="mt-2.5 rounded-xl bg-amber/15 px-3 py-2 text-[0.85rem] text-warn">
          {status.message}
        </p>
      )}
    </div>
  );
}

export function Button({
  children,
  variant = "quiet",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "quiet" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[0.95rem] whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-tip text-sheet hover:bg-tip/90",
        variant === "quiet" && "bg-ink/[0.06] text-ink hover:bg-ink/10",
        variant === "danger" && "bg-amber/15 text-warn hover:bg-amber/25",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cx(
        "sheet-dialog m-auto w-[min(100vw-2rem,var(--w))] rounded-[1.6rem] bg-sheet p-0 text-ink",
        wide ? "[--w:34rem]" : "[--w:26rem]",
      )}
    >
      {open && (
        <div className="p-6">
          <h2 className="text-xl font-medium tracking-[-0.01em]">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
