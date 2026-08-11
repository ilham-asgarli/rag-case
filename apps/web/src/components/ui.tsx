import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small shared primitives.
 *
 * Hand-written rather than pulled from a component library: this app needs
 * seven of them, and every one is under twenty lines. A dependency would cost
 * more to configure than to write.
 */

export const Card = ({ className, ...props }: ComponentPropsWithoutRef<"div">) => (
  <div
    className={cn(
      "rounded-[--radius-card] border border-border bg-surface-raised shadow-sm",
      className,
    )}
    {...props}
  />
);

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export const Button = ({ className, variant = "primary", size = "md", ...props }: ButtonProps) => (
  <button
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
      "disabled:pointer-events-none disabled:opacity-50",
      size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
      variant === "primary" && "bg-accent text-white hover:bg-accent-hover",
      variant === "secondary" &&
        "border border-border-strong bg-surface-raised text-ink hover:bg-surface-sunken",
      variant === "ghost" && "text-ink-muted hover:bg-surface-sunken hover:text-ink",
      variant === "danger" && "bg-critical text-white hover:opacity-90",
      className,
    )}
    {...props}
  />
);

export const Input = ({ className, ...props }: ComponentPropsWithoutRef<"input">) => (
  <input
    className={cn(
      "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink",
      "placeholder:text-ink-subtle",
      className,
    )}
    {...props}
  />
);

type BadgeTone = "neutral" | "positive" | "critical" | "warning" | "accent";

export const Badge = ({
  tone = "neutral",
  className,
  ...props
}: ComponentPropsWithoutRef<"span"> & { tone?: BadgeTone }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      tone === "neutral" && "bg-surface-sunken text-ink-muted",
      tone === "positive" && "bg-positive-soft text-positive",
      tone === "critical" && "bg-critical-soft text-critical",
      tone === "warning" && "bg-warning-soft text-warning",
      tone === "accent" && "bg-accent-soft text-accent-ink",
      className,
    )}
    {...props}
  />
);

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
    <p className="font-medium text-ink">{title}</p>
    <p className="max-w-sm text-sm text-ink-muted">{description}</p>
    {action}
  </div>
);

/** Error states say what failed and offer the next action. */
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="flex flex-col items-center gap-3 rounded-[--radius-card] border border-critical/30 bg-critical-soft px-6 py-8 text-center">
    <p className="text-sm text-critical">{message}</p>
    {onRetry ? (
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    ) : null}
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded bg-surface-sunken", className)} />
);
