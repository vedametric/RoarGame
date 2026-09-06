/*
 * game-copy.js — "COPY ME"
 *
 * Four animals, four notes. One of them sings, then two of them, then three,
 * and each time she has to play the tune back. It is the oldest electronic
 * toy there is, and it still works, because remembering a tune is a different
 * kind of remembering from Pairs: you cannot look for it, you can only hold
 * on to it.
 *
 * Two things make it a five-year-old's game rather than a test.
 *
 * She can always ask to hear it again, free and as often as she likes. A
 * child who has lost the tune has lost the game, and there is nothing to be
 * learned from sitting there having lost it.
 *
 * And a wrong note costs a heart, not the run. The same tune comes round
 * again so she gets another go at the length she is actually on, instead of
 * being sent back to one note for a slip of the finger.
 */
(function (global) {
  'use strict';

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  var SAVED = 'copy.best';
  var LIVES = 3;

  // Four notes of a major chord, so any tune it invents sounds like a tune
  // and never like a mistake.
  var PADS = [
    { emoji: '🐸', hz: 262, dim: '#1f6b3f', lit: '#5df08a' },
    { emoji: '🐤', hz: 330, dim: '#7a5c14', lit: '#ffd94c' },
    { emoji: '🐷', hz: 392, dim: '#7a2a52', lit: '#ff8ac0' },
    { emoji: '🐬', hz: 523, dim: '#1c4a7a', lit: '#6fd0ff' }
  ];

  // Longer tunes go a little quicker, but never quicker than a child can
  // follow — the floor is what makes it stay playable at fifteen notes.
  function stepTime(n) { return Math.max(0.34, 0.66 - n * 0.022); }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var CopyGame = {
    running: false,

    start: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');

      this.best = parseInt(saved(SAVED, '0'), 10) || 0;
      this.paused = false;
      this.running = true;
      this._fit();
      this._newGame();

      this._onResize = function () { self._fit(); self._draw(); };
      addEventListener('resize', this._onResize);
      this._bind();

      this.last = performance.now();
      this.raf = requestAnimationFrame(function (t) { self._loop(t); });
      return this;
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      clearTimeout(this._playT);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      this._unbind();
      try { global.Confetti.stop(); } catch (e) {}
    },

    setPaused: function (on) {
      this.paused = !!on;
      this.last = performance.now();
      // A tune half played while she is answering a question is a tune she
      // never heard, so it starts again from the top when she comes back.
      if (this.paused && this.mode === 'watch') this._replayWhenBack = true;
      if (!this.paused && this._replayWhenBack) {
        this._replayWhenBack = false;
        this._playTune();
      }
    },

    _newGame: function () {
      clearTimeout(this._playT);
      this.tune = [];
      this.round = 0;
      this.lives = LIVES;
      this.at = 0;                 // how far through the tune she has got
      this.lit = -1;               // which pad is glowing
      this.litFor = 0;
      this.flash = 0;
      this.good = 0;
      this.over = false;
      this.newBest = false;
      this.mode = 'watch';
      this._replayWhenBack = false;
      this._render();
      this._nextRound(0.7);
    },

    again: function () {
      if (!this.running) return;
      this._newGame();
      global.RoarAudio.sfx('go');
    },

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 420;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    },

    _refit: function () { this._fit(); this._draw(); },

    /* Where each pad sits: a 2×2 block of the biggest squares that fit, with
       a band left at the top for the "watch" / "your turn" sign. */
    _box: function (i) {
      var top = Math.min(64, this.H * 0.16);
      var pad = Math.min(this.W, this.H - top) * 0.045;
      var w = (this.W - pad * 3) / 2;
      // Pads may stand a little taller than they are wide. Four squares on a
      // phone leave most of the screen empty, and a pad you can barely miss
      // is the whole point of the thing.
      var h = Math.min(w * 1.42, (this.H - top - pad * 3) / 2);
      if (h < w) w = h;
      var x0 = (this.W - (w * 2 + pad)) / 2;
      var y0 = top + (this.H - top - (h * 2 + pad)) / 2;
      return { x: x0 + (i % 2) * (w + pad), y: y0 + ((i / 2) | 0) * (h + pad), w: w, h: h };
    },

    _bind: function () {
      var self = this;
      this._down = function (e) {
        var r = self.canvas.getBoundingClientRect();
        self.tap(e.clientX - r.left, e.clientY - r.top);
        e.preventDefault();
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });

      // The keyboard is only ever for testing, but it costs four lines.
      this._key = function (e) {
        var n = '1234'.indexOf(e.key);
        if (n >= 0) { self.press(n); e.preventDefault(); }
      };
      addEventListener('keydown', this._key);
    },

    _unbind: function () {
      if (this._down) this.canvas.removeEventListener('pointerdown', this._down);
      if (this._key) removeEventListener('keydown', this._key);
    },

    tap: function (x, y) {
      for (var i = 0; i < PADS.length; i++) {
        var b = this._box(i);
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return this.press(i);
      }
      return false;
    },

    /* ── the tune ─────────────────────────────────────────────── */

    _nextRound: function (wait) {
      var self = this;
      this.round++;
      this.tune.push((Math.random() * PADS.length) | 0);
      clearTimeout(this._playT);
      this._playT = setTimeout(function () { self._playTune(); }, (wait || 0.5) * 1000);
      this._render();
    },

    // Plays the whole tune through, then hands over to her.
    _playTune: function () {
      var self = this;
      clearTimeout(this._playT);
      this.mode = 'watch';
      this.at = 0;
      this.lit = -1;
      this._render();

      var step = stepTime(this.tune.length) * 1000;
      var n = 0;
      var beat = function () {
        if (!self.running) return;
        if (self.paused) { self._playT = setTimeout(beat, 120); return; }   // wait it out
        if (n >= self.tune.length) {
          self.lit = -1;
          self.mode = 'copy';
          self._render();
          return;
        }
        self._sing(self.tune[n], step * 0.62);
        n++;
        self._playT = setTimeout(beat, step);
      };
      this._playT = setTimeout(beat, 260);
    },

    // Hear it again — free, and as often as she likes.
    replay: function () {
      if (!this.running || this.over || this.mode === 'watch') return false;
      this._playTune();
      return true;
    },

    _sing: function (i, ms) {
      this.lit = i;
      this.litFor = (ms || 240) / 1000;
      try { global.RoarAudio.note(PADS[i].hz, this.litFor * 0.95); } catch (e) {}
    },

    /* ── her turn ─────────────────────────────────────────────── */

    press: function (i) {
      if (!this.running || this.over || this.paused) return false;
      if (this.mode !== 'copy') return false;

      this._sing(i, 240);

      if (i !== this.tune[this.at]) { this._wrong(); return true; }

      this.at++;
      if (this.at >= this.tune.length) this._right();
      this._render();
      return true;
    },

    _right: function () {
      var self = this;
      this.mode = 'good';
      this.good = 1;
      global.RoarAudio.sfx('gold');
      if (this.round > this.best) {
        this.best = this.round;
        this.newBest = true;
        save(SAVED, String(this.best));
      }
      this._render();
      clearTimeout(this._playT);
      this._playT = setTimeout(function () { if (self.running) self._nextRound(0.35); }, 750);
    },

    _wrong: function () {
      var self = this;
      this.lives--;
      this.flash = 1;
      this.mode = 'bad';
      global.RoarAudio.sfx('spellbad');
      this._render();
      clearTimeout(this._playT);
      if (this.lives <= 0) { this._finish(); return; }
      // The same tune again, so a slip does not cost her the length she is on.
      this._playT = setTimeout(function () { if (self.running) self._playTune(); }, 900);
    },

    _finish: function () {
      this.over = true;
      this.mode = 'over';
      clearTimeout(this._playT);
      global.RoarAudio.sfx('bust');
      // The score is the last tune she got right, not the one she missed.
      this.score = Math.max(0, this.round - 1);
      if (this.newBest) {
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#5df08a', '#ffd94c', '#ff8ac0', '#6fd0ff']); } catch (e) {}
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.score, this.best, this.newBest);
    },

    _render: function () {
      var e = this.el;
      var done = Math.max(0, this.round - (this.mode === 'good' ? 0 : 1));
      if (e.score) e.score.textContent = done;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.lives) e.lives.textContent = '💛'.repeat(Math.max(0, this.lives));
      if (e.replay) e.replay.disabled = !(this.mode === 'copy' || this.mode === 'bad');
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overScore) e.overScore.textContent = this.score;
          if (e.overBest) {
            e.overBest.textContent = this.newBest ? '🎉 A NEW BEST!' : 'best ★ ' + this.best;
            e.overBest.classList.toggle('is-new', !!this.newBest);
          }
        }
      }
    },

    /* ── the loop, which only animates the glow ───────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        this.litFor = Math.max(0, this.litFor - dt);
        if (this.litFor <= 0 && this.mode !== 'watch') this.lit = -1;
        if (this.litFor <= 0 && this.mode === 'watch') this.lit = -1;
        this.flash = Math.max(0, this.flash - dt * 2);
        this.good = Math.max(0, this.good - dt * 1.4);
      }
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#120a2c';
      c.fillRect(0, 0, W, H);

      this._sign(c);

      for (var i = 0; i < PADS.length; i++) this._pad(c, i);

      if (this.flash > 0.01) {
        c.fillStyle = 'rgba(255,70,70,' + (0.36 * this.flash) + ')';
        c.fillRect(0, 0, W, H);
      }
    },

    // Whose turn it is, in words she can read and a colour she can't miss.
    _sign: function (c) {
      var watching = this.mode === 'watch';
      var text = this.over ? '' :
                 watching ? '👂 LISTEN…' :
                 this.mode === 'good' ? '⭐ YES!' :
                 this.mode === 'bad' ? 'OOPS — LISTEN AGAIN' : '👆 YOUR TURN';
      if (!text) return;
      var y = Math.min(64, this.H * 0.16) / 2;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 ' + clamp(this.W * 0.055, 14, 22) + 'px system-ui, sans-serif';
      c.fillStyle = this.mode === 'bad' ? '#ff9a9a'
                  : this.mode === 'good' ? '#ffd94c'
                  : watching ? 'rgba(201,189,240,.9)' : '#9df08a';
      c.fillText(text, this.W / 2, y);

      // How much of the tune she has played back, as dots rather than a number
      if (this.mode === 'copy' && this.tune.length) {
        var n = this.tune.length, r = clamp(this.W * 0.011, 3, 6), gap = r * 3.2;
        var x0 = this.W / 2 - (n - 1) * gap / 2;
        for (var i = 0; i < n; i++) {
          c.beginPath();
          c.arc(x0 + i * gap, y + clamp(this.W * 0.05, 16, 22), r, 0, 6.2832);
          c.fillStyle = i < this.at ? '#9df08a' : 'rgba(255,255,255,.22)';
          c.fill();
        }
      }
      c.restore();
    },

    _pad: function (c, i) {
      var p = PADS[i], b = this._box(i);
      var on = this.lit === i;
      var r = Math.min(b.w, b.h) * 0.22;

      c.save();
      // A lit pad swells a little as well as brightening, because a five-year-
      // old watching four squares needs more than a change of colour.
      var grow = on ? 1.05 : 1;
      c.translate(b.x + b.w / 2, b.y + b.h / 2);
      c.scale(grow, grow);
      c.translate(-b.w / 2, -b.h / 2);

      if (on) {
        c.shadowColor = p.lit;
        c.shadowBlur = Math.min(b.w, b.h) * 0.34;
      }
      c.fillStyle = on ? p.lit : p.dim;
      c.beginPath();
      if (c.roundRect) c.roundRect(0, 0, b.w, b.h, r);
      else c.rect(0, 0, b.w, b.h);
      c.fill();
      c.shadowBlur = 0;

      c.strokeStyle = on ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.12)';
      c.lineWidth = Math.max(2, Math.min(b.w, b.h) * 0.025);
      c.stroke();

      // Opaque fill, dimmed by globalAlpha rather than by the colour: a
      // colour emoji is painted through the fill's alpha too, and the pad's
      // own colour would have tinted the animal as well as hiding it.
      c.globalAlpha = on ? 1 : 0.82;
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = (Math.min(b.w, b.h) * 0.52) + 'px ' + EMOJI;
      c.fillText(p.emoji, b.w / 2, b.h / 2);
      c.restore();
    }
  };

  CopyGame.PADS = PADS;           // exposed for testing
  CopyGame.LIVES = LIVES;
  global.CopyGame = CopyGame;
})(window);
