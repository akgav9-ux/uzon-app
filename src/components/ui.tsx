"use client";

import { Loader2, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn, avatarGradient, initials } from "@/lib/utils";
import { useApp } from "@/components/providers";

/* ------------------------------- Button ------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" }[size];
  const variants = {
    primary: "bg-brand text-white hover:bg-brandstrong shadow-[0_10px_30px_-16px_var(--brand)]",
    secondary: "bg-surface2 text-ink hover:bg-line border border-line",
    ghost: "text-muted hover:text-ink hover:bg-surface2",
    outline: "border border-brand/60 text-brand hover:bg-brandsoft",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button className={cn(base, sizes, variants, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface2 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------- Inputs ------------------------------- */

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-xs font-medium text-muted">
          {label}
          {required && <span className="text-danger"> *</span>}
        </span>
      )}
      {children}
      {error ? (
        <span role="alert" className="block text-xs text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 transition focus:border-brand focus:outline-none",
        invalid ? "border-danger" : "border-line",
        className,
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink placeholder:text-muted/70 transition focus:border-brand focus:outline-none",
        className,
      )}
      {...rest}
    />
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none", className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition",
        checked ? "border-brand bg-brand" : "border-line bg-surface2",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-all",
          checked ? "left-[22px]" : "left-0.5",
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

/* ------------------------------- Surfaces ------------------------------- */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface", className)} {...rest}>
      {children}
    </div>
  );
}

export function Avatar({
  name,
  url,
  size = 40,
  ring,
  className,
}: {
  name: string;
  url?: string | null;
  size?: number;
  ring?: "story" | "brand" | null;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{ width: size, height: size }}
    >
      {ring && (
        <span
          className={cn(
            "absolute -inset-0.5 rounded-full",
            ring === "story" ? "bg-gradient-to-tr from-brand via-uzblue to-uzgreen" : "bg-brand",
          )}
          aria-hidden
        />
      )}
      <span
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white"
        style={{ background: url ? undefined : avatarGradient(name) }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          initials(name)
        )}
      </span>
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "success" | "danger" | "warning" }) {
  const tones = {
    neutral: "bg-surface2 text-muted border-line",
    brand: "bg-brandsoft text-brand border-brand/30",
    success: "bg-success/15 text-success border-success/30",
    danger: "bg-danger/15 text-danger border-danger/30",
    warning: "bg-warning/15 text-warning border-warning/30",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-brand", className)} aria-hidden />;
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useApp();
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
      <Spinner />
      {label ?? t("common.loading")}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-14 text-center">
      {icon && <div className="text-brand">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useApp();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <p className="text-sm font-medium text-danger">{message || t("common.error")}</p>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

/* -------------------------------- Modal -------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl" }[size];
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm md:items-center md:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn("animate-pop w-full rounded-t-3xl border border-line bg-surface shadow-2xl md:rounded-2xl", widths)}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- Tabs --------------------------------- */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string; icon?: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
            value === item.value ? "bg-brand text-white" : "text-muted hover:bg-surface2 hover:text-ink",
          )}
        >
          {item.icon}
          {item.label}
          {typeof item.count === "number" && <span className="opacity-70">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------- Menu --------------------------------- */

const MenuCtx = createContext<{ open: boolean; close: () => void }>({ open: false, close: () => {} });

export function Menu({ trigger, children, align = "right" }: { trigger: (props: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <MenuCtx.Provider value={{ open, close: () => setOpen(false) }}>
          <div
            className={cn(
              "animate-pop absolute z-50 mt-1 min-w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl",
              align === "right" ? "right-0" : "left-0",
            )}
          >
            {children}
          </div>
        </MenuCtx.Provider>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, tone = "default", icon }: { children: ReactNode; onClick?: () => void; tone?: "default" | "danger"; icon?: ReactNode }) {
  const { close } = useContext(MenuCtx);
  return (
    <button
      onClick={() => {
        onClick?.();
        close();
      }}
      className={cn(
        "flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs transition hover:bg-surface2",
        tone === "danger" ? "text-danger" : "text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ------------------------------ Progress ------------------------------ */

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface2", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
