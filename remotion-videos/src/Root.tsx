import { Composition } from "remotion";
import { HelloWorld } from "./HelloWorld";
import { KnowzTeaser, TEASER } from "./knowz/KnowzTeaser";

// Every composition you want to render must be registered here.
// Docs: https://remotion.dev/docs/the-fundamentals
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KnowzTeaser"
        component={KnowzTeaser}
        durationInFrames={TEASER.durationInFrames}
        fps={TEASER.fps}
        width={TEASER.width}
        height={TEASER.height}
      />
      <Composition
        id="HelloWorld"
        component={HelloWorld}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          title: "Hello Remotion",
        }}
      />
    </>
  );
};
