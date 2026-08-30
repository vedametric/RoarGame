/*
 * rocket.js — the launch
 *
 * Five right words builds a rocket in the spelling bee, and the fifth one
 * lights the engine. This is what happens next, and it is meant to be the
 * best thirty seconds of her day: the screen clears, the rocket is standing
 * on the pad, her own voice counts it down, the engine lights, the whole
 * phone shakes, and it goes — up through the clouds, out of the blue, into
 * the black, until the earth is a curve underneath it.
 *
 * It is a real flight rather than a picture that slides upwards: the rocket
 * has thrust, mass and speed, the smoke is thousands of particles pushed out
 * of the nozzle and left behind, and the sky is the sky it is actually in.
 */
(function (global) {
  'use strict';

  var PAD_Y = 0.74;          // where the pad sits, as a fraction of the screen
  var HOLD_Y = 0.42;         // once it climbs this high the camera goes with it

  // The flight, second by second. Everything below reads its state from here,
  // so the whole sequence can be re-timed in one place.
  var IGNITE = 3.4;          // engine lights
  var CLEAR = 4.0;           // and it leaves the pad
  var END = 11.5;            // curtain

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // #rrggbb → #rrggbb, mixed. The sky is one long blend from afternoon blue
  // to the black of space, so this does most of the flight's mood.
  function mix(a, b, k) {
    k = clamp(k, 0, 1);
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    return 'rgb(' +
      Math.round((pa >> 16 & 255) * (1 - k) + (pb >> 16 & 255) * k) + ',' +
      Math.round((pa >> 8 & 255) * (1 - k) + (pb >> 8 & 255) * k) + ',' +
      Math.round((pa & 255) * (1 - k) + (pb & 255) * k) + ')';
  }

  var Rocket = {
    running: false,

    /* cfg: { wrap, canvas, word, skip, onDone } */
    play: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');

      this.t = 0;
      this.alt = 0;             // metres off the pad
      this.vel = 0;             // metres per second
      this.shake = 0;
      this.smoke = [];
      this.sparks = [];
      this.clouds = [];
      this.stars = [];
      this.said = {};
      this.done = false;
      this.running = true;

      for (var i = 0; i < 150; i++) {
        this.stars.push({ x: Math.random(), y: Math.random(), r: rnd(0.4, 1.6),
                          tw: rnd(0, 6.28) });
      }
      // Cloud height in metres, so the rocket genuinely passes through them.
      for (i = 0; i < 14; i++) {
        this.clouds.push({ x: rnd(-0.2, 1.2), h: rnd(260, 2400),
                           w: rnd(0.28, 0.75), o: rnd(0.5, 0.95) });
      }

      cfg.wrap.hidden = false;
      if (cfg.word) cfg.word.textContent = '';
      this._fit();
      this._onResize = function () { self._fit(); };
      addEventListener('resize', this._onResize);

      // The engine: a real roar held for as long as it burns, rather than a
      // sound effect fired once and forgotten.
      this.air = global.RoarAudio.airLoop();

      this.last = performance.now();
      this.raf = requestAnimationFrame(function (t) { self._loop(t); });
      return this;
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      if (this.air) { try { this.air.stop(); } catch (e) {} this.air = null; }
      if (this.cfg && this.cfg.wrap) this.cfg.wrap.hidden = true;
      if (this.cfg && this.cfg.word) this.cfg.word.textContent = '';
    },

    // Tapping SKIP goes straight to the end. A five-year-old who has seen it
    // nine times today should not have to sit through the tenth.
    skip: function () {
      if (!this.running) return;
      this.t = END;
      this._finish();
    },

    _finish: function () {
      if (this.done) return;
      this.done = true;
      var cb = this.cfg && this.cfg.onDone;
      this.stop();
      if (cb) cb();
    },

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || innerWidth;
      this.H = this.canvas.clientHeight || innerHeight;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    },

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this._update(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    /* ── the flight ───────────────────────────────────────────── */

    _update: function (dt) {
      var self0 = this;
      var t = (this.t += dt);
      var say = global.Say;

      // the countdown, in whichever voice she has chosen
      this._once('ready', 0.15, function () {
        if (self0.cfg.word) {
          self0.cfg.word.textContent = 'GET READY!';
          self0.cfg.word.className = 'launch-word is-ready is-on';
        }
      });
      [[1.0, '3', 'n-3'], [1.8, '2', 'n-2'], [2.6, '1', 'n-1']].forEach(function (c) {
        self0._once(c[1], c[0], function () {
          if (self0.cfg.word) {
            self0.cfg.word.textContent = c[1];
            self0.cfg.word.className = 'launch-word is-count';
            void self0.cfg.word.offsetWidth;              // restart the pop
            self0.cfg.word.className = 'launch-word is-count is-on';
          }
          if (say) say.line(c[2], c[1]);
          global.RoarAudio.sfx('tick');
        });
      });

      this._once('ignite', IGNITE, function () {
        if (self0.cfg.word) {
          self0.cfg.word.textContent = 'LIFT OFF!';
          self0.cfg.word.className = 'launch-word is-liftoff is-on';
        }
        if (say) say.line('m-liftoff', 'Lift off!');
        global.RoarAudio.sfx('thunder');
        // Ignition is not a fade-in. The instant it lights, a wall of smoke
        // comes out sideways from under the pad — so it starts with a burst
        // rather than waiting for the per-frame trickle to build one.
        self0._burst(150);
      });
      this._once('clear', CLEAR + 2.2, function () {
        if (self0.cfg.word) self0.cfg.word.className = 'launch-word is-gone';
      });
      this._once('space', 9.4, function () {
        if (self0.cfg.word) {
          self0.cfg.word.textContent = '🌍 SPACE!';
          self0.cfg.word.className = 'launch-word is-space is-on';
        }
        global.RoarAudio.sfx('win');
      });

      /* thrust — the engine builds before it can lift its own weight, which
         is why a real rocket sits still for a moment in all that fire */
      var burn = clamp((t - IGNITE) / 0.6, 0, 1);
      if (t >= CLEAR) {
        // It gets lighter as it burns, so it keeps accelerating all the way up.
        var thrust = 26 + Math.min(150, (t - CLEAR) * 34);
        this.vel += thrust * dt;
        this.alt += this.vel * dt;
      }

      // The shake is worst at ignition, when it is straining against the pad.
      this.shake = burn * (t < CLEAR ? 1 : Math.max(0, 1 - (t - CLEAR) / 3.5)) * 9;

      if (this.air) {
        this.air.setBurner(burn);
        this.air.setWind(burn * clamp(this.vel / 90, 0, 1) * 0.9);
      }

      this._smoke(dt, burn);

      if (t >= END) this._finish();
    },

    _once: function (key, at, fn) {
      if (this.t >= at && !this.said[key]) { this.said[key] = 1; fn(); }
    },

    // Where the rocket is on screen. It climbs off the pad first, and once it
    // is a third of the way up the camera goes with it and the world falls
    // away instead — the same trick every launch broadcast uses.
    _rocketY: function () {
      var padY = this.H * PAD_Y, holdY = this.H * HOLD_Y;
      var climb = this.alt * (this.H / 260);          // pixels per metre, at first
      return Math.max(holdY, padY - climb);
    },

    // How far the world has scrolled underneath it, in metres.
    _camAlt: function () {
      var padY = this.H * PAD_Y, holdY = this.H * HOLD_Y;
      var reach = (padY - holdY) / (this.H / 260);
      return Math.max(0, this.alt - reach);
    },

    /* ── the exhaust ──────────────────────────────────────────────
       Not a picture of smoke: particles pushed out of the nozzle at speed,
       which spread, slow, billow outwards and are left behind. On the pad
       they hit the ground and roll sideways, which is the shape everyone
       recognises even if they have never thought about why. */

    // A lot of smoke at once, thrown wide and low, the way it comes off a pad.
    _burst: function (n) {
      var rx = this.W / 2, ry = this._rocketY() + this._scale() * 1.35;
      for (var i = 0; i < n; i++) {
        var a = rnd(0, 6.2832);
        this.smoke.push({
          x: rx + Math.cos(a) * rnd(0, 14), y: ry + rnd(-4, 10),
          vx: Math.cos(a) * rnd(60, 340), vy: rnd(40, 260),
          r: rnd(10, 26), grow: rnd(40, 90),
          life: rnd(1.4, 2.8), age: 0, hot: 1, pad: true
        });
      }
    },

    _smoke: function (dt, burn) {
      var i, p;
      if (burn > 0.05 && this.smoke.length < 420) {
        var n = Math.round(burn * 260 * dt);
        var rx = this.W / 2, ry = this._rocketY() + this._scale() * 1.35;
        var onPad = this.t < CLEAR + 0.7;
        for (i = 0; i < n; i++) {
          this.smoke.push({
            x: rx + rnd(-4, 4), y: ry + rnd(-2, 6),
            vx: rnd(-30, 30), vy: rnd(90, 220),
            r: rnd(6, 16), grow: rnd(26, 62),
            life: rnd(1.1, 2.4), age: 0,
            hot: 1, pad: onPad
          });
        }
        for (i = 0; i < Math.round(burn * 26 * dt * 6); i++) {
          this.sparks.push({
            x: rx + rnd(-3, 3), y: ry,
            vx: rnd(-90, 90), vy: rnd(150, 420),
            life: rnd(0.25, 0.7), age: 0
          });
        }
      }

      var ground = this.H * PAD_Y + this._scale() * 1.6;
      for (i = this.smoke.length - 1; i >= 0; i--) {
        p = this.smoke[i];
        p.age += dt;
        if (p.age > p.life) { this.smoke.splice(i, 1); continue; }
        // Billowing: it slows down fast and swells as it cools.
        p.vx *= Math.exp(-1.3 * dt);
        p.vy *= Math.exp(-1.9 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.grow * dt;
        p.hot = Math.max(0, p.hot - dt * 2.4);
        // On the pad it hits the deck and rolls out sideways.
        if (p.pad && p.y > ground) {
          p.y = ground;
          p.vy *= -0.12;
          p.vx += (p.x < this.W / 2 ? -1 : 1) * 220 * dt;
        }
        // Once the rocket is climbing, the smoke it left behind falls away
        // with the rest of the world.
        if (this.t > CLEAR) p.y += this.vel * (this.H / 260) * dt * 0.55;
      }
      for (i = this.sparks.length - 1; i >= 0; i--) {
        p = this.sparks[i];
        p.age += dt;
        if (p.age > p.life) { this.sparks.splice(i, 1); continue; }
        p.vy += 260 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },

    _scale: function () { return Math.min(this.W, this.H) * 0.075; },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      var camAlt = this._camAlt();

      c.save();
      if (this.shake > 0.1) {
        c.translate(rnd(-this.shake, this.shake), rnd(-this.shake, this.shake));
      }

      this._sky(c, W, H, camAlt);
      this._stars(c, W, H, camAlt);
      this._clouds(c, W, H, camAlt);
      this._ground(c, W, H, camAlt);
      this._smokeDraw(c);
      this._rocket(c, W, H);
      this._sparkDraw(c);
      c.restore();

      this._hud(c, W, H);

      // fade in at the start and out at the end, so it never snaps
      var fade = Math.min(clamp(this.t / 0.4, 0, 1), clamp((END - this.t) / 0.6, 0, 1));
      if (fade < 1) {
        c.fillStyle = 'rgba(9,4,22,' + (1 - fade) + ')';
        c.fillRect(0, 0, W, H);
      }
    },

    // Afternoon blue at the pad, deepening as it climbs, black by 3 km.
    _sky: function (c, W, H, alt) {
      var k = clamp(alt / 1500, 0, 1);
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, mix('#2f7fd8', '#01010a', Math.min(1, k * 1.3)));
      g.addColorStop(0.55, mix('#8fc9f5', '#04040f', k));
      g.addColorStop(1, mix('#dff0ff', '#0a0a18', k));
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    },

    _stars: function (c, W, H, alt) {
      var a = clamp((alt - 400) / 900, 0, 1);
      if (a <= 0) return;
      c.save();
      for (var i = 0; i < this.stars.length; i++) {
        var s = this.stars[i];
        c.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(this.t * 1.6 + s.tw)));
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(s.x * W, ((s.y * H * 3 + alt * 0.05) % (H * 1.2)) - H * 0.1, s.r, 0, 6.2832);
        c.fill();
      }
      c.restore();
    },

    // Real clouds at real heights, so going through one means something.
    _clouds: function (c, W, H, alt) {
      c.save();
      for (var i = 0; i < this.clouds.length; i++) {
        var cl = this.clouds[i];
        // Screen position from the height difference: above you until you
        // reach it, below you once you are past.
        var y = H * HOLD_Y + (alt - cl.h) * (H / 260) * 0.85;
        if (y < -H * 0.4 || y > H * 1.4) continue;
        var w = cl.w * W, near = clamp(1 - Math.abs(alt - cl.h) / 1400, 0.25, 1);
        c.globalAlpha = cl.o * near;
        c.fillStyle = '#ffffff';
        for (var p = 0; p < 5; p++) {
          var px = cl.x * W + (p - 2) * w * 0.22;
          var pr = w * (0.16 + 0.08 * Math.sin(p * 2.1 + i));
          c.beginPath();
          c.ellipse(px, y + Math.sin(p * 1.7 + i) * w * 0.05, pr, pr * 0.62, 0, 0, 6.2832);
          c.fill();
        }
      }
      c.restore();
    },

    // The pad, and then the whole country falling away below it.
    _ground: function (c, W, H, alt) {
      var y = H * PAD_Y + alt * (H / 260) * 0.85;
      if (y > H * 1.3) return;
      c.save();

      // ground
      var g = c.createLinearGradient(0, y, 0, H);
      g.addColorStop(0, '#5c7040');
      g.addColorStop(1, '#22331f');
      c.fillStyle = g;
      c.fillRect(0, y, W, H - y + 2);

      // From high up it is a curve rather than a line, and that is the moment
      // it stops being a field and starts being the earth.
      var bend = clamp(alt / 1800, 0, 1);
      if (bend > 0.05) {
        c.beginPath();
        c.moveTo(0, y);
        c.quadraticCurveTo(W / 2, y - H * 0.30 * bend, W, y);
        c.lineTo(W, y - 2); c.lineTo(0, y - 2);
        c.closePath();
        c.fillStyle = mix('#5c7040', '#2f7fd8', bend * 0.6);
        c.fill();
      }

      // the pad itself, only while it is still worth drawing
      if (alt < 400) {
        var s = this._scale();
        c.fillStyle = '#4a4a55';
        c.fillRect(W / 2 - s * 1.5, y - s * 0.22, s * 3, s * 0.22);
        c.fillStyle = '#6a6a78';
        c.fillRect(W / 2 - s * 1.5, y - s * 0.26, s * 3, s * 0.06);
        // the gantry, stood off to one side
        c.strokeStyle = '#7c7c8c';
        c.lineWidth = Math.max(2, s * 0.09);
        c.beginPath();
        c.moveTo(W / 2 + s * 1.25, y - s * 0.26);
        c.lineTo(W / 2 + s * 1.25, y - s * 3.1);
        c.moveTo(W / 2 + s * 1.25, y - s * 2.9);
        c.lineTo(W / 2 + s * 0.6, y - s * 2.9);
        c.stroke();
      }
      c.restore();
    },

    _smokeDraw: function (c) {
      c.save();
      for (var i = 0; i < this.smoke.length; i++) {
        var p = this.smoke[i];
        var k = 1 - p.age / p.life;
        c.globalAlpha = clamp(k * 0.75, 0, 0.75);
        // It leaves the nozzle glowing and cools to grey within a moment.
        c.fillStyle = p.hot > 0.05
          ? mix('#ffd9a0', '#dcdce4', 1 - p.hot)
          : 'rgb(' + Math.round(198 + k * 40) + ',' + Math.round(198 + k * 40) + ',210)';
        c.beginPath();
        c.arc(p.x, p.y, p.r, 0, 6.2832);
        c.fill();
      }
      c.restore();
    },

    _sparkDraw: function (c) {
      c.save();
      for (var i = 0; i < this.sparks.length; i++) {
        var p = this.sparks[i];
        c.globalAlpha = clamp(1 - p.age / p.life, 0, 1);
        c.fillStyle = '#ffd24c';
        c.fillRect(p.x, p.y, 2.4, 2.4);
      }
      c.restore();
    },

    /* The rocket: the same five pieces she built, drawn full size. */
    _rocket: function (c, W, H) {
      var s = this._scale();
      var x = W / 2, y = this._rocketY();
      var burn = clamp((this.t - IGNITE) / 0.5, 0, 1);

      c.save();
      c.translate(x, y);

      /* flame, under everything, flickering hard */
      if (burn > 0.02) {
        var len = s * (1.4 + burn * 2.6) * rnd(0.82, 1.18);
        var wid = s * 0.36 * burn;
        c.save();
        c.globalCompositeOperation = 'lighter';
        [[len, wid, 'rgba(255,140,30,0.85)'],
         [len * 0.66, wid * 0.66, 'rgba(255,214,90,0.9)'],
         [len * 0.34, wid * 0.38, 'rgba(255,255,235,0.95)']].forEach(function (f) {
          c.fillStyle = f[2];
          c.beginPath();
          c.moveTo(-f[1], s * 1.3);
          c.quadraticCurveTo(0, s * 1.3 + f[0] * 0.55, 0, s * 1.3 + f[0]);
          c.quadraticCurveTo(0, s * 1.3 + f[0] * 0.55, f[1], s * 1.3);
          c.closePath();
          c.fill();
        });
        // and the light it throws on everything near it
        var glow = c.createRadialGradient(0, s * 1.4, s * 0.1, 0, s * 1.4, s * 4);
        glow.addColorStop(0, 'rgba(255,170,60,' + (0.45 * burn) + ')');
        glow.addColorStop(1, 'rgba(255,170,60,0)');
        c.fillStyle = glow;
        c.beginPath(); c.arc(0, s * 1.4, s * 4, 0, 6.2832); c.fill();
        c.restore();
      }

      /* body */
      c.fillStyle = '#f4f1ff';
      c.beginPath();
      c.moveTo(0, -s * 1.35);
      c.bezierCurveTo(s * 0.72, -s * 0.55, s * 0.80, s * 0.35, s * 0.80, s * 1.05);
      c.lineTo(-s * 0.80, s * 1.05);
      c.bezierCurveTo(-s * 0.80, s * 0.35, -s * 0.72, -s * 0.55, 0, -s * 1.35);
      c.closePath();
      c.fill();
      // the shading down one side that makes it a tube and not a sticker
      var side = c.createLinearGradient(-s * 0.8, 0, s * 0.8, 0);
      side.addColorStop(0, 'rgba(20,10,44,0.30)');
      side.addColorStop(0.38, 'rgba(255,255,255,0.35)');
      side.addColorStop(1, 'rgba(20,10,44,0.34)');
      c.fillStyle = side;
      c.fill();

      /* nose cone */
      c.fillStyle = '#e8542f';
      c.beginPath();
      c.moveTo(0, -s * 2.05);
      c.bezierCurveTo(s * 0.34, -s * 1.72, s * 0.5, -s * 1.5, s * 0.52, -s * 1.3);
      c.lineTo(-s * 0.52, -s * 1.3);
      c.bezierCurveTo(-s * 0.5, -s * 1.5, -s * 0.34, -s * 1.72, 0, -s * 2.05);
      c.closePath();
      c.fill();

      /* fins */
      c.fillStyle = '#e8542f';
      [-1, 1].forEach(function (d) {
        c.beginPath();
        c.moveTo(d * s * 0.76, s * 0.25);
        c.lineTo(d * s * 1.5, s * 1.25);
        c.lineTo(d * s * 0.78, s * 1.05);
        c.closePath();
        c.fill();
      });

      /* window */
      c.fillStyle = '#2b6ea8';
      c.beginPath(); c.arc(0, -s * 0.45, s * 0.34, 0, 6.2832); c.fill();
      c.fillStyle = '#7fd0ff';
      c.beginPath(); c.arc(0, -s * 0.45, s * 0.25, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath(); c.arc(-s * 0.09, -s * 0.54, s * 0.08, 0, 6.2832); c.fill();

      /* engine */
      c.fillStyle = '#6b5a86';
      c.beginPath();
      c.moveTo(-s * 0.46, s * 1.05);
      c.lineTo(s * 0.46, s * 1.05);
      c.lineTo(s * 0.34, s * 1.32);
      c.lineTo(-s * 0.34, s * 1.32);
      c.closePath();
      c.fill();

      c.restore();
    },

    // The one number that makes it a flight rather than an animation.
    _hud: function (c, W, H) {
      if (this.t < CLEAR) return;
      var m = Math.round(this.alt);
      c.save();
      c.globalAlpha = clamp((this.t - CLEAR) / 0.5, 0, 1) *
                      clamp((END - this.t) / 0.6, 0, 1);
      c.textAlign = 'center';
      c.font = '900 15px system-ui, sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText((m > 999 ? (m / 1000).toFixed(1) + ' km' : m + ' m') + ' up', W / 2, H - 26);
      c.restore();
    }
  };

  Rocket.END = END;
  global.RocketLaunch = Rocket;
})(window);
