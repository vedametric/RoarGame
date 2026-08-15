/*
 * game-balloon.js — "THE HOT AIR BALLOON"
 *                    a game by Sienna 🦄
 *
 * You are standing in the basket at sunset. The envelope is above your head,
 * the ropes run past your shoulders, and the world falls away in front of you.
 * Six buttons fly it: left, right, forward, back, up, down.
 *
 * Out there you will find food, clouds and unicorns — fly into them (or tap
 * them) to collect. Birds are NOT for collecting; bump one and you lose points
 * and it flaps away startled. Drop all the way down and you land.
 *
 * The world is drawn with a plain perspective projection: everything lives at
 * a world (x, y, z), and screen position is just that divided by depth. No 3D
 * library, no assets — the sky, mountains, fields and balloon are all painted.
 */
(function (global) {
  'use strict';

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  var FOOD = ['🍎', '🍌', '🍰', '🍪', '🍇', '🥕', '🍩', '🍓'];
  var GROUND_LIFE = ['🐄', '🐑', '🐎', '🦌', '🐘', '🦒', '🐖', '🐐'];

  var ACC = 34;              // how hard a button pushes
  var DAMP = 1.7;            // drag, so it always drifts to a stop
  var MAX_ALT = 460;
  var EYE = 3;               // basket floor above the ground
  var NEAR = 10;
  var FAR = 900;
  var GRID = 44;             // field size on the ground
  var SPIN = 0.55;           // how much the burner twists you round

  var POINTS = { food: 10, cloud: 5, unicorn: 25, bird: -10, land: 50 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  var BalloonGame = {
    running: false,

    start: function (cfg) {
      var self = this;
      self.cfg = cfg;
      self.canvas = cfg.canvas;
      self.ctx = self.canvas.getContext('2d');

      self.camX = 0; self.alt = 120; self.camZ = 0;
      self.vx = 0; self.vy = 0; self.vz = 0;
      self.yaw = 0; self.yawVel = 0;
      self.cosY = 1; self.sinY = 0;
      self.drag = null;
      self.hold = { left: 0, right: 0, fwd: 0, back: 0, up: 0, down: 0 };

      self.score = 0;
      self.collected = { food: 0, cloud: 0, unicorn: 0 };
      self.landed = false;
      self.landedOnce = false;
      self.burner = 0;
      self.sway = 0;
      self.t = 0;
      self.msg = null;
      self.floaters = [];
      self.things = [];
      self.ground = [];
      self.running = true;
      self.air = global.RoarAudio.airLoop();

      for (var i = 0; i < 34; i++) self.things.push(self._make(true));
      for (i = 0; i < 26; i++) self.ground.push(self._makeGround(true));

      self._onResize = function () { self._fit(); };
      addEventListener('resize', self._onResize);
      self._fit();
      self._bind();

      // Nobody discovers dragging on their own.
      self._say('Drag the sky to look around 👆', '#ffe89a');
      self.msg.life = 5;

      self.last = performance.now();
      self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._unbind();
      if (this.air) { this.air.stop(); this.air = null; }
    },

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || innerWidth;
      this.H = this.canvas.clientHeight || innerHeight;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this.f = this.W * 0.95;              // focal length
      this.hz = this.H * 0.46;             // horizon
    },

    /* ── controls ─────────────────────────────────────────────── */

    _bind: function () {
      var self = this;
      this.btns = [];
      var wrap = this.cfg.controls;
      if (!wrap) return;

      var press = function (key, on) {
        return function (e) {
          self.hold[key] = on ? 1 : 0;
          if (on && key === 'up') self._fireBurner();
          e.preventDefault();
        };
      };

      var list = wrap.querySelectorAll('[data-dir]');
      for (var i = 0; i < list.length; i++) {
        var el = list[i], key = el.getAttribute('data-dir');
        var dn = press(key, true), up = press(key, false);
        el.addEventListener('pointerdown', dn, { passive: false });
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('pointerleave', up);
        this.btns.push({ el: el, dn: dn, up: up });
      }

      // Drag anywhere in the sky to look around, all the way round if you
      // like. A press that barely moves is a grab instead.
      this._down2 = function (e) {
        self.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      };
      this._move2 = function (e) {
        var d = self.drag;
        if (!d || d.id !== e.pointerId) return;
        var dx = e.clientX - d.x;
        d.moved += Math.abs(dx) + Math.abs(e.clientY - d.y);
        self.yaw -= dx * 0.005;
        self.yawVel *= 0.5;                 // your hand overrides any spin
        d.x = e.clientX; d.y = e.clientY;
        e.preventDefault();
      };
      this._up2 = function (e) {
        var d = self.drag;
        if (!d || d.id !== e.pointerId) return;
        if (d.moved < 12) self._pickAt(e.clientX, e.clientY);
        self.drag = null;
      };

      this.canvas.addEventListener('pointerdown', this._down2);
      this.canvas.addEventListener('pointermove', this._move2, { passive: false });
      this.canvas.addEventListener('pointerup', this._up2);
      this.canvas.addEventListener('pointercancel', this._up2);
    },

    _unbind: function () {
      for (var i = 0; this.btns && i < this.btns.length; i++) {
        var b = this.btns[i];
        b.el.removeEventListener('pointerdown', b.dn);
        b.el.removeEventListener('pointerup', b.up);
        b.el.removeEventListener('pointercancel', b.up);
        b.el.removeEventListener('pointerleave', b.up);
      }
      this.btns = [];
      if (this._down2) {
        this.canvas.removeEventListener('pointerdown', this._down2);
        this.canvas.removeEventListener('pointermove', this._move2);
        this.canvas.removeEventListener('pointerup', this._up2);
        this.canvas.removeEventListener('pointercancel', this._up2);
      }
    },

    _fireBurner: function () {
      this.burner = 1;
      global.RoarAudio.sfx('burner');
    },

    _pickAt: function (cx, cy) {
      var r = this.canvas.getBoundingClientRect();
      var px = cx - r.left, py = cy - r.top;
      var bestI = -1, bestD = 60;

      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        if (!o.on || o.kind === 'bird') continue;
        var p = this._project(o.x, o.y, o.z);
        if (!p) continue;
        var d = Math.hypot(p.sx - px, p.sy - py);
        if (d < Math.max(bestD, p.size * 0.7) && d < bestD * 2.2) { bestD = d; bestI = i; }
      }
      if (bestI >= 0) this._take(this.things[bestI], true);
    },

    /* ── world ────────────────────────────────────────────────── */

    _make: function (spread) {
      var r = Math.random();
      var kind = r < 0.30 ? 'food' : r < 0.58 ? 'cloud' : r < 0.76 ? 'unicorn' : 'bird';
      var ang = (this.yaw || 0) + rnd(-1.25, 1.25);
      var dist = spread ? rnd(140, FAR * 0.95) : rnd(FAR * 0.55, FAR * 0.95);
      var o = {
        kind: kind, on: true,
        x: (this.camX || 0) + Math.sin(ang) * dist,
        z: (this.camZ || 0) + Math.cos(ang) * dist,
        drift: rnd(-9, 9),
        bobT: rnd(0, 6.28),
        flap: rnd(0, 6.28)
      };
      if (kind === 'cloud') { o.y = rnd(150, 430); o.size = rnd(55, 105); o.puffs = 4 + ((Math.random() * 3) | 0); }
      else if (kind === 'food') { o.y = rnd(18, 190); o.size = 26; o.emoji = FOOD[(Math.random() * FOOD.length) | 0]; }
      else if (kind === 'unicorn') { o.y = rnd(50, 240); o.size = 34; o.emoji = '🦄'; o.drift = rnd(-22, 22); }
      else { o.y = rnd(70, 340); o.size = 20; o.drift = rnd(-16, 16); }
      return o;
    },

    _makeGround: function (spread) {
      var ang = (this.yaw || 0) + rnd(-1.4, 1.4);
      var dist = spread ? rnd(50, FAR * 0.9) : rnd(FAR * 0.6, FAR * 0.9);
      return {
        x: (this.camX || 0) + Math.sin(ang) * dist,
        z: (this.camZ || 0) + Math.cos(ang) * dist,
        emoji: GROUND_LIFE[(Math.random() * GROUND_LIFE.length) | 0],
        size: rnd(14, 26)
      };
    },

    // World → camera, rotated by the heading so you can face any direction.
    _cam: function (x, y, z) {
      var dx = x - this.camX, dz = z - this.camZ;
      return {
        rx: dx * this.cosY - dz * this.sinY,
        ry: y - (this.alt + EYE),
        rz: dx * this.sinY + dz * this.cosY
      };
    },

    _project: function (x, y, z) {
      var p = this._cam(x, y, z);
      if (p.rz < NEAR || p.rz > FAR * 1.2) return null;
      var s = this.f / p.rz;
      return {
        sx: this.W / 2 + p.rx * s,
        sy: this.hz - p.ry * s,
        s: s, size: s * 30, dz: p.rz
      };
    },

    // A ground-level segment, clipped against the near plane.
    _lineW: function (c, x0, z0, x1, z1) {
      var a = this._cam(x0, 0, z0), b = this._cam(x1, 0, z1), t;
      if (a.rz < NEAR && b.rz < NEAR) return;
      if (a.rz < NEAR) {
        t = (NEAR - a.rz) / (b.rz - a.rz);
        a = { rx: a.rx + (b.rx - a.rx) * t, ry: a.ry, rz: NEAR };
      } else if (b.rz < NEAR) {
        t = (NEAR - b.rz) / (a.rz - b.rz);
        b = { rx: b.rx + (a.rx - b.rx) * t, ry: b.ry, rz: NEAR };
      }
      var sa = this.f / a.rz, sb = this.f / b.rz;
      c.moveTo(this.W / 2 + a.rx * sa, this.hz - a.ry * sa);
      c.lineTo(this.W / 2 + b.rx * sb, this.hz - b.ry * sb);
    },

    /* ── loop ─────────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;
      self._update(dt);
      self._draw(dt);
      if (self.running) self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _update: function (dt) {
      var h = this.hold, i;
      this.t += dt;

      this.vx += (h.right - h.left) * ACC * dt;
      this.vz += (h.fwd - h.back) * ACC * dt;
      this.vy += (h.up - h.down) * ACC * dt;

      var k = Math.exp(-DAMP * dt);
      this.vx *= k; this.vy *= k; this.vz *= k;

      // A real balloon turns slowly as the burner fires and as it vents, and
      // never quite holds still. That drift is most of what sells it.
      this.yawVel += (h.up * SPIN - h.down * SPIN * 0.8) * dt;
      this.yawVel += Math.sin(this.t * 0.13) * 0.010 * dt;
      this.yawVel *= Math.exp(-1.1 * dt);
      this.yawVel = clamp(this.yawVel, -0.9, 0.9);
      this.yaw += this.yawVel * dt;

      this.cosY = Math.cos(this.yaw);
      this.sinY = Math.sin(this.yaw);

      // You fly the way you are facing.
      this.camX += (this.vz * this.sinY + this.vx * this.cosY) * dt * 6;
      this.camZ += (this.vz * this.cosY - this.vx * this.sinY) * dt * 6;
      this.alt = clamp(this.alt + this.vy * dt * 6, 0, MAX_ALT);

      if (this.alt <= 0.4 && !h.up) {
        if (!this.landed) this._touchDown();
        this.vy = Math.max(0, this.vy);
      } else if (this.alt > 4) {
        this.landed = false;
      }

      this.sway = this.sway * 0.92 + (this.vx * 0.02 - this.yawVel * 0.5);
      this.burner = Math.max(0, this.burner - dt * 1.6);
      if (h.up) this.burner = Math.min(1, this.burner + dt * 3);

      if (this.air) {
        var speed = Math.min(1, Math.hypot(this.vx, this.vz, this.vy) / 26);
        this.air.setWind(0.22 + speed * 0.78);          // always a little breeze
        this.air.setBurner(this.burner);
        this.air.setVent(h.down ? 1 : 0);
      }

      // things drift, get collected, and recycle behind you
      for (i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        o.bobT += dt;
        o.flap += dt * 9;
        o.x += o.drift * dt;
        if (o.kind === 'unicorn') o.y += Math.sin(o.bobT * 1.6) * 14 * dt;
        if (o.kind === 'bird') o.z -= 8 * dt;            // birds fly toward you

        var dx = o.x - this.camX, dz = o.z - this.camZ;
        var flat = Math.hypot(dx, dz);
        var behind = dx * this.sinY + dz * this.cosY;      // camera-space depth
        if (flat > FAR * 1.25 || (behind < -60 && flat > 200)) {
          this.things[i] = this._make(false);
          continue;
        }
        if (!o.on) continue;

        var reach = o.kind === 'cloud' ? (o.size * 0.55 + 14) : 26;
        var dy = o.y - (this.alt + EYE);
        if (flat < reach && Math.abs(dy) < reach) this._take(o, false);
      }

      for (i = 0; i < this.ground.length; i++) {
        var g = this.ground[i];
        var gdx = g.x - this.camX, gdz = g.z - this.camZ;
        var gflat = Math.hypot(gdx, gdz);
        var gbehind = gdx * this.sinY + gdz * this.cosY;
        if (gflat > FAR * 1.2 || (gbehind < -60 && gflat > 200)) this.ground[i] = this._makeGround(false);
      }

      for (i = this.floaters.length - 1; i >= 0; i--) {
        var fl = this.floaters[i];
        fl.age += dt;
        fl.y -= 60 * dt;
        if (fl.age > fl.life) this.floaters.splice(i, 1);
      }

      if (this.msg && (this.msg.age += dt) > this.msg.life) this.msg = null;
      if (this.cfg.onScore) this.cfg.onScore(this.score, this.alt / MAX_ALT);
    },

    _touchDown: function () {
      this.landed = true;
      this.vy = 0; this.vx *= 0.3; this.vz *= 0.3;
      if (!this.landedOnce) {
        this.landedOnce = true;
        this.score += POINTS.land;
        this._say('PERFECT LANDING! +' + POINTS.land, '#9df08a');
      } else {
        this._say('Landed 🌱', '#9df08a');
      }
      global.RoarAudio.sfx('thud');
      if (this.cfg.onLand) this.cfg.onLand(this.score);
    },

    _take: function (o, tapped) {
      var p = this._project(o.x, o.y, o.z);
      var sx = p ? p.sx : this.W / 2, sy = p ? p.sy : this.hz;

      if (o.kind === 'bird') {
        // Never a collectible. Bumping one costs you, and it flaps away.
        this.score = Math.max(0, this.score + POINTS.bird);
        o.drift = (o.x < this.camX ? -1 : 1) * 60;
        o.y += 30;
        this._say('Oh no — mind the birds! 🐦', '#ff9f9f');
        this._float(sx, sy, POINTS.bird, '#ff8a8a');
        global.RoarAudio.sfx('birdaww');
        return;
      }

      o.on = false;
      var pts = POINTS[o.kind];
      this.score += pts;
      this.collected[o.kind]++;
      this._float(sx, sy, '+' + pts, o.kind === 'unicorn' ? '#e6b3ff' : '#ffe89a');
      global.RoarAudio.sfx(o.kind === 'unicorn' ? 'sparkle' : o.kind === 'cloud' ? 'puff' : 'nom');
      if (o.kind === 'unicorn') this._say('Unicorn caught! 🦄', '#e6b3ff');
      if (tapped && o.kind === 'food') this._say('Yum! 😋', '#ffe89a');

      var self = this;
      setTimeout(function () {
        var i = self.things.indexOf(o);
        if (i >= 0) self.things[i] = self._make(false);
      }, 30);
    },

    _float: function (x, y, text, color) {
      this.floaters.push({ x: x, y: y, text: String(text), color: color, age: 0, life: 1 });
    },

    _say: function (text, color) {
      this.msg = { text: text, color: color || '#fff', age: 0, life: 2 };
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function (dt) {
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);

      this._sky(c, W, H);
      this._mountains(c, W, H);
      this._land(c, W, H);
      this._groundLife(c);
      this._things(c);
      this._balloon(c, W, H);
      this._floaters(c);
      this._hud(c, W, H);
    },

    // Sunset: warm at the horizon, dusk overhead, and it deepens as you climb.
    _sky: function (c, W, H) {
      var high = clamp(this.alt / MAX_ALT, 0, 1);
      var g = c.createLinearGradient(0, 0, 0, this.hz + 2);
      g.addColorStop(0.00, high > 0.5 ? '#0c0a2e' : '#20134f');
      g.addColorStop(0.35, '#4b2377');
      g.addColorStop(0.62, '#9b3f7a');
      g.addColorStop(0.82, '#ef7452');
      g.addColorStop(1.00, '#ffc46b');
      c.fillStyle = g;
      c.fillRect(0, 0, W, this.hz + 2);

      var rel = ((0 - this.yaw + Math.PI) % 6.2832 + 6.2832) % 6.2832 - Math.PI;
      var visible = Math.abs(rel) < 1.35;
      var sunX = W * 0.5 + (visible ? Math.tan(rel) * this.f : 1e5);
      var sunY = this.hz - 26;
      var glow = c.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.55);
      glow.addColorStop(0, 'rgba(255,240,190,0.95)');
      glow.addColorStop(0.12, 'rgba(255,190,110,0.55)');
      glow.addColorStop(0.45, 'rgba(255,130,90,0.18)');
      glow.addColorStop(1, 'rgba(255,120,80,0)');
      c.fillStyle = glow;
      c.fillRect(0, 0, W, this.hz + 2);

      if (visible) {
        c.fillStyle = 'rgba(255,247,214,0.96)';
        c.beginPath(); c.arc(sunX, sunY, W * 0.085, 0, 6.2832); c.fill();
      }

      // a few high streak clouds, barely moving
      c.save();
      c.globalAlpha = 0.30;
      c.fillStyle = '#ffd9c0';
      for (var i = 0; i < 5; i++) {
        var y = this.hz - 60 - i * 34 - (this.alt * 0.12) % 40;
        var x = ((i * 260 - this.yaw * this.f * 0.5 - this.camX * 0.25) % (W + 400) + W + 400) % (W + 400) - 200;
        c.beginPath();
        c.ellipse(x, y, 110 - i * 8, 8, 0, 0, 6.2832);
        c.fill();
      }
      c.restore();
    },

    // Three ridge lines built from stacked sine waves — cheap and stable.
    _mountains: function (c, W, H) {
      var layers = [
        { col: '#8a5580', amp: 46, base: 10, n: 3.1, par: 0.00010, seed: 0.0 },
        { col: '#5c3468', amp: 68, base: 2, n: 2.2, par: 0.00022, seed: 1.7 },
        { col: '#341f4e', amp: 94, base: -16, n: 1.4, par: 0.00040, seed: 3.4 }
      ];
      for (var L = 0; L < layers.length; L++) {
        var m = layers[L];
        c.fillStyle = m.col;
        c.beginPath();
        c.moveTo(0, this.hz + 4);
        for (var x = 0; x <= W; x += 6) {
          // bearing of this column, so the ridge line wraps seamlessly at 360
          var az = this.yaw + Math.atan2(x - W / 2, this.f) + this.camX * m.par;
          var u = az * m.n + m.seed;
          var h = Math.sin(u) * m.amp
                + Math.sin(u * 2.3 + 1.1) * m.amp * 0.42
                + Math.sin(u * 4.7 + 2.6) * m.amp * 0.18;
          c.lineTo(x, this.hz - m.base - Math.abs(h) * 0.9);
        }
        c.lineTo(W, this.hz + 4);
        c.closePath();
        c.fill();

        // sunset catching the top of each ridge
        c.save();
        c.clip();
        var rim = c.createLinearGradient(0, this.hz - m.amp * 1.6, 0, this.hz);
        rim.addColorStop(0, 'rgba(255,180,120,0.35)');
        rim.addColorStop(1, 'rgba(255,180,120,0)');
        c.fillStyle = rim;
        c.fillRect(0, this.hz - m.amp * 1.6, W, m.amp * 1.6);
        c.restore();
      }
    },

    // Ground plane: receding field bands plus lines converging on the horizon.
    _land: function (c, W, H) {

      var g = c.createLinearGradient(0, this.hz, 0, H);
      g.addColorStop(0, '#7b6440');
      g.addColorStop(0.08, '#5c7040');
      g.addColorStop(0.45, '#42663a');
      g.addColorStop(1, '#1d3020');
      c.fillStyle = g;
      c.fillRect(0, this.hz, W, H - this.hz);

      // soft patches of lighter and darker land, so it is not a flat carpet
      var patch = c.createLinearGradient(0, this.hz, W, H);
      patch.addColorStop(0, 'rgba(120,150,80,0.14)');
      patch.addColorStop(0.4, 'rgba(40,70,40,0.10)');
      patch.addColorStop(0.7, 'rgba(140,160,90,0.12)');
      patch.addColorStop(1, 'rgba(30,60,35,0.14)');
      c.fillStyle = patch;
      c.fillRect(0, this.hz, W, H - this.hz);

      // A world-space grid of field edges. Drawn as real 3D lines so the
      // whole landscape turns with you instead of sliding sideways.
      var gx = Math.floor(this.camX / GRID) * GRID;
      var gz = Math.floor(this.camZ / GRID) * GRID;
      var span = 17 * GRID;

      for (var pass = 0; pass < 2; pass++) {
        c.strokeStyle = pass ? 'rgba(240,255,220,0.10)' : 'rgba(20,40,14,0.20)';
        c.lineWidth = pass ? 1.2 : 2;
        c.beginPath();
        for (var i = -17; i <= 17; i++) {
          this._lineW(c, gx + i * GRID, gz - span, gx + i * GRID, gz + span);
          this._lineW(c, gx - span, gz + i * GRID, gx + span, gz + i * GRID);
        }
        c.stroke();
      }

      // haze so the far ground melts into the horizon
      var hz = c.createLinearGradient(0, this.hz, 0, this.hz + 130);
      hz.addColorStop(0, 'rgba(255,166,110,0.72)');
      hz.addColorStop(0.45, 'rgba(190,110,120,0.30)');
      hz.addColorStop(1, 'rgba(120,70,120,0)');
      c.fillStyle = hz;
      c.fillRect(0, this.hz, W, 130);
      c.restore();
    },

    _groundLife: function (c) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      for (var i = 0; i < this.ground.length; i++) {
        var g = this.ground[i];
        var p = this._project(g.x, 0, g.z);
        if (!p || p.sy < this.hz || p.sy > this.H + 40) continue;
        var size = clamp(g.size * p.s * 0.9, 6, 90);
        if (size < 7) continue;
        c.globalAlpha = clamp((p.sy - this.hz) / 60, 0.15, 1);
        c.font = size + 'px ' + EMOJI;
        c.fillText(g.emoji, p.sx, p.sy);
      }
      c.restore();
    },

    _things: function (c) {
      var list = [];
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        if (!o.on) continue;
        var p = this._project(o.x, o.y, o.z);
        if (!p) continue;
        if (p.sx < -260 || p.sx > this.W + 260) continue;
        list.push({ o: o, p: p });
      }
      list.sort(function (a, b) { return b.p.dz - a.p.dz; });    // far first

      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (i = 0; i < list.length; i++) {
        var o = list[i].o, p = list[i].p;
        var fade = clamp(1.25 - p.dz / FAR, 0, 1);

        if (o.kind === 'cloud') {
          var r = clamp(o.size * p.s * 0.6, 0, 150);
          if (r < 4) continue;
          c.globalAlpha = clamp(0.55 + fade * 0.45, 0, 1);
          // shadowed underside first, then a sunlit cap on top
          for (var pass = 0; pass < 2; pass++) {
            c.fillStyle = pass ? '#fff6ec' : '#c9a7c8';
            var lift = pass ? -r * 0.13 : 0;
            for (var k = 0; k < o.puffs; k++) {
              var u = (k / (o.puffs - 1 || 1)) - 0.5;
              c.beginPath();
              c.ellipse(p.sx + u * r * 1.5, p.sy + Math.abs(u) * r * 0.26 + lift,
                        r * (0.74 - Math.abs(u) * 0.34), r * (0.48 - Math.abs(u) * 0.18),
                        0, 0, 6.2832);
              c.fill();
            }
          }
          continue;
        }

        if (o.kind === 'bird') {
          var bs = clamp(o.size * p.s * 0.7, 3, 46);
          c.globalAlpha = 0.55 + fade * 0.45;
          c.strokeStyle = '#2a1c3f';
          c.lineWidth = Math.max(1.4, bs * 0.16);
          c.lineCap = 'round';
          var w = bs, flap = Math.sin(o.flap) * 0.5 + 0.5;
          c.beginPath();
          c.moveTo(p.sx - w, p.sy + w * 0.25 * flap);
          c.quadraticCurveTo(p.sx - w * 0.4, p.sy - w * 0.5, p.sx, p.sy);
          c.quadraticCurveTo(p.sx + w * 0.4, p.sy - w * 0.5, p.sx + w, p.sy + w * 0.25 * flap);
          c.stroke();
          continue;
        }

        var size = clamp(o.size * p.s * 1.1, 8, 96);
        c.globalAlpha = 0.4 + fade * 0.6;
        if (o.kind === 'unicorn') {
          c.save();
          c.translate(p.sx, p.sy + Math.sin(o.bobT * 2.2) * size * 0.12);
          var gl = c.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 1.3);
          gl.addColorStop(0, 'rgba(240,190,255,0.55)');
          gl.addColorStop(1, 'rgba(240,190,255,0)');
          c.fillStyle = gl;
          c.beginPath(); c.arc(0, 0, size * 1.3, 0, 6.2832); c.fill();
          c.font = size + 'px ' + EMOJI;
          c.fillText(o.emoji, 0, 0);
          c.restore();
        } else {
          c.font = size + 'px ' + EMOJI;
          c.fillText(o.emoji, p.sx, p.sy + Math.sin(o.bobT * 2) * size * 0.1);
        }
      }
      c.restore();
    },

    // Envelope overhead (only its underside is in view), throat and burner,
    // ropes framing the edges, and the basket rim you are standing behind.
    _balloon: function (c, W, H) {
      var sway = clamp(this.sway, -1.2, 1.2) * 16;
      var ex = W / 2 + sway;
      var cy = -H * 0.44 + Math.sin(this.t * 0.7) * 4;   // mostly above the screen
      var rx = W * 0.62, ry = H * 0.56;
      var throatY = cy + ry;
      var rimY = H * 0.745;

      /* ── envelope ── */
      c.save();
      c.beginPath();
      c.ellipse(ex, cy, rx, ry, 0, 0, 6.2832);
      c.closePath();
      c.save();
      c.clip();

      var cols = ['#e8542f', '#ffd24c', '#ff8a2b', '#fdf6ec',
                  '#4fb3e8', '#a78bfa', '#e8542f', '#ffd24c',
                  '#ff8a2b', '#fdf6ec', '#4fb3e8', '#a78bfa'];
      var n = cols.length;
      for (var i = 0; i < n; i++) {
        var x0 = ex - rx + (i / n) * rx * 2;
        var x1 = ex - rx + ((i + 1) / n) * rx * 2;
        c.fillStyle = cols[i];
        c.fillRect(x0, cy - ry, x1 - x0 + 1, ry * 2);
      }

      // round it off: bright down the middle, dark at the edges
      var shade = c.createLinearGradient(ex - rx, 0, ex + rx, 0);
      shade.addColorStop(0.00, 'rgba(10,0,30,0.55)');
      shade.addColorStop(0.22, 'rgba(10,0,30,0.16)');
      shade.addColorStop(0.46, 'rgba(255,240,210,0.20)');
      shade.addColorStop(0.72, 'rgba(10,0,30,0.16)');
      shade.addColorStop(1.00, 'rgba(10,0,30,0.55)');
      c.fillStyle = shade;
      c.fillRect(ex - rx, cy - ry, rx * 2, ry * 2);

      // the underside falls into shadow, warmed by the burner
      var under = c.createLinearGradient(0, throatY - H * 0.30, 0, throatY);
      under.addColorStop(0, 'rgba(20,6,40,0)');
      under.addColorStop(1, 'rgba(20,6,40,0.55)');
      c.fillStyle = under;
      c.fillRect(ex - rx, throatY - H * 0.30, rx * 2, H * 0.30);

      if (this.burner > 0.02) {
        var warm = c.createRadialGradient(ex, throatY, 4, ex, throatY, W * 0.5);
        warm.addColorStop(0, 'rgba(255,190,90,' + (0.5 * this.burner) + ')');
        warm.addColorStop(1, 'rgba(255,190,90,0)');
        c.fillStyle = warm;
        c.fillRect(ex - rx, throatY - H * 0.3, rx * 2, H * 0.3);
      }
      c.restore();

      c.lineWidth = 3;
      c.strokeStyle = 'rgba(40,16,60,0.5)';
      c.stroke();
      c.restore();

      /* ── throat ── */
      c.save();
      c.fillStyle = '#3a2140';
      c.beginPath();
      c.moveTo(ex - W * 0.11, throatY - 6);
      c.lineTo(ex + W * 0.11, throatY - 6);
      c.lineTo(ex + W * 0.07, throatY + H * 0.045);
      c.lineTo(ex - W * 0.07, throatY + H * 0.045);
      c.closePath();
      c.fill();
      c.restore();

      /* ── burner flame ── */
      if (this.burner > 0.02) {
        var fy = throatY + H * 0.045;
        var fh = 26 + this.burner * 54;
        c.save();
        c.globalAlpha = 0.85;
        var fg = c.createLinearGradient(0, fy - fh, 0, fy + 10);
        fg.addColorStop(0, 'rgba(255,255,220,0)');
        fg.addColorStop(0.35, 'rgba(255,228,120,0.9)');
        fg.addColorStop(1, 'rgba(255,110,30,0.95)');
        c.fillStyle = fg;
        c.beginPath();
        c.moveTo(ex - 16, fy + 8);
        c.quadraticCurveTo(ex - 7, fy - fh * 0.6, ex, fy - fh);
        c.quadraticCurveTo(ex + 7, fy - fh * 0.6, ex + 16, fy + 8);
        c.closePath();
        c.fill();
        c.restore();
      }

      /* ── ropes: thin, out at the edges, framing the view ── */
      c.save();
      c.strokeStyle = 'rgba(48,30,20,0.55)';
      c.lineWidth = 2.6;
      c.lineCap = 'round';
      var bw = W * 0.92;
      var anchors = [-0.46, -0.30, 0.30, 0.46];
      for (var r = 0; r < anchors.length; r++) {
        var rxp = W / 2 + sway * 0.3 + anchors[r] * bw;
        var top = ex + anchors[r] * W * 0.62;
        c.beginPath();
        c.moveTo(rxp, rimY + 4);
        c.quadraticCurveTo((rxp + top) / 2, rimY - H * 0.26, top, throatY + 4);
        c.stroke();
      }
      c.restore();

      /* ── basket ── */
      c.save();
      var kx = W / 2 + sway * 0.3;
      var kw = W * 0.94, kh = H - rimY + 10;
      c.translate(kx, rimY);

      c.fillStyle = '#96632f';
      c.beginPath();
      c.moveTo(-kw / 2, 0);
      c.quadraticCurveTo(0, -30, kw / 2, 0);
      c.lineTo(kw / 2, kh);
      c.lineTo(-kw / 2, kh);
      c.closePath();
      c.fill();

      c.save();
      c.clip();
      c.strokeStyle = 'rgba(58,32,10,0.5)';
      c.lineWidth = 2;
      for (var wy = 6; wy < kh; wy += 14) {
        c.beginPath(); c.moveTo(-kw, wy); c.lineTo(kw, wy); c.stroke();
      }
      c.strokeStyle = 'rgba(255,214,160,0.20)';
      for (var wx = -kw / 2; wx < kw / 2; wx += 16) {
        c.beginPath(); c.moveTo(wx, -24); c.lineTo(wx + 7, kh); c.stroke();
      }
      // the basket sits in its own shadow
      var bs = c.createLinearGradient(0, 0, 0, kh);
      bs.addColorStop(0, 'rgba(0,0,0,0.05)');
      bs.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = bs;
      c.fillRect(-kw / 2, 0, kw, kh);
      c.restore();

      c.strokeStyle = '#d29a54';
      c.lineWidth = 13;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-kw / 2 + 4, 0);
      c.quadraticCurveTo(0, -30, kw / 2 - 4, 0);
      c.stroke();
      c.restore();

      /* ── vignette, so the eye goes to the middle ── */
      var vg = c.createRadialGradient(W / 2, H * 0.42, H * 0.24, W / 2, H * 0.42, H * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,4,26,0.45)');
      c.fillStyle = vg;
      c.fillRect(0, 0, W, H);
    },

    _floaters: function (c) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var i = 0; i < this.floaters.length; i++) {
        var f = this.floaters[i];
        var k = 1 - f.age / f.life;
        c.globalAlpha = clamp(k * 1.6, 0, 1);
        c.font = '900 30px system-ui';
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(0,0,0,0.4)';
        c.fillStyle = f.color;
        c.strokeText(f.text, f.x, f.y);
        c.fillText(f.text, f.x, f.y);
      }
      c.restore();
    },

    _hud: function (c, W, H) {
      // altitude gauge on the right, with the balloon riding at your height
      var top = H * 0.20, hgt = H * 0.30, x = W - 24, w = 7;
      var frac = clamp(this.alt / MAX_ALT, 0, 1);
      var markY = top + hgt * (1 - frac);

      c.save();
      c.fillStyle = 'rgba(20,8,40,0.35)';
      c.beginPath();
      c.roundRect ? c.roundRect(x - w / 2, top, w, hgt, w / 2)
                  : c.rect(x - w / 2, top, w, hgt);
      c.fill();

      c.fillStyle = 'rgba(255,210,76,0.9)';
      c.beginPath();
      c.roundRect ? c.roundRect(x - w / 2, markY, w, hgt - (markY - top), w / 2)
                  : c.rect(x - w / 2, markY, w, hgt - (markY - top));
      c.fill();

      c.font = '13px ' + EMOJI;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('🎈', x, markY);

      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.font = '900 11px system-ui';
      c.textBaseline = 'alphabetic';
      c.fillText(Math.round(this.alt) + 'm', x, top + hgt + 16);
      c.restore();

      if (this.msg) {
        var a = clamp((this.msg.life - this.msg.age) * 2, 0, 1);
        c.save();
        c.globalAlpha = a;
        c.textAlign = 'center';
        c.font = '900 22px system-ui';
        c.lineWidth = 5;
        c.strokeStyle = 'rgba(0,0,0,0.45)';
        c.fillStyle = this.msg.color;
        c.strokeText(this.msg.text, W / 2, H * 0.30);
        c.fillText(this.msg.text, W / 2, H * 0.30);
        c.restore();
      }

      if (this.landed) {
        c.save();
        c.globalAlpha = 0.6 + Math.sin(this.t * 4) * 0.3;
        c.textAlign = 'center';
        c.font = '900 15px system-ui';
        c.fillStyle = '#9df08a';
        c.fillText('press ▲ to take off again', W / 2, H * 0.36);
        c.restore();
      }
    }
  };

  global.BalloonGame = BalloonGame;
})(window);
