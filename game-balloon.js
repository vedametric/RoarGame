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
  var MAX_ALT = 3200;        // all the way up to space
  var SKY_TOP = 460;         // the old ceiling: above here the air thins out
  var SPACE = 2100;          // black sky, stars, and the earth curving below
  var ALIEN_ALT = 900;       // nobody meets an alien at treetop height
  var EYE = 3;               // basket floor above the ground
  var NEAR = 10;
  var FAR = 900;
  var GRID = 44;             // field size on the ground
  var SPIN = 0.55;           // how much the burner twists you round

  var POINTS = { food: 10, cloud: 5, unicorn: 25, alien: 40, bird: -10, land: 50 };

  /* ── weather ────────────────────────────────────────────────
     It changes on its own every half-minute or so. Each kind moves the balloon
     as well as decorating the sky, so you can feel it and not just see it. */
  var WEATHER = {
    clear: { name: 'Clear skies', icon: '☀️', say: 'Clear skies ☀️', tint: null,
             wind: 0.10, drops: 0, colour: '#ffe89a' },
    windy: { name: 'Windy', icon: '💨', say: 'Hold on — it is getting windy! 💨',
             tint: null, wind: 1.00, drops: 0, colour: '#cfe9ff' },
    rain:  { name: 'Rain', icon: '🌧️', say: 'Here comes the rain 🌧️',
             tint: 'rgba(70,86,120,0.34)', wind: 0.45, drops: 150, colour: '#a9c9ff' },
    snow:  { name: 'Snow', icon: '❄️', say: 'It is snowing! ❄️',
             tint: 'rgba(190,205,235,0.26)', wind: 0.30, drops: 130, colour: '#eaf4ff' },
    storm: { name: 'Storm', icon: '⛈️', say: 'A thunderstorm! Hold tight ⛈️',
             tint: 'rgba(40,44,74,0.48)', wind: 1.35, drops: 210, colour: '#ffd24c' },
    fog:   { name: 'Fog', icon: '🌫️', say: 'Foggy up here 🌫️',
             tint: 'rgba(206,206,224,0.42)', wind: 0.18, drops: 0, colour: '#e6e6f2' },
    rainbow: { name: 'Rainbow', icon: '🌈', say: 'Look — a rainbow! 🌈',
             tint: null, wind: 0.22, drops: 0, colour: '#ffb3f0' }
  };
  // Rainbow only ever follows rain, the way it does out of the window.
  var AFTER_RAIN = ['rainbow', 'clear'];
  var ROLL = ['clear', 'windy', 'rain', 'snow', 'storm', 'fog', 'clear', 'windy', 'rain'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Mix two #rrggbb colours, k = 0 gives the first, 1 the second. Used to drain
  // the sunset away to black as the balloon climbs out of the atmosphere.
  function blend(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    var r = Math.round((pa >> 16 & 255) * (1 - k) + (pb >> 16 & 255) * k);
    var g = Math.round((pa >> 8 & 255) * (1 - k) + (pb >> 8 & 255) * k);
    var bl = Math.round((pa & 255) * (1 - k) + (pb & 255) * k);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

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
      self.collected = { food: 0, cloud: 0, unicorn: 0, alien: 0 };
      self.landed = false;
      self.landedOnce = false;
      self.reachedSpace = false;
      self.burner = 0;
      self.sway = 0;
      self.t = 0;
      self.msg = null;
      self.floaters = [];
      self.feathers = [];
      self.things = [];
      self.ground = [];
      self.paused = false;
      self.running = true;
      self.air = global.RoarAudio.airLoop();

      self.weather = 'clear';
      self.wxIn = rnd(14, 22);      // seconds until the sky changes its mind
      self.wxAmt = 0;               // eases in, so nothing snaps on
      self.wxWindDir = rnd(0, 6.2832);
      self.flash = 0;
      self.drops = [];
      self.stars = self._makeStars();

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
      clearTimeout(this.boom);
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
        if (!o.on) continue;
        if (o.kind === 'bird' && o.state && o.state !== 'fly') continue;
        var p = this._project(o.x, o.y, o.z);
        if (!p) continue;
        var d = Math.hypot(p.sx - px, p.sy - py);
        if (d < Math.max(bestD, p.size * 0.7) && d < bestD * 2.2) { bestD = d; bestI = i; }
      }
      if (bestI >= 0) this._take(this.things[bestI], true);
    },

    /* ── world ────────────────────────────────────────────────── */

    _make: function (spread) {
      var alt = this.alt || 0;
      var r = Math.random();
      var kind;

      // Aliens live up where the air runs out, and they take over completely
      // once you are properly in space. Birds and food stay down below.
      if (alt > ALIEN_ALT && r < clamp((alt - ALIEN_ALT) / (SPACE - ALIEN_ALT), 0.18, 0.72)) {
        kind = 'alien';
      } else if (alt > SPACE * 0.9) {
        // Space is mostly saucers, but a unicorn up among the stars is far too
        // good to leave out of Sienna's game.
        kind = Math.random() < 0.24 ? 'unicorn' : 'alien';
      } else {
        kind = r < 0.30 ? 'food' : r < 0.58 ? 'cloud' : r < 0.76 ? 'unicorn' : 'bird';
      }

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
      else if (kind === 'alien') { o.y = rnd(ALIEN_ALT, MAX_ALT); o.size = 30; o.drift = rnd(-30, 30);
                                   o.blink = rnd(0, 6.28); o.dart = rnd(0, 6.28); }
      else { o.y = rnd(70, 340); o.size = 20; o.drift = rnd(-16, 16); }

      // Whatever it is, put it somewhere you could actually reach from where
      // you are now — otherwise everything sits far below once you climb.
      if (alt > SKY_TOP * 0.8) o.y = clamp(alt + rnd(-150, 150), 20, MAX_ALT);
      return o;
    },

    // A fixed dome of stars, held in bearing and elevation so they sit still
    // while you turn rather than sliding about with the scenery.
    _makeStars: function () {
      var out = [];
      for (var i = 0; i < 170; i++) {
        out.push({
          az: rnd(0, 6.2832),
          el: rnd(-0.12, 1.15),
          r: rnd(0.5, 1.7),
          tw: rnd(0, 6.2832),
          bright: rnd(0.45, 1)
        });
      }
      return out;
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

    // Held while the "finish the flight?" question is up. The held buttons are
    // let go too, otherwise a finger still down when the card appeared would
    // leave the burner stuck on when we come back.
    setPaused: function (on) {
      this.paused = !!on;
      this.last = performance.now();
      if (on) {
        for (var k in this.hold) if (this.hold.hasOwnProperty(k)) this.hold[k] = 0;
        if (this.air) {
          this.air.setWind(0);      // the sky goes quiet while you decide
          this.air.setBurner(0);
          this.air.setVent(0);
          this.air.setRain(0);
        }
      }
    },

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;
      if (!self.paused) {
        self._update(dt);
        self._draw(dt);
      }
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

      this._weather(dt);

      // You fly the way you are facing, and the wind pushes you besides.
      var wx = Math.sin(this.wxWindDir) * this.wind * 26;
      var wz = Math.cos(this.wxWindDir) * this.wind * 26;
      this.camX += ((this.vz * this.sinY + this.vx * this.cosY) * 6 + wx) * dt;
      this.camZ += ((this.vz * this.cosY - this.vx * this.sinY) * 6 + wz) * dt;

      // Thin air near the top: the balloon fairly shoots up there, so getting
      // to space is a treat rather than a chore.
      var lift = 1 + 2.6 * clamp((this.alt - SKY_TOP * 0.6) / (SPACE - SKY_TOP * 0.6), 0, 1);
      this.alt = clamp(this.alt + this.vy * dt * 6 * (this.vy > 0 ? lift : 1), 0, MAX_ALT);

      if (this.alt > SPACE && !this.reachedSpace) {
        this.reachedSpace = true;
        this.score += 100;
        this._say('🚀 YOU MADE IT TO SPACE! +100', '#ffe89a');
        this.msg.life = 4;
        global.RoarAudio.sfx('win');
      }

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
        // Space is silent: there is no air up there to rush past you.
        var airy = 1 - clamp((this.alt - SKY_TOP) / (SPACE - SKY_TOP), 0, 1);
        this.air.setWind((0.22 + speed * 0.78 + this.wind * 0.9) * airy);
        this.air.setBurner(this.burner);
        this.air.setVent(h.down ? 1 : 0);
        this.air.setRain(this.rainAmt * airy);
      }

      // things drift, get collected, and recycle behind you
      for (i = 0; i < this.things.length; i++) {
        var o = this.things[i];

        if (o.kind === 'bird' && o.state && o.state !== 'fly') {
          this._stepBird(o, dt, i);
          continue;                       // no drifting, no collecting
        }

        o.bobT += dt;
        o.flap += dt * 9;
        o.x += o.drift * dt;
        if (o.kind === 'unicorn') o.y += Math.sin(o.bobT * 1.6) * 14 * dt;
        if (o.kind === 'bird') o.z -= 8 * dt;            // birds fly toward you
        if (o.kind === 'alien') {
          // Saucers do not drift, they dart — a sudden sideways skip, then a
          // pause, which is exactly how they behave in every film.
          o.dart += dt * 1.5;
          o.x += Math.sin(o.dart * 2.3) * 46 * dt;
          o.z += Math.cos(o.dart * 1.7) * 46 * dt;
          o.y += Math.sin(o.dart * 0.9) * 26 * dt;
        }

        var dx = o.x - this.camX, dz = o.z - this.camZ;
        var flat = Math.hypot(dx, dz);
        var behind = dx * this.sinY + dz * this.cosY;      // camera-space depth
        if (flat > FAR * 1.25 || (behind < -60 && flat > 200)) {
          this.things[i] = this._make(false);
          continue;
        }
        if (!o.on) continue;

        var reach = o.kind === 'cloud' ? (o.size * 0.55 + 14) : o.kind === 'alien' ? 34 : 26;
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

      for (i = this.feathers.length - 1; i >= 0; i--) {
        var ft = this.feathers[i];
        ft.age += dt;
        if (ft.age > ft.life) { this.feathers.splice(i, 1); continue; }
        ft.vy -= 42 * dt;                 // feathers sink, they do not plummet
        ft.vx *= 0.97; ft.vz *= 0.97; ft.vy *= 0.99;
        ft.x += ft.vx * dt; ft.y += ft.vy * dt; ft.z += ft.vz * dt;
        ft.rot += ft.spin * dt;
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

    /* ── weather ──────────────────────────────────────────────────
       The sky makes its own mind up every twenty-odd seconds. Above the clouds
       it clears — real weather happens down in the air, and it would be silly
       to have snow in space — so climbing is a way to escape a storm. */

    _weather: function (dt) {
      this.wxIn -= dt;
      if (this.wxIn <= 0) this._turnWeather();

      var w = WEATHER[this.weather] || WEATHER.clear;
      // Nothing snaps on or off; every change fades over about two seconds.
      this.wxAmt = clamp(this.wxAmt + dt * 0.5, 0, 1);
      var thin = 1 - clamp((this.alt - SKY_TOP * 0.7) / (SPACE * 0.8 - SKY_TOP * 0.7), 0, 1);
      var amt = this.wxAmt * thin;

      this.wxStrength = amt;
      this.wind = w.wind * amt;
      this.rainAmt = this.weather === 'rain' ? amt : this.weather === 'storm' ? amt : 0;

      // The wind wanders rather than blowing from one fixed quarter all game.
      this.wxWindDir += Math.sin(this.t * 0.07) * 0.25 * dt;

      // lightning, and the thunder a moment behind it
      if (this.weather === 'storm' && amt > 0.4) {
        this.flash = Math.max(0, this.flash - dt * 3.2);
        if (this.flash <= 0 && Math.random() < dt * 0.32) {
          this.flash = 1;
          var self = this;
          this.boom = setTimeout(function () {
            if (self.running && !self.paused) global.RoarAudio.sfx('thunder');
          }, 300 + Math.random() * 700);
        }
      } else {
        this.flash = Math.max(0, this.flash - dt * 3);
      }

      this._stepDrops(dt, w, amt);
    },

    _turnWeather: function () {
      var next;
      if (this.weather === 'rain' && Math.random() < 0.7) {
        next = AFTER_RAIN[(Math.random() * AFTER_RAIN.length) | 0];
      } else {
        do { next = ROLL[(Math.random() * ROLL.length) | 0]; } while (next === this.weather);
      }
      this.weather = next;
      this.wxAmt = 0;
      this.wxIn = rnd(22, 38);
      this.wxWindDir = rnd(0, 6.2832);
      this.drops.length = 0;

      // No weather report while you are above it all.
      if (this.alt < SPACE * 0.7) {
        var w = WEATHER[next];
        this._say(w.say, w.colour);
        if (next === 'storm') global.RoarAudio.sfx('thunder');
      }
    },

    // Rain and snow are drawn straight on the screen rather than in the world:
    // they are all around you, and this keeps hundreds of them cheap.
    _stepDrops: function (dt, w, amt) {
      var want = Math.round(w.drops * amt);
      var snow = this.weather === 'snow';

      // Snowflakes and raindrops are shaped differently, so a change of weather
      // starts a fresh batch rather than re-using the last lot at the wrong size.
      if (this.dropKind !== this.weather) { this.drops.length = 0; this.dropKind = this.weather; }

      while (this.drops.length < want) {
        this.drops.push({
          x: Math.random() * (this.W || 400),
          y: Math.random() * (this.H || 800),
          v: snow ? rnd(40, 110) : rnd(620, 1000),
          len: snow ? rnd(2.5, 6) : rnd(11, 26),
          sway: rnd(0, 6.28),
          o: rnd(0.35, 0.9)
        });
      }
      if (this.drops.length > want) this.drops.length = want;

      var gust = Math.sin(this.wxWindDir) * this.wind * 90 + this.yawVel * 260;
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        d.y += d.v * dt;
        d.sway += dt * 2.2;
        d.x += (gust + (snow ? Math.sin(d.sway) * 26 : 0)) * dt;
        if (d.y > this.H) { d.y = -10; d.x = Math.random() * this.W; }
        if (d.x < -20) d.x += this.W + 40; else if (d.x > this.W + 20) d.x -= this.W + 40;
      }
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

      if (o.kind === 'bird') { this._hitBird(o, sx, sy); return; }

      o.on = false;
      var pts = POINTS[o.kind];
      this.score += pts;
      this.collected[o.kind]++;
      this._float(sx, sy, '+' + pts,
        o.kind === 'unicorn' ? '#e6b3ff' : o.kind === 'alien' ? '#9dff9d' : '#ffe89a');
      global.RoarAudio.sfx(o.kind === 'unicorn' ? 'sparkle' : o.kind === 'alien' ? 'alien'
                         : o.kind === 'cloud' ? 'puff' : 'nom');
      if (o.kind === 'unicorn') this._say('Unicorn caught! 🦄', '#e6b3ff');
      if (o.kind === 'alien') this._say('An alien! 👽 +' + pts, '#9dff9d');
      if (tapped && o.kind === 'food') this._say('Yum! 😋', '#ffe89a');

      var self = this;
      setTimeout(function () {
        var i = self.things.indexOf(o);
        if (i >= 0) self.things[i] = self._make(false);
      }, 30);
    },

    // Birds are never points. Clip one and it skips sideways in fright, goes
    // off with a puff of feathers, then tumbles all the way down to the ground.
    _hitBird: function (o, sx, sy) {
      if (o.state && o.state !== 'fly') return;

      o.state = 'hop';
      o.stateT = 0;
      o.hopDir = o.x >= this.camX ? 1 : -1;
      o.baseY = o.y;
      o.rot = 0;

      this.score = Math.max(0, this.score + POINTS.bird);
      this._float(sx, sy, POINTS.bird, '#ff8a8a');
      this._say('Oh no! Mind the birds 🐦', '#ff9f9f');
      global.RoarAudio.sfx('birdaww');
    },

    _stepBird: function (o, dt, i) {
      o.stateT += dt;

      if (o.state === 'hop') {
        // two panicked skips to the side before it goes
        o.x += o.hopDir * 130 * dt;
        o.y = o.baseY + Math.abs(Math.sin(o.stateT * 16)) * 22;
        if (o.stateT > 0.5) {
          o.state = 'boom';
          o.stateT = 0;
          o.vy = 26;
          o.spin = rnd(-9, 9);
          this._feathers(o, 14);
          global.RoarAudio.sfx('bomb');
        }
        return true;
      }

      if (o.state === 'boom') {
        if (o.stateT > 0.2) { o.state = 'fall'; o.stateT = 0; }
        return true;
      }

      // fall: gravity all the way down to the fields
      o.vy -= 240 * dt;
      o.y += o.vy * dt;
      o.x += o.hopDir * 14 * dt;
      o.rot += o.spin * dt;

      if (o.y <= 0) {
        o.y = 0;
        this._feathers(o, 6, 0.35);      // a last little puff of dust
        this.things[i] = this._make(false);
      }
      return true;
    },

    _feathers: function (o, n, force) {
      var f = force == null ? 1 : force;
      for (var k = 0; k < n; k++) {
        this.feathers.push({
          x: o.x, y: o.y, z: o.z,
          vx: rnd(-46, 46) * f, vy: rnd(-14, 52) * f, vz: rnd(-46, 46) * f,
          rot: rnd(0, 6.28), spin: rnd(-7, 7),
          age: 0, life: rnd(1.3, 2.4),
          col: ['#ffffff', '#efe8f8', '#c8bcd8', '#3a2b52'][(Math.random() * 4) | 0]
        });
      }
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

      // How far into space we are. At 1 the ground is long gone and the world
      // below is a curved blue edge.
      var sp = clamp((this.alt - SKY_TOP) / (SPACE - SKY_TOP), 0, 1);
      this.sp = sp;

      this._sky(c, W, H);
      this._stars(c, W, H, sp);
      if (sp < 1) {
        c.save();
        c.globalAlpha = 1 - sp;                 // the world fades as you leave it
        this._mountains(c, W, H);
        this._land(c, W, H);
        this._groundLife(c);
        c.restore();
      }
      if (sp > 0.35) this._earth(c, W, H, sp);
      this._things(c);
      this._featherDraw(c);
      this._balloon(c, W, H);
      this._weatherDraw(c, W, H);
      this._floaters(c);
      this._hud(c, W, H);
    },

    // Sunset: warm at the horizon, dusk overhead, and it deepens as you climb.
    // Keep climbing and the whole thing drains away to the black of space.
    _sky: function (c, W, H) {
      var sp = this.sp || 0;
      var storm = this.weather === 'storm' ? (this.wxStrength || 0) : 0;

      // In space the sky is black from top to bottom, so paint the whole
      // canvas rather than just down to the horizon.
      if (sp > 0) {
        c.fillStyle = '#04040f';
        c.fillRect(0, 0, W, H);
      }

      var g = c.createLinearGradient(0, 0, 0, this.hz + 2);
      var mix = function (hex, k) { return blend(hex, '#04040f', k); };
      g.addColorStop(0.00, mix(sp > 0.5 ? '#0c0a2e' : '#20134f', sp));
      g.addColorStop(0.35, mix(storm > 0.3 ? '#2f2a55' : '#4b2377', sp));
      g.addColorStop(0.62, mix(storm > 0.3 ? '#4a4470' : '#9b3f7a', sp));
      g.addColorStop(0.82, mix(storm > 0.3 ? '#7d6f88' : '#ef7452', sp));
      g.addColorStop(1.00, mix(storm > 0.3 ? '#b6a68f' : '#ffc46b', sp));
      c.save();
      c.globalAlpha = 1 - sp * 0.92;
      c.fillStyle = g;
      c.fillRect(0, 0, W, this.hz + 2);
      c.restore();
      if (sp > 0.98) return;                  // no sun, no streak clouds up there

      c.save();
      c.globalAlpha = 1 - sp;                 // the sunset thins out as you climb

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
      c.globalAlpha = 0.30 * (1 - sp);
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

    /* ── space ────────────────────────────────────────────────────
       Stars are held at a fixed bearing and elevation on a dome around you, so
       turning sweeps past them properly instead of dragging them along. */

    _stars: function (c, W, H, sp) {
      var a = clamp((this.alt - SKY_TOP * 0.75) / (SPACE * 0.75), 0, 1);
      if (a <= 0.02) return;
      c.save();
      for (var i = 0; i < this.stars.length; i++) {
        var s = this.stars[i];
        var rel = ((s.az - this.yaw + Math.PI) % 6.2832 + 6.2832) % 6.2832 - Math.PI;
        if (Math.abs(rel) > 1.3) continue;                 // behind you
        var x = W / 2 + Math.tan(rel) * this.f;
        if (x < -8 || x > W + 8) continue;
        var y = this.hz - Math.tan(s.el) * this.f * 0.55;
        if (y < -8 || y > this.hz + 8) continue;
        var tw = 0.72 + Math.sin(this.t * 1.7 + s.tw) * 0.28;
        c.globalAlpha = a * s.bright * tw;
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(x, y, s.r * (1 + sp * 0.5), 0, 6.2832);
        c.fill();
      }

      // the moon, once it is dark enough to see one
      if (a > 0.5) {
        var mrel = ((2.4 - this.yaw + Math.PI) % 6.2832 + 6.2832) % 6.2832 - Math.PI;
        if (Math.abs(mrel) < 1.2) {
          var mx = W / 2 + Math.tan(mrel) * this.f, my = this.hz - this.f * 0.42;
          var r = W * 0.055;
          c.globalAlpha = (a - 0.5) * 2;
          var mg = c.createRadialGradient(mx - r * 0.3, my - r * 0.3, r * 0.2, mx, my, r);
          mg.addColorStop(0, '#fffef4'); mg.addColorStop(1, '#cdc9bb');
          c.fillStyle = mg;
          c.beginPath(); c.arc(mx, my, r, 0, 6.2832); c.fill();
          c.fillStyle = 'rgba(150,145,135,0.45)';
          [[-0.3, 0.1, 0.22], [0.25, -0.25, 0.15], [0.1, 0.4, 0.12]].forEach(function (k) {
            c.beginPath(); c.arc(mx + k[0] * r, my + k[1] * r, k[2] * r, 0, 6.2832); c.fill();
          });
        }
      }
      c.restore();
    },

    // The world seen from above: a curved blue edge with the atmosphere glowing
    // along it. It sinks and flattens the higher you go.
    _earth: function (c, W, H, sp) {
      var k = clamp((sp - 0.35) / 0.65, 0, 1);
      var top = this.hz + k * H * 0.13;                  // the world falls away
      var r = W * (2.6 - k * 1.1);                       // and curves more
      var cx = W / 2, cy = top + r;

      c.save();
      c.globalAlpha = k;

      c.beginPath();
      c.arc(cx, cy, r, -Math.PI, 0);
      c.closePath();
      var g = c.createLinearGradient(0, top, 0, Math.min(H, top + H * 0.7));
      g.addColorStop(0, '#7fc4ff');
      g.addColorStop(0.18, '#2f7fd0');
      g.addColorStop(0.55, '#1c4f8f');
      g.addColorStop(1, '#0d2450');
      c.fillStyle = g;
      c.fill();

      // continents: soft green blobs that turn with you
      c.save();
      c.clip();
      // Land is drawn as clusters of small overlapping blobs rather than one
      // big ellipse each, which reads as coastline instead of a green pill.
      c.fillStyle = 'rgba(96,150,92,0.7)';
      var turn = this.camX * 0.0004 - this.yaw * 0.12;
      for (var i = 0; i < 9; i++) {
        var ang = -Math.PI + ((i * 0.41 + turn) % Math.PI);
        var depth = 0.86 + (i % 3) * 0.045;
        for (var b = 0; b < 4; b++) {
          var off = (b - 1.5) * 0.055;
          var lx = cx + Math.cos(ang + off) * r * depth;
          var ly = cy + Math.sin(ang + off) * r * depth;
          c.beginPath();
          c.ellipse(lx, ly, W * (0.035 + (b % 2) * 0.02), W * (0.026 + (i % 2) * 0.012),
                    ang + off, 0, 6.2832);
          c.fill();
        }
      }
      // and a swirl of cloud over the top
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (i = 0; i < 5; i++) {
        var a2 = -Math.PI + (i * 0.8 + this.t * 0.004) % Math.PI;
        c.beginPath();
        c.ellipse(cx + Math.cos(a2) * r * 0.95, cy + Math.sin(a2) * r * 0.95,
                  W * 0.13, W * 0.028, a2, 0, 6.2832);
        c.fill();
      }
      c.restore();

      // the atmosphere, lit along the limb
      c.lineWidth = 8 + k * 10;
      var atm = c.createLinearGradient(0, top - 20, 0, top + 30);
      atm.addColorStop(0, 'rgba(150,215,255,0)');
      atm.addColorStop(0.5, 'rgba(150,215,255,0.75)');
      atm.addColorStop(1, 'rgba(150,215,255,0)');
      c.strokeStyle = atm;
      c.beginPath();
      c.arc(cx, cy, r, -Math.PI, 0);
      c.stroke();
      c.restore();
    },

    /* ── weather on the screen ───────────────────────────────────
       Rain, snow, fog and lightning sit in front of everything, because they
       are between you and the world rather than part of it. */

    _weatherDraw: function (c, W, H) {
      var w = WEATHER[this.weather] || WEATHER.clear;
      var amt = this.wxStrength || 0;
      if (amt <= 0.01) return;

      if (w.tint) {
        c.save();
        c.globalAlpha = amt;
        c.fillStyle = w.tint;
        c.fillRect(0, 0, W, H);
        c.restore();
      }

      if (this.weather === 'fog') {
        c.save();
        c.globalAlpha = amt * 0.5;
        var fg = c.createLinearGradient(0, this.hz - H * 0.25, 0, H);
        fg.addColorStop(0, 'rgba(226,226,240,0)');
        fg.addColorStop(0.45, 'rgba(226,226,240,0.85)');
        fg.addColorStop(1, 'rgba(210,210,228,0.6)');
        c.fillStyle = fg;
        c.fillRect(0, this.hz - H * 0.25, W, H);
        c.restore();
      }

      if (this.weather === 'rainbow') {
        var bands = ['#ff5f6d', '#ffa751', '#ffe259', '#7ddf64', '#4facfe', '#8f6ed5'];
        var rel = ((1.1 - this.yaw + Math.PI) % 6.2832 + 6.2832) % 6.2832 - Math.PI;
        if (Math.abs(rel) < 1.5) {
          var bx = W / 2 + Math.tan(rel) * this.f;
          c.save();
          c.globalAlpha = amt * 0.55;
          c.lineWidth = 9;
          for (var b = 0; b < bands.length; b++) {
            c.strokeStyle = bands[b];
            c.beginPath();
            c.arc(bx, this.hz + H * 0.22, W * 0.42 - b * 9, Math.PI, 0);
            c.stroke();
          }
          c.restore();
        }
      }

      if (this.drops.length) {
        var snow = this.weather === 'snow';
        c.save();
        c.lineCap = 'round';
        for (var i = 0; i < this.drops.length; i++) {
          var d = this.drops[i];
          c.globalAlpha = d.o * amt;
          if (snow) {
            c.fillStyle = '#fff';
            c.beginPath();
            c.arc(d.x, d.y, d.len * 0.7, 0, 6.2832);
            c.fill();
          } else {
            c.strokeStyle = '#cfe4ff';
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(d.x, d.y);
            c.lineTo(d.x - this.wind * 5, d.y + d.len);
            c.stroke();
          }
        }
        c.restore();
      }

      if (this.flash > 0) {
        c.save();
        c.globalAlpha = this.flash * 0.55;
        c.fillStyle = '#fff';
        c.fillRect(0, 0, W, H);
        c.restore();
      }
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

          if (o.state === 'boom') {
            // the puff itself: an expanding ring where the bird was
            var k = o.stateT / 0.2;
            c.save();
            c.globalAlpha = (1 - k) * 0.9;
            c.strokeStyle = '#fff';
            c.lineWidth = Math.max(2, bs * 0.5 * (1 - k));
            c.beginPath();
            c.arc(p.sx, p.sy, bs * (0.6 + k * 2.6), 0, 6.2832);
            c.stroke();
            c.fillStyle = 'rgba(255,255,255,' + (1 - k) * 0.5 + ')';
            c.beginPath();
            c.arc(p.sx, p.sy, bs * (1 - k) * 1.1, 0, 6.2832);
            c.fill();
            c.restore();
            continue;
          }

          c.save();
          c.translate(p.sx, p.sy);
          var falling = o.state === 'fall';
          if (falling) c.rotate(o.rot);
          c.strokeStyle = '#2a1c3f';
          c.lineWidth = Math.max(1.4, bs * 0.16);
          c.lineCap = 'round';

          var w = bs;
          // Flapping while it flies; wings folded and limp once it is falling.
          var flap = falling ? -0.55 : Math.sin(o.flap) * 0.5 + 0.5;
          c.beginPath();
          c.moveTo(-w, w * 0.25 * flap);
          c.quadraticCurveTo(-w * 0.4, -w * 0.5, 0, 0);
          c.quadraticCurveTo(w * 0.4, -w * 0.5, w, w * 0.25 * flap);
          c.stroke();
          c.restore();
          continue;
        }

        var size = clamp(o.size * p.s * 1.1, 8, 96);
        c.globalAlpha = 0.4 + fade * 0.6;

        // A little flying saucer with a green pilot under the dome, drawn
        // rather than lettered so it looks the same on every phone.
        if (o.kind === 'alien') {
          var s = size;
          c.save();
          c.translate(p.sx, p.sy + Math.sin(o.bobT * 2.4) * s * 0.12);

          var halo = c.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.5);
          halo.addColorStop(0, 'rgba(140,255,170,0.40)');
          halo.addColorStop(1, 'rgba(140,255,170,0)');
          c.fillStyle = halo;
          c.beginPath(); c.arc(0, 0, s * 1.5, 0, 6.2832); c.fill();

          // beam of light underneath
          c.globalAlpha *= 0.55;
          c.fillStyle = 'rgba(170,255,190,0.35)';
          c.beginPath();
          c.moveTo(-s * 0.28, s * 0.16);
          c.lineTo(s * 0.28, s * 0.16);
          c.lineTo(s * 0.72, s * 1.25);
          c.lineTo(-s * 0.72, s * 1.25);
          c.closePath(); c.fill();
          c.globalAlpha /= 0.55;

          // dome
          var dome = c.createLinearGradient(0, -s * 0.6, 0, 0);
          dome.addColorStop(0, 'rgba(215,245,255,0.95)');
          dome.addColorStop(1, 'rgba(130,190,225,0.75)');
          c.fillStyle = dome;
          c.beginPath();
          c.ellipse(0, -s * 0.04, s * 0.42, s * 0.42, 0, Math.PI, 0);
          c.fill();

          // the pilot
          c.fillStyle = '#7bea86';
          c.beginPath(); c.ellipse(0, -s * 0.18, s * 0.19, s * 0.22, 0, 0, 6.2832); c.fill();
          c.fillStyle = '#16321c';
          c.beginPath(); c.ellipse(-s * 0.07, -s * 0.20, s * 0.055, s * 0.075, -0.3, 0, 6.2832); c.fill();
          c.beginPath(); c.ellipse(s * 0.07, -s * 0.20, s * 0.055, s * 0.075, 0.3, 0, 6.2832); c.fill();

          // hull
          var hull = c.createLinearGradient(0, -s * 0.1, 0, s * 0.2);
          hull.addColorStop(0, '#dfe6ef');
          hull.addColorStop(1, '#7d8aa0');
          c.fillStyle = hull;
          c.beginPath();
          c.ellipse(0, 0, s * 0.82, s * 0.20, 0, 0, 6.2832);
          c.fill();

          // running lights, blinking round the rim
          for (var L = 0; L < 5; L++) {
            var lx = (-0.6 + L * 0.3) * s;
            var on = (Math.sin(this.t * 5 + o.blink + L) + 1) / 2;
            c.fillStyle = 'rgba(255,' + Math.round(150 + on * 105) + ',120,' + (0.35 + on * 0.65) + ')';
            c.beginPath(); c.arc(lx, s * 0.09, s * 0.065, 0, 6.2832); c.fill();
          }
          c.restore();
          continue;
        }

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

    _featherDraw: function (c) {
      c.save();
      for (var i = 0; i < this.feathers.length; i++) {
        var f = this.feathers[i];
        var p = this._project(f.x, f.y, f.z);
        if (!p) continue;
        var r = clamp(4.5 * p.s * 8, 1.2, 16);
        c.globalAlpha = clamp((1 - f.age / f.life) * 1.5, 0, 1) * 0.95;
        c.save();
        c.translate(p.sx, p.sy);
        c.rotate(f.rot);
        c.fillStyle = f.col;
        c.beginPath();
        c.ellipse(0, 0, r, r * 0.42, 0, 0, 6.2832);
        c.fill();
        c.restore();
      }
      c.restore();
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

      // a mark where space begins, so the climb has something to aim at
      var spY = top + hgt * (1 - SPACE / MAX_ALT);
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - 7, spY); c.lineTo(x + 7, spY); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.font = '800 8px system-ui';
      c.textAlign = 'right';
      c.fillText('SPACE', x - 9, spY + 3);

      c.textAlign = 'right';
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.font = '900 11px system-ui';
      c.textBaseline = 'alphabetic';
      c.fillText(Math.round(this.alt) + 'm', x + 6, top + hgt + 16);
      c.restore();

      // what the sky is doing, top left, out of the way of the score
      var w = WEATHER[this.weather] || WEATHER.clear;
      var above = this.alt > SPACE * 0.8;
      c.save();
      c.globalAlpha = 0.9;
      // Top middle: clear of the score on the left, the ✕ on the right and the
      // flight controls at the bottom.
      var label = above ? 'SPACE' : w.name.toUpperCase();
      c.textBaseline = 'middle';
      c.font = '800 11px system-ui';
      var tw = c.measureText(label).width;
      var bx = W / 2 - (tw + 26) / 2, by = 26;
      c.fillStyle = 'rgba(20,8,40,0.4)';
      c.beginPath();
      c.roundRect ? c.roundRect(bx - 8, by - 12, tw + 42, 24, 12)
                  : c.rect(bx - 8, by - 12, tw + 42, 24);
      c.fill();
      c.textAlign = 'left';
      c.font = '14px ' + EMOJI;
      c.fillText(above ? '🚀' : w.icon, bx, by);
      c.font = '800 11px system-ui';
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText(label, bx + 22, by + 1);
      c.restore();

      if (this.msg) {
        var a = clamp((this.msg.life - this.msg.age) * 2, 0, 1);
        c.save();
        c.globalAlpha = a;
        c.textAlign = 'center';
        // Shrink to fit rather than running off the edge — some of these lines
        // are much longer than others.
        var fs = 22;
        c.font = '900 ' + fs + 'px system-ui';
        var wide = c.measureText(this.msg.text).width;
        if (wide > W - 56) {
          fs = Math.max(12, Math.floor(fs * (W - 56) / wide));
          c.font = '900 ' + fs + 'px system-ui';
        }
        c.lineWidth = Math.max(3, fs * 0.22);
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
