import {parseMedia} from '@remotion/media-parser';
import {nodeReader} from '@remotion/media-parser/node';
import {readdirSync} from 'fs';
import {join} from 'path';

const dir = process.argv[2] || '/Users/alex/Code/remotion-videos/public/audio';
const files = readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();
const out = {};
for (const f of files) {
  try {
    const {durationInSeconds} = await parseMedia({
      src: join(dir, f),
      fields: {durationInSeconds: true},
      reader: nodeReader,
    });
    out[f] = Number(durationInSeconds.toFixed(3));
  } catch (e) {
    out[f] = 'ERR: ' + e.message;
  }
}
console.log(JSON.stringify(out, null, 2));
