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
    noiseFloor: 0.04,
    profiles: [null, null],
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
      if (self.ready) return Promise.resolve();

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

          var src = self.ctx.createMediaStreamSource(stream);
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
        });
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
      var out = { level: 0, rms: 0, pitch: 0, centroid: 0, rolloff: 0, loud: false };
      if (!this.ready) return out;

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

      if (!out.loud) { this._lastPitch = 0; return out; }

      // Pitch is the expensive part; every other frame is plenty at 60fps.
      this._pitchTick = (this._pitchTick + 1) % 2;
      out.pitch = this._pitchTick === 0 ? (this._lastPitch = this._pitch(time, sr)) : this._lastPitch;

      an.getByteFrequencyData(this._freq);
      this._spectral(this._freq, sr, out);
      out.bands = this._bandEnergy(this._freq);
      return out;
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

    // Listens for `ms`, keeps the frames that were actually loud, and boils
    // them down to one fingerprint. onTick(progress, level) drives the UI.
    recordProfile: function (ms, onTick) {
      var self = this;
      return new Promise(function (resolve) {
        var pitches = [], centroids = [], rolloffs = [];
        var bandSum = new Float32Array(NBANDS);
        var frames = 0, loudFrames = 0, peak = 0, t0 = performance.now();

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

          resolve({
            ok: true,
            profile: {
              pitch: median(pitches),
              centroid: median(centroids),
              rolloff: median(rolloffs),
              bands: tmpl,
              peak: peak,
              voiced: pitches.length / loudFrames
            }
          });
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

    // Least-squares split of the current spectrum across the two templates,
    // constrained to non-negative amounts. Templates are unit length, so the
    // 2x2 normal equations reduce to this.
    _unmix: function (cur) {
      var t0 = this.profiles[0] && this.profiles[0].bands;
      var t1 = this.profiles[1] && this.profiles[1].bands;
      if (!cur || !t0 || !t1) return null;

      var a01 = 0, b0 = 0, b1 = 0;
      for (var i = 0; i < NBANDS; i++) {
        a01 += t0[i] * t1[i];
        b0 += t0[i] * cur[i];
        b1 += t1[i] * cur[i];
      }
      var det = 1 - a01 * a01;
      var x0, x1;
      if (det > 1e-6) { x0 = (b0 - b1 * a01) / det; x1 = (b1 - b0 * a01) / det; }
      else { x0 = b0; x1 = b1; }           // templates nearly identical

      if (x0 < 0) { x0 = 0; x1 = Math.max(0, b1); }
      if (x1 < 0) { x1 = 0; x0 = Math.max(0, b0); }

      var s = x0 + x1;
      return s > 1e-9 ? [x0 / s, x1 / s] : null;
    },

    // Soft attribution: returns a weight per player that sums to 1, plus the
    // index of the best match and how confident that match is.
    attribute: function (f) {
      var d0 = this.distance(f, this.profiles[0]);
      var d1 = this.distance(f, this.profiles[1]);
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
      return { w: [p0, p1], best: p0 >= p1 ? 0 : 1, conf: Math.abs(p0 - p1) };
    },

    /* ── little synthesised sound effects (no asset files) ─────── */

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
