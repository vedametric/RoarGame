/*
 * game-pairs.js — "PAIRS"
 *
 * The card game every child already knows: everything is face down, turn two
 * over, keep them if they match. Six pairs, which is enough to be a real test
 * of memory at five and short enough to finish before anyone loses interest.
 *
 * The only game here with no clock and no way to fail. You cannot lose Pairs,
 * you can only take more turns over it — so the score is how few turns it
 * took, and the best is the lowest, not the highest.
 *
 * Drawn rather than laid out in HTML because the flip has to be a flip: the
 * card squashes to nothing edge-on and opens out the other side, which is the
 * whole pleasure of the thing.
 */
(function (global) {
  'use strict';

  var COLS = 3, ROWS = 4;          // twelve cards, six pairs
  var FLIP = 0.34;                 // seconds a card takes to turn over
  var LOOK = 1.4;                  // how long a wrong pair stays up if she waits
  var SAVED = 'pairs.best';
  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  // Deliberately unalike: nothing that could be mistaken for its neighbour at
  // a glance, which is what makes it a memory game rather than an eye test.
  var FACES = ['🦊', '🐸', '🦄', '🐙', '🐝', '🦖', '🐧', '🦁', '🐳', '🦋',
               '🍓', '🍕', '🚀', '⚽', '🌈', '🎩'];

  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var PairsGame = {
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
      clearTimeout(this._lookT);
      clearTimeout(this._doneT);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      if (this._tap) this.canvas.removeEventListener('pointerdown', this._tap);
      try { global.Confetti.stop(); } catch (e) {}
    },

    setPaused: function (on) { this.paused = !!on; this.last = performance.now(); },

    _newGame: function () {
      var pairs = (COLS * ROWS) / 2;
      var faces = shuffled(FACES).slice(0, pairs);
      this.cards = shuffled(faces.concat(faces)).map(function (f, i) {
        return { face: f, at: i, up: 0, done: false, flip: 0, wobble: 0 };
      });
      this.t = 0;
      this.turns = 0;
      this.found = 0;
      this.open = [];            // the one or two she is looking at
      this.busy = false;         // true while a wrong pair is still showing
      this.over = false;
      this.newBest = false;
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this._newGame();
      global.RoarAudio.sfx('go');
    },

    /* ── the table ────────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 420;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);

      // Cards as big as will fit, keeping them the right shape.
      var gap = Math.min(this.W, this.H) * 0.035;
      var cw = (this.W - gap * (COLS + 1)) / COLS;
      var ch = (this.H - gap * (ROWS + 1)) / ROWS;
      var s = Math.min(cw, ch / 1.28);
      this.cw = s;
      this.ch = s * 1.28;
      this.gap = gap;
      this.left = (this.W - (this.cw * COLS + gap * (COLS - 1))) / 2;
      this.top = (this.H - (this.ch * ROWS + gap * (ROWS - 1))) / 2;
    },

    _box: function (i) {
      var col = i % COLS, row = (i / COLS) | 0;
      return {
        x: this.left + col * (this.cw + this.gap),
        y: this.top + row * (this.ch + this.gap),
        w: this.cw, h: this.ch
      };
    },

    _bind: function () {
      var self = this;
      this._tap = function (e) {
        if (!self.running || self.paused || self.over) return;
        var r = self.canvas.getBoundingClientRect();
        self.tapAt(e.clientX - r.left, e.clientY - r.top);
        e.preventDefault();
      };
      this.canvas.addEventListener('pointerdown', this._tap, { passive: false });
    },

    tapAt: function (x, y) {
      for (var i = 0; i < this.cards.length; i++) {
        var b = this._box(i);
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return this.turn(i);
      }
      return false;
    },

    /* Turning one over.

       A tap while a wrong pair is still on show is NOT thrown away: it puts
       that pair back down and turns the new card, straight away. Throwing it
       away is what a memory game usually does, and it meant that a child
       tapping at her natural three-a-second rate had half her taps do nothing
       at all — so the only pictures she ever really saw were the matched ones
       that stayed up, and the game looked broken.

       Tapping a card that is already up still does nothing, and none of it
       ever costs her a turn. */
    turn: function (i) {
      var card = this.cards[i];
      if (!card || card.done) return false;
      if (this.busy) this._closeWrong();
      if (this.open.indexOf(i) >= 0) return false;
      if (this.open.length >= 2) return false;

      card.up = 1;
      card.flip = FLIP;
      this.open.push(i);
      global.RoarAudio.sfx('tick');

      if (this.open.length === 2) this._judge();
      return true;
    },

    _judge: function () {
      var self = this;
      var a = this.cards[this.open[0]], b = this.cards[this.open[1]];
      this.turns++;

      if (a.face === b.face) {
        // A match is instant: nothing to wait for, and the pause would only
        // be a chance to doubt it.
        a.done = b.done = true;
        a.wobble = b.wobble = 1;
        this.found++;
        this.open = [];
        global.RoarAudio.sfx('spellgood');
        if (this.found === this.cards.length / 2) this._finish();
      } else {
        // Long enough to take them in if she waits, and she can cut it short
        // simply by carrying on.
        this.busy = true;
        global.RoarAudio.sfx('miss');
        this._lookT = setTimeout(function () {
          if (self.running) self._closeWrong();
        }, LOOK * 1000);
      }
      this._render();
    },

    // Put the pair she got wrong back down, whether the clock ran out or she
    // simply moved on.
    _closeWrong: function () {
      clearTimeout(this._lookT);
      for (var i = 0; i < this.open.length; i++) {
        var c = this.cards[this.open[i]];
        if (c && !c.done) { c.up = 0; c.flip = FLIP; }
      }
      this.open = [];
      this.busy = false;
    },

    _finish: function () {
      this.over = true;
      // Fewer turns is better, so the best score is the lowest — and the first
      // finish is always a best, since there is nothing to beat.
      this.newBest = !this.best || this.turns < this.best;
      if (this.newBest) { this.best = this.turns; save(SAVED, String(this.best)); }
      global.RoarAudio.sfx('win');
      try { global.Confetti.start(['#ffd24c', '#7ec8ff', '#e6b3ff', '#9df08a', '#ffffff']); } catch (e) {}
      var self = this;
      this._doneT = setTimeout(function () { try { global.Confetti.stop(); } catch (e) {} }, 3000);
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.turns, this.best, this.newBest);
    },

    _render: function () {
      var e = this.el;
      if (e.turns) e.turns.textContent = this.turns;
      if (e.found) e.found.textContent = this.found + ' / ' + (this.cards.length / 2);
      if (e.best) e.best.textContent = this.best ? '★ ' + this.best : '★ —';
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overTurns) e.overTurns.textContent = this.turns;
          if (e.overBest) {
            e.overBest.textContent = this.newBest ? '🎉 YOUR BEST YET!' : 'best ★ ' + this.best;
            e.overBest.classList.toggle('is-new', !!this.newBest);
          }
        }
      }
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        this.t += dt;
        for (var i = 0; i < this.cards.length; i++) {
          var c = this.cards[i];
          c.flip = Math.max(0, c.flip - dt);
          c.wobble = Math.max(0, c.wobble - dt * 2);
        }
      }
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);
      for (var i = 0; i < this.cards.length; i++) this._card(c, i);
    },

    _card: function (c, i) {
      var card = this.cards[i], b = this._box(i);
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;

      // The flip: the card squashes to nothing edge-on, and whichever side is
      // showing swaps over exactly as it passes through zero width.
      var k = card.flip / FLIP;                       // 1 at the start, 0 at rest
      var half = k > 0.5 ? (k - 0.5) * 2 : (0.5 - k) * 2;
      var squeeze = card.flip > 0 ? half : 1;
      var showFace = card.flip > 0 ? (k <= 0.5 ? card.up : !card.up) : card.up;
      var lift = card.wobble ? Math.sin(card.wobble * 9) * b.h * 0.05 : 0;

      c.save();
      c.translate(cx, cy - lift);
      c.scale(Math.max(0.02, squeeze), 1);

      var w = b.w, h = b.h, r = w * 0.14;
      // A matched pair fades back but stays on the table, so she can see what
      // she has already found.
      c.globalAlpha = card.done && !card.flip ? 0.55 : 1;

      c.beginPath();
      if (c.roundRect) c.roundRect(-w / 2, -h / 2, w, h, r);
      else c.rect(-w / 2, -h / 2, w, h);

      if (showFace) {
        var g = c.createLinearGradient(0, -h / 2, 0, h / 2);
        g.addColorStop(0, card.done ? '#2f6b3c' : '#3d2a68');
        g.addColorStop(1, card.done ? '#1e4a28' : '#271a4a');
        c.fillStyle = g;
        c.fill();
        c.strokeStyle = card.done ? '#9df08a' : '#ffd24c';
        c.lineWidth = 3;
        c.stroke();
        c.font = (h * 0.5) + 'px ' + EMOJI;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(card.face, 0, h * 0.02);
      } else {
        var bg = c.createLinearGradient(0, -h / 2, 0, h / 2);
        bg.addColorStop(0, '#6b4ba8');
        bg.addColorStop(1, '#3d2a68');
        c.fillStyle = bg;
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.25)';
        c.lineWidth = 3;
        c.stroke();
        // a back you would recognise across a table
        c.fillStyle = 'rgba(255,255,255,0.16)';
        c.beginPath();
        c.arc(0, 0, w * 0.22, 0, 6.2832);
        c.fill();
        c.font = (h * 0.24) + 'px ' + EMOJI;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('❔', 0, h * 0.01);
      }
      c.restore();
    }
  };

  PairsGame.COLS = COLS;          // exposed for testing
  PairsGame.ROWS = ROWS;
  PairsGame.FACES = FACES;
  global.PairsGame = PairsGame;
})(window);
