import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const containerSizes = {
  reading: "distil-container-reading",
  list: "distil-container-list",
  wide: "distil-container-wide",
};

export function PageContainer({
  size = "list",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: keyof typeof containerSizes }) {
  return (
    <div className={cn(containerSizes[size], className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  meta,
  actions,
  className,
  titleClassName,
  display = false,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  display?: boolean;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 flex-1 basis-60">
        {eyebrow && <div className="mb-2 text-sm font-medium text-muted-foreground">{eyebrow}</div>}
        <h1
          className={cn(
            "font-serif font-medium text-foreground text-balance",
            display ? "text-display" : "text-page-title",
            titleClassName
          )}
        >
          {title}
        </h1>
        {description && <div className="mt-3 text-base text-muted-foreground">{description}</div>}
        {meta && <div className="mt-2 text-sm text-muted-foreground">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
