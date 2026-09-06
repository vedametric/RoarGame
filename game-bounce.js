/*
 * game-bounce.js — "BOUNCE"
 *
 * Breakout, softened. A ball bounces round a wall of coloured blocks and you
 * slide a bat along the bottom to keep it up. Clear the wall and the next one
 * comes down with an extra row.
 *
 * The bat is wide, the ball is slow to start and the walls sit low enough to
 * hit without aiming. Where it is kind is the bat itself: hit the ball near
 * the edge and it goes off that way, so steering is something she can feel
 * rather than something she has to work out.
 *
 * Three lives. Losing one puts the ball back on the bat and waits — nothing
 * moves again until she taps, so a lost life is never followed immediately by
 * another one.
 */
(function (global) {
  'use strict';

  var COLS = 7;
  var ROWS0 = 3;                 // rows in the first wall
  var LIVES = 3;
  var SAVED = 'bounce.best';

  var HUES = ['#e8542f', '#ff8a2b', '#ffd24c', '#9df08a', '#4fb3e8', '#a78bfa', '#ffb3f0'];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var BounceGame = {
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
      this.level = 1;
      this.over = false;
      this.newBest = false;
      this.bits = [];
      this._wall(ROWS0);
      this._reset();
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this._newGame();
      global.RoarAudio.sfx('go');
    },

    // A wall of blocks, each row its own colour and worth more the higher up.
    _wall: function (rows) {
      this.blocks = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < COLS; c++) {
          this.blocks.push({ c: c, r: r, alive: true,
                             colour: HUES[r % HUES.length],
                             points: (rows - r) * 10 });
        }
      }
    },

    // Ball back on the bat, waiting. Nothing moves until she taps.
    _reset: function () {
      this.waiting = true;
      this.bx = this.x || (this.W ? this.W / 2 : 160);
      this.by = this.batY - this.ballR * 1.4;
      this.vx = 0;
      this.vy = 0;
    },

    _launch: function () {
      if (!this.waiting) return false;
      this.waiting = false;
      var speed = this.H * (0.44 + (this.level - 1) * 0.05);
      var ang = rnd(-0.5, 0.5);                 // always upwards, never sideways
      this.vx = Math.sin(ang) * speed;
      this.vy = -Math.cos(ang) * speed;
      global.RoarAudio.sfx('puff');
      return true;
    },

    /* ── the table ────────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 420;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);

      this.pad = this.W * 0.03;
      this.bw = (this.W - this.pad * 2) / COLS;
      // Low enough that the ball is not spending most of its life crossing an
      // empty middle: on a tall phone the wall was a third of the way up and
      // the bat right at the bottom.
      this.bh = this.H * 0.068;
      this.top = this.H * 0.16;
      this.batW = this.W * 0.30;                // deliberately wide
      this.batH = Math.max(10, this.H * 0.022);
      this.batY = this.H * 0.90;
      this.ballR = Math.max(6, Math.min(this.W, this.H) * 0.022);
      this.x = clamp(this.x == null ? this.W / 2 : this.x,
                     this.batW / 2, this.W - this.batW / 2);
      if (this.waiting) this.by = this.batY - this.ballR * 1.4;
    },

    _bind: function () {
      var self = this;
      var aim = function (e) {
        var r = self.canvas.getBoundingClientRect();
        self.moveTo(e.clientX - r.left);
        e.preventDefault();
      };
      this._down = function (e) {
        if (!self.running || self.paused) return;
        if (self.over) { self.again(); return; }
        self.dragging = true;
        aim(e);
        self._launch();
      };
      this._move = function (e) { if (self.dragging) aim(e); };
      this._up = function () { self.dragging = false; };

      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      addEventListener('pointerup', this._up);
      addEventListener('pointercancel', this._up);

      this._key = function (e) {
        var step = self.W * 0.1;
        if (e.key === 'ArrowLeft') { self.moveTo(self.x - step); e.preventDefault(); }
        if (e.key === 'ArrowRight') { self.moveTo(self.x + step); e.preventDefault(); }
        if (e.key === ' ') { self._launch(); e.preventDefault(); }
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
      this.x = clamp(x, this.batW / 2, this.W - this.batW / 2);
      if (this.waiting) this.bx = this.x;
      return this.x;
    },

    _boxOf: function (b) {
      return { x: this.pad + b.c * this.bw, y: this.top + b.r * this.bh,
               w: this.bw, h: this.bh };
    },

    /* ── the loop ─────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.033, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this._update(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _update: function (dt) {
      var i;
      this.t += dt;

      for (i = this.bits.length - 1; i >= 0; i--) {
        var p = this.bits[i];
        p.age += dt;
        if (p.age > p.life) { this.bits.splice(i, 1); continue; }
        p.vy += 700 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }

      if (this.over) return;
      if (this.waiting) { this.bx = this.x; this.by = this.batY - this.ballR * 1.4; return; }

      // Stepped, so a fast ball cannot pass straight through a thin block.
      var steps = Math.ceil(Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt / (this.ballR * 0.6)) || 1;
      var sdt = dt / Math.min(steps, 8);
      for (var s = 0; s < Math.min(steps, 8) && !this.over && !this.waiting; s++) {
        this._step(sdt);
      }
      this._render();
    },

    _step: function (dt) {
      this.bx += this.vx * dt;
      this.by += this.vy * dt;
      var r = this.ballR;

      // walls
      if (this.bx < r) { this.bx = r; this.vx = Math.abs(this.vx); this._tick(); }
      if (this.bx > this.W - r) { this.bx = this.W - r; this.vx = -Math.abs(this.vx); this._tick(); }
      if (this.by < r) { this.by = r; this.vy = Math.abs(this.vy); this._tick(); }

      // the bat
      if (this.vy > 0 && this.by + r >= this.batY && this.by - r <= this.batY + this.batH &&
          Math.abs(this.bx - this.x) < this.batW / 2 + r) {
        this.by = this.batY - r;
        // Where on the bat it landed decides where it goes — that is the
        // steering, and it is the one thing worth learning here.
        var off = clamp((this.bx - this.x) / (this.batW / 2), -1, 1);
        var speed = Math.hypot(this.vx, this.vy);
        var ang = off * 1.0;                       // up to about 57° either way
        this.vx = Math.sin(ang) * speed;
        this.vy = -Math.cos(ang) * speed;
        this._tick();
      }

      // blocks
      for (var i = 0; i < this.blocks.length; i++) {
        var b = this.blocks[i];
        if (!b.alive) continue;
        var q = this._boxOf(b);
        if (this.bx + r < q.x || this.bx - r > q.x + q.w ||
            this.by + r < q.y || this.by - r > q.y + q.h) continue;

        b.alive = false;
        this.score += b.points;
        this._smash(q, b.colour);
        global.RoarAudio.sfx('grab');

        // Bounce off whichever face it actually came through.
        var dx = (this.bx - (q.x + q.w / 2)) / (q.w / 2);
        var dy = (this.by - (q.y + q.h / 2)) / (q.h / 2);
        if (Math.abs(dx) > Math.abs(dy)) this.vx = Math.abs(this.vx) * (dx > 0 ? 1 : -1);
        else this.vy = Math.abs(this.vy) * (dy > 0 ? 1 : -1);

        if (!this._left()) this._nextWall();
        break;                                     // one block per step
      }

      // off the bottom
      if (this.by - r > this.H) {
        this.lives--;
        global.RoarAudio.sfx('miss');
        if (this.lives <= 0) this._finish();
        else this._reset();
      }
    },

    _left: function () {
      for (var i = 0; i < this.blocks.length; i++) if (this.blocks[i].alive) return true;
      return false;
    },

    _nextWall: function () {
      this.level++;
      this.score += 100;                           // clearing one is worth it
      global.RoarAudio.sfx('level');
      try { global.Confetti.start(['#ffd24c', '#9df08a', '#7ec8ff', '#ffffff']); } catch (e) {}
      var self = this;
      setTimeout(function () { try { global.Confetti.stop(); } catch (e) {} }, 1600);
      this._wall(Math.min(6, ROWS0 + this.level - 1));
      this._reset();
    },

    _tick: function () { global.RoarAudio.sfx('tick'); },

    _smash: function (q, colour) {
      for (var i = 0; i < 8; i++) {
        this.bits.push({
          x: q.x + q.w / 2 + rnd(-q.w / 3, q.w / 3),
          y: q.y + q.h / 2,
          vx: rnd(-140, 140), vy: rnd(-180, 20),
          r: rnd(2, 5), colour: colour, age: 0, life: rnd(0.4, 0.9)
        });
      }
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
      if (e.level) e.level.textContent = 'wall ' + this.level;
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
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);

      var bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#150b30');
      bg.addColorStop(1, '#2a1550');
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);

      // blocks
      for (var i = 0; i < this.blocks.length; i++) {
        var b = this.blocks[i];
        if (!b.alive) continue;
        var q = this._boxOf(b);
        c.fillStyle = b.colour;
        c.beginPath();
        if (c.roundRect) c.roundRect(q.x + 2, q.y + 2, q.w - 4, q.h - 4, 5);
        else c.rect(q.x + 2, q.y + 2, q.w - 4, q.h - 4);
        c.fill();
        // a highlight along the top, so they look like objects not swatches
        c.fillStyle = 'rgba(255,255,255,0.28)';
        c.fillRect(q.x + 5, q.y + 5, q.w - 10, Math.max(2, q.h * 0.16));
      }

      // the bits of the last one
      for (i = 0; i < this.bits.length; i++) {
        var p = this.bits[i];
        c.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
        c.fillStyle = p.colour;
        c.fillRect(p.x, p.y, p.r, p.r);
      }
      c.globalAlpha = 1;

      // the bat
      c.fillStyle = '#9df08a';
      c.beginPath();
      if (c.roundRect) c.roundRect(this.x - this.batW / 2, this.batY, this.batW, this.batH, this.batH / 2);
      else c.rect(this.x - this.batW / 2, this.batY, this.batW, this.batH);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(this.x - this.batW / 2 + 4, this.batY + 2, this.batW - 8, this.batH * 0.3);

      // the ball
      var g = c.createRadialGradient(this.bx - this.ballR * 0.3, this.by - this.ballR * 0.35,
                                     this.ballR * 0.1, this.bx, this.by, this.ballR);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, '#ffd24c');
      c.fillStyle = g;
      c.beginPath();
      c.arc(this.bx, this.by, this.ballR, 0, 6.2832);
      c.fill();

      if (this.waiting && !this.over) {
        c.textAlign = 'center';
        c.font = '900 ' + Math.max(14, this.W * 0.045) + 'px system-ui, sans-serif';
        c.fillStyle = 'rgba(255,255,255,' + (0.5 + Math.sin(this.t * 4) * 0.35) + ')';
        c.fillText('TAP TO GO!', W / 2, this.batY - this.ballR * 4);
      }
    }
  };

  BounceGame.COLS = COLS;         // exposed for testing
  BounceGame.ROWS0 = ROWS0;
  BounceGame.LIVES = LIVES;
  global.BounceGame = BounceGame;
})(window);
