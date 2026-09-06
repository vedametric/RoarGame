/*
 * game-catch.js — "CATCH IT!"
 *
 * Fruit falls out of the sky and you slide a basket along the bottom to catch
 * it. Bombs fall too, and those you have to let past — which is the whole
 * game, because the reflex to grab everything is exactly the one that has to
 * be unlearned.
 *
 * Held your finger anywhere and the basket follows it, rather than only
 * moving when you touch the basket itself: a small hand covering the basket
 * cannot see what it is doing.
 *
 * Three lives, and a dropped fruit costs nothing — only a caught bomb does.
 * It speeds up as the score climbs, so it ends eventually, but the early
 * minute is slow enough to be a gentle place to start.
 */
(function (global) {
  'use strict';

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  var SAVED = 'catch.best';
  var LIVES = 3;

  var GOOD = [
    { emoji: '🍎', points: 10 }, { emoji: '🍌', points: 10 },
    { emoji: '🍓', points: 15 }, { emoji: '🍇', points: 15 },
    { emoji: '🍰', points: 25 }, { emoji: '🍩', points: 25 },
    { emoji: '⭐', points: 50 }
  ];
  var BAD = ['💣', '🌶️'];

  // How often a bomb turns up, and how fast things fall. Both climb with the
  // score, so it starts kind and gets properly hard by a few hundred.
  function bombOdds(score) { return Math.min(0.30, 0.08 + score / 4000); }
  function fallSpeed(score) { return 0.30 + Math.min(0.42, score / 2600); }
  function dropGap(score) { return Math.max(0.36, 0.85 - score / 2400); }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var CatchGame = {
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
      this.t = 0;
      this.score = 0;
      this.lives = LIVES;
      this.things = [];
      this.pops = [];
      this.x = this.W ? this.W / 2 : 160;      // where the basket is
      this.want = this.x;                      // ...and where the finger is
      this.next = 0.7;
      this.over = false;
      this.newBest = false;
      this.flash = 0;
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
      this.size = clamp(Math.min(this.W, this.H) * 0.11, 24, 52);
      this.basketW = this.size * 1.9;
      this.basketY = this.H - this.size * 1.15;
      if (this.x != null) this.x = clamp(this.x, this.basketW / 2, this.W - this.basketW / 2);
    },

    /* Drag anywhere: the basket goes where the finger is, not where it was
       grabbed, so she never has to find the basket before she can move it. */
    _bind: function () {
      var self = this;
      var aim = function (e) {
        var r = self.canvas.getBoundingClientRect();
        self.moveTo(e.clientX - r.left);
        e.preventDefault();
      };
      this._down = function (e) { self.dragging = true; aim(e); };
      this._move = function (e) { if (self.dragging) aim(e); };
      this._up = function () { self.dragging = false; };

      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      addEventListener('pointerup', this._up);
      addEventListener('pointercancel', this._up);

      this._key = function (e) {
        var step = self.W * 0.12;
        if (e.key === 'ArrowLeft') { self.moveTo(self.want - step); e.preventDefault(); }
        if (e.key === 'ArrowRight') { self.moveTo(self.want + step); e.preventDefault(); }
      };
      addEventListener('keydown', this._key);
    },

    _unbind: function () {
      if (this._down) {
        this.canvas.removeEventListener('pointerdown', this._down);
        this.canvas.removeEventListener('pointermove', this._move);
        removeEventListener('pointerup', this._up);
        removeEventListener('pointercancel', this._up);
      }
      if (this._key) removeEventListener('keydown', this._key);
    },

    moveTo: function (x) {
      this.want = clamp(x, this.basketW / 2, this.W - this.basketW / 2);
      return this.want;
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
      var i, o;
      this.t += dt;
      this.flash = Math.max(0, this.flash - dt * 2.5);

      // The basket chases the finger rather than teleporting to it, which is
      // what makes a near miss feel like a near miss.
      this.x += (this.want - this.x) * clamp(dt * 16, 0, 1);

      for (i = this.pops.length - 1; i >= 0; i--) {
        var p = this.pops[i];
        p.age += dt;
        if (p.age > p.life) this.pops.splice(i, 1);
      }
      if (this.over) return;

      this.next -= dt;
      if (this.next <= 0) {
        this.things.push(this._drop());
        this.next = dropGap(this.score) * rnd(0.7, 1.3);
      }

      var reach = this.size * 0.75;
      for (i = this.things.length - 1; i >= 0; i--) {
        o = this.things[i];
        o.y += o.vy * dt;
        o.spin += o.spinV * dt;
        // caught?
        if (o.y > this.basketY - reach && o.y < this.basketY + reach * 0.8 &&
            Math.abs(o.x - this.x) < this.basketW / 2 + this.size * 0.18) {
          this.things.splice(i, 1);
          this._caught(o);
          continue;
        }
        if (o.y > this.H + this.size) {
          this.things.splice(i, 1);
          // A dropped fruit costs nothing. Only catching a bomb does.
          if (!o.bad) this.pops.push({ x: o.x, y: this.H - 10, age: 0, life: 0.4, text: 'missed', bad: true });
        }
      }
      this._render();
    },

    _drop: function () {
      var bad = Math.random() < bombOdds(this.score);
      var kind = bad ? null : GOOD[(Math.random() * GOOD.length) | 0];
      return {
        bad: bad,
        emoji: bad ? BAD[(Math.random() * BAD.length) | 0] : kind.emoji,
        points: bad ? 0 : kind.points,
        x: rnd(this.size, this.W - this.size),
        y: -this.size,
        vy: this.H * fallSpeed(this.score) * rnd(0.85, 1.15),
        spin: rnd(0, 6.28), spinV: rnd(-2, 2)
      };
    },

    _caught: function (o) {
      if (o.bad) {
        this.lives--;
        this.flash = 1;
        this.pops.push({ x: o.x, y: this.basketY, age: 0, life: 0.7, text: '💥', bad: true });
        global.RoarAudio.sfx('bomb');
        if (this.lives <= 0) this._finish();
      } else {
        this.score += o.points;
        this.pops.push({ x: o.x, y: this.basketY, age: 0, life: 0.6, text: '+' + o.points });
        global.RoarAudio.sfx(o.points >= 50 ? 'gold' : 'nom');
      }
      this._render();
    },

    _finish: function () {
      this.over = true;
      global.RoarAudio.sfx('bust');
      if (this.score > this.best) {
        this.best = this.score;
        this.newBest = true;
        save(SAVED, String(this.best));
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#ffd24c', '#9df08a', '#7ec8ff', '#ffffff']); } catch (e) {}
      } else {
        this.newBest = false;
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.score, this.best, this.newBest);
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.lives) e.lives.textContent = '❤️'.repeat(Math.max(0, this.lives));
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

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H, s = this.size;
      c.clearRect(0, 0, W, H);

      var sky = c.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#1b3a6b');
      sky.addColorStop(1, '#3f7ab0');
      c.fillStyle = sky;
      c.fillRect(0, 0, W, H);

      // grass under the basket, so the bottom of the screen is a place
      c.fillStyle = '#2f6b3c';
      c.fillRect(0, H - s * 0.5, W, s * 0.5);

      // falling things
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        c.save();
        c.translate(o.x, o.y);
        c.rotate(o.spin);
        c.font = (s * 1.05) + 'px ' + EMOJI;
        c.fillText(o.emoji, 0, 0);
        c.restore();
      }

      this._basket(c);
      this._popsDraw(c);

      if (this.flash > 0.01) {
        c.fillStyle = 'rgba(255,70,70,' + (0.4 * this.flash) + ')';
        c.fillRect(0, 0, W, H);
      }
    },

    _basket: function (c) {
      var s = this.size, w = this.basketW, y = this.basketY;
      c.save();
      c.translate(this.x, y);
      // a tilt in the direction she is moving, which reads as effort
      c.rotate(clamp((this.want - this.x) / 200, -0.22, 0.22));

      c.fillStyle = '#a9762f';
      c.beginPath();
      c.moveTo(-w / 2, -s * 0.34);
      c.lineTo(w / 2, -s * 0.34);
      c.lineTo(w * 0.38, s * 0.34);
      c.lineTo(-w * 0.38, s * 0.34);
      c.closePath();
      c.fill();

      c.strokeStyle = '#7d5622';
      c.lineWidth = Math.max(1, s * 0.045);
      for (var i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(i * w * 0.17, -s * 0.34);
        c.lineTo(i * w * 0.13, s * 0.34);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(-w / 2, -s * 0.10); c.lineTo(w / 2, -s * 0.10);
      c.stroke();

      // the rim, which is the bit she aims with
      c.strokeStyle = '#d29a54';
      c.lineWidth = Math.max(3, s * 0.13);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-w / 2, -s * 0.34); c.lineTo(w / 2, -s * 0.34);
      c.stroke();
      c.restore();
    },

    _popsDraw: function (c) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var i = 0; i < this.pops.length; i++) {
        var p = this.pops[i];
        var k = 1 - p.age / p.life;
        c.globalAlpha = clamp(k * 1.6, 0, 1);
        c.font = '900 ' + (this.size * 0.6) + 'px system-ui, sans-serif';
        c.fillStyle = p.bad ? '#ff8a8a' : '#ffd24c';
        c.fillText(p.text, p.x, p.y - (1 - k) * this.size);
      }
      c.restore();
    }
  };

  CatchGame.GOOD = GOOD;          // exposed for testing
  CatchGame.BAD = BAD;
  CatchGame.LIVES = LIVES;
  global.CatchGame = CatchGame;
})(window);
