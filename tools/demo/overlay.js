// Injected into VJ Pad while recording the demo: a visible cursor, click pings, caption banners,
// a "key pressed" badge, full-screen title cards, and a recorder for the tab picture plus VJ Pad's sound.
(() => {
  if (window.__demo) return;
  const st = document.createElement('style');
  st.textContent = `
#demo-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; transform: translate(-200px, -200px); }
#demo-cursor svg { display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
.demo-ping { position: fixed; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; border: 3px solid #d9ff3f; z-index: 2147483646; pointer-events: none; animation: demo-ping .5s ease-out forwards; }
@keyframes demo-ping { from { transform: scale(.3); opacity: 1; } to { transform: scale(1.5); opacity: 0; } }
#demo-cap { position: fixed; left: 50%; bottom: 40px; transform: translate(-50%, 16px); opacity: 0; z-index: 2147483645; pointer-events: none;
  background: rgba(13,14,16,.94); color: #fff; border: 2px solid #d9ff3f; border-radius: 16px; padding: 12px 28px; max-width: 80vw;
  font: 600 24px/1.25 system-ui, "Segoe UI", sans-serif; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,.6); transition: opacity .3s, transform .3s; }
#demo-cap small { display: block; font-weight: 400; font-size: 18px; color: #c4c9d2; margin-top: 4px; }
#demo-cap.show { opacity: 1; transform: translate(-50%, 0); }
#demo-cap.top { bottom: auto; top: 22px; }
#demo-key { position: fixed; z-index: 2147483645; pointer-events: none; transform: translate(-50%, 0) scale(.85); opacity: 0;
  background: #000; color: #fff; border: 2px solid #44d6ff; border-radius: 12px; padding: 8px 18px; font: 800 30px/1 system-ui, "Segoe UI", sans-serif; white-space: nowrap; }
#demo-key.show { opacity: 1; transform: translate(-50%, 0) scale(1); transition: none; }
#demo-key.fade { opacity: 0; transition: opacity .35s, transform .35s; }
#demo-key small { font-size: 18px; font-weight: 600; color: #c4c9d2; }
#demo-full { position: fixed; inset: 0; z-index: 2147483644; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none;
  background: #0d0e10; color: #fff; font-family: system-ui, "Segoe UI", sans-serif; text-align: center; opacity: 0; transition: opacity .45s; }
#demo-full.show { opacity: 1; }
#demo-full h1 { font-size: 64px; margin: 0 0 16px; font-weight: 700; }
#demo-full p { font-size: 24px; color: #d4d8de; margin: 6px 0; }
#demo-full .url { margin-top: 24px; font-size: 24px; color: #44d6ff; font-weight: 600; }
html.demo-fs #stage { position: fixed; inset: 0; z-index: 50; border: 0; border-radius: 0; width: 100vw; height: 100vh; aspect-ratio: auto; display: flex; align-items: center; justify-content: center; }
html.demo-fs #stage canvas { width: auto; height: auto; max-width: 100vw; max-height: 100vh; aspect-ratio: 16/9; flex: 1; }
`;
  document.head.appendChild(st);
  const cursor = document.createElement('div');
  cursor.id = 'demo-cursor';
  cursor.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26.2 L12.2 17 L20 17 Z" fill="#fff" stroke="#000" stroke-width="2" stroke-linejoin="round"/></svg>';
  const cap = document.createElement('div'); cap.id = 'demo-cap';
  const keyb = document.createElement('div'); keyb.id = 'demo-key';
  const full = document.createElement('div'); full.id = 'demo-full';
  document.documentElement.append(full, cap, keyb, cursor);

  let pos = { x: -200, y: -200 }, keyTimer = 0;
  const place = (x, y) => { pos = { x, y }; cursor.style.transform = `translate(${x - 2}px, ${y - 2}px)`; };
  addEventListener('pointermove', e => place(e.clientX, e.clientY), true);
  addEventListener('mousemove', e => place(e.clientX, e.clientY), true);
  const ping = (x = pos.x, y = pos.y) => {
    const p = document.createElement('div'); p.className = 'demo-ping';
    p.style.left = x + 'px'; p.style.top = y + 'px';
    document.documentElement.appendChild(p); setTimeout(() => p.remove(), 600);
  };
  addEventListener('pointerdown', e => ping(e.clientX, e.clientY), true);
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  let rec = null, chunks = [];

  window.__demo = {
    place, ping,
    caption(html, where) { cap.innerHTML = html; cap.classList.toggle('top', where === 'top'); cap.classList.add('show'); },
    hide() { cap.classList.remove('show'); },
    full(html) { full.innerHTML = html; full.classList.add('show'); },
    unfull() { full.classList.remove('show'); },
    // a badge that shows which key or MIDI note was just pressed, above the middle of the pads area
    key(html, x, y) {
      keyb.innerHTML = html; keyb.style.left = x + 'px'; keyb.style.top = y + 'px';
      keyb.classList.remove('fade'); keyb.classList.add('show');
      clearTimeout(keyTimer); keyTimer = setTimeout(() => { keyb.classList.add('fade'); keyb.classList.remove('show'); }, 380);
    },
    fullscreen(on) { document.documentElement.classList.toggle('demo-fs', on); },
    center(sel, text) {
      const el = [...document.querySelectorAll(sel)].find(e => visible(e) && (!text || e.textContent.includes(text)));
      if (!el) throw new Error('not found: ' + sel + ' ' + (text || ''));
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height, top: r.top, left: r.left };
    },
    reveal(sel, block = 'center') { document.querySelector(sel).scrollIntoView({ block }); },
    async startRec(bitrate) {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, width: innerWidth, height: innerHeight }, preferCurrentTab: true, audio: false });
      const dest = audioCtx.createMediaStreamDestination();   // VJ Pad's own mix, after its limiter
      audioOut.connect(dest);
      stream.addTrack(dest.stream.getAudioTracks()[0]);
      const type = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 });
      chunks = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.start(1000);
      return type;
    },
    async stopRec(url) {
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      rec.stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      await fetch(url, { method: 'PUT', body: blob });
      return blob.size;
    },
  };
})();
