import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <h2 className="font-serif text-xl font-medium text-foreground">{title}</h2>
      {description && (
        <div className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
