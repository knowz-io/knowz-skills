import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const HelloWorld: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Spring-driven pop-in on the title.
  const scale = spring({
    frame,
    fps,
    config: { damping: 100, stiffness: 200 },
  });

  // Fade the whole scene in over the first second.
  const opacity = interpolate(frame, [0, fps], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0b1020 0%, #1b2a4a 100%)",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <h1
        style={{
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          fontSize: 120,
          fontWeight: 800,
          color: "white",
          transform: `scale(${scale})`,
          letterSpacing: -2,
        }}
      >
        {title} 👋
      </h1>
    </AbsoluteFill>
  );
};
