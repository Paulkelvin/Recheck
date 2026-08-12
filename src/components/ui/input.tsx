import { cn } from "@/lib/cn";

const FIELD_BASE =
  "rounded-lg border border-border bg-surface px-3 py-2 text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-accent";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_BASE, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_BASE, className)} {...props} />;
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD_BASE, className)} {...props} />;
}

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("flex flex-col gap-1.5 text-sm font-medium text-foreground", className)}
      {...props}
    >
      {children}
    </label>
  );
}
