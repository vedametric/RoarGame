/*
 * speech.js — one voice for the whole app.
 *
 * The phone's own speech synthesiser sounds mechanical on any device that has
 * only the compact voices installed, which is most of them — and a child who is
 * frightened of the voice stops playing the game. So every fixed phrase was
 * spoken once, ahead of time, by a neural voice and shipped as a small audio
 * file; see tools/build-voice.py. This plays those.
 *
 * Say.line('w-cat')                 one clip
 * Say.line(['p-1', 'w-cat'])        a few in a row, with a natural gap
 * Say.line('t-7-30', 'half past seven')   clip if we have it, spoken if not
 *
 * The browser voice is still there as a fallback for the genuinely unbounded
 * cases — counting past a hundred, an arbitrary calculator answer — and that
 * fallback is now fixed too: it waits for the voice list to arrive before
 * choosing, which it never used to.
 */
(function (global) {
  'use strict';

  var DIR = 'voice/';
  var GAP = 90;          // ms between clips in a run; enough to hear the join

  var Say = {
    ready: false,
    have: null,          // set of keys we have audio for
    els: {},             // key -> Audio, kept once loaded
    queue: [],
    playing: null,

    /* ── setup ──────────────────────────────────────────────────
       The manifest is checked before anything is requested, so a key we never
       recorded quietly becomes browser speech rather than a 404 and silence. */
    init: function (base) {
      var self = this;
      if (self._started) return;
      self._started = true;
      self.base = base || '';
      try {
        fetch(self.base + DIR + 'manifest.json', { cache: 'force-cache' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            if (!j || !j.keys) return;
            self.have = Object.create(null);
            for (var i = 0; i < j.keys.length; i++) self.have[j.keys[i]] = 1;
            self.voiceName = j.voice;
            self.ready = true;
          })
          .catch(function () {});
      } catch (e) {}
      this._primeFallback();
    },

    has: function (key) { return !!(this.have && this.have[key]); },

    /* ── saying something ───────────────────────────────────────
       Takes a key, or a list of keys, and plays them in order. Anything we do
       not have a clip for falls through to the browser, so a new phrase works
       before it has been recorded. */
    line: function (keys, fallbackText, opts) {
      this.stop();
      if (global.RoarAudio && global.RoarAudio.muted) return;
      opts = opts || {};

      var list = (keys == null) ? [] : (typeof keys === 'string' ? [keys] : keys.slice());
      var missing = false;
      for (var i = 0; i < list.length; i++) if (!this.has(list[i])) missing = true;

      // All or nothing per line: half a sentence in one voice and half in
      // another is worse than either on its own.
      if (missing || !list.length) {
        if (fallbackText) this.speak(fallbackText, opts);
        return;
      }
      this.queue = list;
      this._step(opts);
    },

    _step: function (opts) {
      var self = this;
      if (!self.queue.length) { self.playing = null; if (opts.onEnd) opts.onEnd(); return; }
      var key = self.queue.shift();
      var a = self.els[key];
      if (!a) {
        a = self.els[key] = new Audio(self.base + DIR + key + '.m4a');
        a.preload = 'auto';
      }
      self.playing = a;
      a.playbackRate = opts.rate || 1;
      a.currentTime = 0;
      a.onended = function () {
        if (self.playing !== a) return;             // superseded
        if (self.queue.length) setTimeout(function () { self._step(opts); }, GAP);
        else { self.playing = null; if (opts.onEnd) opts.onEnd(); }
      };
      var p = a.play();
      // Autoplay can still be refused before the first tap; fall back rather
      // than leave the game silent.
      if (p && p.catch) p.catch(function () {
        if (opts.fallbackText) self.speak(opts.fallbackText, opts);
      });
    },

    stop: function () {
      var a = this.playing;
      this.queue.length = 0;
      this.playing = null;
      if (a) { try { a.pause(); a.currentTime = 0; } catch (e) {} }
      try { if (global.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
    },

    /* ── the fallback ───────────────────────────────────────────
       Safari fills the voice list asynchronously: the first getVoices() almost
       always returns nothing. The old code cached that empty answer forever and
       so never used the good voices even when they were installed. */
    _primeFallback: function () {
      var self = this;
      var grab = function () {
        try {
          var list = speechSynthesis.getVoices() || [];
          if (list.length) { self._voices = list; self._picked = undefined; }
        } catch (e) {}
      };
      grab();
      try { speechSynthesis.addEventListener('voiceschanged', grab); } catch (e) {}
      // Belt and braces: iOS sometimes never fires the event.
      var tries = 0;
      var poll = setInterval(function () {
        grab();
        if ((self._voices && self._voices.length) || ++tries > 20) clearInterval(poll);
      }, 250);
    },

    // Friendly, not sepulchral: brighter voices first, novelty voices never.
    _voice: function () {
      if (this._picked !== undefined) return this._picked;
      this._picked = null;
      var list = this._voices || [];
      var best = -1;
      for (var i = 0; i < list.length; i++) {
        var v = list[i], s = 0;
        if (!/^en/i.test(v.lang || '')) continue;
        if (/enhanced|premium/i.test(v.name)) s += 6;
        if (/en-GB/i.test(v.lang)) s += 2;
        if (/samantha|karen|serena|kate|martha|moira|fiona|ava|allison|susan|tessa/i.test(v.name)) s += 3;
        if (/zarvox|trinoids|albert|bells|bubbles|jester|organ|superstar|whisper|wobble|bahh|boing|good news|bad news|cellos|deranged|hysterical|ralph|fred/i.test(v.name)) s -= 30;
        if (s > best) { best = s; this._picked = v; }
      }
      return this._picked;
    },

    speak: function (text, opts) {
      opts = opts || {};
      if (global.RoarAudio && global.RoarAudio.muted) return;
      try {
        if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) return;
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(String(text));
        u.rate = opts.rate || 0.95;
        u.pitch = opts.pitch || 1.1;      // friendly, never sepulchral
        u.volume = 1;
        try { var v = this._voice(); if (v) u.voice = v; } catch (e2) {}
        if (opts.onEnd) u.onend = opts.onEnd;
        speechSynthesis.speak(u);
      } catch (e) {}
    },

    /* ── numbers ────────────────────────────────────────────────
       0–100 are recorded. Bigger ones are read out of the parts we have —
       "fifty-four", "thousand", "three", "hundred", "and", "twenty-one" — which
       is how you would say a big number to a child anyway. */
    numberKeys: function (n) {
      if (!isFinite(n) || n < 0 || n !== Math.floor(n)) return null;
      if (n <= 100) return this.has('n-' + n) ? ['n-' + n] : null;

      var out = [];
      var chunk = function (v) {                     // 1..999
        var k = [];
        if (v >= 100) {
          k.push('n-' + Math.floor(v / 100), 'm-hundred');
          v %= 100;
          if (v) k.push('m-and');
        }
        if (v) k.push('n-' + v);
        return k;
      };
      var scales = [[1e6, 'm-million'], [1e3, 'm-thousand']];
      for (var i = 0; i < scales.length; i++) {
        var size = scales[i][0];
        if (n >= size) {
          var many = Math.floor(n / size);
          if (many > 999) return null;               // past a billion, give up
          out = out.concat(chunk(many), [scales[i][1]]);
          n %= size;
        }
      }
      if (n) {
        if (out.length && n < 100) out.push('m-and');
        out = out.concat(chunk(n));
      }
      for (var j = 0; j < out.length; j++) if (!this.has(out[j])) return null;
      return out;
    },

    // A number, however big: clips when we can, the browser voice when we cannot.
    number: function (n, fallbackText, opts) {
      var keys = this.numberKeys(n);
      if (keys) this.line(keys, null, opts);
      else this.speak(fallbackText != null ? fallbackText : String(n), opts);
    }
  };

  global.Say = Say;
})(window);
