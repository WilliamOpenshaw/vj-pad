# VJ Pad

Live VJ program for high school English learners: video, sound and word pads played from keys, MIDI or touch, with live effects and a modulation matrix. Vanilla JS, WebGL2, Web MIDI, Web Audio, no dependencies. `README.md` is for the teacher and students.

## Files and the build

- **Edit only `source/VJ Pad.source.html`, then run `node source/build.mjs`.** It writes two versions:
  - `VJ Pad.html`: the computer version. Students double-click it.
  - `iPad website/index.html`: the iPad version. The whole `iPad website` folder is uploaded to a website.
- Never edit the two outputs by hand; the next build overwrites them. Rebuild and test both after every change.
- **Version-only parts sit between markers:** `/*@computer*/ … /*@end*/` and `/*@ipad*/ … /*@end*/` in JS and CSS, and `<!--@computer--> … <!--@end-->` in HTML. Markers cannot be nested. The build fails if one is left over. Inside an argument list, put the comma inside the marker.
- **Computer only:** MIDI connection and the MIDI monitor, knob learn buttons, MIDI clock, Follow MIDI note, the Output window, and plain `requestFullscreen`.
- **iPad only:** Home Screen meta and link tags, the service worker, the install tip, `unlockVideos`, `navigator.audioSession`, `webkit` full screen, and the kit picker without `accept` (iPad greys out unknown file types). Also lower limits: `MAX_PLAYERS` 32, and 2 voices per clip only up to 12 video clips.
- **Shared:** everything else, including gain-node volume, `putBlob`, the menu styling and the narrow layout. There is no `IOS` detection: each version knows what it is.
- `Version History/` belongs to the user. Do not change it. It is in `.gitignore` and is not on GitHub.

## GitHub

- Repository: `WilliamOpenshaw/vj-pad` (public), default branch `main`. The user asked Claude to manage it.
- `.github/workflows/pages.yml` publishes `iPad website/` to GitHub Pages on every push to `main`: https://williamopenshaw.github.io/vj-pad/. It first runs the build and fails if the committed outputs differ from the source, so always commit the rebuilt files with the source.
- Commit or push only when the user asks. `.gitattributes` keeps text files LF so the build check matches on Windows and Linux.

## Requirements to keep

- **The computer version stays one file that works offline from `file://`.** No external fonts, scripts or server.
- **The iPad version is served over https** (iPads cannot run local HTML files). `sw.js` is network first; bump `CACHE` when its file list changes.
- **Latency comes first.** Nothing slow goes in the hit path (`onKeyDown` / `onMidi` / pad `pointerdown` -> `hit` -> `startVoice` or `startSound`). DOM updates wait for `flushUI` in the render loop.
- **Simple English in the UI.** Short sentences and common words, for language learners. Update the Help overlay when behavior changes, in both versions.
- **Clips start at normal speed, and pitch changes with speed by default** (`pitchShift: true`, like a record). **Keep the same pitch** is the per-clip alternative for videos. Velocity defaults to brightness for videos and volume for sounds.
- **Nothing flashes more than 3 times per second**, for photosensitivity safety. Strobe is capped. Modulation can never target Brightness, Invert or Strobe, and waves are capped at 3 Hz (`MAX_LFO_HZ`).
- **No unnecessary features.** The user asked for this. Keep additions small and useful for performing.

## How it works

- **Voices:** each video clip has a pool of 2 `<video>` elements (1 once a kit has more than `TWO_VOICES_UP_TO` video clips), each paused on its start frame with that frame already in a texture. A hit only calls `play()`, so the first frame draws on the next animation frame. `arm()` re-parks a voice after it stops.
- **Sound clips (`kind:'sound'`):** `loadSound` decodes the file once into `buffers` (keyed by blob, shared by copies). Each hit makes a new `AudioBufferSourceNode` -> gain -> `audioIn`, and a new hit of the same clip fades the last one out in 6 ms. Sound voices live in `sounds`, not `active`, so they never count as video layers. Loop, trim, fades, speed, velocity and pitch bend work; pitch always follows speed. Limits: 120 MB and 10 minutes (`MAX_SOUND_BYTES`, `MAX_SOUND_SEC`). A new sound longer than 20 s becomes **Press on, press off** with velocity off, for songs. The pad picture is a waveform from `waveThumb`.
- **Player limit:** browsers refuse about 75 video players per page, so `MAX_PLAYERS` is 70 on computers. The preview and frame-rate detector each use one more. Sounds use no players.
- **Keep-awake:** an interval makes a small seek on armed voices, so idle decoders do not delay the first motion. It appeared to help, but the cause was never confirmed.
- **Render:** `tick` -> `frame`. Each voice draws through one uber shader into a scene framebuffer, then optional trails, then a global pass to the screen with the modulated live effects. Textures use mirrored repeat and premultiplied alpha.
- **Modulation:** `modulate(now)` runs once a frame. It returns `S.g` untouched when there are no rows, otherwise fills `G` = live effect + amount x source, clamped (Hue and Turn wrap). Sources: two waves on the tempo clock (`lfoValue`, phase from `beatPos`), `Hits` (velocity, decays in about 350 ms), and sound level, bass and high from an `AnalyserNode` on `audioOut`, which is created only when a row uses one. Tempo comes from typing, **Tap**, or MIDI clock (`clockTick`, computer only). Row meters update about 15 times a second from `flushUI`. Measured cost: about 9 µs a frame with 8 rows.
- **Output window (computer):** videos are rebuilt inside the popup's document (`moveVideos`) so the browser keeps decoding them if the main window is covered. Both windows run `tick`, and it skips a draw if one just ran. The popup copies the GL canvas with `drawImage` in the same task.
- **Audio:** video or sound -> per-voice gain -> `audioIn` -> limiter `audioOut` -> destination. Recording and the modulation analyser tap `audioOut`. The video gain is `normGain` x velocity volume x master (`setVoiceVolume`), because iPad Safari ignores `video.volume`.
- **iPad:** no Web MIDI on any iPad browser, and no Output window (its videos would stop in a hidden tab). `unlockVideos` plays each armed video once inside the Start tap so later plays with sound are allowed. Pad taps call `hit` before any panel update, and hold mode releases by `pointerId` so several fingers work.
- **Loudness:** `measureAudio` analyses the file at 48 kHz (a sound clip's playback buffer is reused when the context runs at 48 kHz) and stores K-weighted energy and peak per 100 ms in `clip.audio`, saved with the kit. `updateNorm` recalculates gain for the trimmed range, without decoding again. Target is -16 LUFS, with at most +24 dB and at most 3 dB over peak into the limiter.
- **Speed:** `voiceRate` = effect or velocity speed x note ratio x pitch bend. `video.preservesPitch` is false only when `pitchShift` or `notePitch` is on. Computer keys pass no note, so they never get a note ratio.
- **MIDI (computer):** `startMidi` requests access once (the **Connect MIDI** button reuses it, so listeners are never doubled), and `scanMidi` opens every input explicitly so open errors can be shown. `onMidi` calls `logMidi` first, which only records bytes; the **MIDI monitor** and the **MIDI in** footer readout are drawn later by `flushUI`. Clock (`F8`) feeds `clockTick` when **Follow MIDI clock** is on and redraws the monitor only once a beat; active sensing (`FE`) is ignored.
- **Effects:** `FX` lists clip effects (`SOUND_FX` is the part sound clips use), `VEL_DEFAULTS` lists what velocity can control, `GFX` lists live effects, `MOD_TARGETS` lists what modulation may move. `computeParams` applies velocity once at hit time.
- **Storage:** IndexedDB database `vjpad` (`kv` holds state JSON, `blobs` holds files), with debounced `saveSoon`. Always write files with `putBlob` and read them with `asBlob`: if a browser cannot store a Blob (`DataCloneError`, seen in WebKit), the raw bytes are stored instead. A `.vjkit` file is `VJKIT1`, a uint32 header length, JSON header, then raw file bytes. Kits open in both versions.
- **Old kits:** `applyState` migrates by version `S.v` (now 4: sound clips, `mods`, `lfo`, `bpm`, `clockSync`). If the saved state shape changes, add defaults to `newClip` / `defaultState`, and a migration if the old behavior should change. Older program versions show sound clips as "Cannot play this video".

## Testing

- `window.VJ` exposes a small debug API (`sounds`, `buffers`, `modSrc` included). Top-level `const` and `let` names such as `S`, `active`, `pools` and `modulate` can also be read from an evaluated script. `onMidi({data:[0x90,48,100],timeStamp:performance.now()})` simulates MIDI.
- **Test the computer version on real `file://` in Chrome and Edge,** and the iPad version from a localhost server. The Claude browser pane loads local files as `data:` URLs, where IndexedDB and MIDI do not work. Use headless Chrome or Edge over the DevTools protocol from a Node script, with `--autoplay-policy=no-user-gesture-required` and `--disable-popup-blocking`. Keep test scripts and profiles out of this folder.
- **Making test clips:** ffmpeg is not installed. Make videos in the page with `MediaRecorder` (`video/mp4`) from a canvas. Make sounds as WAV bytes written in the page (a sine at a known frequency), or `MediaRecorder` audio (`audio/mp4`). Pass them to `VJ.addFiles`. No real MP3 file has been tested; Chrome and Safari decode MP3 natively.
- **Check results by measuring:** read frequency and level with an `AnalyserNode` on `audioOut`, modulation values from `modulate(performance.now())` and `VJ.modSrc`, and draw time from `lastLat`. Test the running program after changes; do not rely only on reading the code.
- **Real MIDI hardware:** headless Chrome can open the real devices if the test grants permission over CDP with `Browser.grantPermissions`. In Chrome 157, plain `requestMIDIAccess()` was refused unless `midiSysex` was granted along with `midi`. A Universal Device Inquiry (`F0 7E 7F 06 01 F7`, needs sysex access) makes the keyboard answer, which proves input works without anyone pressing keys.
- **WebKit:** Playwright's WebKit (installed outside this folder) with `devices['iPad Pro 11 landscape']`, served from a local Node static server. That Windows WebKit build cannot play blob-URL videos and has no `AudioContext`, so sound clips cannot be tested there, and tests point `URL.createObjectURL` at served clip files. Neither limit is expected on a real iPad.
- **This computer's controller (confirmed working in the user's Chrome on 2026-11-05):** Launchkey Mini MK4 25 over USB. It shows as two inputs, `Launchkey Mini MK4 25 MIDI` (keys, pads, knobs) and `MIDIIN2 (Launchkey Mini MK4 25` (DAW port), and sends clock all the time, which is why **Follow MIDI clock** is off by default. Pads were seen on channel 10. Windows only lets one program open a MIDI port at a time, so another open browser or music program blocks it.

Single evaluated scripts time out at about 45 seconds in the pane, so split long tests.

## Demo video

- The README plays the demo from a GitHub `user-attachments` link the user uploaded, with `docs/demo.mp4` as the fallback link. `docs/demo-poster.jpg` is a still for other uses. Re-record with `node tools/demo/record-demo.js` (add `headed` to watch). It needs ffmpeg (installed on this computer) and writes work files to `test-output/`.
- `tools/demo/make-media.js` makes the demo clips (videos with ffmpeg, drums as WAV, a beat as MP3). MIDI is faked inside the page as the Launchkey input. `overlay.js` draws the cursor, captions and key badges and records the tab with VJ Pad's own sound.
- Re-record after visible UI changes. The README player then needs a new upload: the user drags the MP4 into a GitHub issue comment box (without submitting) and shares the new `user-attachments` link.

## Not tested yet

A real iPad (only Playwright WebKit on Windows with iPad emulation, which does not copy iPadOS media and autoplay rules or memory limits, and has no Web Audio), sound clips in any Apple browser, real MP3 files, Mac, Firefox and desktop Safari, a real second screen, judging audio and the sound-following modulation by ear with real music, and MIDI clock from real hardware. Say so when reporting results that depend on these.

## Ideas discussed, not built

- A per-clip **Pitch** setting where a student picks a note or chord, so one key or MIDI note plays it with exact pitches. Today a clip plays one pitch at a time, and chords need one copy per note. Sound clips with **Follow the MIDI note** already play a sample chromatically.
- A microphone as a modulation source, for music that does not come from VJ Pad.
