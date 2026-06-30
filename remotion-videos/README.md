# remotion-videos

Local [Remotion](https://remotion.dev) project — write React components, render real video files locally. 100% local, free (no cloud video service).

## Commands

```bash
npm run dev      # open Remotion Studio (live preview) at http://localhost:3000
npm run render   # render the default composition to out/video.mp4
```

Render a specific composition / output path / props:

```bash
npx remotion render HelloWorld out/hello.mp4
npx remotion render HelloWorld out/hello.mp4 --props='{"title":"My Title"}'
```

Render a single still frame (PNG):

```bash
npx remotion still HelloWorld out/frame.png --frame=75
```

## Structure

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point — `registerRoot` |
| `src/Root.tsx` | Registers compositions (id, dimensions, fps, duration, props) |
| `src/HelloWorld.tsx` | Example animated component |
| `remotion.config.ts` | Render config (CLI-only options) |

## Using with Claude Code

The official Remotion Agent Skill is installed in this project (`.claude/`).
Just ask Claude to build or edit a video — e.g. "add a 3-second intro that fades
in our logo, then the title." Claude edits the React components; preview live in
the Studio (`npm run dev`) and render with `npm run render`.
