/*
 * fx.js — tiny particle helpers shared by both games.
 *   Burst    — reusable emitter drawn into any 2D context
 *   Confetti — fullscreen celebration on the results screen
 */
(function (global) {
  'use strict';

  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ── particle burst ───────────────────────────────────────────── */

  function Burst() { this.parts = []; }

  Burst.prototype.emit = function (x, y, count, colors, opts) {
    opts = opts || {};
    var speed = opts.speed || 340, life = opts.life || 0.75;
    var size = opts.size || 7, gravity = opts.gravity == null ? 520 : opts.gravity;
    for (var i = 0; i < count; i++) {
      var a = rand(0, Math.PI * 2), s = rand(speed * 0.25, speed);
      this.parts.push({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(life * 0.6, life), age: 0,
        r: rand(size * 0.5, size), g: gravity,
        rot: rand(0, 6.28), vr: rand(-9, 9),
        c: colors[(Math.random() * colors.length) | 0],
        square: Math.random() < 0.45
      });
    }
  };

  Burst.prototype.update = function (dt) {
    for (var i = this.parts.length - 1; i >= 0; i--) {
      var p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  };

  Burst.prototype.draw = function (ctx) {
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      var k = 1 - p.age / p.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      if (p.square) ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.5);
      else { ctx.beginPath(); ctx.arc(0, 0, p.r * k, 0, 6.2832); ctx.fill(); }
      ctx.restore();
    }
  };

  Burst.prototype.clear = function () { this.parts.length = 0; };

  /* ── fullscreen confetti ──────────────────────────────────────── */

  var Confetti = {
    canvas: null, ctx: null, bits: [], raf: 0, last: 0,

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(innerWidth * d);
      this.canvas.height = Math.floor(innerHeight * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    },

    start: function (colors) {
      var self = this;
      if (!self.canvas) {
        self.canvas = document.getElementById('confetti');
        if (!self.canvas) return;
        self.ctx = self.canvas.getContext('2d');
        addEventListener('resize', function () { if (self.raf) self._fit(); });
      }
      self._fit();
      self.canvas.classList.add('is-on');
      self.bits = [];
      for (var i = 0; i < 120; i++) {
        self.bits.push({
          x: rand(0, innerWidth), y: rand(-innerHeight, 0),
          vy: rand(90, 260), vx: rand(-45, 45),
          w: rand(7, 13), h: rand(9, 18),
          rot: rand(0, 6.28), vr: rand(-5, 5),
          c: colors[(Math.random() * colors.length) | 0],
          sway: rand(0.6, 2.2), phase: rand(0, 6.28)
        });
      }
      self.last = performance.now();
      cancelAnimationFrame(self.raf);
      self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;
      var c = self.ctx;
      c.clearRect(0, 0, innerWidth, innerHeight);

      for (var i = 0; i < self.bits.length; i++) {
        var b = self.bits[i];
        b.phase += dt * b.sway * 3;
        b.y += b.vy * dt;
        b.x += (b.vx + Math.sin(b.phase) * 40) * dt;
        b.rot += b.vr * dt;
        if (b.y > innerHeight + 30) { b.y = -20; b.x = rand(0, innerWidth); }
        c.save();
        c.translate(b.x, b.y);
        c.rotate(b.rot);
        c.fillStyle = b.c;
        c.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        c.restore();
      }
      self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    stop: function () {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.ctx) this.ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (this.canvas) this.canvas.classList.remove('is-on');
    }
  };

  global.Burst = Burst;
  global.Confetti = Confetti;
})(window);
