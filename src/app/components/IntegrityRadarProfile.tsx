import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { animate } from "motion/react";
import {
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  Cpu,
  CornerDownRight,
  Sparkles,
  ChevronRight,
  X,
} from "lucide-react";

interface RadarMetricInfo {
  key: string;
  name: string;
  angle: number;
}

const METRICS_MAP: RadarMetricInfo[] = [
  { key: "focus", name: "Focus", angle: (0 * Math.PI) / 3 - Math.PI / 2 },
  { key: "integrity", name: "Integrity", angle: (1 * Math.PI) / 3 - Math.PI / 2 },
  { key: "collaboration", name: "Collaboration", angle: (2 * Math.PI) / 3 - Math.PI / 2 },
  { key: "consistency", name: "Consistency", angle: (3 * Math.PI) / 3 - Math.PI / 2 },
  { key: "accuracy", name: "Accuracy", angle: (4 * Math.PI) / 3 - Math.PI / 2 },
  { key: "participation", name: "Participation", angle: (5 * Math.PI) / 3 - Math.PI / 2 },
];

interface IntegrityRadarProfileProps {
  attemptDetails: any;
}

export function IntegrityRadarProfile({ attemptDetails }: IntegrityRadarProfileProps) {
  const metrics = attemptDetails?.radarMetrics || {
    focus: 100,
    integrity: 100,
    collaboration: 100,
    consistency: 100,
    accuracy: 100,
    participation: 100,
  };

  const agentAnalysis = attemptDetails?.agentAnalysis || {};

  // Animation values
  const [animatedValues, setAnimatedValues] = useState<Record<string, number>>({
    focus: 0,
    integrity: 0,
    collaboration: 0,
    consistency: 0,
    accuracy: 0,
    participation: 0,
  });

  // UI Interactive States
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);

  // SVG configurations
  const cx = 200;
  const cy = 200;
  const maxRadius = 120;

  // Trigger outward animation on metrics load
  useEffect(() => {
    const controls = Object.keys(metrics).map((key) => {
      const targetVal = metrics[key] ?? 100;
      return animate(0, targetVal, {
        duration: 0.7,
        ease: "easeOut",
        onUpdate: (latest) => {
          setAnimatedValues((prev) => ({ ...prev, [key]: latest }));
        },
      });
    });

    return () => {
      controls.forEach((c) => c.stop());
    };
  }, [metrics]);

  // Color rules generator
  const getMetricColor = (score: number) => {
    if (score >= 95) return { stroke: "#10b981", fill: "rgba(16,185,129,0.18)", label: "text-emerald-600 bg-emerald-50 border-emerald-200", badge: "bg-emerald-500", name: "Excellent" };
    if (score >= 80) return { stroke: "#3b82f6", fill: "rgba(59,130,246,0.18)", label: "text-blue-600 bg-blue-50 border-blue-200", badge: "bg-blue-500", name: "Good" };
    if (score >= 60) return { stroke: "#f59e0b", fill: "rgba(245,158,11,0.18)", label: "text-amber-600 bg-amber-50 border-amber-200", badge: "bg-amber-500", name: "Warning" };
    if (score >= 40) return { stroke: "#f97316", fill: "rgba(249,115,22,0.18)", label: "text-orange-600 bg-orange-50 border-orange-200", badge: "bg-orange-500", name: "Risk" };
    return { stroke: "#ef4444", fill: "rgba(239,68,68,0.18)", label: "text-rose-600 bg-rose-50 border-rose-200", badge: "bg-rose-500", name: "Critical" };
  };

  // Overall report color rules
  const overallColor = getMetricColor(attemptDetails?.integrityScore || 90);

  // Calculate coordinates for dynamic metrics polygon points
  const pointsList = METRICS_MAP.map((m) => {
    const val = animatedValues[m.key] || 0;
    const r = (val / 100) * maxRadius;
    const x = cx + r * Math.cos(m.angle);
    const y = cy + r * Math.sin(m.angle);
    return { x, y, name: m.name, key: m.key, val };
  });

  const pointsString = pointsList.map((p) => `${p.x},${p.y}`).join(" ");

  // Grid background Concentric hexagons points builder
  const getConcentricPoints = (percent: number) => {
    const r = (percent / 100) * maxRadius;
    return METRICS_MAP.map((m) => {
      const x = cx + r * Math.cos(m.angle);
      const y = cy + r * Math.sin(m.angle);
      return `${x},${y}`;
    }).join(" ");
  };

  // Keyboard navigation action
  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedMetricKey(key);
    }
  };

  // Fetch selected metric details for side panel
  const getSelectedMetricDetails = () => {
    if (!selectedMetricKey) return null;
    const metricInfo = METRICS_MAP.find((m) => m.key === selectedMetricKey);
    const agentData = agentAnalysis[`${selectedMetricKey}Agent`] || {};
    return {
      name: metricInfo?.name || "",
      score: metrics[selectedMetricKey] || 0,
      ...agentData,
    };
  };

  const selectedDetails = getSelectedMetricDetails();

  return (
    <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#ebdcc9]/40 pb-4 mb-4 select-none">
        <div>
          <h3 className="text-base font-bold text-[#1a1917] flex items-center gap-2">
            <TrendingUp className="size-4.5 text-[#c5af8a]" />
            Integrity Radar Profile
          </h3>
          <p className="text-xs text-[#8e8a80] mt-0.5">Interactive data-driven multi-agent AI verification profile</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider">Overall Risk:</span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border uppercase ${overallColor.label}`}>
            {overallColor.name}
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 relative">
        {/* Radar Chart Visual Container */}
        <div className="relative size-[360px] flex items-center justify-center shrink-0">
          <svg className="size-full overflow-visible" viewBox="0 0 400 400">
            {/* 1. Grid level lines (nested concentric hexagons) */}
            {[20, 40, 60, 80, 100].map((level) => (
              <polygon
                key={level}
                points={getConcentricPoints(level)}
                fill="none"
                stroke="#ebdcc9"
                strokeWidth="0.75"
                strokeDasharray="3 3"
                opacity="0.6"
              />
            ))}

            {/* 2. Grid scale value labels */}
            {[20, 40, 60, 80, 100].map((level) => (
              <text
                key={level}
                x={cx + 5}
                y={cy - (level / 100) * maxRadius + 3}
                fill="#8e8a80"
                fontSize="9"
                fontWeight="bold"
                className="select-none pointer-events-none opacity-80"
              >
                {level}
              </text>
            ))}

            {/* 3. Radial axes (spokes) */}
            {METRICS_MAP.map((m, idx) => {
              const targetX = cx + maxRadius * Math.cos(m.angle);
              const targetY = cy + maxRadius * Math.sin(m.angle);
              const isHovered = hoveredIndex === idx;

              return (
                <line
                  key={m.key}
                  x1={cx}
                  y1={cy}
                  x2={targetX}
                  y2={targetY}
                  stroke={isHovered ? "#1a1917" : "#ebdcc9"}
                  strokeWidth={isHovered ? "1.5" : "0.75"}
                  opacity={hoveredIndex === null ? 0.7 : isHovered ? 1 : 0.3}
                  className="transition-all duration-200"
                />
              );
            })}

            {/* 4. Active Polygon Fill Area */}
            <polygon
              points={pointsString}
              fill={overallColor.fill}
              stroke={overallColor.stroke}
              strokeWidth="2.5"
              className="transition-all duration-300 ease-out"
            />

            {/* 5. Highlight polygon border edge if hovered */}
            {hoveredIndex !== null && (() => {
              const curr = pointsList[hoveredIndex];
              const next = pointsList[(hoveredIndex + 1) % 6];
              return (
                <line
                  x1={curr.x}
                  y1={curr.y}
                  x2={next.x}
                  y2={next.y}
                  stroke={overallColor.stroke}
                  strokeWidth="4"
                  opacity="0.85"
                />
              );
            })()}

            {/* 6. Chart points & interactive labels */}
            {pointsList.map((p, idx) => {
              const isHovered = hoveredIndex === idx;
              const metricColor = getMetricColor(p.val);
              
              // Compute label coordinates (with slight offset outward)
              const labelRadius = maxRadius + 22;
              const labelX = cx + labelRadius * Math.cos(METRICS_MAP[idx].angle);
              const labelY = cy + labelRadius * Math.sin(METRICS_MAP[idx].angle);

              return (
                <g key={p.key}>
                  {/* Outer circle interactive trigger (for larger hover area) */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="10"
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => setSelectedMetricKey(p.key)}
                  />

                  {/* Visual Point circle */}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 6 : 4}
                    fill={isHovered ? "#fff" : metricColor.stroke}
                    stroke={metricColor.stroke}
                    strokeWidth={isHovered ? 3.5 : 2}
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => setSelectedMetricKey(p.key)}
                  />

                  {/* Axis Text Label */}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={hoveredIndex === null ? "#1a1917" : isHovered ? "#1a1917" : "#8e8a80"}
                    fontSize={isHovered ? "11.5" : "10"}
                    fontWeight={isHovered ? "bold" : "semibold"}
                    className="cursor-pointer transition-all duration-200 select-none"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => setSelectedMetricKey(p.key)}
                    tabIndex={0}
                    onKeyDown={(e) => handleKeyDown(e, p.key)}
                    aria-label={`Verify metric ${p.name}. Score: ${Math.round(p.val)}%`}
                  >
                    {p.name}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating Point Tooltip */}
          {hoveredIndex !== null && (() => {
            const activePoint = pointsList[hoveredIndex];
            const activeAgent = agentAnalysis[`${activePoint.key}Agent`] || {};
            const scoreColor = getMetricColor(activePoint.val);
            
            return (
              <div
                className="absolute z-10 w-52 bg-white/90 backdrop-blur-md p-3.5 rounded-2xl border border-[#ebdcc9] shadow-lg pointer-events-none select-none text-left"
                style={{
                  left: `${(activePoint.x / 400) * 100 + 4}%`,
                  top: `${(activePoint.y / 400) * 100 - 15}%`,
                }}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-[#1a1917]">{activePoint.name}</span>
                  <span className="text-[11px] font-extrabold text-[#1a1917]">{Math.round(activePoint.val)}%</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`size-1.5 rounded-full ${scoreColor.badge}`} />
                  <span className="text-[9.5px] font-bold text-[#8e8a80] uppercase tracking-wide">
                    {scoreColor.name} Risk
                  </span>
                </div>
                <p className="text-[10px] text-[#6b6760] font-medium leading-relaxed">
                  {activeAgent.reason || "AI agent verifying session metrics compliance."}
                </p>
              </div>
            );
          })()}
        </div>

        {/* Dynamic description info legend */}
        <div className="flex-1 space-y-4 select-none">
          <div className="bg-[#FAF6EE]/50 border border-[#ebdcc9]/40 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-[#1a1917] flex items-center gap-1.5">
              <Cpu className="size-4 text-[#c5af8a]" />
              Multi-Agent Audit Engine
            </h4>
            <p className="text-[11px] text-[#6b6861] leading-relaxed mt-1">
              Select any axis or label to review verified data inputs, contributing detection agents, security evidence hashes, and faculty action recommendations.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-left">
            {pointsList.map((p, idx) => {
              const scoreColor = getMetricColor(p.val);
              const isHovered = hoveredIndex === idx;
              return (
                <button
                  key={p.key}
                  onClick={() => setSelectedMetricKey(p.key)}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`p-2.5 rounded-xl border transition-all text-left flex justify-between items-center cursor-pointer ${
                    isHovered 
                      ? "border-[#1a1917] bg-[#FAF6EE] shadow-sm scale-[1.02]" 
                      : "border-[#ebdcc9]/30 bg-white hover:border-[#1a1917]/30 hover:bg-[#FAF6EE]/35"
                  }`}
                >
                  <span className={`text-[11.5px] font-bold transition-colors ${isHovered ? "text-[#1a1917]" : "text-[#6b6760]"}`}>{p.name}</span>
                  <span className={`text-[10.5px] font-extrabold px-1.5 py-0.5 rounded-md ${scoreColor.label}`}>
                    {Math.round(p.val)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 7. Detailed sliding side panel */}
      <AnimatePresence>
        {selectedDetails && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.25 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMetricKey(null)}
              className="absolute inset-0 bg-black z-20 cursor-pointer"
            />

            {/* Slide-out detail panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 bottom-0 w-80 bg-white border-l border-[#ebdcc9] z-30 p-5 shadow-2xl flex flex-col justify-between"
            >
              <div className="space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[#ebdcc9]/40 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4.5 text-[#c5af8a]" />
                    <span className="text-xs font-bold text-[#1a1917] uppercase tracking-wider">
                      {selectedDetails.name} Analysis
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedMetricKey(null)}
                    className="p-1 rounded-lg text-[#8e8a80] hover:text-[#1a1917] hover:bg-neutral-100 transition-colors"
                  >
                    <X className="size-4.5" />
                  </button>
                </div>

                {/* Main Score KPI */}
                <div className="bg-[#FAF6EE]/50 border border-[#ebdcc9]/40 rounded-2xl p-4 text-center">
                  <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block">
                    Overall {selectedDetails.name} Score
                  </span>
                  <div className="text-3xl font-extrabold text-[#1a1917] mt-1">
                    {selectedDetails.score}%
                  </div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase ${getMetricColor(selectedDetails.score).label}`}>
                      {getMetricColor(selectedDetails.score).name} Risk
                    </span>
                  </div>
                </div>

                {/* Contributing agents */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block">
                    Contributing AI Agents
                  </span>
                  <div className="space-y-1.5">
                    {selectedDetails.contributingAgents?.map((agent: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center text-xs py-1.5 border-b border-[#ebdcc9]/20"
                      >
                        <span className="text-[#6b6760] flex items-center gap-1">
                          <CornerDownRight className="size-3 text-[#c5af8a]" />
                          {agent.name}
                        </span>
                        <span className={`font-mono font-bold ${getMetricColor(agent.score).stroke === "#ef4444" ? "text-rose-600" : "text-zinc-700"}`}>
                          {agent.score}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Evidence log */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block">
                    Telemetry Evidence
                  </span>
                  <ul className="space-y-1.5">
                    {selectedDetails.evidence?.map((item: string, idx: number) => (
                      <li key={idx} className="text-[11px] leading-relaxed text-[#6b6760] font-medium flex items-start gap-1.5">
                        <span className="text-[#c5af8a] mt-1 shrink-0">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Faculty recommendations */}
              <div className="bg-[#FAF6EE]/50 border border-[#ebdcc9]/40 rounded-2xl p-3.5 mt-4">
                <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block mb-1">
                  Faculty Action Recommendation
                </span>
                <p className="text-[11px] leading-normal text-[#1a1917] font-semibold flex items-start gap-1.5">
                  <Sparkles className="size-3.5 text-indigo-500 mt-0.5 shrink-0" />
                  <span>{selectedDetails.recommendation || "No action required. Compliance standards met."}</span>
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
