import type { LucideIcon } from "lucide-react";

export default function ComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-7" />
      </div>
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Coming soon in a future milestone!
      </p>
    </div>
  );
}
