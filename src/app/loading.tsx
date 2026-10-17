import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
