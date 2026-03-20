interface SankETLogoProps {
  size?: "sm" | "md" | "lg";
}

const SIZES = {
  sm: { height: 24, text: "text-sm", svgSize: 24 },
  md: { height: 36, text: "text-xl", svgSize: 36 },
  lg: { height: 56, text: "text-4xl", svgSize: 56 },
};

const SankETLogo = ({ size = "md" }: SankETLogoProps) => {
  const s = SIZES[size];
  const center = s.svgSize / 2;
  const dotR = s.svgSize * 0.12;
  const maxR = s.svgSize * 0.45;

  return (
    <div className="flex items-center gap-2">
      <svg
        width={s.svgSize}
        height={s.svgSize}
        viewBox={`0 0 ${s.svgSize} ${s.svgSize}`}
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id={`sonar-grad-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0D9488" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>
        {/* Ripple rings */}
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={dotR}
            fill="none"
            stroke={`url(#sonar-grad-${size})`}
            strokeWidth={1.5}
            opacity={0}
          >
            <animate
              attributeName="r"
              from={dotR}
              to={maxR}
              dur="2.4s"
              begin={`${i * 0.4}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.6;0"
              dur="2.4s"
              begin={`${i * 0.4}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}
        {/* Center dot */}
        <circle cx={center} cy={center} r={dotR} fill="#0D9488" />
      </svg>
      <span className={`font-title tracking-tight ${s.text}`}>
        <span style={{ color: "#F97316" }}>S</span>
        <span style={{ color: "#e8eaf0" }}>ank</span>
        <span style={{ color: "#e8eaf0" }}>E</span>
        <span style={{ color: "#F97316" }}>T</span>
      </span>
    </div>
  );
};

export default SankETLogo;
