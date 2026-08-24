import React from "react";

export interface SkeletonProps {
  style?: React.CSSProperties;
  className?: string;
}

/** Pulse skeleton primitive. */
export function Skeleton({ style, className = "" }: SkeletonProps) {
  return <div className={("ds-skeleton " + className).trim()} style={style} />;
}

export function ConversationCardSkeleton() {
  return (
    <div className="ds-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Skeleton style={{ height: 24, width: "75%", marginBottom: 8 }} />
        <Skeleton style={{ height: 20, width: 64, borderRadius: "var(--radius-full)" }} />
      </div>
      <Skeleton style={{ height: 16, width: "100%", marginTop: 8 }} />
      <Skeleton style={{ height: 16, width: "83%", marginTop: 4 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <Skeleton style={{ height: 16, width: 80 }} />
        <Skeleton style={{ height: 16, width: 64 }} />
        <Skeleton style={{ height: 20, width: 80 }} />
      </div>
    </div>
  );
}
