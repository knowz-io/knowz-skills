import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */
const C = {
  bg: "#F4F7FB",
  white: "#FFFFFF",
  ink: "#0F172A",
  sub: "#475569",
  muted: "#94A3B8",
  line: "#E6ECF5",
  blue: "#2563EB",
  blueDk: "#1D4ED8",
  blueSoft: "#EFF4FF",
  green: "#16A34A",
  greenSoft: "#E9F8EF",
};
const FONT =
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const SHADOW = "0 24px 60px rgba(15, 23, 42, 0.12)";
const SHADOW_SM = "0 8px 22px rgba(15, 23, 42, 0.10)";

/* ------------------------------------------------------------------ */
/* Timeline (30fps, 720 frames = 24s)                                  */
/* ------------------------------------------------------------------ */
export const TEASER = {
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: 720,
};

const CAPTIONS: { from: number; dur: number; text: string }[] = [
  { from: 12, dur: 80, text: "Every new chat, your AI starts from zero." },
  {
    from: 93,
    dur: 150,
    text: "Your conventions. Your decisions. Your team's hard-won lessons — gone.",
  },
  { from: 243, dur: 57, text: "Knowz gives it a memory." },
  {
    from: 303,
    dur: 224,
    text: "Ask, and get answers grounded in what your team actually knows. Share an insight, and it's kept — forever.",
  },
  { from: 528, dur: 100, text: "Woven into every conversation. Automatically." },
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
const ease = (frame: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(frame, [a, b], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const useEnter = (delay = 0, dur = 18) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, stiffness: 120, mass: 0.7 },
  });
  return { opacity: ease(frame, delay, delay + dur), s };
};

const KnowzMark: React.FC<{ size?: number; dark?: boolean }> = ({
  size = 46,
  dark = true,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.32 }}>
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: `linear-gradient(135deg, ${C.blue}, ${C.blueDk})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontWeight: 800,
        fontSize: size * 0.6,
        boxShadow: "0 6px 16px rgba(37,99,235,0.35)",
      }}
    >
      K
    </div>
    <span
      style={{
        fontWeight: 800,
        fontSize: size * 0.92,
        letterSpacing: -1,
        color: dark ? C.ink : "#fff",
      }}
    >
      Knowz
    </span>
  </div>
);

const Bubble: React.FC<{
  side: "left" | "right";
  children: React.ReactNode;
  tone?: "blue" | "grey" | "white";
  style?: React.CSSProperties;
}> = ({ side, children, tone = "white", style }) => {
  const bg = tone === "blue" ? C.blue : tone === "grey" ? "#EEF2F8" : C.white;
  const color = tone === "blue" ? "#fff" : C.ink;
  return (
    <div
      style={{
        alignSelf: side === "right" ? "flex-end" : "flex-start",
        maxWidth: "80%",
        background: bg,
        color,
        fontSize: 33,
        lineHeight: 1.32,
        padding: "22px 28px",
        borderRadius: 26,
        borderTopRightRadius: side === "right" ? 8 : 26,
        borderTopLeftRadius: side === "left" ? 8 : 26,
        border: tone === "white" ? `1px solid ${C.line}` : "none",
        boxShadow: SHADOW_SM,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

const ChatFrame: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  title?: string;
}> = ({ children, style, title = "AI Assistant" }) => (
  <div
    style={{
      width: 860,
      background: C.white,
      borderRadius: 40,
      border: `1px solid ${C.line}`,
      boxShadow: SHADOW,
      overflow: "hidden",
      ...style,
    }}
  >
    <div
      style={{
        height: 92,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 34px",
        borderBottom: `1px solid ${C.line}`,
        background: "#FBFDFF",
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        {["#FF6058", "#FFBD2E", "#28C840"].map((c) => (
          <div
            key={c}
            style={{ width: 16, height: 16, borderRadius: 8, background: c }}
          />
        ))}
      </div>
      <span style={{ marginLeft: 8, color: C.sub, fontSize: 28, fontWeight: 600 }}>
        {title}
      </span>
    </div>
    <div style={{ padding: 34, display: "flex", flexDirection: "column", gap: 22 }}>
      {children}
    </div>
  </div>
);

const SceneWrap: React.FC<{ children: React.ReactNode; top?: number }> = ({
  children,
  top = 360,
}) => (
  <AbsoluteFill>
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Scene 1 — Hook: AI forgets                                          */
/* ------------------------------------------------------------------ */
const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { s, opacity } = useEnter(0);
  const ghost = ease(frame, 34, 56, 1, 0.16); // messages fade to grey
  const emptyIn = ease(frame, 52, 72);
  return (
    <SceneWrap>
      <div style={{ transform: `scale(${0.94 + s * 0.06})`, opacity }}>
        <ChatFrame style={{ minHeight: 560 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
              filter: `grayscale(${1 - ghost})`,
              opacity: ghost,
              transform: `translateY(${(1 - ghost) * -14}px)`,
            }}
          >
            <Bubble side="right" tone="blue">
              Remember our API error-handling rules?
            </Bubble>
            <Bubble side="left" tone="grey">
              Of course — wrap external calls, log with context…
            </Bubble>
          </div>

          <div
            style={{
              opacity: emptyIn,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
              padding: "26px 0 8px",
            }}
          >
            <div style={{ fontSize: 64 }}>🧠💨</div>
            <div style={{ color: C.muted, fontSize: 30, fontWeight: 600 }}>
              New chat · no memory of past conversations
            </div>
            <div
              style={{
                marginTop: 8,
                width: "100%",
                height: 70,
                borderRadius: 18,
                border: `1px solid ${C.line}`,
                background: "#FBFDFF",
                display: "flex",
                alignItems: "center",
                padding: "0 24px",
                color: C.muted,
                fontSize: 28,
              }}
            >
              Ask anything
              <span
                style={{
                  marginLeft: 6,
                  opacity: frame % 30 < 15 ? 1 : 0,
                }}
              >
                |
              </span>
            </div>
          </div>
        </ChatFrame>
      </div>
    </SceneWrap>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 2 — Problem: knowledge drains away                            */
/* ------------------------------------------------------------------ */
const LossCard: React.FC<{
  icon: string;
  label: string;
  delay: number;
  drop: number;
}> = ({ icon, label, delay, drop }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 200, stiffness: 120 },
  });
  const gone = ease(frame, drop, drop + 26); // 0 -> 1 as it leaves
  return (
    <div
      style={{
        width: 720,
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 26,
        boxShadow: SHADOW_SM,
        padding: "30px 34px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        transform: `translateY(${(1 - s) * 40 + gone * 150}px)`,
        opacity: interpolate(s, [0, 1], [0, 1]) * (1 - gone),
        filter: `grayscale(${gone})`,
      }}
    >
      <div style={{ fontSize: 50 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 36, fontWeight: 700, color: C.ink }}>{label}</div>
        <div style={{ fontSize: 26, color: C.muted, marginTop: 4 }}>
          remembered once · then forgotten
        </div>
      </div>
    </div>
  );
};

const ProblemScene: React.FC = () => (
  <SceneWrap top={470}>
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <LossCard icon="📐" label="Your conventions" delay={6} drop={62} />
      <LossCard icon="✅" label="Your decisions" delay={18} drop={82} />
      <LossCard icon="🤝" label="Your team's hard-won lessons" delay={30} drop={104} />
    </div>
  </SceneWrap>
);

/* ------------------------------------------------------------------ */
/* Scene 3 — Turn: Knowz gives it a memory                             */
/* ------------------------------------------------------------------ */
const VaultRow: React.FC<{ icon: string; label: string; delay: number }> = ({
  icon,
  label,
  delay,
}) => {
  const frame = useCurrentFrame();
  const o = ease(frame, delay, delay + 14);
  const x = (1 - o) * 40;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "20px 24px",
        background: C.blueSoft,
        borderRadius: 18,
        opacity: o,
        transform: `translateX(${x}px)`,
      }}
    >
      <div style={{ fontSize: 34 }}>{icon}</div>
      <div style={{ fontSize: 31, fontWeight: 600, color: C.ink }}>{label}</div>
      <div style={{ marginLeft: "auto", color: C.green, fontSize: 30 }}>✓</div>
    </div>
  );
};

const TurnScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({
    frame,
    fps,
    config: { damping: 200, stiffness: 90, mass: 0.9 },
  });
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 430,
          transform: `translateX(-50%) translateY(${(1 - rise) * 700}px)`,
          width: 820,
          background: C.white,
          borderRadius: 40,
          border: `1px solid ${C.line}`,
          boxShadow: SHADOW,
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <KnowzMark size={50} />
          <div
            style={{
              fontSize: 26,
              color: C.blue,
              fontWeight: 700,
              background: C.blueSoft,
              padding: "10px 18px",
              borderRadius: 999,
            }}
          >
            memory · on
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <VaultRow icon="📐" label="Your conventions" delay={22} />
          <VaultRow icon="✅" label="Your decisions" delay={32} />
          <VaultRow icon="🤝" label="Your team's lessons" delay={42} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 4 — Proof: ask + auto-capture                                 */
/* ------------------------------------------------------------------ */
const ProofScene: React.FC = () => {
  const frame = useCurrentFrame();
  const ask = ease(frame, 8, 26);
  const typing = frame > 30 && frame < 60;
  const answer = ease(frame, 60, 82);
  const insight = ease(frame, 112, 134);
  const fly = ease(frame, 126, 152); // card flies to vault
  const saved = ease(frame, 150, 172);
  return (
    <SceneWrap top={330}>
      <ChatFrame style={{ minHeight: 1000, position: "relative" }}>
        {/* vault target top-right */}
        <div
          style={{
            position: "absolute",
            top: -8,
            right: 30,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: C.blueSoft,
            color: C.blueDk,
            padding: "12px 18px",
            borderRadius: 999,
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          🔒 Vault
        </div>

        <Bubble side="right" tone="blue" style={{ opacity: ask, transform: `translateY(${(1 - ask) * 20}px)` }}>
          What's our error-handling convention?
        </Bubble>

        {typing && (
          <Bubble side="left" tone="grey">
            <span style={{ letterSpacing: 4 }}>•••</span>
          </Bubble>
        )}

        <div style={{ opacity: answer, transform: `translateY(${(1 - answer) * 20}px)` }}>
          <Bubble side="left">
            Wrap external calls, log with context, never swallow errors.
            <div
              style={{
                marginTop: 16,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                background: C.blueSoft,
                color: C.blueDk,
                fontSize: 24,
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: 999,
              }}
            >
              🔖 Grounded in your Knowz vault
            </div>
          </Bubble>
        </div>

        {/* new insight that gets captured — flies into the vault and fades */}
        <div
          style={{
            opacity: insight * (1 - ease(frame, 138, 156)),
            transform: `translate(${fly * 320}px, ${-fly * 390}px) scale(${1 - fly * 0.6})`,
          }}
        >
          <Bubble side="right" tone="white" style={{ border: `2px dashed ${C.blue}` }}>
            💡 We chose Redis over Memcached for pub/sub.
          </Bubble>
        </div>

        {/* saved toast */}
        <div
          style={{
            alignSelf: "center",
            marginTop: 8,
            opacity: saved,
            transform: `translateY(${(1 - saved) * 16}px)`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: C.greenSoft,
            color: C.green,
            padding: "16px 26px",
            borderRadius: 999,
            fontSize: 30,
            fontWeight: 700,
            boxShadow: SHADOW_SM,
          }}
        >
          ✓ Saved to Knowz — available to your whole team
        </div>
      </ChatFrame>
    </SceneWrap>
  );
};

/* ------------------------------------------------------------------ */
/* Scene 5 — Payoff: woven into every conversation                     */
/* ------------------------------------------------------------------ */
const NODES = [
  { x: 180, y: 120 },
  { x: 520, y: 60 },
  { x: 860, y: 150 },
  { x: 300, y: 360 },
  { x: 700, y: 380 },
  { x: 120, y: 560 },
  { x: 540, y: 600 },
  { x: 920, y: 540 },
];
const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [3, 6],
  [4, 6],
  [3, 5],
  [4, 7],
  [6, 5],
  [6, 7],
];

const PayoffScene: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = ease(frame, 4, 50);
  const pulse = 1 + Math.sin(frame / 7) * 0.03;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ position: "relative", width: 1040, height: 700, transform: `scale(${pulse})` }}>
        <svg width={1040} height={700} style={{ position: "absolute", inset: 0 }}>
          {EDGES.map(([a, b], i) => {
            const pa = NODES[a];
            const pb = NODES[b];
            const p = ease(frame, 6 + i * 3, 6 + i * 3 + 22);
            return (
              <line
                key={i}
                x1={pa.x}
                y1={pa.y}
                x2={pa.x + (pb.x - pa.x) * p}
                y2={pa.y + (pb.y - pa.y) * p}
                stroke={C.blue}
                strokeOpacity={0.35}
                strokeWidth={3}
              />
            );
          })}
        </svg>
        {NODES.map((n, i) => {
          const o = ease(frame, i * 3, i * 3 + 16);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: n.x - 14,
                top: n.y - 14,
                width: 28,
                height: 28,
                borderRadius: 14,
                background: `linear-gradient(135deg, ${C.blue}, ${C.blueDk})`,
                boxShadow: "0 6px 16px rgba(37,99,235,0.4)",
                opacity: o,
                transform: `scale(${o})`,
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: draw,
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.9)",
              padding: "18px 32px",
              borderRadius: 999,
              boxShadow: SHADOW,
              fontSize: 36,
              fontWeight: 700,
              color: C.ink,
            }}
          >
            one shared memory
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* End card                                                            */
/* ------------------------------------------------------------------ */
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 200, stiffness: 90 } });
  const tag = ease(frame, 18, 36);
  const url = ease(frame, 30, 48);
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, #FFFFFF 0%, ${C.blueSoft} 100%)`,
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
      }}
    >
      <div style={{ transform: `scale(${0.8 + s * 0.2})`, opacity: ease(frame, 0, 16) }}>
        <KnowzMark size={120} />
      </div>
      <div
        style={{
          opacity: tag,
          transform: `translateY(${(1 - tag) * 16}px)`,
          fontSize: 44,
          fontWeight: 600,
          color: C.sub,
          textAlign: "center",
          maxWidth: 820,
          lineHeight: 1.3,
        }}
      >
        Your knowledge base, inside your AI assistant.
      </div>
      <div
        style={{
          opacity: url,
          transform: `translateY(${(1 - url) * 16}px)`,
          marginTop: 8,
          fontSize: 40,
          fontWeight: 800,
          color: "#fff",
          background: `linear-gradient(135deg, ${C.blue}, ${C.blueDk})`,
          padding: "20px 44px",
          borderRadius: 999,
          boxShadow: "0 14px 30px rgba(37,99,235,0.4)",
        }}
      >
        knowz.io
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */
const CaptionsTrack: React.FC = () => {
  const frame = useCurrentFrame();
  const active = CAPTIONS.find((c) => frame >= c.from && frame < c.from + c.dur);
  if (!active) return null;
  const words = active.text.split(" ");
  const prog = (frame - active.from) / (active.dur * 0.8);
  const shown = Math.max(0, Math.min(words.length, Math.ceil(prog * words.length)));
  const appear = ease(frame, active.from, active.from + 8);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 220,
        left: 90,
        right: 90,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.96)",
          border: `1px solid ${C.line}`,
          boxShadow: SHADOW,
          borderRadius: 30,
          padding: "26px 38px",
          maxWidth: 900,
          textAlign: "center",
          fontFamily: FONT,
          fontSize: 46,
          fontWeight: 700,
          lineHeight: 1.32,
          opacity: appear,
        }}
      >
        {words.map((w, i) => {
          const isShown = i < shown;
          const isLatest = i === shown - 1;
          return (
            <span
              key={i}
              style={{
                color: isLatest ? C.blue : isShown ? C.ink : "rgba(15,23,42,0.16)",
                transition: "color 0.1s",
              }}
            >
              {w}
              {i < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main composition                                                    */
/* ------------------------------------------------------------------ */
export const KnowzTeaser: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: FONT }}>
      {/* soft background accents */}
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -160,
            width: 560,
            height: 560,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(37,99,235,0.10), transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -200,
            left: -180,
            width: 620,
            height: 620,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(37,99,235,0.08), transparent 70%)",
          }}
        />
      </AbsoluteFill>

      {/* ---- Audio ---- */}
      <Audio
        src={staticFile("music/music.mp3")}
        volume={(f) =>
          interpolate(f, [0, 16, 250, 690, 720], [0, 0.32, 0.42, 0.42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <Sequence from={12}>
        <Audio src={staticFile("audio/vo1.mp3")} />
      </Sequence>
      <Sequence from={93}>
        <Audio src={staticFile("audio/vo2.mp3")} />
      </Sequence>
      <Sequence from={243}>
        <Audio src={staticFile("audio/vo3.mp3")} />
      </Sequence>
      <Sequence from={303}>
        <Audio src={staticFile("audio/vo4.mp3")} />
      </Sequence>
      <Sequence from={528}>
        <Audio src={staticFile("audio/vo5.mp3")} />
      </Sequence>
      <Sequence from={240}>
        <Audio src={staticFile("sfx/whoosh.mp3")} volume={0.5} />
      </Sequence>
      <Sequence from={430}>
        <Audio src={staticFile("sfx/pop.mp3")} volume={0.7} />
      </Sequence>

      {/* ---- Scenes ---- */}
      <Sequence from={0} durationInFrames={90}>
        <HookScene />
      </Sequence>
      <Sequence from={90} durationInFrames={150}>
        <ProblemScene />
      </Sequence>
      <Sequence from={240} durationInFrames={60}>
        <TurnScene />
      </Sequence>
      <Sequence from={300} durationInFrames={225}>
        <ProofScene />
      </Sequence>
      <Sequence from={525} durationInFrames={105}>
        <PayoffScene />
      </Sequence>
      <Sequence from={630} durationInFrames={90}>
        <EndCard />
      </Sequence>

      {/* ---- Captions (absolute timing) ---- */}
      <CaptionsTrack />
    </AbsoluteFill>
  );
};
