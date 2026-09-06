/*
 * game-odd.js — "ODD ONE OUT"
 *
 * A grid of the same thing, with one that isn't. Tap it.
 *
 * That is the whole game, and it is the only one here with no character to
 * move and nothing to dodge — just looking, which turns out to be the thing
 * a five-year-old is fastest at and worst at by turns. The clock is the only
 * pressure, and it is a generous one: finding it puts time back on, so a
 * child on a good run is never actually racing anything.
 *
 * It gets harder in two directions at once. The grid grows — four squares,
 * then nine, then sixteen, then twenty-five — and the odd one gets less odd:
 * early on it is a duck among frogs, later a peach among oranges, and the
 * tiles start sitting at slightly different angles so she cannot go by the
 * shape of the gaps.
 */
(function (global) {
  'use strict';

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  var SAVED = 'odd.best';
  var START_TIME = 15;            // seconds on the clock at the start
  var MAX_TIME = 18;
  var FOUND_BONUS = 3;            // ...and what finding one puts back
  var WRONG_COST = 2.5;

  // Things that look nothing like each other: the easy rounds.
  var POOL = ['🐸', '🦆', '🐧', '🦊', '🐙', '🦄', '🐝', '🦋', '🐳', '🦖',
              '🍓', '🍕', '🍩', '🌈', '⚽', '🚀', '🎩', '🌻', '🧦', '🔔',
              '🐢', '🦉', '🐮', '🍔', '🎈', '🪁', '🧁', '🚂'];

  // ...and things that very nearly do: the hard ones.
  var LOOKALIKES = [
    ['🍊', '🍑'], ['⭐', '🌟'], ['🐶', '🐺'], ['🐹', '🐭'], ['🍏', '🍐'],
    ['🌸', '🌺'], ['🐻', '🐨'], ['🍒', '🍅'], ['😀', '😄'], ['🔵', '🟣'],
    ['🟠', '🔴'], ['🌙', '🌛'], ['🐟', '🐠'], ['🥚', '🧄'], ['🦁', '🐯'],
    ['💛', '🧡'], ['🥕', '🌶️'], ['☁️', '🌥️']
  ];

  // Four, then nine, then sixteen, then twenty-five.
  function gridFor(round) {
    return round < 3 ? 2 : round < 6 ? 3 : round < 11 ? 4 : 5;
  }
  // How likely it is that the odd one is a lookalike rather than a stranger.
  function sneaky(round) { return Math.min(0.9, Math.max(0, (round - 2) / 8)); }
  // How far the tiles are allowed to lean, which stops her scanning by shape.
  function lean(round) { return Math.min(0.20, Math.max(0, (round - 4) * 0.035)); }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var OddGame = {
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

      this._onResize = function () { self._fit(); };
      addEventListener('resize', this._onResize);
      this._bind();

      this.last = performance.now();
      this.raf = requestAnimationFrame(function (t) { self._loop(t); });
      return this;
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      this._unbind();
      try { global.Confetti.stop(); } catch (e) {}
    },

    setPaused: function (on) { this.paused = !!on; this.last = performance.now(); },

    _newGame: function () {
      this.round = 0;
      this.found = 0;
      this.time = START_TIME;
      this.shake = 0;
      this.pop = 0;
      this.wrongAt = -1;
      this.over = false;
      this.newBest = false;
      this._deal();
      this._render();
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

    /* ── laying out a round ───────────────────────────────────── */

    _deal: function () {
      this.round++;
      var n = gridFor(this.round);
      var same, odd;

      if (Math.random() < sneaky(this.round)) {
        var pair = pick(LOOKALIKES);
        var flip = Math.random() < 0.5;
        same = pair[flip ? 0 : 1];
        odd = pair[flip ? 1 : 0];
      } else {
        same = pick(POOL);
        do { odd = pick(POOL); } while (odd === same);
      }

      var tilt = lean(this.round);
      this.n = n;
      this.odd = (Math.random() * n * n) | 0;
      this.tiles = [];
      for (var i = 0; i < n * n; i++) {
        this.tiles.push({
          emoji: i === this.odd ? odd : same,
          // A whisker of lean and size on every tile, so the odd one is not
          // given away by being the only thing that isn't perfectly square on.
          rot: (Math.random() * 2 - 1) * tilt,
          scale: 1 + (Math.random() * 2 - 1) * tilt * 0.35
        });
      }
      this.pop = 0;
      this.wrongAt = -1;
      this._render();
    },

    /* Tiles are allowed to be a little taller than they are wide. A phone is
       a tall thin thing and a square grid on one leaves half the screen empty
       — which on a two-by-two round means four small pictures adrift in the
       middle of nowhere. */
    _box: function (i) {
      var n = this.n;
      var pad = Math.min(this.W, this.H) * (n > 3 ? 0.028 : 0.04);
      var w = (this.W - pad * (n + 1)) / n;
      // A small grid is allowed to be taller than a big one, because four
      // tiles at their natural width leave the most room going spare.
      var tall = n === 2 ? 1.6 : n === 3 ? 1.5 : 1.35;
      var h = Math.min(w * tall, (this.H - pad * (n + 1)) / n);
      if (h < w) w = h;                       // never wider than it is tall
      var x0 = (this.W - (w * n + pad * (n - 1))) / 2;
      var y0 = (this.H - (h * n + pad * (n - 1))) / 2;
      return { x: x0 + (i % n) * (w + pad), y: y0 + ((i / n) | 0) * (h + pad), w: w, h: h };
    },

    _bind: function () {
      var self = this;
      this._down = function (e) {
        var r = self.canvas.getBoundingClientRect();
        self.tap(e.clientX - r.left, e.clientY - r.top);
        e.preventDefault();
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
    },

    _unbind: function () {
      if (this._down) this.canvas.removeEventListener('pointerdown', this._down);
    },

    tap: function (x, y) {
      if (!this.running || this.over || this.paused) return false;
      for (var i = 0; i < this.tiles.length; i++) {
        var b = this._box(i);
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return this.press(i);
      }
      return false;
    },

    press: function (i) {
      if (!this.running || this.over || this.paused) return false;
      if (i === this.odd) {
        this.found++;
        this.time = Math.min(MAX_TIME, this.time + FOUND_BONUS);
        this.pop = 1;
        global.RoarAudio.sfx('gold');
        if (this.found > this.best) {
          this.best = this.found;
          this.newBest = true;
          save(SAVED, String(this.best));
        }
        this._deal();
      } else {
        // A wrong tap costs a little time and says so. It never ends the game
        // on its own — only the clock does that.
        this.time = Math.max(0, this.time - WRONG_COST);
        this.shake = 1;
        this.wrongAt = i;
        global.RoarAudio.sfx('spellbad');
        if (this.time <= 0) this._finish();
      }
      this._render();
      return true;
    },

    _finish: function () {
      this.over = true;
      this.time = 0;
      global.RoarAudio.sfx('bust');
      if (this.newBest) {
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#ffd24c', '#9df08a', '#7ec8ff', '#ff8ac0']); } catch (e) {}
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.found, this.best, this.newBest);
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.found;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.note) e.note.textContent = this.n + '×' + this.n;
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overScore) e.overScore.textContent = this.found;
          if (e.overBest) {
            e.overBest.textContent = this.newBest ? '🎉 A NEW BEST!' : 'best ★ ' + this.best;
            e.overBest.classList.toggle('is-new', !!this.newBest);
          }
        }
      }
    },

    /* ── the loop ─────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused && !this.over) {
        this.time = Math.max(0, this.time - dt);
        if (this.time <= 0) this._finish();
      }
      if (!this.paused) {
        this.shake = Math.max(0, this.shake - dt * 3);
        this.pop = Math.max(0, this.pop - dt * 2.5);
      }
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#101b3a';
      c.fillRect(0, 0, W, H);

      c.save();
      if (this.shake > 0.01) {
        c.translate(Math.sin(this.shake * 40) * this.shake * 7, 0);
      }
      for (var i = 0; i < this.tiles.length; i++) this._tile(c, i);
      c.restore();

      this._clock(c);
    },

    _tile: function (c, i) {
      var t = this.tiles[i], b = this._box(i);
      var wrong = this.wrongAt === i && this.shake > 0.01;

      c.save();
      c.translate(b.x + b.w / 2, b.y + b.h / 2);

      c.fillStyle = wrong ? 'rgba(255,90,90,.30)' : 'rgba(255,255,255,.055)';
      c.strokeStyle = wrong ? 'rgba(255,120,120,.85)' : 'rgba(255,255,255,.10)';
      c.lineWidth = Math.max(1.5, b.w * 0.02);
      c.beginPath();
      if (c.roundRect) c.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, Math.min(b.w, b.h) * 0.20);
      else c.rect(-b.w / 2, -b.h / 2, b.w, b.h);
      c.fill();
      c.stroke();

      c.rotate(t.rot);
      c.scale(t.scale, t.scale);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      // Opaque, and not the tile's own see-through fill: a colour emoji is
      // painted through the fill's alpha, so leaving the 5%-white in place
      // drew every animal as a ghost of itself.
      c.fillStyle = '#fff';
      c.font = (Math.min(b.w, b.h) * 0.58) + 'px ' + EMOJI;
      c.fillText(t.emoji, 0, 0);
      c.restore();
    },

    /* The clock is a bar rather than a number, because a number is a thing to
       read and a bar is a thing to see. It goes amber then red as it runs
       down, and a find visibly puts some back. */
    _clock: function (c) {
      var W = this.W, h = Math.max(7, this.H * 0.018);
      var k = clamp(this.time / MAX_TIME, 0, 1);
      var m = W * 0.06, w = W - m * 2, y = this.H - h - m * 0.5;

      c.save();
      c.fillStyle = 'rgba(255,255,255,.10)';
      c.beginPath();
      if (c.roundRect) c.roundRect(m, y, w, h, h / 2); else c.rect(m, y, w, h);
      c.fill();

      c.fillStyle = this.time < 4 ? '#ff6b6b' : this.time < 8 ? '#ffb020' : '#9df08a';
      c.beginPath();
      var fw = Math.max(h, w * k);
      if (c.roundRect) c.roundRect(m, y, fw, h, h / 2); else c.rect(m, y, fw, h);
      c.fill();

      if (this.pop > 0.01) {
        c.globalAlpha = clamp(this.pop, 0, 1);
        c.fillStyle = '#ffd24c';
        c.textAlign = 'center';
        c.textBaseline = 'bottom';
        c.font = '900 ' + clamp(W * 0.05, 14, 22) + 'px system-ui, sans-serif';
        c.fillText('+' + FOUND_BONUS + 's', m + fw, y - 4);
      }
      c.restore();
    }
  };

  OddGame.POOL = POOL;            // exposed for testing
  OddGame.LOOKALIKES = LOOKALIKES;
  OddGame.gridFor = gridFor;
  global.OddGame = OddGame;
})(window);
