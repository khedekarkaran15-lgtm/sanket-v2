import React from "react";

const QUANT_PATTERN = /(\+?\d[\d,]*\.?\d*%|\₹[\d,]+(?:Cr|Lakh|K)?|\d[\d,]*\.?\d*\/\d+|\d[\d,]+\s*(?:posts?|products?|brands?|videos?|reviews?|papers?|listings?|views?))/i;

export function boldKeyFigure(insight: string): React.ReactNode {
  const match = insight.match(QUANT_PATTERN);
  if (!match || match.index === undefined) {
    return <>{insight}</>;
  }

  const before = insight.substring(0, match.index);
  const bold = match[0];
  const after = insight.substring(match.index + bold.length);

  return (
    <>
      {before}
      <strong className="font-bold text-foreground">{bold}</strong>
      {after}
    </>
  );
}
