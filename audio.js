/*
 * audio.js — microphone, voice fingerprinting and speaker attribution.
 *
 * Both players share one phone and one microphone, so we cannot physically
 * separate their voices. Instead each player records a short calibration
 * sound ("make your sound!") and we build a small fingerprint from it:
 *
 *   pitch     — fundamental frequency, via normalised autocorrelation
 *   centroid  — spectral centre of mass ("brightness")
 *   rolloff   — frequency below which 85% of the energy sits
 *   bands     — a 20-band energy template of the whole sound
 *
 * During play we split every frame between the two players. The band template
 * does the heavy lifting: when both kids shout at once the microphone hears
 * the sum of two spectra, so we solve for how much of each template is
 * present (a two-column non-negative least squares) rather than just handing
 * the frame to whoever is louder. The pitch/brightness distance is folded in
 * as a tie-breaker for the times only one of them is making noise.
 */
(function (global) {
  'use strict';

  var FFT = 2048;
  var MIN_HZ = 60, MAX_HZ = 700;      // plausible range for a kid or grown-up roar
  var LO_HZ = 100, HI_HZ = 8000;      // band used for the spectral features
  var NBANDS = 20;                    // log-spaced bands in the voice template
  var BAND_LO = 120, BAND_HI = 7500;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function median(arr) {
    if (!arr.length) return 0;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  var RoarAudio = {
    ctx: null,
    stream: null,
    analyser: null,
    ready: false,
    micLive: false,
    noiseFloor: 0.04,
    profiles: [null, null],
    voice: [null, null],
    source: null,
    muted: false,

    _time: null,
    _freq: null,
    _deci: null,
    _corr: null,
    _pitchTick: 0,
    _lastPitch: 0,

    /* ── setup ─────────────────────────────────────────────────── */

    // Must be called from inside a user gesture (iOS unlocks audio that way).
    init: function () {
      var self = this;
      if (self.ready && self.micLive) return Promise.resolve();

      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return Promise.reject(new Error('unsupported'));
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return Promise.reject(new Error('unsupported'));
      }

      self.ctx = self.ctx || new AC();
      // The browser's cleanup filters would flatten exactly the loudness and
      // timbre differences the game is measuring, so ask for a raw signal.
      var constraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1
        }
      };

      return navigator.mediaDevices.getUserMedia(constraints)
        .catch(function () { return navigator.mediaDevices.getUserMedia({ audio: true }); })
        .then(function (stream) {
          self.stream = stream;
          if (self.ctx.state === 'suspended') { try { self.ctx.resume(); } catch (e) {} }

          var src = self.source = self.ctx.createMediaStreamSource(stream);
          var an = self.ctx.createAnalyser();
          an.fftSize = FFT;
          an.smoothingTimeConstant = 0.2;
          an.minDecibels = -95;
          an.maxDecibels = -8;
          src.connect(an);

          self.analyser = an;
          self._time = new Float32Array(an.fftSize);
          self._freq = new Uint8Array(an.frequencyBinCount);
          self._deci = new Float32Array(an.fftSize >> 1);
          self._corr = new Float32Array(Math.ceil((self.ctx.sampleRate / 2) / MIN_HZ) + 2);
          self._bands = new Float32Array(NBANDS);
          self._setupBands();
          self.ready = true;
          self.micLive = true;
        });
    },

    // Hand the microphone back to the system.
    //
    // This is not just tidiness. While a getUserMedia capture is live, iOS puts
    // the audio session into play-and-record and routes output to the earpiece
    // at a fraction of the volume — so the recorded voices play back almost
    // inaudibly. TAP mode never needs the mic during play, so we let it go and
    // playback returns to the loudspeaker.
    releaseMic: function () {
      if (this.stream) {
        this.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        this.stream = null;
      }
      if (this.source) {
        try { this.source.disconnect(); } catch (e) {}
        this.source = null;
      }
      this.micLive = false;
    },

    // Re-acquire after a release (switching back to SHOUT, or re-recording).
    ensureMic: function () {
      this.resume();
      return this.micLive ? Promise.resolve() : this.init();
    },

    // Bin ranges for each log-spaced band, plus a lookup table that undoes the
    // analyser's dB mapping so band energies add up the way real signals do.
    _setupBands: function () {
      var sr = this.ctx.sampleRate, binHz = sr / FFT;
      var hi = Math.min(BAND_HI, sr / 2 * 0.9);
      var nBins = this.analyser.frequencyBinCount;

      this._edges = [];
      for (var i = 0; i <= NBANDS; i++) {
        var f = BAND_LO * Math.pow(hi / BAND_LO, i / NBANDS);
        this._edges.push(Math.min(nBins - 1, Math.max(1, Math.round(f / binHz))));
      }

      var minDb = this.analyser.minDecibels, maxDb = this.analyser.maxDecibels;
      this._mag = new Float32Array(256);
      for (var v = 0; v < 256; v++) {
        var db = minDb + (v / 255) * (maxDb - minDb);
        this._mag[v] = Math.pow(10, db / 20);
      }
    },

    // Sample the quiet room so the noise gate adapts to where they're playing.
    measureAmbient: function (ms) {
      var self = this;
      return new Promise(function (resolve) {
        var peak = 0, t0 = performance.now();
        (function tick() {
          var f = self.analyze();
          if (f.level > peak) peak = f.level;
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else { self.noiseFloor = clamp(peak, 0.02, 0.35); resolve(self.noiseFloor); }
        })();
      });
    },

    gate: function () { return Math.max(this.noiseFloor + 0.10, 0.15); },

    // iOS suspends the context whenever the app goes to the background, and a
    // suspended context reads as pure silence. Nudge it before anything that
    // needs to hear.
    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') {
        try { this.ctx.resume(); } catch (e) {}
      }
    },

    /* ── per-frame analysis ────────────────────────────────────── */

    analyze: function () {
      // Always the same shape, so callers never have to null-check a field.
      var out = {
        level: 0, rms: 0, pitch: 0, centroid: 0, rolloff: 0,
        flatness: 0, bands: null, loud: false
      };
      if (!this.ready || !this.micLive) return out;

      var an = this.analyser, time = this._time, sr = this.ctx.sampleRate;
      an.getFloatTimeDomainData(time);

      var i, sum = 0;
      for (i = 0; i < time.length; i++) sum += time[i] * time[i];
      var rms = Math.sqrt(sum / time.length);
      out.rms = rms;

      // -55 dBFS reads as silence, -12 dBFS reads as a full-blooded roar.
      var db = 20 * Math.log10(rms + 1e-8);
      out.level = clamp((db + 55) / 43, 0, 1);
      out.loud = out.level > this.gate();

      if (!out.loud) {
        this._lastPitch = 0;
        // Let the floor drift with the room so a noisy kitchen stops counting
        // as somebody roaring.
        this.noiseFloor = clamp(this.noiseFloor * 0.995 + out.level * 0.005, 0.02, 0.5);
        return out;
      }

      // Pitch is the expensive part; every other frame is plenty at 60fps.
      this._pitchTick = (this._pitchTick + 1) % 2;
      out.pitch = this._pitchTick === 0 ? (this._lastPitch = this._pitch(time, sr)) : this._lastPitch;

      an.getByteFrequencyData(this._freq);
      this._spectral(this._freq, sr, out);
      out.bands = this._bandEnergy(this._freq);
      out.flatness = this._flatness(out.bands);
      return out;
    },

    // Ratio of geometric to arithmetic mean: ~1 for hiss/rumble/broadband room
    // noise, well below that for anything with voice-like structure.
    _flatness: function (b) {
      var logSum = 0, sum = 0, v;
      for (var i = 0; i < NBANDS; i++) {
        v = b[i] + 1e-9;
        logSum += Math.log(v);
        sum += v;
      }
      return Math.exp(logSum / NBANDS) / (sum / NBANDS + 1e-12);
    },

    // Mean linear magnitude per log-spaced band. Reused each frame, so callers
    // must not hold on to the array.
    _bandEnergy: function (freq) {
      var b = this._bands, e = this._edges, mag = this._mag;
      for (var i = 0; i < NBANDS; i++) {
        var lo = e[i], hi = Math.max(lo + 1, e[i + 1]);
        var sum = 0;
        for (var k = lo; k < hi; k++) sum += mag[freq[k]];
        b[i] = sum / (hi - lo);
      }
      return b;
    },

    // Normalised autocorrelation on a 2x decimated signal — cheap enough to
    // run on an iPhone every other frame.
    _pitch: function (buf, sr) {
      var n = this._deci.length, d = this._deci, i;
      for (i = 0; i < n; i++) d[i] = 0.5 * (buf[2 * i] + buf[2 * i + 1]);
      var sr2 = sr / 2;

      var mean = 0;
      for (i = 0; i < n; i++) mean += d[i];
      mean /= n;
      for (i = 0; i < n; i++) d[i] -= mean;

      var minLag = Math.max(2, Math.floor(sr2 / MAX_HZ));
      var maxLag = Math.min(n - 4, Math.ceil(sr2 / MIN_HZ));
      if (maxLag <= minLag + 2) return 0;

      var win = n - maxLag, e0 = 0;
      for (i = 0; i < win; i++) e0 += d[i] * d[i];
      if (e0 < 1e-7) return 0;

      var corr = this._corr, best = -1, bestVal = 0, lag;
      for (lag = minLag; lag <= maxLag; lag++) {
        var c = 0, e1 = 0;
        for (i = 0; i < win; i++) { var a = d[i], b = d[i + lag]; c += a * b; e1 += b * b; }
        var nc = c / Math.sqrt(e0 * e1 + 1e-12);
        corr[lag] = nc;
        if (nc > bestVal) { bestVal = nc; best = lag; }
      }
      if (best < 0 || bestVal < 0.42) return 0;

      // Prefer the shortest lag that is nearly as good, otherwise a strong
      // harmonic can drag the reading down an octave.
      for (lag = minLag; lag < best; lag++) {
        if (corr[lag] >= bestVal * 0.86) { best = lag; bestVal = corr[lag]; break; }
      }

      var y0 = corr[best - 1] || bestVal, y1 = bestVal, y2 = corr[best + 1] || bestVal;
      var den = y0 - 2 * y1 + y2;
      var shift = den !== 0 ? clamp(0.5 * (y0 - y2) / den, -1, 1) : 0;
      return sr2 / (best + shift);
    },

    _spectral: function (freq, sr, out) {
      var binHz = sr / FFT;
      var lo = Math.max(1, Math.floor(LO_HZ / binHz));
      var hi = Math.min(freq.length - 1, Math.ceil(HI_HZ / binHz));
      var i, w, total = 0, weighted = 0;

      for (i = lo; i <= hi; i++) {
        w = freq[i] > 42 ? (freq[i] - 42) / 213 : 0;
        w *= w;
        total += w;
        weighted += w * i * binHz;
      }
      if (total < 1e-6) return;

      out.centroid = weighted / total;

      var acc = 0, target = total * 0.85;
      for (i = lo; i <= hi; i++) {
        w = freq[i] > 42 ? (freq[i] - 42) / 213 : 0;
        acc += w * w;
        if (acc >= target) { out.rolloff = i * binHz; break; }
      }
      if (!out.rolloff) out.rolloff = hi * binHz;
    },

    /* ── fingerprints ──────────────────────────────────────────── */

    /* ── raw voice clips (so nobody has to shout to play) ──────── */

    // Taps a copy of the live mic into a plain PCM buffer. ScriptProcessor is
    // deprecated but it is the one thing that works on every iOS Safari we
    // care about, and it only runs while a player is calibrating.
    _startCapture: function () {
      var sp = this.ctx.createScriptProcessor(4096, 1, 1);
      var mute = this.ctx.createGain();
      var chunks = [];

      mute.gain.value = 0;                       // keeps the node pulled, silently
      sp.onaudioprocess = function (e) {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      this.source.connect(sp);
      sp.connect(mute);
      mute.connect(this.ctx.destination);

      var self = this;
      return {
        chunks: chunks,
        stop: function () {
          sp.onaudioprocess = null;
          try { self.source.disconnect(sp); } catch (e) {}
          try { sp.disconnect(); mute.disconnect(); } catch (e) {}
        }
      };
    },

    // Picks the punchiest ~1.1s out of the calibration take, trims the silence
    // around it and normalises it, so repeated taps sound snappy.
    _makeClip: function (chunks) {
      var total = 0, i;
      for (i = 0; i < chunks.length; i++) total += chunks[i].length;
      if (total < 2048) return null;

      var pcm = new Float32Array(total), off = 0;
      for (i = 0; i < chunks.length; i++) { pcm.set(chunks[i], off); off += chunks[i].length; }

      var sr = this.ctx.sampleRate;
      var hop = Math.max(1, Math.floor(sr * 0.02));
      var nHops = Math.floor(total / hop);
      if (nHops < 3) return null;

      var env = new Float32Array(nHops), h, k, sum;
      for (h = 0; h < nHops; h++) {
        sum = 0;
        for (k = 0; k < hop; k++) { var v = pcm[h * hop + k]; sum += v * v; }
        env[h] = Math.sqrt(sum / hop);
      }

      // Slide a window over the energy envelope and keep the loudest stretch.
      var winHops = Math.min(nHops, Math.max(6, Math.floor(sr * 1.1 / hop)));
      var run = 0;
      for (h = 0; h < winHops; h++) run += env[h];
      var bestVal = run, bestAt = 0;
      for (h = winHops; h < nHops; h++) {
        run += env[h] - env[h - winHops];
        if (run > bestVal) { bestVal = run; bestAt = h - winHops + 1; }
      }

      // Tighten onto the part that is actually above the clip's own noise floor.
      var peakEnv = 0;
      for (h = bestAt; h < bestAt + winHops; h++) if (env[h] > peakEnv) peakEnv = env[h];
      if (peakEnv < 1e-4) return null;
      var thr = peakEnv * 0.18;

      var s = bestAt, e = bestAt + winHops - 1;
      while (s < e && env[s] < thr) s++;
      while (e > s && env[e] < thr) e--;

      var start = s * hop;
      var end = Math.min(total, (e + 1) * hop);
      var len = end - start;
      if (len < sr * 0.12) return null;

      var out = new Float32Array(len);
      var peak = 0;
      for (i = 0; i < len; i++) {
        out[i] = pcm[start + i];
        var a = Math.abs(out[i]);
        if (a > peak) peak = a;
      }
      var g = peak > 1e-5 ? 0.92 / peak : 1;

      var fade = Math.min(Math.floor(sr * 0.008), len >> 1);   // no clicks on repeat
      for (i = 0; i < len; i++) {
        var ramp = 1;
        if (i < fade) ramp = i / fade;
        else if (i > len - fade) ramp = (len - i) / fade;
        out[i] *= g * ramp;
      }

      var buf = this.ctx.createBuffer(1, len, sr);
      buf.copyToChannel ? buf.copyToChannel(out, 0) : buf.getChannelData(0).set(out);
      return buf;
    },

    // If the raw capture came back unusable on some device, synthesise a growl
    // around the player's own pitch. A tap must always make a noise.
    _fallbackClip: function (profile) {
      var sr = this.ctx.sampleRate;
      var len = Math.floor(sr * 0.42);
      var buf = this.ctx.createBuffer(1, len, sr);
      var d = buf.getChannelData(0);
      var f0 = profile.pitch > 0 ? profile.pitch : 170;
      var phase = 0;

      for (var i = 0; i < len; i++) {
        var t = i / len;
        phase += 6.2832 * (f0 * (1 - 0.32 * t)) / sr;
        var saw = 2 * ((phase / 6.2832) % 1) - 1;
        var env = Math.sin(Math.PI * Math.min(1, t * 1.12));
        d[i] = (saw * 0.62 + (Math.random() * 2 - 1) * 0.22) * env * 0.85;
      }
      return buf;
    },

    // One sound per tap. A new tap cuts the previous one short so rapid
    // tapping reads as "ro-ro-ro-roar" instead of a pile of overlapping roars.
    playVoiceOnce: function (i, vol) {
      var p = this.profiles[i];
      if (!p || !p.clip || !this.ctx || this.muted) return;
      this.resume();
      this.stopVoice(i);

      var g = this.ctx.createGain();
      g.gain.value = vol == null ? 1 : vol;
      g.connect(this.ctx.destination);

      var src = this.ctx.createBufferSource();
      src.buffer = p.clip;
      src.connect(g);

      var self = this;
      var h = { src: src, gain: g };
      src.onended = function () {
        try { g.disconnect(); } catch (e) {}
        if (self.voice[i] === h) self.voice[i] = null;
      };
      src.start();
      this.voice[i] = h;
    },

    stopVoice: function (i) {
      var h = this.voice[i];
      if (!h) return;
      this.voice[i] = null;
      try { h.src.onended = null; h.src.stop(); } catch (e) {}
      try { h.gain.disconnect(); } catch (e) {}
    },

    stopAllVoices: function () { this.stopVoice(0); this.stopVoice(1); },

    // Listens for `ms`, keeps the frames that were actually loud, and boils
    // them down to one fingerprint. onTick(progress, level) drives the UI.
    recordProfile: function (ms, onTick) {
      var self = this;
      return new Promise(function (resolve) {
        var pitches = [], centroids = [], rolloffs = [];
        var bandSum = new Float32Array(NBANDS);
        var frames = 0, loudFrames = 0, peak = 0, t0 = performance.now();
        var cap = self._startCapture();

        (function tick() {
          var f = self.analyze();
          var p = clamp((performance.now() - t0) / ms, 0, 1);
          if (f.level > peak) peak = f.level;
          frames++;

          if (f.loud) {
            loudFrames++;
            if (f.pitch > 0) pitches.push(f.pitch);
            if (f.centroid > 0) centroids.push(f.centroid);
            if (f.rolloff > 0) rolloffs.push(f.rolloff);
            for (var k = 0; k < NBANDS; k++) bandSum[k] += f.bands[k];
          }
          if (onTick) onTick(p, f.level);

          if (p < 1) { requestAnimationFrame(tick); return; }

          cap.stop();

          if (loudFrames < Math.max(8, frames * 0.12) || centroids.length < 6) {
            resolve({ ok: false, reason: peak < 0.25 ? 'quiet' : 'short' });
            return;
          }
          // Unit-normalise the template so only its *shape* matters — a player
          // who calibrated quietly is not penalised during the game.
          var norm = 0, k;
          for (k = 0; k < NBANDS; k++) norm += bandSum[k] * bandSum[k];
          norm = Math.sqrt(norm) || 1;
          var tmpl = new Float32Array(NBANDS);
          for (k = 0; k < NBANDS; k++) tmpl[k] = bandSum[k] / norm;

          var profile = {
            pitch: median(pitches),
            centroid: median(centroids),
            rolloff: median(rolloffs),
            bands: tmpl,
            peak: peak,
            voiced: pitches.length / loudFrames
          };
          profile.clip = self._makeClip(cap.chunks);
          profile.recorded = !!profile.clip;
          if (!profile.clip) profile.clip = self._fallbackClip(profile);

          resolve({ ok: true, profile: profile });
        })();
      });
    },

    // 0 = identical timbre, 2 = wildly different.
    distance: function (f, p) {
      if (!p) return 2;
      var d = 0, w = 0;
      if (f.pitch > 0 && p.pitch > 0) {
        d += 2.4 * clamp(Math.abs(Math.log2(f.pitch / p.pitch)) / 0.45, 0, 2); w += 2.4;
      }
      if (f.centroid > 0 && p.centroid > 0) {
        d += 1.0 * clamp(Math.abs(Math.log2(f.centroid / p.centroid)) / 0.38, 0, 2); w += 1.0;
      }
      if (f.rolloff > 0 && p.rolloff > 0) {
        d += 0.6 * clamp(Math.abs(Math.log2(f.rolloff / p.rolloff)) / 0.38, 0, 2); w += 0.6;
      }
      return w ? d / w : 2;
    },

    // How alike the two saved fingerprints are, so we can warn the players.
    profileClash: function () {
      var a = this.profiles[0], b = this.profiles[1];
      if (!a || !b) return 0;

      var byFeature = 1 - clamp(this.distance(a, b) / 0.55, 0, 1);
      var byShape = 0;
      if (a.bands && b.bands) {
        var dot = 0;
        for (var i = 0; i < NBANDS; i++) dot += a.bands[i] * b.bands[i];
        byShape = clamp((dot - 0.80) / 0.18, 0, 1);   // templates are unit length
      }
      return Math.max(byFeature, byShape);
    },

    // How well the current spectrum matches either saved voice, 0..1. Used to
    // throw away sounds that are neither player — a door, a TV, a sibling.
    _matchQuality: function (cur) {
      var best = 0;
      for (var p = 0; p < 2; p++) {
        var t = this.profiles[p] && this.profiles[p].bands;
        if (!t) continue;
        var dot = 0, mag = 0;
        for (var i = 0; i < NBANDS; i++) { dot += t[i] * cur[i]; mag += cur[i] * cur[i]; }
        mag = Math.sqrt(mag) || 1e-9;
        if (dot / mag > best) best = dot / mag;
      }
      return clamp(best, 0, 1);
    },

    // Least-squares split of the current spectrum across the two templates,
    // constrained to non-negative amounts. Templates are unit length, so the
    // 2x2 normal equations reduce to this.
    //
    // RIDGE is what keeps this honest. Without it, two similar templates make
    // the determinant tiny, the solution explodes, and the negative clamp then
    // hands the entire frame to the WRONG player — which is exactly how one
    // person's voice ends up scoring for the other.
    _unmix: function (cur) {
      var t0 = this.profiles[0] && this.profiles[0].bands;
      var t1 = this.profiles[1] && this.profiles[1].bands;
      if (!cur || !t0 || !t1) return null;

      var RIDGE = 0.10;
      var a01 = 0, b0 = 0, b1 = 0;
      for (var i = 0; i < NBANDS; i++) {
        a01 += t0[i] * t1[i];
        b0 += t0[i] * cur[i];
        b1 += t1[i] * cur[i];
      }

      // Near-identical templates carry no separating information at all;
      // pretending otherwise is worse than admitting we cannot tell.
      if (a01 > 0.985) return null;

      var d = 1 + RIDGE;
      var det = d * d - a01 * a01;
      var x0 = (b0 * d - b1 * a01) / det;
      var x1 = (b1 * d - b0 * a01) / det;

      if (x0 < 0) { x0 = 0; x1 = Math.max(0, b1 / d); }
      if (x1 < 0) { x1 = 0; x0 = Math.max(0, b0 / d); }

      var s = x0 + x1;
      return s > 1e-9 ? [x0 / s, x1 / s] : null;
    },

    // Soft attribution. `accepted` is false when the sound does not convincingly
    // belong to either player — callers must award nothing in that case.
    attribute: function (f) {
      var reject = { w: [0, 0], best: -1, conf: 0, accepted: false };
      if (!f.loud || !this.profiles[0] || !this.profiles[1]) return reject;

      // Broadband hiss/rumble is not a roar, however loud it is.
      if (f.flatness > 0.62) return reject;

      var quality = this._matchQuality(f.bands);
      if (quality < 0.74) return reject;

      var d0 = this.distance(f, this.profiles[0]);
      var d1 = this.distance(f, this.profiles[1]);
      if (Math.min(d0, d1) > 1.15) return reject;

      var T = 0.3;
      var e0 = Math.exp(-d0 / T), e1 = Math.exp(-d1 / T);
      var s = e0 + e1;
      var p0, p1;

      if (isFinite(s) && s > 0) {
        // Sharpen so the closer match clearly leads without silencing the other.
        p0 = Math.pow(e0 / s, 1.8);
        p1 = Math.pow(e1 / s, 1.8);
        var t = p0 + p1;
        p0 /= t; p1 /= t;
      } else {
        p0 = p1 = 0.5;
      }

      // The spectral split handles simultaneous shouting; the feature distance
      // keeps things steady when only one of them is making noise.
      var mix = this._unmix(f.bands);
      if (mix) {
        p0 = 0.72 * mix[0] + 0.28 * p0;
        p1 = 0.72 * mix[1] + 0.28 * p1;
        var n = p0 + p1;
        p0 /= n; p1 /= n;
      }
      return { w: [p0, p1], best: p0 >= p1 ? 0 : 1, conf: Math.abs(p0 - p1), accepted: true };
    },

    /* ── little synthesised sound effects (no asset files) ─────── */

    setMuted: function (on) {
      this.muted = !!on;
      if (this.muted) this.stopAllVoices();
    },

    sfx: function (type) {
      if (!this.ctx || this.muted) return;
      var ctx = this.ctx, t = ctx.currentTime;

      var voice = function (wave, f0, f1, dur, vol, delay) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = wave;
        o.frequency.setValueAtTime(f0, t + delay);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + delay + dur);
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(t + delay); o.stop(t + delay + dur + 0.03);
      };

      switch (type) {
        case 'tick':   voice('square',   660,  660, 0.09, 0.12, 0);    break;
        case 'go':     voice('sawtooth', 300, 1200, 0.35, 0.18, 0);    break;
        case 'spawn':  voice('sine',     900, 1500, 0.13, 0.09, 0);    break;
        case 'grab':   voice('square',   520, 1180, 0.14, 0.16, 0);
                       voice('sine',    1180, 1760, 0.18, 0.10, 0.05); break;
        case 'miss':   voice('sawtooth', 420,  120, 0.26, 0.10, 0);    break;
        case 'warn':   voice('square',   240,  180, 0.10, 0.11, 0);
                       voice('square',   240,  180, 0.10, 0.11, 0.16); break;
        case 'step':   voice('square',   880,  880, 0.05, 0.07, 0);    break;
        case 'bust':   voice('sawtooth', 300,   90, 0.30, 0.16, 0);
                       voice('square',   150,   60, 0.24, 0.10, 0.04); break;
        case 'gold':   [784, 988, 1319, 1568].forEach(function (f, i) {
                         voice('triangle', f, f, 0.16, 0.14, i * 0.05);
                       });                                             break;
        case 'bomb':   voice('sawtooth', 180,   40, 0.42, 0.20, 0);
                       voice('square',    90,   30, 0.34, 0.14, 0.02); break;
        case 'burner': voice('sawtooth',  90,  180, 0.34, 0.09, 0);
                       voice('square',  1200,  400, 0.22, 0.04, 0);  break;
        case 'level':  voice('square',   520,  520, 0.10, 0.13, 0);
                       voice('square',   700,  700, 0.10, 0.13, 0.1);
                       voice('square',   900,  900, 0.16, 0.13, 0.2);  break;
        case 'win':    [523, 659, 784, 1046].forEach(function (f, i) {
                         voice('triangle', f, f, 0.3, 0.16, i * 0.11);
                       });                                             break;
      }
    }
  };

  global.RoarAudio = RoarAudio;
})(window);
