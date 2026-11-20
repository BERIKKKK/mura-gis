/* Windows орнатқышын құрастыру (electron-builder орауышы): орнатқыш қазақша және орысша.
   NSIS-тің ресми таратылымында (демек, electron-builder-дің NSIS жинағында да) қазақ тілі жоқ, сондықтан:
     1) electron-builder-дің өз NSIS жинағы (кэштен; жоқ болса — жүктеледі) node_modules/.cache/mura-nsis қалтасына көшіріледі;
     2) оған build/nsis-lang/Kazakh.nlf және Kazakh.nsh (біздің аударма) қосылады;
     3) electron-builder ELECTRON_BUILDER_NSIS_DIR арқылы осы көшірмені пайдаланады.
   Қолданылуы: node scripts/build-win.js --win --publish never   (аргументтер electron-builder-ге беріледі) */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const LANG_DIR = path.join(ROOT, 'build', 'nsis-lang');
const OUT = path.join(ROOT, 'node_modules', '.cache', 'mura-nsis');

async function main() {
  const { getMakeNsisPath } = require('app-builder-lib/out/toolsets/windows');
  const nsis = await getMakeNsisPath(undefined, undefined);        // ескі (legacy) жинақ — package.json-дағы әдепкі
  const src = nsis.env && nsis.env.NSISDIR;
  if (!src || !fs.existsSync(path.join(src, 'Contrib', 'Language files'))) throw new Error('NSIS жинағы табылмады: ' + src);
  const stamp = path.join(OUT, '.mura-source');
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== src) {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.cpSync(src, OUT, { recursive: true });
    fs.writeFileSync(stamp, src);
  }
  for (const f of fs.readdirSync(LANG_DIR)) fs.copyFileSync(path.join(LANG_DIR, f), path.join(OUT, 'Contrib', 'Language files', f));
  console.log('NSIS + қазақ тілі: ' + OUT);
  const cli = require.resolve('electron-builder/cli.js');
  const r = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, ELECTRON_BUILDER_NSIS_DIR: OUT } });
  process.exit(r.status == null ? 1 : r.status);
}
main().catch(e => { console.error(e); process.exit(1); });
