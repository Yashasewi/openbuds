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
        "relative h-6 w-11 shrink-0 border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40",
        on ? "border-tip/75 bg-tip/15" : "border-ink/28 bg-fog/70 hover:border-ink/50",
      )}
    >
      <span
        className={cx(
          "absolute top-[3px] left-[3px] size-4 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          on ? "translate-x-5 bg-tip" : "bg-ink/45",
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
        "gap-[2px] border border-ink/25 bg-fog/75 p-[2px]",
        size === "md" ? "grid grid-cols-2" : "grid",
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
              "px-2 text-center leading-tight tracking-tight transition-colors duration-200 disabled:cursor-not-allowed",
              size === "md" ? "min-h-9 px-2.5 py-1.5 text-[0.83rem]" : "min-h-8 py-1 text-[0.78rem]",
              selected
                ? size === "md"
                  ? "bg-ink font-medium text-fog"
                  : "bg-tip/18 font-medium text-tip ring-1 ring-tip/55 ring-inset"
                : "font-light text-ink/60 hover:bg-ink/[0.06] hover:text-ink disabled:hover:bg-transparent disabled:hover:text-ink/60",
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
        className="h-9 appearance-none border border-ink/28 bg-fog/85 py-0 pr-8 pl-3 text-[0.88rem] font-light text-ink transition-colors hover:border-ink/55 disabled:opacity-45"
      >
        {value !== undefined && !options.some((o) => o.value === value) && (
          <option value={value} className="bg-sheet text-ink">
            Other ({value})
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-sheet text-ink">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute top-1/2 right-2.5 size-3 -translate-y-1/2 text-ink/60"
      >
        <path
          d="M2.5 4.5 6 8l3.5-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="square"
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
      <output ref={out} className="w-10 text-right font-mono text-sm text-ink/85 tabular-nums">
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
    <section
      aria-labelledby={id}
      className="scroll-mt-20 border border-ink/28 bg-sheet/86 backdrop-blur-[2px]"
    >
      <div className="border-b border-ink/15 px-5 py-4 sm:px-6 sm:py-5">
        <h2
          id={id}
          className="display-sharp text-[1.45rem] leading-tight font-extralight tracking-[-0.02em] text-ink"
        >
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-[58ch] text-[0.88rem] font-light leading-relaxed text-ink/58">
            {description}
          </p>
        )}
      </div>
      <div className="divide-y divide-ink/12 px-5 sm:px-6">{children}</div>
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
          <div className="text-[0.95rem] font-normal text-ink">{title}</div>
          {description && (
            <div className="mt-0.5 max-w-[54ch] text-[0.85rem] font-light leading-relaxed text-ink/56">
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
        <p className="mt-2.5 flex items-center gap-2 font-mono text-[0.78rem] text-tip">
          <span className="pulse size-1.5 bg-tip" />
          Waiting for the earbuds to confirm
        </p>
      )}
      {status?.phase === "done" && (
        <p className="mt-2.5 flex items-center gap-2 font-mono text-[0.78rem] text-tip">
          <svg aria-hidden viewBox="0 0 12 12" className="size-3">
            <path
              d="m2.5 6.2 2.3 2.3 4.7-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="square"
            />
          </svg>
          {status.message ?? "Confirmed by the earbuds"}
        </p>
      )}
      {status?.phase === "error" && (
        <p className="mt-2.5 border border-amber/40 bg-amber/12 px-3 py-2 text-[0.83rem] text-warn">
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
        "inline-flex h-10 items-center justify-center gap-2 border px-4 text-[0.88rem] tracking-tight whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "border-ink bg-ink font-medium text-fog hover:bg-white",
        variant === "quiet" &&
          "border-ink/35 bg-fog/55 font-normal text-ink/90 backdrop-blur-[2px] hover:border-ink hover:bg-ink/10 hover:text-ink",
        variant === "danger" &&
          "border-amber/50 bg-amber/12 font-normal text-warn hover:border-amber hover:bg-amber/20",
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
        "sheet-dialog m-auto w-[min(100vw-2rem,var(--w))] border border-ink/40 bg-sheet p-0 text-ink",
        wide ? "[--w:34rem]" : "[--w:26rem]",
      )}
    >
      {open && (
        <div className="p-6">
          <h2 className="display-sharp text-[1.35rem] font-extralight tracking-[-0.02em]">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
