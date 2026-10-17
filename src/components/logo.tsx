import { cn } from "@/lib/utils";

export function UzonMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.jpg"
      alt="UZON"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-xl object-contain", className)}
    />
  );
}

export function UzonWordmark({ className, withSlogan }: { className?: string; withSlogan?: boolean }) {
  return (
    <span className={cn("flex flex-col leading-none", className)}>
      <span className="text-[20px] font-extrabold tracking-[0.15em] text-ink">UZON</span>
      {withSlogan && <span className="mt-0.5 text-[8px] font-medium tracking-[0.15em] text-muted uppercase">Made in Uzbekistan</span>}
    </span>
  );
}