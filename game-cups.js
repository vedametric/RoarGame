/*
 * game-cups.js — "WHICH CUP?"
 *
 * A mouse hides under a cup, the cups shuffle themselves about, and she says
 * where he went. It is the oldest trick at the fair, and the only honest
 * version of it: the mouse really is under the cup she saw him go under, and
 * every swap is drawn, so a child who keeps her eyes on him always wins.
 *
 * Which is the point. Every other game here is about doing something quickly;
 * this one is about not looking away, and there is nothing else in it to do —
 * no dodging, no timer during the shuffle, no reason to hurry the answer.
 *
 * It grows the way the trick does: three cups, then four, then five, more
 * swaps, faster. The swaps never overlap, though, however fast it gets — two
 * cups crossing at once is something to follow, four is a blur, and a blur is
 * just a coin toss with extra steps.
 */
(function (global) {
  'use strict';

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  var SAVED = 'cups.best';
  var LIVES = 3;
  var HIDER = '🐭';

  function cupsFor(round) { return round < 6 ? 3 : round < 11 ? 4 : 5; }
  function swapsFor(round) { return Math.min(11, 2 + round); }
  function swapDur(round) { return Math.max(0.22, 0.58 - round * 0.032); }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var CupsGame = {
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
      this.won = 0;
      this.lives = LIVES;
      this.over = false;
      this.newBest = false;
      this.picked = -1;
      this.right = false;
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
      var n = this.cups ? this.cups.length : 3;
      this.cupW = Math.min(this.W / (n + 0.4), this.H * 0.30);
      this.cupH = this.cupW * 1.5;
      // Low, so the table is a band under the cups rather than a slab of
      // brown taking up the bottom third of the screen.
      this.floor = this.H * 0.83;
    },

    _refit: function () { this._fit(); this._draw(); },

    /* ── a round ──────────────────────────────────────────────── */

    _deal: function () {
      this.round++;
      var n = cupsFor(this.round);
      this.cups = [];
      for (var i = 0; i < n; i++) {
        this.cups.push({ at: i, p: i, from: i, to: i, k: 1, arc: 0 });
      }
      this.mouse = (Math.random() * n) | 0;      // which CUP he is under
      this.left = swapsFor(this.round);
      this.dur = swapDur(this.round);
      this.picked = -1;
      this.right = false;
      this.lift = 1;                              // cups start up, showing him
      this.phase = 'peek';
      this.wait = 1.15;
      this._fit();
      this._render();
      try { global.RoarAudio.sfx('spawn'); } catch (e) {}
    },

    _slotX: function (slot) {
      var n = this.cups.length;
      var gap = (this.W - this.cupW * n) / (n + 1);
      return gap + slot * (this.cupW + gap) + this.cupW / 2;
    },

    _startSwap: function () {
      var n = this.cups.length;
      var a = (Math.random() * n) | 0;
      var b;
      do { b = (Math.random() * n) | 0; } while (b === a);

      var ca = this.cups[a], cb = this.cups[b];
      var sa = ca.at, sb = cb.at;
      ca.from = ca.p; ca.to = sb; ca.k = 0; ca.arc = sa < sb ? -1 : 1;
      cb.from = cb.p; cb.to = sa; cb.k = 0; cb.arc = -ca.arc;
      ca.at = sb; cb.at = sa;
      this.swapping = [a, b];
      try { global.RoarAudio.sfx('step'); } catch (e) {}
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
      if (this.phase !== 'pick' || this.over || this.paused) return false;
      for (var i = 0; i < this.cups.length; i++) {
        var cx = this._slotX(this.cups[i].p);
        if (Math.abs(x - cx) <= this.cupW * 0.62 &&
            y > this.floor - this.cupH * 1.4 && y < this.floor + this.cupH * 0.4) {
          return this.press(i);
        }
      }
      return false;
    },

    // i is a CUP, not a slot: cups keep their identity through the shuffle.
    press: function (i) {
      if (this.phase !== 'pick' || this.over || this.paused) return false;
      this.picked = i;
      this.right = i === this.mouse;
      this.phase = 'reveal';
      this.wait = 1.5;

      if (this.right) {
        this.won++;
        global.RoarAudio.sfx('gold');
        if (this.won > this.best) {
          this.best = this.won;
          this.newBest = true;
          save(SAVED, String(this.best));
        }
      } else {
        this.lives--;
        global.RoarAudio.sfx('spellbad');
      }
      this._render();
      return true;
    },

    _finish: function () {
      this.over = true;
      this.phase = 'over';
      global.RoarAudio.sfx('bust');
      if (this.newBest) {
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#ffd24c', '#9df08a', '#7ec8ff', '#ffffff']); } catch (e) {}
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.won, this.best, this.newBest);
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.won;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.lives) e.lives.textContent = '🧀'.repeat(Math.max(0, this.lives));
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overScore) e.overScore.textContent = this.won;
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
      if (!this.paused) this._update(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _update: function (dt) {
      if (this.over) return;
      var i, c;

      // Cups slide between slots; nothing else moves.
      for (i = 0; i < this.cups.length; i++) {
        c = this.cups[i];
        if (c.k < 1) {
          c.k = Math.min(1, c.k + dt / this.dur);
          c.p = c.from + (c.to - c.from) * ease(c.k);
        }
      }

      if (this.phase === 'peek') {
        this.wait -= dt;
        if (this.wait <= 0) { this.phase = 'drop'; this.wait = 0.45; }

      } else if (this.phase === 'drop') {
        this.lift = Math.max(0, this.lift - dt / 0.35);
        this.wait -= dt;
        if (this.wait <= 0) {
          this.lift = 0;
          this.phase = this.left > 0 ? 'shuffle' : 'pick';
          if (this.phase === 'shuffle') this._startSwap();
        }

      } else if (this.phase === 'shuffle') {
        // One swap at a time, and only when the last one has finished.
        var busy = false;
        for (i = 0; i < this.cups.length; i++) if (this.cups[i].k < 1) busy = true;
        if (!busy) {
          this.left--;
          if (this.left > 0) this._startSwap();
          else { this.phase = 'pick'; this.swapping = null; }
        }

      } else if (this.phase === 'reveal') {
        this.lift = Math.min(1, this.lift + dt / 0.3);
        this.wait -= dt;
        if (this.wait <= 0) {
          if (this.lives <= 0) this._finish();
          else this._deal();
        }
      }
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);

      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a1740');
      g.addColorStop(1, '#160c26');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);

      // a spotlight over the table, which makes the empty top half a room
      var spot = c.createRadialGradient(W / 2, this.floor, W * 0.05,
                                        W / 2, this.floor, W * 0.95);
      spot.addColorStop(0, 'rgba(255,214,150,.22)');
      spot.addColorStop(1, 'rgba(255,214,150,0)');
      c.fillStyle = spot;
      c.fillRect(0, 0, W, H);

      // the table he is running about on, going dark towards the front edge
      // so it lies down instead of standing up as a slab
      var wood = c.createLinearGradient(0, this.floor, 0, H);
      wood.addColorStop(0, '#5b3a22');
      wood.addColorStop(1, '#2a1810');
      c.fillStyle = wood;
      c.fillRect(0, this.floor, W, H - this.floor);
      c.fillStyle = 'rgba(255,255,255,.09)';
      c.fillRect(0, this.floor, W, Math.max(2, H * 0.006));

      this._sign(c);

      // Back to front so a cup crossing in front overlaps the one behind it.
      var order = this.cups.map(function (cu, i) { return i; }).sort((function (self) {
        return function (a, b) { return self._hop(a) - self._hop(b); };
      })(this));

      for (var k = 0; k < order.length; k++) this._cup(c, order[k]);
    },

    // How high a cup is riding on its arc: also the draw order, so the cup
    // going over the top passes in front.
    _hop: function (i) {
      var c = this.cups[i];
      return c.k < 1 && c.arc < 0 ? 1 : 0;
    },

    _sign: function (c) {
      var text = this.phase === 'peek' ? '👀 WATCH HIM!'
               : this.phase === 'shuffle' || this.phase === 'drop' ? '🌀 keep looking…'
               : this.phase === 'pick' ? '👆 WHERE IS HE?'
               : this.phase === 'reveal' ? (this.right ? '🎉 FOUND HIM!' : '🙈 he was here!')
               : '';
      if (!text) return;
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 ' + clamp(this.W * 0.058, 15, 24) + 'px system-ui, sans-serif';
      c.fillStyle = this.phase === 'reveal' ? (this.right ? '#9df08a' : '#ff9a9a')
                  : this.phase === 'pick' ? '#ffd24c' : 'rgba(201,189,240,.9)';
      c.fillText(text, this.W / 2, this.H * 0.10);
      c.restore();
    },

    _cup: function (c, i) {
      var cup = this.cups[i];
      var x = this._slotX(cup.p);
      var w = this.cupW, h = this.cupH, y = this.floor;

      // The arc: mid-swap a cup rises over its partner or dips under it.
      var swing = cup.k < 1 ? Math.sin(Math.PI * cup.k) : 0;
      var hop = swing * h * (cup.arc < 0 ? 0.5 : 0.12) * (cup.arc < 0 ? -1 : 1);

      // Lifted at peek and at the reveal — but only the cup that matters.
      var showing = this.phase === 'peek' ? (i === this.mouse)
                  : this.phase === 'drop' ? (i === this.mouse)
                  : this.phase === 'reveal' ? (i === this.mouse || i === this.picked)
                  : false;
      var up = showing ? this.lift * h * 0.85 : 0;

      /* Shadow first, then the mouse, then the cup. Drawn in any other order
         the shadow lands on top of him and he looks like he is coming up out
         of a hole in the table rather than standing on it. */
      var off = clamp(up / (h * 0.85), 0, 1);
      c.save();
      // A lifted cup's shadow fades right out. Left under the mouse it read
      // as a hole he was climbing out of rather than a table he was on.
      c.globalAlpha = Math.max(0, 0.35 - swing * 0.15 - off * 0.5);
      c.fillStyle = '#000';
      c.beginPath();
      c.ellipse(x, y + h * 0.02, w * (0.46 - off * 0.08), w * 0.10, 0, 0, 6.2832);
      c.fill();
      c.restore();

      // the mouse, drawn before the cup so the cup can come down over him
      if (i === this.mouse && up > h * 0.18) {
        c.save();
        c.globalAlpha = clamp(off * 1.4, 0, 1);
        // Opaque: a colour emoji is painted through the fill's alpha, and
        // whatever was last set on the table would have left him a ghost.
        c.fillStyle = '#fff';
        c.textAlign = 'center';
        c.textBaseline = 'alphabetic';
        c.font = (w * 0.52) + 'px ' + EMOJI;
        c.fillText(HIDER, x, y - w * 0.10);
        c.restore();
      }

      c.save();
      c.translate(x, y + hop - up);

      var wrong = this.phase === 'reveal' && i === this.picked && !this.right;
      var top = w * 0.66;          // a cup narrows a little; a cone comes to a point

      // the cup itself: a trapezoid, wider at the bottom
      var g = c.createLinearGradient(-w / 2, -h, w / 2, 0);
      if (wrong) { g.addColorStop(0, '#9e3b3b'); g.addColorStop(1, '#5c1f1f'); }
      else { g.addColorStop(0, '#ff9d4a'); g.addColorStop(0.5, '#e2762a'); g.addColorStop(1, '#a8501a'); }
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-top / 2, -h);
      c.lineTo(top / 2, -h);
      c.lineTo(w / 2, 0);
      c.lineTo(-w / 2, 0);
      c.closePath();
      c.fill();

      // a band round the middle, so a cup that moves has something to move
      c.fillStyle = 'rgba(255,255,255,.15)';
      var by = -h * 0.60, bh = h * 0.13;
      c.beginPath();
      c.moveTo(-(top + (w - top) * 0.40) / 2, by);
      c.lineTo((top + (w - top) * 0.40) / 2, by);
      c.lineTo((top + (w - top) * 0.53) / 2, by + bh);
      c.lineTo(-(top + (w - top) * 0.53) / 2, by + bh);
      c.closePath();
      c.fill();

      // the base it sits on, and the closed top it was turned over onto
      c.strokeStyle = 'rgba(0,0,0,.4)';
      c.lineWidth = Math.max(2, w * 0.035);
      c.beginPath();
      c.moveTo(-w / 2, 0); c.lineTo(w / 2, 0);
      c.stroke();

      c.fillStyle = wrong ? '#d07070' : '#ffc078';
      c.beginPath();
      c.ellipse(0, -h, top / 2, w * 0.075, 0, 0, 6.2832);
      c.fill();
      c.strokeStyle = 'rgba(0,0,0,.22)';
      c.lineWidth = Math.max(1.5, w * 0.02);
      c.stroke();

      // While it is her turn every cup is outlined, so they read as things to
      // press rather than scenery.
      if (this.phase === 'pick') {
        c.strokeStyle = 'rgba(255,210,76,.7)';
        c.lineWidth = Math.max(2, w * 0.028);
        c.beginPath();
        c.moveTo(-w / 2, 0);
        c.lineTo(-top / 2, -h);
        c.lineTo(top / 2, -h);
        c.lineTo(w / 2, 0);
        c.stroke();
      }
      c.restore();
    }
  };

  CupsGame.LIVES = LIVES;         // exposed for testing
  CupsGame.cupsFor = cupsFor;
  CupsGame.swapsFor = swapsFor;
  global.CupsGame = CupsGame;
})(window);
