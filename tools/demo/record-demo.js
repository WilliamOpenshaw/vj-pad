// Records the README demo video by playing VJ Pad (computer version) in a hidden Chrome window.
//   node tools/demo/record-demo.js           -> docs/demo.mp4 and docs/demo-poster.jpg
//   node tools/demo/record-demo.js headed    (watch it happen)
// Needs Chrome or Edge, and ffmpeg for the clips and the final encode. Makes its clips with
// make-media.js, serves this folder on port 5175, and simulates a MIDI keyboard for the velocity scene.
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { launch, sleep } = require('./cdp');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'test-output');
const MEDIA = path.join(OUT, 'demo-media');
const PORT = 5175, W = 1280, H = 720, BEAT = 500;   // the demo song is 120 BPM
const VIDEOS = ['Tunnel.mp4', 'Plasma.mp4', 'Life.mp4', 'Rainbow.mp4'];   // keys A S D F, MIDI C3 C#3 D3 D#3
const SOUNDS = ['Kick.wav', 'Clap.wav', 'Hat.wav', 'Beat song.mp3'];      // keys G H J K, MIDI E3 F3 F#3 G3

// Stands in for a MIDI keyboard, so the velocity scene does not need real hardware.
const FAKE_MIDI = `(() => {
  const input = { name: 'Launchkey Mini MK4 25 MIDI', type: 'input', state: 'connected', connection: 'open', onmidimessage: null, open: async () => input };
  const access = { inputs: new Map([['demo', input]]), outputs: new Map(), sysexEnabled: false, onstatechange: null };
  navigator.requestMIDIAccess = async () => access;
  window.__midiIn = input;
  window.__errs = [];
  addEventListener('error', e => __errs.push(e.message));
  addEventListener('unhandledrejection', e => __errs.push(String(e.reason)));
})();`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (req.method === 'PUT' && p.startsWith('/out/')) {
    const f = fs.createWriteStream(path.join(OUT, path.basename(p)));
    req.pipe(f); f.on('finish', () => { res.writeHead(200); res.end(); });
    return;
  }
  const full = p.startsWith('/media/') ? path.join(MEDIA, path.basename(p)) : path.join(ROOT, p);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

(async () => {
  if (!fs.existsSync(path.join(MEDIA, 'Beat song.mp3'))) execFileSync(process.execPath, [path.join(__dirname, 'make-media.js')], { stdio: 'inherit' });
  await new Promise(r => server.listen(PORT, r));
  const b = await launch({ width: W, height: H, port: 9334, headless: process.argv[2] !== 'headed' });
  const { send, evaluate } = b;
  const js = (fn, ...args) => evaluate(`(${fn})(${args.map(a => JSON.stringify(a)).join(',')})`);
  const marks = {};
  try {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_MIDI });
    await send('Page.navigate', { url: `http://localhost:${PORT}/VJ%20Pad.html` });
    await sleep(1800);
    await evaluate(fs.readFileSync(path.join(__dirname, 'overlay.js'), 'utf8'));
    await evaluate(`document.getElementById('btnStart').click()`, true);
    await sleep(600);
    // the files, fetched now so that adding them on camera is instant
    await js(async names => {
      const type = n => n.endsWith('.mp4') ? 'video/mp4' : n.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav';
      window.__files = {};
      for (const n of names) window.__files[n] = new File([await (await fetch('media/' + encodeURIComponent(n))).blob()], n, { type: type(n) });
    }, [...VIDEOS, ...SOUNDS]);

    // ---------- input helpers: real mouse and keyboard events through DevTools ----------
    let cur = { x: W / 2, y: H / 2 };
    const mouse = (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, buttons, button: type === 'mouseMoved' ? (buttons ? 'left' : 'none') : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
    const moveTo = async (p, ms = 420, buttons = 0) => {
      const s0 = { ...cur }, t0 = Date.now();
      for (;;) {
        const t = Math.min(1, (Date.now() - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        cur = { x: Math.round(s0.x + (p.x - s0.x) * e), y: Math.round(s0.y + (p.y - s0.y) * e) };
        await mouse('mouseMoved', cur.x, cur.y, buttons);
        if (t >= 1) break;
        await sleep(12);
      }
    };
    const click = async (p, ms) => { await moveTo(p, ms); await sleep(80); await mouse('mousePressed', p.x, p.y, 1); await sleep(70); await mouse('mouseReleased', p.x, p.y); await sleep(120); };
    const drag = async (from, to, ms = 900) => { await moveTo(from); await sleep(90); await mouse('mousePressed', from.x, from.y, 1); await moveTo(to, ms, 1); await sleep(80); await mouse('mouseReleased', to.x, to.y); await sleep(200); };
    const at = (sel, text) => js((s, t) => __demo.center(s, t), sel, text || '');
    const T0 = Date.now();
    const stamp = () => ((Date.now() - T0) / 1000).toFixed(1);
    const caption = (html, where) => { console.log(stamp() + 's', html.replace(/<.*/, '')); return js((h, w) => __demo.caption(h, w), html, where || ''); };
    const hide = () => js(() => __demo.hide());
    const LETTER = c => c.replace('Key', '');
    let badgeAt = null;
    const badge = html => js((h, p) => __demo.key(h, p.x, p.y), html, badgeAt);
    const keys = async (codes, show = true) => {
      for (const code of codes) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: LETTER(code).toLowerCase(), windowsVirtualKeyCode: LETTER(code).charCodeAt(0) });
      if (show) badge(codes.map(LETTER).join(' + '));
      await sleep(40);
      for (const code of codes) await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: LETTER(code).toLowerCase(), windowsVirtualKeyCode: LETTER(code).charCodeAt(0) });
    };
    const toTop = () => js(() => document.getElementById('left').scrollTo({ top: 0, behavior: 'smooth' }));
    const midi = (note, vel) => evaluate(`__midiIn.onmidimessage({data:new Uint8Array([0x90,${note},${vel}]),timeStamp:performance.now(),currentTarget:__midiIn})`);
    const sliderTo = async (id, from, to) => {
      const r = await js(i => { const e = document.getElementById(i).getBoundingClientRect(); return { l: e.left + 8, w: e.width - 16, y: Math.round(e.top + e.height / 2) }; }, id);
      await drag({ x: Math.round(r.l + r.w * from), y: r.y }, { x: Math.round(r.l + r.w * to), y: r.y });
    };
    // plays videos on the beat in the background while the cursor does other things
    let grooving = false, songStart = 0;
    const groove = async (pattern) => {
      grooving = true;
      let k = Math.ceil((Date.now() - songStart) / BEAT);
      while (grooving) {
        const wait = songStart + k * BEAT - Date.now();
        if (wait > 0) await sleep(wait);
        if (!grooving) break;
        const step = pattern[k % pattern.length];
        if (step) await keys(step, false);
        k++;
      }
    };

    await js(() => __demo.place(700, 420));
    const pads = await js(() => { const r = document.getElementById('center').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.66) }; });
    badgeAt = pads;
    const mime = await evaluate('__demo.startRec(6000000)', true);
    console.log('recording as', mime);

    // 1. Title
    await js(() => __demo.full('<h1>VJ<b>PAD</b></h1><p>Play videos and sounds like an instrument</p><p>with a keyboard, a MIDI controller, or an iPad</p>'));
    await sleep(3000);
    await js(() => __demo.unfull());
    await sleep(400);

    // 2. Videos
    await caption('Add your videos<small>Each video becomes a pad with its own key</small>');
    await click(await at('#btnAdd'), 650);
    await js(n => VJ.addFiles(n.map(x => __files[x])), VIDEOS);
    await sleep(2000);

    // 3. Sounds
    await caption('Add sounds: MP3, WAV and more<small>Short sounds for hits, or a whole song</small>');
    await click(await at('#btnSounds'), 600);
    await js(n => VJ.addFiles(n.map(x => __files[x])), SOUNDS);
    await sleep(1400);
    await js(() => { const s = VJ.state.clips.find(c => c.name === 'Beat song'); s.loop = true; s.fadeOut = 1500; });
    await sleep(900);

    // 4. Play with keys
    await caption('Press a key to play its pad<small>Videos and sounds start the moment you press</small>');
    await moveTo({ x: pads.x + 120, y: pads.y + 60 }, 500);
    const drum = [['KeyA', 'KeyG'], ['KeyJ'], ['KeyS', 'KeyH'], ['KeyJ'], ['KeyD', 'KeyG'], ['KeyJ'], ['KeyF', 'KeyH'], ['KeyJ']];
    for (let bar = 0; bar < 2; bar++) for (const step of drum) { const t = Date.now(); await keys(step); await sleep(Math.max(0, 250 - (Date.now() - t))); }
    await sleep(300);

    // 5. Song
    await caption('A long sound is a song<small>Press its key once to start it, and again to stop it</small>');
    await sleep(700);
    songStart = Date.now();
    await keys(['KeyK']);
    marks.song = stamp();
    const g1 = groove([['KeyA'], null, ['KeyS'], null, ['KeyD'], null, ['KeyF'], null]);
    await sleep(3500);

    // 6. Velocity with MIDI
    grooving = false; await g1;
    await caption('Hit a MIDI key harder for a brighter video and a louder sound<small>The MIDI monitor shows every note</small>');
    await js(() => __demo.reveal('#midiMon', 'end'));
    for (let i = 0; i < 6; i++) {
      const hard = i % 2 === 1, wait = songStart + Math.ceil((Date.now() - songStart) / BEAT) * BEAT - Date.now();
      await sleep(wait);
      await midi(48, hard ? 127 : 22); await midi(52, hard ? 127 : 22);
      await badge(hard ? 'MIDI C3 <small>hard</small>' : 'MIDI C3 <small>soft</small>');
      await sleep(BEAT * 0.6);
      if (i === 1) await toTop();   // then watch the picture get brighter and darker
    }

    // 7. Live effects
    await caption('Live effects change the whole show');
    const g2 = groove([['KeyA'], ['KeyJ'], ['KeyS'], null, ['KeyD'], ['KeyJ'], ['KeyF'], null]);
    await sleep(400);
    await sliderTo('g_kaleido', 0, 0.75);
    await sleep(600);
    await sliderTo('g_rgb', 0, 0.6);
    await sleep(1200);
    await sliderTo('g_kaleido', 0.75, 0);
    await sliderTo('g_rgb', 0.6, 0);

    // 8. Modulation
    await caption('Modulation moves effects for you<small>With waves on the beat, your hits, or the music</small>');
    await js(() => __demo.reveal('#mods', 'center'));
    await sleep(500);
    await click(await at('#mods button', '+ Add modulation'), 600);
    await sleep(900);
    await click(await at('#mods button', '+ Add modulation'), 400);
    marks.mods = stamp();
    await sleep(1500);
    await toTop();
    await moveTo({ x: 640, y: 300 }, 700);
    await sleep(3200);

    // 9. One clip
    grooving = false; await g2;
    await caption('Change each clip: effects, speed, trim and more');
    const g3 = groove([['KeyS'], null, ['KeyS'], null, ['KeyS'], ['KeyJ'], ['KeyS'], null]);
    await click(await at('.pad', 'Plasma'), 600);
    await sleep(300);
    await click(await at('#tabs button', 'Effects'), 500);
    await sleep(400);
    await click(await at('#panel button', 'Surprise me'), 500);
    await sleep(1300);
    await click(await at('#panel button', 'Surprise me'), 200);
    await sleep(1600);
    grooving = false; await g3;

    // 10. Words
    await caption('Put words on the screen');
    await click(await at('#btnWords'), 600);
    await sleep(300);
    for (const ch of "Let's dance!") { await send('Input.insertText', { text: ch }); await sleep(45); }
    await sleep(300);
    await evaluate('document.activeElement.blur()');
    const g4 = groove([['KeyA', 'KeyL'], null, ['KeyS'], null, ['KeyA'], ['KeyJ'], ['KeyF'], null]);
    await moveTo({ x: pads.x, y: pads.y + 80 }, 600);
    await sleep(3000);

    // 11. Full screen
    await caption('Full screen for the projector', 'top');
    await js(() => __demo.fullscreen(true));
    marks.full = stamp();
    await moveTo({ x: W - 40, y: H - 40 }, 300);
    await sleep(2500);
    await hide();
    await js(() => { VJ.state.g.kaleido = 0.3; });
    grooving = false; await g4;
    const g5 = groove([['KeyA', 'KeyL'], ['KeyJ'], ['KeyS'], ['KeyJ'], ['KeyA', 'KeyH'], ['KeyJ'], ['KeyF'], ['KeyJ']]);
    await sleep(3500);
    grooving = false; await g5;

    // 12. Ending
    await js(() => __demo.full('<h1>VJ<b>PAD</b></h1><p>Free · No install · Works offline</p><p>Computer: Chrome or Edge, with MIDI · iPad: tap the pads</p><p class="url">github.com/WilliamOpenshaw/vj-pad</p>'));
    await js(() => releaseClip(VJ.state.clips.find(c => c.name === 'Beat song')));
    await sleep(4200);
    await js(() => __demo.fullscreen(false));

    const size = await evaluate(`__demo.stopRec('/out/demo-raw.mp4')`);
    console.log(`saved test-output/demo-raw.mp4 (${(size / 1048576).toFixed(2)} MB)`, JSON.stringify(marks));
    console.log('page errors:', JSON.stringify(await evaluate('(window.__errs||[])')));
  } catch (e) {
    try { await evaluate(`__demo.stopRec('/out/demo-partial.mp4')`); } catch (e2) { /* not recording */ }
    throw e;
  } finally {
    b.close();
    server.close();
  }

  // web encode, then a poster picture of the whole program with all pads
  const docs = path.join(ROOT, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  ff(['-i', path.join(OUT, 'demo-raw.mp4'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(docs, 'demo.mp4')]);
  ff(['-ss', String(+marks.mods + 2.2), '-i', path.join(docs, 'demo.mp4'), '-frames:v', '1', '-q:v', '3', path.join(docs, 'demo-poster.jpg')]);
  console.log(`docs/demo.mp4: ${(fs.statSync(path.join(docs, 'demo.mp4')).size / 1048576).toFixed(2)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
