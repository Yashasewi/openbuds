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
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40",
        on ? "bg-tip" : "bg-ink/14 ring-1 ring-inset ring-ink/12",
      )}
    >
      <span
        className={cx(
          "absolute top-0.75 left-0.75 size-4.5 rounded-full bg-sheet shadow-[0_1px_2px_rgb(23_25_24/0.22)] transition-transform duration-150",
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
        "gap-1 rounded-md bg-ink/[0.055] p-0.75 ring-1 ring-inset ring-ink/[0.07]",
        size === "md" ? "flex flex-wrap sm:flex-nowrap" : "grid",
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
              "rounded-[4px] px-2.5 text-center leading-tight transition-colors duration-150 disabled:cursor-not-allowed",
              size === "md"
                ? "min-h-9 flex-auto py-1.5 text-[0.84rem] whitespace-nowrap"
                : "min-h-8 py-1 text-[0.8rem]",
              selected
                ? "bg-sheet font-medium text-ink shadow-[0_1px_2px_rgb(23_25_24/0.08),0_0_0_1px_rgb(23_25_24/0.08)]"
                : "text-muted hover:text-ink disabled:hover:text-muted",
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
        className="h-9 appearance-none rounded-md bg-fog py-0 pr-8 pl-3 text-[0.86rem] text-ink ring-1 ring-ink/14 transition-colors hover:ring-ink/28 disabled:opacity-50"
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
        className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 text-muted"
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
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
    <div className="flex w-full items-center gap-3.5">
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
      <output ref={out} className="numeral w-9 text-right text-[0.95rem] text-ink tabular-nums">
        {value === undefined ? "–" : format(shown)}
      </output>
    </div>
  );
}

export function SectionHeader({
  id,
  title,
  meta,
  serifMeta,
  description,
}: {
  id?: string;
  title: string;
  meta?: string;
  serifMeta?: boolean;
  description?: string;
}) {
  return (
    <div className="mb-3.5">
      <div className="flex items-baseline gap-3.5">
        <h2 id={id} className="text-[0.94rem] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        <span className="h-px flex-1 bg-ink/10" aria-hidden />
        {meta && (
          <span
            className={cx(
              "shrink-0 text-muted",
              serifMeta ? "font-serif text-[0.92rem] italic" : "text-[0.78rem] tabular-nums",
            )}
          >
            {meta}
          </span>
        )}
      </div>
      {description && (
        <p className="mt-1.5 max-w-[60ch] text-[0.86rem] leading-relaxed text-muted">
          {description}
        </p>
      )}
    </div>
  );
}

export function Group({
  title,
  meta,
  description,
  children,
}: {
  title: string;
  meta?: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="scroll-mt-8">
      <SectionHeader id={id} title={title} meta={meta} description={description} />
      <div className="divide-y divide-ink/[0.08] rounded-[4px] border border-ink/12 bg-sheet px-4.5">
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
    <div className="py-3.5">
      <div
        className={cx(
          "flex gap-x-6 gap-y-2.5",
          stack ? "flex-col" : "items-center justify-between",
        )}
      >
        <div className="min-w-0">
          <div className="text-[0.9rem] font-medium text-ink">{title}</div>
          {description && (
            <div className="mt-0.5 max-w-[54ch] text-[0.83rem] leading-relaxed text-muted">
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
        <p className="mt-2 flex items-center gap-2 text-[0.8rem] text-tip">
          <span className="pulse size-1.5 rounded-full bg-tip" />
          Waiting for the earbuds to confirm
        </p>
      )}
      {status?.phase === "done" && (
        <p className="mt-2 flex items-center gap-1.5 text-[0.8rem] text-tip">
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
        <p className="mt-2 rounded bg-amber/12 px-3 py-1.5 text-[0.8rem] text-warn ring-1 ring-amber/25">
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
        "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-[0.86rem] whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-tip font-medium text-white hover:bg-tip/90",
        variant === "quiet" &&
          "bg-sheet text-ink ring-1 ring-ink/14 hover:bg-ink/[0.025] hover:ring-ink/28",
        variant === "danger" && "bg-amber/14 text-warn ring-1 ring-amber/30 hover:bg-amber/22",
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
        "sheet-dialog m-auto w-[min(100vw-2rem,var(--w))] rounded-md bg-sheet p-0 text-ink",
        wide ? "[--w:32rem]" : "[--w:25rem]",
      )}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <h2 className="text-[1.02rem] font-semibold tracking-[-0.01em]">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
