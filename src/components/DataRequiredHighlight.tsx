import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DataRequiredHighlightProps {
  text: string;
  className?: string;
}

/**
 * Renders text with [DATA REQUIRED] markers highlighted as amber-underlined
 * spans with a tooltip explaining the gap.
 */
const DataRequiredHighlight = ({ text, className = "text-muted-foreground leading-relaxed" }: DataRequiredHighlightProps) => {
  if (!text) return null;

  const parts = text.split(/(\[DATA REQUIRED\])/gi);

  if (parts.length === 1) {
    return <p className={className}>{text}</p>;
  }

  return (
    <TooltipProvider>
      <p className={className}>
        {parts.map((part, i) =>
          part.match(/\[DATA REQUIRED\]/i) ? (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <span className="underline decoration-accent decoration-2 underline-offset-2 cursor-help text-accent font-semibold">
                  [DATA REQUIRED]
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  This claim requires additional data — upload supplementary research to validate.
                </p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
    </TooltipProvider>
  );
};

export default DataRequiredHighlight;
