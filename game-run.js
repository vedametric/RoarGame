/*
 * game-run.js — "RUN!"
 *
 * The dinosaur game out of Chrome, for a five-year-old: pick who you want to
 * be, and then run. Things come at you along the ground — tap to jump them —
 * and things come through the air, which you duck under by holding your
 * finger down.
 *
 * Three speeds to pick from before you start, and whichever you pick it gets
 * quicker the further you go, so it always ends eventually. The distance is
 * the score and each speed keeps its own best, so choosing the easy one is
 * never a way of cheating the leaderboard.
 *
 * Kinder than Chrome's in two ways that matter at five: the very first
 * obstacle is a long way off, and a jump started a fraction too late is still
 * counted, because a child's timing is not a grown-up's.
 */
(function (global) {
  'use strict';

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  var SAVED = 'run.best.';        // + the level, so each keeps its own

  // Who you can be. All the same size and all the same to play — the choice is
  // about who she wants to be, not about which one is better.
  var RUNNERS = [
    { id: 'dino',   emoji: '🦖', name: 'Dino' },
    { id: 'bunny',  emoji: '🐰', name: 'Bunny' },
    { id: 'cat',    emoji: '🐱', name: 'Cat' },
    { id: 'uni',    emoji: '🦄', name: 'Unicorn' },
    { id: 'dog',    emoji: '🐶', name: 'Puppy' },
    { id: 'peng',   emoji: '🐧', name: 'Penguin' },
    { id: 'robot',  emoji: '🤖', name: 'Robot' },
    { id: 'lion',   emoji: '🦁', name: 'Lion' }
  ];

  /* The three speeds. `v0` is how fast it starts, `ramp` how much faster it
     gets per second of running, and `gap` how much room there is between
     obstacles — which matters far more than raw speed at this age. */
  var LEVELS = [
    { id: 'easy', name: 'EASY',   emoji: '🐢', v0: 250, ramp: 5.5,  gap: 1.55, air: 0.10 },
    { id: 'mid',  name: 'FASTER', emoji: '🐇', v0: 330, ramp: 9.0,  gap: 1.20, air: 0.26 },
    { id: 'fast', name: 'ZOOM!',  emoji: '⚡', v0: 420, ramp: 13.0, gap: 0.95, air: 0.38 }
  ];

  var GROUND = ['🌵', '🪨', '🌳', '🍄', '🧊'];
  var FLYERS = ['🦅', '🦇', '🐝', '🛸'];

  var GRAV = 2600;
  var JUMP_V = 900;
  var HOLD_EXTRA = 900;        // holding the tap jumps higher, up to a point
  var HOLD_MAX = 0.20;
  var COYOTE = 0.10;           // a jump asked for just too late still counts
  var GRACE = 0.62;            // how much of the drawn body actually collides

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var RunGame = {
    running: false,

    /* cfg: { canvas, els: {score, best, over, overScore, overBest, overWho},
              runner, level, onOver } */
    start: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');

      this.who = this._find(RUNNERS, cfg.runner) || RUNNERS[0];
      this.level = this._find(LEVELS, cfg.level) || LEVELS[0];
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

    _find: function (list, id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      this._unbind();
      try { global.Confetti.stop(); } catch (e) {}
    },

    setPaused: function (on) {
      this.paused = !!on;
      this.last = performance.now();
    },

    _newGame: function () {
      this.best = parseInt(saved(SAVED + this.level.id, '0'), 10) || 0;
      this.t = 0;
      this.dist = 0;
      this.v = this.level.v0;
      this.y = 0;              // height above the ground
      this.vy = 0;
      this.onGround = true;
      this.ducking = false;
      this.held = 0;
      this.wantJump = -1;      // when she last asked, for the late-jump grace
      this.obstacles = [];
      this.clouds = [];
      this.puffs = [];
      this.over = false;
      this.newBest = false;
      // A long run-up before the first one, so she is moving before she has to
      // do anything about it.
      this.next = 1.6;
      for (var i = 0; i < 5; i++) {
        this.clouds.push({ x: rnd(0, 1) * (this.W || 400), y: rnd(0.1, 0.42),
                           s: rnd(0.5, 1.2), v: rnd(0.05, 0.16) });
      }
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this._newGame();
      global.RoarAudio.sfx('go');
    },

    setRunner: function (id) {
      var r = this._find(RUNNERS, id);
      if (r) this.who = r;
      this._render();
      return this.who;
    },

    setLevel: function (id) {
      var l = this._find(LEVELS, id);
      if (l) this.level = l;
      this._newGame();
      return this.level;
    },

    /* ── the board ────────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 360;
      this.H = this.canvas.clientHeight || 260;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this.groundY = this.H * 0.80;
      this.size = clamp(this.H * 0.22, 26, 62);      // how big everybody is
      this.runX = this.W * 0.20;
    },

    /* ── controls ─────────────────────────────────────────────────
       Tap to jump, hold to jump higher, hold still to duck. One finger does
       all of it, because that is all a small child has spare. */

    _bind: function () {
      var self = this;
      this._down = function (e) {
        if (!self.running || self.paused) return;
        if (self.over) { self.again(); e.preventDefault(); return; }
        self.press();
        e.preventDefault();
      };
      this._up = function () { self.release(); };

      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      addEventListener('pointerup', this._up);
      addEventListener('pointercancel', this._up);

      this._key = function (e) {
        if (e.key === ' ' || e.key === 'ArrowUp') { self.press(); e.preventDefault(); }
        if (e.key === 'ArrowDown') { self.ducking = true; e.preventDefault(); }
      };
      this._keyUp = function (e) {
        if (e.key === ' ' || e.key === 'ArrowUp') self.release();
        if (e.key === 'ArrowDown') self.ducking = false;
      };
      addEventListener('keydown', this._key);
      addEventListener('keyup', this._keyUp);
    },

    _unbind: function () {
      if (this._down) this.canvas.removeEventListener('pointerdown', this._down);
      if (this._up) { removeEventListener('pointerup', this._up); removeEventListener('pointercancel', this._up); }
      if (this._key) { removeEventListener('keydown', this._key); removeEventListener('keyup', this._keyUp); }
    },

    press: function () {
      if (this.over) return false;
      this.wantJump = this.t;
      this.holding = true;
      return this._tryJump();
    },

    release: function () {
      this.holding = false;
      this.held = HOLD_MAX;        // stop the extra push
      this.ducking = false;
    },

    // A jump is allowed if she is on the ground, or was a heartbeat ago.
    _tryJump: function () {
      if (!this.onGround && this.t - (this.leftGround || -9) > COYOTE) {
        // Not a jump — so it is a duck instead, which is the other thing a
        // held finger can mean.
        this.ducking = true;
        return false;
      }
      this.vy = JUMP_V;
      this.onGround = false;
      this.held = 0;
      this.ducking = false;
      this.wantJump = -1;
      global.RoarAudio.sfx('puff');
      this._puff();
      return true;
    },

    _puff: function () {
      for (var i = 0; i < 6; i++) {
        this.puffs.push({
          x: this.runX + rnd(-8, 8), y: this.groundY,
          vx: rnd(-70, -10), vy: rnd(-40, 10),
          r: rnd(3, 8), age: 0, life: rnd(0.3, 0.6)
        });
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
      var i, o;
      this.t += dt;

      for (i = this.puffs.length - 1; i >= 0; i--) {
        var p = this.puffs[i];
        p.age += dt;
        if (p.age > p.life) { this.puffs.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += 14 * dt;
      }
      for (i = 0; i < this.clouds.length; i++) {
        var cl = this.clouds[i];
        cl.x -= this.v * cl.v * dt;
        if (cl.x < -this.W * 0.3) { cl.x = this.W * 1.2; cl.y = rnd(0.1, 0.42); }
      }

      if (this.over) return;

      // It speeds up the whole time, so every run ends sooner or later.
      this.v += this.level.ramp * dt;
      this.dist += this.v * dt;

      // jumping
      if (!this.onGround) {
        if (this.holding && this.held < HOLD_MAX) {
          this.held += dt;
          this.vy += HOLD_EXTRA * dt;      // a longer press goes higher
        }
        this.vy -= GRAV * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0; this.vy = 0;
          this.onGround = true;
          this.leftGround = null;
        }
      } else if (this.wantJump >= 0 && this.t - this.wantJump < COYOTE) {
        this._tryJump();                    // she asked a moment too early
      }

      // obstacles
      this.next -= dt;
      if (this.next <= 0) {
        this.obstacles.push(this._make());
        // The gap is measured in time, not pixels, so speeding up does not
        // silently make it impossible.
        this.next = this.level.gap * rnd(0.85, 1.35) * (this.level.v0 / this.v) + 0.25;
      }
      for (i = this.obstacles.length - 1; i >= 0; i--) {
        o = this.obstacles[i];
        o.x -= this.v * dt;
        if (o.x < -this.size * 2) { this.obstacles.splice(i, 1); continue; }
        if (this._hits(o)) { this._crash(); return; }
      }

      this._render();
    },

    _make: function () {
      var flying = Math.random() < this.level.air;
      var s = this.size;
      return flying
        ? { fly: true, emoji: FLYERS[(Math.random() * FLYERS.length) | 0],
            x: this.W + s, y: this.groundY - s * rnd(1.25, 1.6), w: s * 0.8, h: s * 0.7,
            flap: rnd(0, 6.28) }
        : { fly: false, emoji: GROUND[(Math.random() * GROUND.length) | 0],
            x: this.W + s, y: this.groundY, w: s * rnd(0.6, 0.85), h: s * rnd(0.8, 1.1) };
    },

    // Generous on purpose: only the middle of each drawing actually collides,
    // so a near miss is a miss.
    _hits: function (o) {
      var s = this.size;
      var myW = s * 0.62 * GRACE;
      var myH = (this.ducking && this.onGround ? s * 0.5 : s * 0.9) * GRACE;
      var myX = this.runX, myY = this.groundY - this.y - myH / 2;

      var oW = o.w * GRACE, oH = o.h * GRACE;
      var oY = o.fly ? o.y : o.y - oH / 2;

      return Math.abs(myX - o.x) < (myW + oW) / 2 &&
             Math.abs(myY - oY) < (myH + oH) / 2;
    },

    _crash: function () {
      this.over = true;
      var score = Math.floor(this.dist / 10);
      global.RoarAudio.sfx('bust');
      if (score > this.best) {
        this.best = score;
        this.newBest = true;
        save(SAVED + this.level.id, String(this.best));
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#ffd24c', '#9df08a', '#7ec8ff', '#ffffff']); } catch (e) {}
      } else {
        this.newBest = false;
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(score, this.best, this.newBest);
    },

    score: function () { return Math.floor(this.dist / 10); },

    /* ── the screen around it ─────────────────────────────────── */

    _render: function () {
      var e = this.el;
      var score = this.score();
      if (e.score) e.score.textContent = score;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.level) e.level.textContent = this.level.emoji + ' ' + this.level.name;
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overScore) e.overScore.textContent = score;
          if (e.overWho) e.overWho.textContent = this.who.emoji;
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
      var gy = this.groundY, s = this.size;
      c.clearRect(0, 0, W, H);

      // sky
      var sky = c.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, '#2b1a52');
      sky.addColorStop(1, '#6a4a86');
      c.fillStyle = sky;
      c.fillRect(0, 0, W, gy);

      // clouds
      c.fillStyle = 'rgba(255,255,255,0.16)';
      for (var i = 0; i < this.clouds.length; i++) {
        var cl = this.clouds[i];
        var cw = s * 1.4 * cl.s, cy = cl.y * H;
        for (var p = 0; p < 3; p++) {
          c.beginPath();
          c.ellipse(cl.x + (p - 1) * cw * 0.35, cy + (p === 1 ? -cw * 0.08 : 0),
                    cw * 0.32, cw * 0.19, 0, 0, 6.2832);
          c.fill();
        }
      }

      // ground
      c.fillStyle = '#2d1f14';
      c.fillRect(0, gy, W, H - gy);
      c.strokeStyle = '#7a5b3a';
      c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke();
      // little stones scrolling past, which is what sells the speed
      c.fillStyle = 'rgba(255,255,255,0.16)';
      var scroll = (this.dist * 0.5) % 60;
      for (var g = -1; g < W / 60 + 1; g++) {
        var gx = g * 60 - scroll;
        c.fillRect(gx, gy + 12, 14, 2.5);
        c.fillRect(gx + 30, gy + 26, 9, 2.5);
      }

      this._puffsDraw(c);

      // obstacles
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (i = 0; i < this.obstacles.length; i++) {
        var o = this.obstacles[i];
        var bob = o.fly ? Math.sin(this.t * 9 + o.flap) * s * 0.10 : 0;
        c.font = (o.fly ? o.h * 1.5 : o.h * 1.35) + 'px ' + EMOJI;
        c.fillText(o.emoji, o.x, (o.fly ? o.y : o.y - o.h * 0.42) + bob);
      }

      this._runner(c);
    },

    _runner: function (c) {
      var s = this.size, gy = this.groundY;
      var x = this.runX, y = gy - this.y;
      var duck = this.ducking && this.onGround;
      // A little bounce on the ground and a lean in the air, so it is plainly
      // running rather than sliding along.
      var bounce = this.onGround && !this.over ? Math.abs(Math.sin(this.t * 14)) * s * 0.06 : 0;
      var tilt = this.onGround ? Math.sin(this.t * 14) * 0.06 : clamp(-this.vy / 2600, -0.3, 0.3);

      c.save();
      c.translate(x, y - bounce);
      c.rotate(this.over ? 0.5 : tilt);
      if (duck) c.scale(1.15, 0.62);
      c.font = (s * 1.15) + 'px ' + EMOJI;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.globalAlpha = this.over ? 0.75 : 1;
      c.fillText(this.who.emoji, 0, 0);
      c.restore();
    },

    _puffsDraw: function (c) {
      c.save();
      for (var i = 0; i < this.puffs.length; i++) {
        var p = this.puffs[i];
        c.globalAlpha = clamp(1 - p.age / p.life, 0, 1) * 0.5;
        c.fillStyle = '#d8cfc0';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, 6.2832); c.fill();
      }
      c.restore();
    }
  };

  RunGame.RUNNERS = RUNNERS;      // exposed for testing and for the pickers
  RunGame.LEVELS = LEVELS;
  global.RunGame = RunGame;
})(window);
