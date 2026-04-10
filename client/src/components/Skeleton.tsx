export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/30 rounded h-3 ${className}`} />;
}

export function SkeletonCard({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={`animate-pulse border border-border/30 rounded-lg p-4 space-y-3 ${className}`}>
      {children || (
        <>
          <SkeletonLine className="w-3/4" />
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-full" />
        </>
      )}
    </div>
  );
}

export function SkeletonCircle({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-muted/30 rounded-full ${className}`} />;
}
