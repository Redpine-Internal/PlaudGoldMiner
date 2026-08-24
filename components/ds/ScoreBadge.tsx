import React from "react";

export interface ScoreBadgeProps {
  score?: number;
  style?: React.CSSProperties;
  className?: string;
}

/** Green percentage chip for opportunity/relevance scores — repeated across Dashboard, OutputPanel and Oportunidades. */
export function ScoreBadge({ score = 0, style, className = "" }: ScoreBadgeProps) {
  return (
    <span className={("ds-score " + className).trim()} style={style}>
      {Math.round(score)}%
    </span>
  );
}
