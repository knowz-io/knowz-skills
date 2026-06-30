# Knowz Teaser — "Your AI Has Amnesia" (Design / Brief)

**Date:** 2026-06-29
**Type:** Short-form vertical product teaser (also serves as the Remotion Superpowers pipeline smoke test)
**Status:** Approved

## Specs
- Aspect: 9:16 vertical, 1080×1920, 30fps
- Length: ~22s (final duration derived from measured voiceover)
- Visual style: light, clean SaaS — white/off-white, blue primary, rounded shapes, friendly
- Composition id: `KnowzTeaser` (registered alongside the default `HelloWorld`)

## Narrative angle
"Your AI has amnesia" — open on the pain of a stateless AI that forgets everything each new chat, then resolve into Knowz as persistent memory.

## Shot list / script (VO = warm female, ElevenLabs "Sarah")
| Beat | VO line (TTS text) | On screen |
|---|---|---|
| Hook | "Every new chat, your AI starts from zero." | Clean chat UI; prior messages ghost out to grey |
| Problem | "Your conventions. Your decisions. Your team's hard-won lessons — gone." | Three cards (conventions / decisions / team context) drain of color and drop away |
| Turn | "Knows gives it a memory." | Knowz panel slides up (whoosh SFX); cards snap back to color into a tidy vault |
| Proof | "Ask, and get answers grounded in what your team actually knows. Share an insight, and it's kept — forever." | Chat asks an error-handling question → answer cites the vault; a new insight auto-saves (pop SFX) |
| Payoff | "Woven into every conversation. Automatically." | Knowledge nodes weave into the chat thread |
| End card | (no VO) | White; KNOWZ wordmark; "Your knowledge base, inside your AI assistant."; knowz.io |

## Audio
- VO: ElevenLabs Sarah (`EXAVITQu4vr4xnSDxMaL`), eleven_multilingual_v2, per-line clips.
- Music: Suno V5 instrumental — sparse/uncertain → bright optimistic build.
- SFX: soft whoosh (Knowz enters), gentle pop (insight captured).
- Captions: burned-in, timed to measured per-line VO durations.

## Pipeline coverage (smoke test)
ElevenLabs TTS · Suno/KIE music · KIE/ElevenLabs SFX · Remotion render · TwelveLabs review pass.
Excluded: Pexels (kept pure motion-graphics for the clean look), Whisper (not installed locally).

## Toggles chosen
- Pexels background: NO (keep clean).
- TwelveLabs review pass: YES (review the render, feed a possible v2).
