/*
 * game-slice.js — "SLICE IT!"
 *
 * Fruit are lobbed up from the bottom of the screen; drag a finger through
 * them to slice them in half. Each fruit is drawn in code — a coloured ball
 * with a shine and a little leaf — so when it is cut it can fall apart into
 * two real halves, flesh-side showing, rather than an emoji that can only
 * ever be whole. A burst of juice in the fruit's own colour goes with it.
 *
 * Nothing to lose here — no bombs, no lives, no game over. Letting fruit
 * fall past you costs nothing, so a small child hacking wildly at the
 * screen still has a wonderful time and just keeps racking up a score.
 *
 * It speeds up as the score climbs: fruit come faster and, now and then, a
 * whole fistful at once, which is where the big combo scores come from —
 * catch several in one sweep and each one past the first is worth double.
 */
(function (global) {
  'use strict';

  var SAVED = 'slice.best';
  var TAU = Math.PI * 2;

  // Each fruit is a rind colour and a flesh colour, plus a leaf on top.
  var FRUIT = [
    { rind: '#ff5b5b', flesh: '#ffe1c2', seed: '#7a2f2f', leaf: true },   // apple
    { rind: '#ff9f1c', flesh: '#ffd27f', seed: '#e07b00', leaf: true },   // orange
    { rind: '#ffe14d', flesh: '#fff6c0', seed: '#c9a400', leaf: false },  // lemon
    { rind: '#6ec531', flesh: '#e6f7c8', seed: '#3f7a12', leaf: false },  // lime
    { rind: '#3fbf6f', flesh: '#ff5b7a', seed: '#2a1414', leaf: true },   // watermelon
    { rind: '#9b5de5', flesh: '#e6d2ff', seed: '#5b2c9c', leaf: true },   // grape
    { rind: '#4a7bff', flesh: '#bcd0ff', seed: '#2440a0', leaf: false },  // blueberry
    { rind: '#ff7ab0', flesh: '#ffe0ec', seed: '#c23f78', leaf: true }    // plum
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Shortest distance from point (px,py) to the segment (ax,ay)-(bx,by):
  // this is what turns a finger's path into a blade.
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var cx = ax + t * dx, cy = ay + t * dy;
    var ex = px - cx, ey = py - cy;
    return Math.sqrt(ex * ex + ey * ey);
  }

  var SliceGame = {
    running: false,
    FRUIT: FRUIT,

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

    setPaused: function (on) {
      this.paused = !!on;
      this.blade = [];
      this.slicing = false;
      this.last = performance.now();
    },

    _newGame: function () {
      this.score = 0;
      this.fruits = [];      // whole fruit still in the air
      this.halves = [];      // sliced-off pieces falling away
      this.juice = [];       // particles
      this.pops = [];        // "+N" score flags floating up
      this.blade = [];       // recent finger points, newest last
      this.slicing = false;
      this.combo = 0;        // fruit cut in the current swipe
      this.newBest = false;
      this.time = 0;
      this.nextSpawn = 0.6;
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
      this.R = Math.min(this.W, this.H) * 0.085;   // a fruit's radius
      this.g = this.H * 2.0;                        // gravity, in px/s²
    },

    /* ── the blade ────────────────────────────────────────────── */

    _bind: function () {
      var self = this;
      function at(e) {
        var r = self.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
      this._down = function (e) {
        if (!self.running || self.paused) return;
        e.preventDefault();
        try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        var p = at(e);
        self.slicing = true;
        self.combo = 0;
        self.blade = [{ x: p.x, y: p.y, t: performance.now() }];
      };
      this._move = function (e) {
        if (!self.slicing) return;
        e.preventDefault();
        var p = at(e), b = self.blade, n = b.length;
        if (n) self._cut(b[n - 1].x, b[n - 1].y, p.x, p.y);
        b.push({ x: p.x, y: p.y, t: performance.now() });
        if (b.length > 24) b.shift();
      };
      this._up = function (e) {
        if (!self.slicing) return;
        e.preventDefault();
        self.slicing = false;
        self.combo = 0;
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      this.canvas.addEventListener('pointerup', this._up, { passive: false });
      this.canvas.addEventListener('pointercancel', this._up, { passive: false });
    },

    _unbind: function () {
      if (!this._down) return;
      this.canvas.removeEventListener('pointerdown', this._down);
      this.canvas.removeEventListener('pointermove', this._move);
      this.canvas.removeEventListener('pointerup', this._up);
      this.canvas.removeEventListener('pointercancel', this._up);
      this._down = this._move = this._up = null;
    },

    // The blade moved from (ax,ay) to (bx,by): slice anything it crossed.
    _cut: function (ax, ay, bx, by) {
      if (this.paused) return;
      for (var i = this.fruits.length - 1; i >= 0; i--) {
        var f = this.fruits[i];
        if (segDist(f.x, f.y, ax, ay, bx, by) <= f.r) {
          this.fruits.splice(i, 1);
          this._slice(f, ax, ay, bx, by);
        }
      }
    },

    _slice: function (f, ax, ay, bx, by) {
      this.combo++;
      var gain = this.combo > 1 ? 2 : 1;     // every fruit past the first in a
      this.score += gain;                     // single sweep is worth double
      if (this.score > this.best) { this.best = this.score; this.newBest = true; save(SAVED, String(this.best)); }

      // The two halves fly apart along the perpendicular of the cut.
      var ang = Math.atan2(by - ay, bx - ax);
      var nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
      var spd = this.H * 0.28;
      for (var s = -1; s <= 1; s += 2) {
        this.halves.push({
          x: f.x, y: f.y,
          vx: f.vx * 0.4 + nx * spd * s, vy: f.vy * 0.4 + ny * spd * s - this.H * 0.05,
          r: f.r, rind: f.type.rind, flesh: f.type.flesh, seed: f.type.seed,
          rot: ang + Math.PI / 2 + (s < 0 ? Math.PI : 0), vr: rand(-6, 6), life: 1.4
        });
      }
      for (var j = 0; j < 14; j++) {
        var a = rand(0, TAU), v = rand(0.1, 1) * this.H * 0.22;
        this.juice.push({ x: f.x, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: rand(2, 6), c: f.type.flesh, life: rand(0.4, 0.8), age: 0 });
      }
      this.pops.push({ x: f.x, y: f.y, n: gain, t: 0 });
      global.RoarAudio.sfx(gain > 1 ? 'gold' : 'nom');
    },

    /* ── throwing fruit ───────────────────────────────────────── */

    _spawn: function () {
      // Faster, and bigger handfuls, as the score climbs.
      var pace = Math.min(1, this.score / 60);
      var wave = 1 + ((Math.random() < 0.25 + pace * 0.4) ? 1 : 0) + ((Math.random() < pace * 0.5) ? 1 : 0);
      for (var i = 0; i < wave; i++) this._throw();
      this.nextSpawn = rand(0.75, 1.15) * (1 - pace * 0.55);
    },

    _throw: function () {
      var x = rand(this.W * 0.16, this.W * 0.84);
      var rise = rand(0.62, 0.82) * this.H;                 // how high it should reach
      var vy = -Math.sqrt(2 * this.g * rise);
      var vx = (this.W * 0.5 - x) * rand(0.5, 1.1) + rand(-0.12, 0.12) * this.W;
      this.fruits.push({
        x: x, y: this.H + this.R, vx: vx, vy: vy,
        r: this.R * rand(0.9, 1.12),
        rot: rand(0, TAU), vr: rand(-2, 2),
        type: pick(FRUIT)
      });
    },

    /* ── the loop ─────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this._step(dt);
      this._draw(now);
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _step: function (dt) {
      var i, o;
      this.time += dt;

      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0) this._spawn();

      for (i = this.fruits.length - 1; i >= 0; i--) {
        o = this.fruits[i];
        o.vy += this.g * dt;
        o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
        if (o.y - o.r > this.H && o.vy > 0) this.fruits.splice(i, 1);   // fell away
      }
      for (i = this.halves.length - 1; i >= 0; i--) {
        o = this.halves[i];
        o.vy += this.g * dt;
        o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
        o.life -= dt;
        if (o.y - o.r > this.H || o.life <= 0) this.halves.splice(i, 1);
      }
      for (i = this.juice.length - 1; i >= 0; i--) {
        o = this.juice[i];
        o.age += dt; o.vy += this.g * 0.5 * dt;
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (o.age >= o.life) this.juice.splice(i, 1);
      }
      for (i = this.pops.length - 1; i >= 0; i--) {
        this.pops[i].t += dt;
        if (this.pops[i].t > 0.8) this.pops.splice(i, 1);
      }
      // Blade points older than a breath fade off the tail.
      var cut = performance.now() - 110;
      while (this.blade.length && this.blade[0].t < cut) this.blade.shift();
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function (now) {
      var c = this.ctx, W = this.W, H = this.H, i;
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#0d1b2e';
      c.fillRect(0, 0, W, H);

      for (i = 0; i < this.juice.length; i++) {
        var j = this.juice[i];
        c.globalAlpha = Math.max(0, 1 - j.age / j.life);
        c.fillStyle = j.c;
        c.beginPath(); c.arc(j.x, j.y, j.r, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;

      for (i = 0; i < this.halves.length; i++) this._half(c, this.halves[i]);
      for (i = 0; i < this.fruits.length; i++) this._fruit(c, this.fruits[i]);

      for (i = 0; i < this.pops.length; i++) {
        var p = this.pops[i];
        c.globalAlpha = Math.max(0, 1 - p.t / 0.8);
        c.fillStyle = p.n > 1 ? '#ffd24c' : '#fff';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '900 ' + Math.round(this.R * 0.7) + 'px system-ui, sans-serif';
        c.fillText('+' + p.n, p.x, p.y - p.t * this.H * 0.18);
      }
      c.globalAlpha = 1;

      this._blade(c);
    },

    _fruit: function (c, f) {
      c.save();
      c.translate(f.x, f.y);
      c.rotate(f.rot);
      var r = f.r;
      c.fillStyle = f.type.rind;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      // a soft shine, top-left
      var g = c.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.05, -r * 0.35, -r * 0.35, r * 1.1);
      g.addColorStop(0, 'rgba(255,255,255,.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      if (f.type.leaf) {
        c.fillStyle = '#3fae4a';
        c.beginPath();
        c.ellipse(r * 0.18, -r * 0.95, r * 0.28, r * 0.14, -0.6, 0, TAU);
        c.fill();
        c.strokeStyle = '#6b3f1d'; c.lineWidth = Math.max(2, r * 0.09);
        c.beginPath(); c.moveTo(0, -r * 0.8); c.lineTo(-r * 0.06, -r * 1.02); c.stroke();
      }
      c.restore();
    },

    // A cut piece: rind on the round edge, flesh across the flat face, a few seeds.
    _half: function (c, h) {
      c.save();
      c.globalAlpha = Math.max(0, Math.min(1, h.life));
      c.translate(h.x, h.y);
      c.rotate(h.rot);
      var r = h.r;
      c.fillStyle = h.rind;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI); c.closePath(); c.fill();
      c.fillStyle = h.flesh;
      c.beginPath(); c.arc(0, 0, r * 0.84, 0, Math.PI); c.closePath(); c.fill();
      c.fillStyle = h.seed;
      for (var s = -1; s <= 1; s++) {
        c.beginPath(); c.arc(s * r * 0.32, r * 0.42, Math.max(1.5, r * 0.06), 0, TAU); c.fill();
      }
      c.restore();
    },

    _blade: function (c) {
      var b = this.blade;
      if (b.length < 2) return;
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      for (var i = 1; i < b.length; i++) {
        var k = i / b.length;
        c.strokeStyle = 'rgba(255,255,255,' + (0.15 + k * 0.75) + ')';
        c.lineWidth = k * this.R * 0.5 + 1;
        c.beginPath();
        c.moveTo(b[i - 1].x, b[i - 1].y);
        c.lineTo(b[i].x, b[i].y);
        c.stroke();
      }
      c.restore();
    }
  };

  SliceGame.segDist = segDist;      // exposed for testing
  global.SliceGame = SliceGame;
})(window);
