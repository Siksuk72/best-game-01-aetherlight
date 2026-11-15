// AETHERLIGHT — The Last Lantern. The entry program (Node 22, standard library only).
//
// It hands the game in: it copies this repository's game/ (the playable game, plain
// static files a desktop browser loads offline) and screenshots/ (four real renders
// of the game's own code) into the output directory, then writes dossier.json with
// the vendored make.fun library — the summary the judge reads.
//
// The grader runs this program twice and both runs must write the same bytes. That
// holds because every input is a fixed file in this repository: game/ and
// screenshots/ are copied as they are, and buildDossier is a pure function of them.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// To play locally instead, run `node serve.ts` and open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Empty a directory's contents without removing the directory itself. The output
// directory is a mount in the grader, so deleting it is refused; removing what it
// holds instead still starts every run from a clean output, so a stale file can
// never ride along.
function emptyDir(dir: string): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return; // nothing to empty: the directory does not exist yet
  }
  for (const name of names) {
    rmSync(join(dir, name), { recursive: true, force: true });
  }
}

emptyDir(out);
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse (more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files, in all, or a
// path under game/ over 1000 bytes — game/ counts beside /output's own 1000-entry cap,
// its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
