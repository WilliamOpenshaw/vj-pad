// Makes the clips used in the demo video: 4 colorful videos (ffmpeg) and 4 sounds
// (drums written as WAV here, plus a 32-second beat saved as MP3 by ffmpeg).
//   node tools/demo/make-media.js   -> test-output/demo-media/
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', '..', 'test-output', 'demo-media');
fs.mkdirSync(OUT, { recursive: true });
const SR = 48000, BPM = 120, BEAT = 60 / BPM;

// ---------- videos ----------
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const enc = ['-t', '6', '-r', '30', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-an'];
const S = '640x360';
ff(['-f', 'lavfi', '-i', `nullsrc=s=${S}:r=30`, '-vf',
  "geq=r='128+127*sin(hypot(X-320,Y-180)/9-T*7)':g='128+127*sin(atan2(Y-180,X-320)*6+T*2)':b='128+127*sin(hypot(X-320,Y-180)/14-T*5+2)'", ...enc, path.join(OUT, 'Tunnel.mp4')]);
ff(['-f', 'lavfi', '-i', `nullsrc=s=${S}:r=30`, '-vf',
  "geq=r='128+127*sin(X/23+T*2.1)*cos(Y/31-T*1.3)':g='128+127*sin((X+Y)/37+T*1.7)':b='128+127*cos(hypot(X-320,Y-180)/19-T*3)'", ...enc, path.join(OUT, 'Plasma.mp4')]);
ff(['-f', 'lavfi', '-i', `life=s=320x180:rate=30:ratio=0.18:death_color=#12002a:life_color=#ff3df2:mold=0`, '-vf', 'scale=640:360:flags=neighbor', ...enc, path.join(OUT, 'Life.mp4')]);
ff(['-f', 'lavfi', '-i', `gradients=s=${S}:r=30:speed=0.03:nb_colors=4:c0=#ff2d6f:c1=#ffd23f:c2=#3df5ff:c3=#7b2dff`, '-vf', 'hue=h=t*40', ...enc, path.join(OUT, 'Rainbow.mp4')]);

// ---------- sounds ----------
function wav(name, data) {
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  fs.writeFileSync(path.join(OUT, name), b);
}
let seed = 7;
const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
function kick(len = 0.45) {
  const n = Math.round(SR * len), d = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += 2 * Math.PI * (48 + 110 * Math.exp(-t * 28)) / SR; d[i] = Math.sin(ph) * Math.exp(-t * 7) * 0.95 + (t < 0.004 ? noise() * 0.3 : 0); }
  return d;
}
function clap(len = 0.35) {
  const n = Math.round(SR * len), d = new Float32Array(n); let lp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, bursts = [0, 0.011, 0.022].reduce((a, s) => a + (t >= s ? Math.exp(-(t - s) * (s < 0.02 ? 140 : 13)) : 0), 0);
    const x = noise(); lp += (x - lp) * 0.35; const hp = lp - prev; prev = lp;   // band-passed noise
    d[i] = hp * bursts * 2.2;
  }
  return d;
}
function hat(len = 0.12) {
  const n = Math.round(SR * len), d = new Float32Array(n); let prev = 0;
  for (let i = 0; i < n; i++) { const x = noise(); d[i] = (x - prev) * Math.exp(-i / SR * 45) * 0.45; prev = x; }
  return d;
}
wav('Kick.wav', kick()); wav('Clap.wav', clap()); wav('Hat.wav', hat());

// a 16-bar beat with bass and chords, for "a song under the show"
const bars = 16, total = Math.round(SR * BEAT * 4 * bars), song = new Float32Array(total);
const add = (smp, at, g = 1) => { const o = Math.round(at * SR); for (let i = 0; i < smp.length && o + i < total; i++) song[o + i] += smp[i] * g; };
const K = kick(), C = clap(), H = hat();
const roots = [45, 45, 41, 43];   // A, A, F, G (MIDI notes)
const hz = n => 440 * Math.pow(2, (n - 69) / 12);
for (let bar = 0; bar < bars; bar++) {
  const t0 = bar * BEAT * 4, root = roots[bar % 4];
  for (let b = 0; b < 4; b++) { add(K, t0 + b * BEAT, 0.8); if (b % 2) add(C, t0 + b * BEAT, 0.55); }
  for (let e = 0; e < 8; e++) add(H, t0 + e * BEAT / 2 + BEAT / 4, e % 2 ? 0.5 : 0.3);
  for (let e = 0; e < 8; e++) {   // bass: eighth notes
    const st = t0 + e * BEAT / 2, f = hz(root - 12 + (e === 6 ? 12 : 0)), n = Math.round(SR * BEAT / 2 * 0.9), o = Math.round(st * SR);
    for (let i = 0; i < n && o + i < total; i++) { const t = i / SR, saw = 2 * ((t * f) % 1) - 1; song[o + i] += (Math.sin(2 * Math.PI * f * t) * 0.6 + saw * 0.12) * Math.min(1, t * 200) * Math.exp(-t * 3) * 0.55; }
  }
  const chord = [root + 12, root + 15 + (root === 41 || root === 43 ? 1 : 0), root + 19], n = Math.round(SR * BEAT * 4), o = Math.round(t0 * SR);
  for (let i = 0; i < n && o + i < total; i++) { const t = i / SR; let v = 0; for (const c of chord) v += Math.sin(2 * Math.PI * hz(c + 12) * t) + 0.3 * Math.sin(4 * Math.PI * hz(c + 12) * t); song[o + i] += v * 0.045 * Math.min(1, t * 8) * (1 - t / (BEAT * 4) * 0.5); }
}
const peak = song.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
for (let i = 0; i < total; i++) song[i] *= 0.89 / peak;
wav('beat.wav', song);
ff(['-i', path.join(OUT, 'beat.wav'), '-c:a', 'libmp3lame', '-b:a', '192k', path.join(OUT, 'Beat song.mp3')]);
fs.unlinkSync(path.join(OUT, 'beat.wav'));
console.log('made', fs.readdirSync(OUT).join(', '));
