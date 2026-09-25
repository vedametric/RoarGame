/*
 * game-animal.js — "ANIMAL WORLD"
 *
 * A little open world you wander as an animal — a goat, a fly, or a monkey —
 * eating, pooping and headbutting your way around a sunny meadow. No score to
 * chase and nothing to lose: it is a sandbox, the way a small child plays.
 *
 * The world is drawn with the same plain perspective the hot air balloon uses:
 * everything lives at a world (x, y, z) and its screen position is that divided
 * by depth, seen from a camera that sits a little way behind the animal at eye
 * height, looking at the horizon. The ground is a carpet of grass blades laid
 * out on a fixed grid in the world, so as you walk they stream past and the
 * meadow feels solid and three-dimensional rather than a flat backdrop. Trees,
 * rocks, flowers, the barn, the pond and the other animals are billboards —
 * flat pictures stood up in the world and scaled by how far off they are —
 * drawn back to front so nearer things cover farther ones.
 *
 * Each animal plays differently. The GOAT walks and can HEADBUTT things so they
 * tumble away; it eats grass, flowers and apples. The MONKEY can JUMP, and a
 * jump under a tree knocks a banana down; it eats bananas and apples. The FLY
 * actually flies — up and down through the air — and, being a fly, eats the
 * poop everyone leaves behind. Everyone can POOP, which is half the fun and
 * also what feeds the fly, so the meadow runs as its own silly little food web.
 */
(function (global) {
  'use strict';

  var SAVED = 'animal.best';
  var TAU = Math.PI * 2;
  var R = 210;                    // the meadow's radius, ringed by a fence
  var SPRITE = 0.16;             // world objects are drawn in tenths of a unit

  var ANIMALS = {
    goat:   { name: 'GOAT',   emoji: '🐐', eats: { grass: 1, flower: 1, apple: 1 },
              fly: false, special: 'butt', speed: 46, turn: 2.4, eye: 18, back: 27, size: 1.3 },
    fly:    { name: 'FLY',    emoji: '🪰', eats: { poop: 1, apple: 1 },
              fly: true,  special: 'alt',  speed: 58, turn: 3.0, eye: 18, back: 25, size: 1.0 },
    monkey: { name: 'MONKEY', emoji: '🐵', eats: { banana: 1, apple: 1 },
              fly: false, special: 'jump', speed: 50, turn: 2.6, eye: 18, back: 27, size: 1.25 }
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  // A stable pseudo-random from two integers, so a grass blade stays put in the
  // world instead of shimmering as the camera moves.
  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  var AnimalSim = {
    running: false,
    ANIMALS: ANIMALS,

    start: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.kind = ANIMALS[cfg.animal] ? cfg.animal : 'goat';
      this.A = ANIMALS[this.kind];
      this.best = parseInt(saved(SAVED, '0'), 10) || 0;
      this.paused = false;
      this.running = true;
      this._fit();
      this._init();
      this._showButtons();

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
    },

    setPaused: function (on) {
      this.paused = !!on;
      this.stick = null; this.stickId = null; this.held = {};
      this.last = performance.now();
    },

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 480;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this.f = this.W * 0.92;               // focal length
      this.hz = this.H * 0.42;              // the horizon
    },

    /* ── building the world ───────────────────────────────────── */

    _init: function () {
      this.pos = { x: 0, z: -40 };
      this.y = 0; this.vy = 0;              // height off the ground, for jumps/flight
      this.yaw = 0;                          // 0 looks north (+z)
      this.eyeX = this.pos.x; this.eyeZ = this.pos.z - this.A.back;
      this.belly = 20;
      this.score = 0;
      this.newBest = false;
      this.walk = 0;                         // leg-swing phase
      this.chomp = 0; this.pooped = 0; this.butt = 0;
      this.pops = [];                        // "+1", "💩!" flags floating up
      this.stick = null; this.stickId = null; this.held = {};
      this.flyH = 18;                        // the fly's chosen cruising height
      this.objects = [];
      this._populate();
    },

    _populate: function () {
      var i, a, r, o = this.objects;
      function spot() { var a = rand(0, TAU), r = Math.sqrt(Math.random()) * (R - 12); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; }
      // the barn and pond, one each, off to the sides
      o.push({ t: 'barn', x: -70, z: 90 });
      o.push({ t: 'pond', x: 80, z: 60, r: 34 });
      for (i = 0; i < 26; i++) { a = spot(); o.push({ t: 'tree', x: a.x, z: a.z, s: rand(0.8, 1.3), sway: rand(0, TAU) }); }
      for (i = 0; i < 16; i++) { a = spot(); o.push({ t: 'rock', x: a.x, z: a.z, s: rand(0.7, 1.4) }); }
      for (i = 0; i < 26; i++) { a = spot(); o.push({ t: 'bush', x: a.x, z: a.z, s: rand(0.7, 1.2) }); }
      for (i = 0; i < 40; i++) { a = spot(); o.push({ t: 'flower', x: a.x, z: a.z, c: ['#ff5b7a', '#ffd24c', '#ff8ac0', '#7ec8ff', '#c88cff'][(Math.random() * 5) | 0] }); }
      for (i = 0; i < 22; i++) { a = spot(); o.push({ t: 'apple', x: a.x, z: a.z }); }
      for (i = 0; i < 14; i++) { a = spot(); o.push({ t: 'banana', x: a.x, z: a.z }); }
      // a few poops already about, so a fly has breakfast waiting
      for (i = 0; i < 10; i++) { a = spot(); o.push({ t: 'poop', x: a.x, z: a.z, age: 0 }); }
      // other animals, ambling on their own little errands
      var herd = ['cow', 'chick', 'pig', 'sheep', 'duck'];
      for (i = 0; i < 10; i++) {
        a = spot();
        o.push({ t: 'critter', kind: herd[(Math.random() * herd.length) | 0], x: a.x, z: a.z,
                 dir: rand(0, TAU), turn: 0, step: rand(0, TAU), spd: rand(3, 7) });
      }
    },

    /* ── the on-screen controls ───────────────────────────────── */

    _showButtons: function () {
      var b = this.el.buttons || {};
      var sp = this.A.special;
      if (b.poop) b.poop.hidden = false;
      if (b.butt) b.butt.hidden = sp !== 'butt';
      if (b.jump) b.jump.hidden = sp !== 'jump';
      if (b.up)   b.up.hidden   = sp !== 'alt';
      if (b.down) b.down.hidden = sp !== 'alt';
    },

    _bind: function () {
      var self = this;
      // The left of the screen is a thumb-stick; the right has the buttons.
      this._down = function (e) {
        if (self.paused) return;
        var r = self.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (self.stickId == null && x < self.W * 0.6) {
          self.stickId = e.pointerId;
          self.stickBase = { x: x, y: y };
          self.stick = { x: 0, y: 0 };
          try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {}
          e.preventDefault();
        }
      };
      this._move = function (e) {
        if (self.stickId !== e.pointerId || !self.stickBase) return;
        var r = self.canvas.getBoundingClientRect();
        var dx = (e.clientX - r.left) - self.stickBase.x, dy = (e.clientY - r.top) - self.stickBase.y;
        var mx = self.W * 0.16;
        self.stick = { x: clamp(dx / mx, -1, 1), y: clamp(dy / mx, -1, 1) };
        e.preventDefault();
      };
      this._up = function (e) {
        if (self.stickId === e.pointerId) { self.stickId = null; self.stick = null; self.stickBase = null; }
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      this.canvas.addEventListener('pointerup', this._up, { passive: false });
      this.canvas.addEventListener('pointercancel', this._up, { passive: false });

      // The action buttons: a tap for poop/butt/jump, a hold for the fly's up/down.
      var b = this.el.buttons || {};
      this._btnHandlers = [];
      function tap(el, fn) { if (!el) return; var h = function (e) { e.preventDefault(); fn(); }; el.addEventListener('pointerdown', h, { passive: false }); self._btnHandlers.push([el, 'pointerdown', h]); }
      function hold(el, key) {
        if (!el) return;
        var dn = function (e) { e.preventDefault(); self.held[key] = true; };
        var upf = function (e) { self.held[key] = false; };
        el.addEventListener('pointerdown', dn, { passive: false });
        el.addEventListener('pointerup', upf); el.addEventListener('pointercancel', upf); el.addEventListener('pointerleave', upf);
        self._btnHandlers.push([el, 'pointerdown', dn], [el, 'pointerup', upf], [el, 'pointercancel', upf], [el, 'pointerleave', upf]);
      }
      tap(b.poop, function () { self.poop(); });
      tap(b.butt, function () { self.headbutt(); });
      tap(b.jump, function () { self.jump(); });
      hold(b.up, 'up'); hold(b.down, 'down');
    },

    _unbind: function () {
      if (this._down) {
        this.canvas.removeEventListener('pointerdown', this._down);
        this.canvas.removeEventListener('pointermove', this._move);
        this.canvas.removeEventListener('pointerup', this._up);
        this.canvas.removeEventListener('pointercancel', this._up);
      }
      if (this._btnHandlers) this._btnHandlers.forEach(function (h) { h[0].removeEventListener(h[1], h[2]); });
      this._btnHandlers = null;
      this._down = this._move = this._up = null;
    },

    /* ── the animal's own tricks ──────────────────────────────── */

    poop: function () {
      if (!this.running || this.paused) return;
      if (this.belly < 22) { this._flag('need to eat!', '#ffd24c'); global.RoarAudio.sfx('warn'); return; }
      this.belly = Math.max(0, this.belly - 22);
      this.objects.push({ t: 'poop', x: this.pos.x - Math.sin(this.yaw) * 10, z: this.pos.z - Math.cos(this.yaw) * 10, age: 0, pop: 1 });
      // keep the meadow from filling up entirely with poop
      var poops = this.objects.filter(function (o) { return o.t === 'poop'; });
      if (poops.length > 26) { var old = poops[0]; this.objects.splice(this.objects.indexOf(old), 1); }
      this.pooped = 1;
      this._add(1, '💩!');
      global.RoarAudio.sfx('puff');
    },

    headbutt: function () {
      if (!this.running || this.paused) return;
      this.butt = 1;
      global.RoarAudio.sfx('thud');
      var self = this, hx = this.pos.x + Math.sin(this.yaw) * 16, hz = this.pos.z + Math.cos(this.yaw) * 16, hit = 0;
      this.objects.forEach(function (o) {
        if (o.t === 'pond' || o.t === 'barn' || o.knock) return;
        var dx = o.x - hx, dz = o.z - hz;
        if (dx * dx + dz * dz < 26 * 26 && (o.t === 'rock' || o.t === 'bush' || o.t === 'apple' || o.t === 'banana' || o.t === 'critter' || o.t === 'tree')) {
          var a = Math.atan2(o.x - self.pos.x, o.z - self.pos.z);
          o.knock = { vx: Math.sin(a) * rand(60, 100), vz: Math.cos(a) * rand(60, 100), vy: rand(60, 110), y: 0, spin: rand(-8, 8), rot: 0 };
          if (o.t === 'tree') { o.knock = { vx: 0, vz: 0, vy: 0, y: 0, spin: 0, rot: 0, shake: 0.6 }; self.objects.push({ t: 'apple', x: o.x + rand(-6, 6), z: o.z + rand(4, 10) }); }
          hit++;
        }
      });
      if (hit) { this._add(2 * hit, 'BONK!'); }
    },

    jump: function () {
      if (!this.running || this.paused) return;
      if (this.y > 0.5) return;              // already in the air
      this.vy = 78;
      global.RoarAudio.sfx('puff');
      this._jumpArmed = true;                // a tree overhead at the top drops a banana
    },

    _add: function (n, label) {
      this.score += n;
      if (this.score > this.best) { this.best = this.score; this.newBest = true; save(SAVED, String(this.best)); }
      if (label) this._flag(label, '#9df08a');
    },

    _flag: function (text, c) { this.pops.push({ text: text, c: c || '#fff', t: 0 }); },

    /* ── the loop ─────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this._step(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _step: function (dt) {
      var A = this.A, i, o;

      // steering from the thumb-stick
      var tx = this.stick ? this.stick.x : 0, ty = this.stick ? this.stick.y : 0;
      this.yaw += tx * A.turn * dt;
      var drive = -ty;                       // push up to go forward
      var moved = Math.abs(drive) > 0.05;
      if (moved) {
        var sp = drive * A.speed;
        this.pos.x += Math.sin(this.yaw) * sp * dt;
        this.pos.z += Math.cos(this.yaw) * sp * dt;
        this.walk += Math.abs(sp) * dt * 0.5;
      }
      // keep to the meadow
      var d = Math.hypot(this.pos.x, this.pos.z);
      if (d > R - 6) { var k = (R - 6) / d; this.pos.x *= k; this.pos.z *= k; }

      // height: the fly cruises at a hover it can raise or lower; others land.
      if (A.fly) {
        if (this.held.up) this.flyH = clamp(this.flyH + 40 * dt, 6, 70);
        if (this.held.down) this.flyH = clamp(this.flyH - 40 * dt, 6, 70);
        this.y += (this.flyH - this.y) * Math.min(1, dt * 4);
      } else {
        this.vy -= 200 * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          if (this._jumpArmed && this.vy < 0) this._jumpArmed = false;
          this.y = 0; this.vy = 0;
        }
        // a monkey at the top of a jump under a tree knocks a banana loose
        if (this._jumpArmed && this.vy < 6 && this.y > 20) {
          this._jumpArmed = false;
          for (i = 0; i < this.objects.length; i++) {
            o = this.objects[i];
            if (o.t === 'tree' && (o.x - this.pos.x) * (o.x - this.pos.x) + (o.z - this.pos.z) * (o.z - this.pos.z) < 20 * 20) {
              this.objects.push({ t: 'banana', x: this.pos.x + rand(-4, 4), z: this.pos.z + rand(-4, 4) });
              o.shake = 0.5; this._add(2, 'nice!'); global.RoarAudio.sfx('gold'); break;
            }
          }
        }
      }

      // the smooth follow camera: an eye a little way behind, at head height
      var tex = this.pos.x - Math.sin(this.yaw) * A.back;
      var tez = this.pos.z - Math.cos(this.yaw) * A.back;
      var lag = Math.min(1, dt * 6);
      this.eyeX += (tex - this.eyeX) * lag;
      this.eyeZ += (tez - this.eyeZ) * lag;
      this.eyeY = A.eye + this.y * 0.6;
      this.cosY = Math.cos(this.yaw); this.sinY = Math.sin(this.yaw);

      // eat anything edible we are standing on (or hovering over)
      var er = A.fly ? 12 : 11;
      for (i = this.objects.length - 1; i >= 0; i--) {
        o = this.objects[i];
        if (o.knock || !A.eats[o.t]) continue;
        var ddx = o.x - this.pos.x, ddz = o.z - this.pos.z;
        // the fly must be low enough to reach the poop on the ground
        if (A.fly && o.t === 'poop' && this.y > 20) continue;
        if (ddx * ddx + ddz * ddz < er * er) {
          this.objects.splice(i, 1);
          this.belly = Math.min(100, this.belly + 16);
          this.chomp = 1; this._add(1);
          global.RoarAudio.sfx('nom');
          this._respawn(o.t);
        }
      }

      // knocked-away things arc through the air and settle
      for (i = 0; i < this.objects.length; i++) {
        o = this.objects[i];
        if (o.knock) {
          var kn = o.knock;
          if (kn.shake != null) { o.shake = kn.shake; delete o.knock; continue; }
          kn.vy -= 200 * dt; kn.y += kn.vy * dt;
          o.x += kn.vx * dt; o.z += kn.vz * dt; kn.rot += kn.spin * dt;
          if (kn.y <= 0) { kn.y = 0; kn.vy *= -0.4; kn.vx *= 0.6; kn.vz *= 0.6; if (Math.abs(kn.vy) < 12) { delete o.knock; } }
          var od = Math.hypot(o.x, o.z); if (od > R - 6) { var kk = (R - 6) / od; o.x *= kk; o.z *= kk; }
        }
        if (o.shake) o.shake = Math.max(0, o.shake - dt);
        if (o.t === 'poop') o.age = (o.age || 0) + dt;
        // the other animals wander about
        if (o.t === 'critter') {
          o.turn += dt; if (o.turn > rand(1.5, 3.5)) { o.dir += rand(-1.2, 1.2); o.turn = 0; }
          o.x += Math.sin(o.dir) * o.spd * dt; o.z += Math.cos(o.dir) * o.spd * dt;
          o.step += o.spd * dt * 0.4;
          var cd = Math.hypot(o.x, o.z); if (cd > R - 10) { o.dir += Math.PI; o.x *= (R - 10) / cd; o.z *= (R - 10) / cd; }
        }
      }

      this.chomp = Math.max(0, this.chomp - dt * 2.5);
      this.pooped = Math.max(0, this.pooped - dt * 2);
      this.butt = Math.max(0, this.butt - dt * 3);
      for (i = this.pops.length - 1; i >= 0; i--) { this.pops[i].t += dt; if (this.pops[i].t > 1.1) this.pops.splice(i, 1); }
      if (this.cfg.onScore) this.cfg.onScore(this.score, this.best);
    },

    _respawn: function (t) {
      if (t === 'poop') return;             // eaten poop just goes
      var a = rand(0, TAU), r = Math.sqrt(Math.random()) * (R - 14);
      this.objects.push({ t: t, x: Math.cos(a) * r, z: Math.sin(a) * r,
                          c: t === 'flower' ? ['#ff5b7a', '#ffd24c', '#ff8ac0', '#7ec8ff', '#c88cff'][(Math.random() * 5) | 0] : null });
    },

    /* ── projection ───────────────────────────────────────────── */

    _cam: function (x, y, z) {
      var dx = x - this.eyeX, dz = z - this.eyeZ;
      return { rx: dx * this.cosY - dz * this.sinY, ry: y - this.eyeY, rz: dx * this.sinY + dz * this.cosY };
    },
    _project: function (x, y, z) {
      var p = this._cam(x, y, z);
      if (p.rz < 4) return null;
      var s = this.f / p.rz;
      return { sx: this.W / 2 + p.rx * s, sy: this.hz - p.ry * s, s: s, dz: p.rz };
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;

      // sky
      var sky = c.createLinearGradient(0, 0, 0, this.hz);
      sky.addColorStop(0, '#7ec6ff'); sky.addColorStop(1, '#d8f0ff');
      c.fillStyle = sky; c.fillRect(0, 0, W, this.hz + 1);
      // sun
      c.fillStyle = 'rgba(255,244,190,.95)';
      c.beginPath(); c.arc(W * 0.8, this.hz * 0.4, Math.min(W, H) * 0.07, 0, TAU); c.fill();
      // far hills for depth
      c.fillStyle = '#8fd07a';
      c.beginPath(); c.moveTo(0, this.hz);
      for (var hx = 0; hx <= W; hx += W / 8) c.lineTo(hx, this.hz - 18 - 14 * Math.sin(hx * 0.9 + this.pos.x * 0.01));
      c.lineTo(W, this.hz); c.closePath(); c.fill();

      // ground
      var gr = c.createLinearGradient(0, this.hz, 0, H);
      gr.addColorStop(0, '#8fd06a'); gr.addColorStop(0.5, '#5fb04a'); gr.addColorStop(1, '#3f8f38');
      c.fillStyle = gr; c.fillRect(0, this.hz, W, H - this.hz);

      this._grass(c);

      // everything standing in the world, far things first
      var self = this, draw = [];
      this.objects.forEach(function (o) {
        var lift = (o.knock ? o.knock.y : 0);
        var p = self._project(o.x, lift, o.z);
        if (p) draw.push({ o: o, p: p });
      });
      // the hero animal is a billboard too, so it sorts in with the rest
      var hp = this._project(this.pos.x, this.y, this.pos.z);
      if (hp) draw.push({ hero: true, p: hp });
      draw.sort(function (a, b) { return b.p.dz - a.p.dz; });
      draw.forEach(function (it) {
        if (it.hero) self._hero(c, it.p);
        else self._object(c, it.o, it.p);
      });

      this._pops(c);
      this._hud(c);
      this._joystick(c);
    },

    // The grass carpet: a jittered grid of blades in the world, projected so
    // they stream past underfoot and give the ground real depth.
    _grass: function (c) {
      var step = 7, near = 6, far = 150;
      var ox = Math.floor(this.eyeX / step), oz = Math.floor(this.eyeZ / step);
      var reach = Math.ceil(far / step);
      c.lineWidth = 1;
      for (var gz = -reach; gz <= reach; gz++) {
        for (var gx = -reach; gx <= reach; gx++) {
          var cx = ox + gx, cz = oz + gz;
          var wx = cx * step + hash(cx, cz) * step, wz = cz * step + hash(cz, cx) * step;
          var p = this._cam(wx, 0, wz);
          if (p.rz < near || p.rz > far) continue;
          var s = this.f / p.rz;
          var sx = this.W / 2 + p.rx * s, sy = this.hz - p.ry * s;
          if (sx < -10 || sx > this.W + 10) continue;
          var bh = s * (1.3 + hash(cx + 7, cz) * 1.4);      // blade height in px
          var lean = (hash(cx, cz + 3) - 0.5) * s * 1.2;
          var g = 120 + (hash(cx + 1, cz + 1) * 50) | 0;
          c.strokeStyle = 'rgb(' + (40 + (g * 0.3 | 0)) + ',' + g + ',' + (48 + (g * 0.2 | 0)) + ')';
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + lean, sy - bh); c.stroke();
        }
      }
    },

    _shadow: function (c, p, w) {
      c.fillStyle = 'rgba(0,0,0,.18)';
      c.beginPath(); c.ellipse(p.sx, p.sy, w, w * 0.34, 0, 0, TAU); c.fill();
    },

    _object: function (c, o, p) {
      // Objects are billboards drawn in sprite units, a fraction of a world
      // unit, so scale the projection down before handing it on.
      p = { sx: p.sx, sy: p.sy, s: p.s * SPRITE, dz: p.dz };
      var s = p.s;
      switch (o.t) {
        case 'tree':   return this._tree(c, o, p);
        case 'rock':   this._shadow(c, p, 16 * s * o.s); this._rock(c, o, p); return;
        case 'bush':   this._shadow(c, p, 15 * s * o.s); this._bush(c, o, p); return;
        case 'flower': return this._flower(c, o, p);
        case 'apple':  this._shadow(c, p, 5 * s); this._fruit(c, p, '#ff4d4d', '#ffd7d7'); return;
        case 'banana': this._shadow(c, p, 6 * s); this._banana(c, p); return;
        case 'poop':   this._shadow(c, p, 8 * s); this._poop(c, o, p); return;
        case 'pond':   return this._pond(c, o, p);
        case 'barn':   this._shadow(c, p, 40 * s); this._barn(c, p); return;
        case 'critter': return this._critter(c, o, p);
      }
    },

    _tree: function (c, o, p) {
      var s = p.s, sc = s * o.s, rot = (o.knock ? o.knock.rot : 0) + (o.shake ? Math.sin(o.shake * 40) * 0.05 : 0);
      this._shadow(c, p, 26 * sc);
      c.save(); c.translate(p.sx, p.sy); c.rotate(rot);
      c.fillStyle = '#8a5a2b'; c.fillRect(-4 * sc, -34 * sc, 8 * sc, 34 * sc);
      c.fillStyle = '#3f9a44';
      c.beginPath(); c.arc(0, -46 * sc, 22 * sc, 0, TAU); c.fill();
      c.fillStyle = '#4fb054';
      c.beginPath(); c.arc(-9 * sc, -52 * sc, 13 * sc, 0, TAU); c.arc(11 * sc, -50 * sc, 12 * sc, 0, TAU); c.fill();
      c.restore();
    },
    _rock: function (c, o, p) {
      var sc = p.s * o.s;
      c.save(); c.translate(p.sx, p.sy); c.rotate(o.knock ? o.knock.rot : 0);
      c.fillStyle = '#9aa2ab'; c.beginPath();
      c.moveTo(-14 * sc, 0); c.lineTo(-9 * sc, -12 * sc); c.lineTo(4 * sc, -15 * sc); c.lineTo(14 * sc, -6 * sc); c.lineTo(11 * sc, 0); c.closePath(); c.fill();
      c.fillStyle = '#b8c0c8'; c.beginPath();
      c.moveTo(-9 * sc, -12 * sc); c.lineTo(4 * sc, -15 * sc); c.lineTo(2 * sc, -8 * sc); c.lineTo(-6 * sc, -7 * sc); c.closePath(); c.fill();
      c.restore();
    },
    _bush: function (c, o, p) {
      var sc = p.s * o.s;
      c.save(); c.translate(p.sx, p.sy); c.rotate(o.knock ? o.knock.rot : 0);
      c.fillStyle = '#3f9a44';
      c.beginPath(); c.arc(-8 * sc, -6 * sc, 9 * sc, 0, TAU); c.arc(6 * sc, -6 * sc, 10 * sc, 0, TAU); c.arc(-1 * sc, -12 * sc, 10 * sc, 0, TAU); c.fill();
      c.restore();
    },
    _flower: function (c, o, p) {
      var sc = p.s;
      c.strokeStyle = '#3f8f38'; c.lineWidth = Math.max(1, 1.6 * sc);
      c.beginPath(); c.moveTo(p.sx, p.sy); c.lineTo(p.sx, p.sy - 10 * sc); c.stroke();
      c.fillStyle = o.c || '#ff5b7a';
      for (var k = 0; k < 5; k++) { var a = k * TAU / 5; c.beginPath(); c.arc(p.sx + Math.cos(a) * 4 * sc, p.sy - 10 * sc + Math.sin(a) * 4 * sc, 3 * sc, 0, TAU); c.fill(); }
      c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(p.sx, p.sy - 10 * sc, 2.6 * sc, 0, TAU); c.fill();
    },
    _fruit: function (c, p, col, shine) {
      var sc = p.s;
      c.fillStyle = col; c.beginPath(); c.arc(p.sx, p.sy - 6 * sc, 6 * sc, 0, TAU); c.fill();
      c.fillStyle = shine; c.beginPath(); c.arc(p.sx - 2 * sc, p.sy - 8 * sc, 2 * sc, 0, TAU); c.fill();
      c.strokeStyle = '#6b3f1d'; c.lineWidth = Math.max(1, 1.4 * sc);
      c.beginPath(); c.moveTo(p.sx, p.sy - 11 * sc); c.lineTo(p.sx + 2 * sc, p.sy - 14 * sc); c.stroke();
    },
    _banana: function (c, p) {
      var sc = p.s;
      c.save(); c.translate(p.sx, p.sy - 6 * sc); c.rotate(-0.4);
      c.fillStyle = '#ffd83a'; c.lineWidth = 0;
      c.beginPath(); c.ellipse(0, 0, 9 * sc, 4 * sc, 0, 0, TAU); c.fill();
      c.fillStyle = '#f3f0c0'; c.beginPath(); c.ellipse(0, -1 * sc, 7 * sc, 2 * sc, 0, 0, TAU); c.fill();
      c.restore();
    },
    _poop: function (c, o, p) {
      var sc = p.s, wob = o.pop ? Math.max(0, 1 - (o.age || 0)) : 0;
      c.save(); c.translate(p.sx, p.sy - wob * 8 * sc); c.scale(1, 1 - wob * 0.2);
      c.fillStyle = '#7a4a22';
      c.beginPath(); c.ellipse(0, 0, 8 * sc, 3.2 * sc, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(0, -4 * sc, 6 * sc, 3 * sc, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(0, -8 * sc, 4 * sc, 2.4 * sc, 0, 0, TAU); c.fill();
      c.fillStyle = '#8a5a2b'; c.beginPath(); c.arc(0, -10 * sc, 1.6 * sc, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(-2 * sc, -6 * sc, 1.3 * sc, 0, TAU); c.arc(2 * sc, -6 * sc, 1.3 * sc, 0, TAU); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.arc(-2 * sc, -6 * sc, 0.6 * sc, 0, TAU); c.arc(2 * sc, -6 * sc, 0.6 * sc, 0, TAU); c.fill();
      c.restore();
    },
    _pond: function (c, o, p) {
      var sc = p.s;
      c.fillStyle = 'rgba(70,160,220,.85)';
      c.beginPath(); c.ellipse(p.sx, p.sy, o.r * sc, o.r * 0.4 * sc, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.beginPath(); c.ellipse(p.sx - o.r * 0.3 * sc, p.sy - o.r * 0.08 * sc, o.r * 0.4 * sc, o.r * 0.12 * sc, 0, 0, TAU); c.fill();
    },
    _barn: function (c, p) {
      var sc = p.s;
      c.fillStyle = '#c0392b'; c.fillRect(p.sx - 34 * sc, p.sy - 44 * sc, 68 * sc, 44 * sc);
      c.fillStyle = '#8f271c'; c.beginPath();
      c.moveTo(p.sx - 40 * sc, p.sy - 44 * sc); c.lineTo(p.sx, p.sy - 66 * sc); c.lineTo(p.sx + 40 * sc, p.sy - 44 * sc); c.closePath(); c.fill();
      c.fillStyle = '#6b3f1d'; c.fillRect(p.sx - 12 * sc, p.sy - 30 * sc, 24 * sc, 30 * sc);
      c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, 2 * sc);
      c.beginPath(); c.moveTo(p.sx, p.sy - 30 * sc); c.lineTo(p.sx, p.sy); c.moveTo(p.sx - 12 * sc, p.sy - 15 * sc); c.lineTo(p.sx + 12 * sc, p.sy - 15 * sc); c.stroke();
    },
    _critter: function (c, o, p) {
      this._shadow(c, p, 11 * p.s);
      var sc = p.s, bob = Math.sin(o.step) * 1.5 * sc, C = {
        cow: ['#f4f4f4', '#333'], chick: ['#ffd83a', '#ff8a2b'], pig: ['#ff9ec2', '#e07ba0'],
        sheep: ['#f0eef0', '#333'], duck: ['#ffffff', '#ff9f1c']
      }[o.kind] || ['#f4f4f4', '#333'];
      c.save(); c.translate(p.sx, p.sy - bob);
      c.fillStyle = C[0];
      c.beginPath(); c.ellipse(0, -8 * sc, 11 * sc, 8 * sc, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(-9 * sc, -14 * sc, 6 * sc, 0, TAU); c.fill();     // head
      c.fillStyle = C[1];
      if (o.kind === 'cow') { c.beginPath(); c.ellipse(3 * sc, -6 * sc, 4 * sc, 3 * sc, 0, 0, TAU); c.fill(); }
      c.fillStyle = '#000';
      c.beginPath(); c.arc(-11 * sc, -15 * sc, 1.2 * sc, 0, TAU); c.fill();  // eye
      c.strokeStyle = C[0]; c.lineWidth = 3 * sc;
      c.beginPath(); c.moveTo(-4 * sc, 0); c.lineTo(-4 * sc, 4 * sc); c.moveTo(4 * sc, 0); c.lineTo(4 * sc, 4 * sc); c.stroke();
      c.restore();
    },

    /* ── the hero, up close ───────────────────────────────────── */

    _hero: function (c, p) {
      var s = p.s * this.A.size, legs = Math.sin(this.walk * 6) * 0.5;
      // shadow on the ground beneath, not lifted with the jump
      var g = this._project(this.pos.x, 0, this.pos.z);
      if (g) this._shadow(c, g, s * 1.0);
      c.save();
      c.translate(p.sx, p.sy);
      var bob = (Math.abs(Math.sin(this.walk * 6)) * 0.06) * s;
      c.translate(0, -bob);
      if (this.kind === 'goat') this._goat(c, s, legs);
      else if (this.kind === 'monkey') this._monkey(c, s, legs);
      else this._fly(c, s);
      c.restore();
    },

    // A goat seen from behind, head up — cream body, four legs, horns, a beard.
    _goat: function (c, s, legs) {
      var chomp = this.chomp, butt = this.butt;
      c.save(); if (butt > 0.01) c.translate(0, butt * -0.3 * s);
      // back legs
      c.strokeStyle = '#e6ddc8'; c.lineWidth = 2.4 * s; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-1.4 * s, -2 * s); c.lineTo(-1.4 * s + legs * s, 0);
      c.moveTo(1.4 * s, -2 * s); c.lineTo(1.4 * s - legs * s, 0);
      c.moveTo(-2.4 * s, -4 * s); c.lineTo(-2.4 * s - legs * s, -1.6 * s);
      c.moveTo(2.4 * s, -4 * s); c.lineTo(2.4 * s + legs * s, -1.6 * s);
      c.stroke();
      // body
      c.fillStyle = '#f4eeda';
      c.beginPath(); c.ellipse(0, -5.2 * s, 3.5 * s, 3.4 * s, 0, 0, TAU); c.fill();
      // tail
      c.fillStyle = '#efe6cf'; c.beginPath(); c.ellipse(0, -8 * s, 1 * s, 1.4 * s, 0, 0, TAU); c.fill();
      // head lifting up over the back
      c.save(); c.translate(0, -9.2 * s - (chomp > 0.01 ? 0 : 1.2 * s) + chomp * 1.4 * s);
      c.fillStyle = '#f7f2e2'; c.beginPath(); c.ellipse(0, 0, 2.3 * s, 2.6 * s, 0, 0, TAU); c.fill();
      // ears
      c.fillStyle = '#e6ddc8'; c.beginPath(); c.ellipse(-2.6 * s, 0.4 * s, 1.2 * s, 0.6 * s, -0.5, 0, TAU); c.ellipse(2.6 * s, 0.4 * s, 1.2 * s, 0.6 * s, 0.5, 0, TAU); c.fill();
      // horns
      c.strokeStyle = '#c9a24a'; c.lineWidth = 1.2 * s; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-1.1 * s, -2 * s); c.quadraticCurveTo(-2 * s, -3.6 * s, -1.2 * s, -4.4 * s);
      c.moveTo(1.1 * s, -2 * s); c.quadraticCurveTo(2 * s, -3.6 * s, 1.2 * s, -4.4 * s); c.stroke();
      // eyes + beard
      c.fillStyle = '#2a2118'; c.beginPath(); c.arc(-0.9 * s, 0.2 * s, 0.5 * s, 0, TAU); c.arc(0.9 * s, 0.2 * s, 0.5 * s, 0, TAU); c.fill();
      c.fillStyle = '#efe6cf'; c.beginPath(); c.moveTo(-0.8 * s, 2.2 * s); c.lineTo(0.8 * s, 2.2 * s); c.lineTo(0, 4 * s); c.closePath(); c.fill();
      c.restore();
      c.restore();
    },

    _monkey: function (c, s, legs) {
      // legs + arms
      c.strokeStyle = '#7a4a24'; c.lineWidth = 2.2 * s; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-1.6 * s, -2 * s); c.lineTo(-1.6 * s + legs * s, 0);
      c.moveTo(1.6 * s, -2 * s); c.lineTo(1.6 * s - legs * s, 0);
      c.moveTo(-3 * s, -6 * s); c.lineTo(-4.4 * s, -4 * s + legs * s);
      c.moveTo(3 * s, -6 * s); c.lineTo(4.4 * s, -4 * s - legs * s);
      c.stroke();
      // tail, curling
      c.strokeStyle = '#8a5a2e'; c.lineWidth = 1.6 * s;
      c.beginPath(); c.moveTo(0, -4 * s); c.quadraticCurveTo(5 * s, -3 * s, 4.5 * s, -8 * s); c.stroke();
      // body + head
      c.fillStyle = '#8a5a2e'; c.beginPath(); c.ellipse(0, -5.4 * s, 3.4 * s, 3.4 * s, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(0, -10 * s, 3 * s, 0, TAU); c.fill();
      c.fillStyle = '#c9915a'; c.beginPath(); c.arc(-3 * s, -10 * s, 1.4 * s, 0, TAU); c.arc(3 * s, -10 * s, 1.4 * s, 0, TAU); c.fill();  // ears
      c.fillStyle = '#e8c69a'; c.beginPath(); c.ellipse(0, -9.3 * s, 2.1 * s, 2.3 * s, 0, 0, TAU); c.fill();                                 // face
      c.fillStyle = '#2a2118'; c.beginPath(); c.arc(-0.9 * s, -10 * s, 0.5 * s, 0, TAU); c.arc(0.9 * s, -10 * s, 0.5 * s, 0, TAU); c.fill();
      c.strokeStyle = '#7a4a24'; c.lineWidth = 0.6 * s; c.beginPath(); c.arc(0, -8.4 * s, 1 * s, 0.2, Math.PI - 0.2); c.stroke();             // smile
    },

    _fly: function (c, s) {
      var flap = Math.sin(performance.now() / 40) * 0.5 + 0.5;
      // wings
      c.fillStyle = 'rgba(200,225,255,.65)';
      c.save(); c.translate(0, -6 * s);
      c.beginPath(); c.ellipse(-3.5 * s, -1 * s, 3.2 * s, 1.4 * s * (0.5 + flap), -0.5, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(3.5 * s, -1 * s, 3.2 * s, 1.4 * s * (0.5 + flap), 0.5, 0, TAU); c.fill();
      c.restore();
      // legs dangling
      c.strokeStyle = '#222'; c.lineWidth = 0.8 * s; c.lineCap = 'round';
      c.beginPath();
      for (var k = -1; k <= 1; k++) { c.moveTo(k * 1.5 * s, -4 * s); c.lineTo(k * 2 * s, -1 * s); }
      c.stroke();
      // body
      c.fillStyle = '#2b2b33'; c.beginPath(); c.ellipse(0, -6 * s, 2.6 * s, 3.4 * s, 0, 0, TAU); c.fill();
      c.fillStyle = '#3a3a44'; c.beginPath(); c.ellipse(0, -4.5 * s, 2.2 * s, 1.6 * s, 0, 0, TAU); c.fill();
      // big red eyes
      c.fillStyle = '#c0392b'; c.beginPath(); c.arc(-1.5 * s, -9 * s, 1.7 * s, 0, TAU); c.arc(1.5 * s, -9 * s, 1.7 * s, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-2 * s, -9.6 * s, 0.6 * s, 0, TAU); c.arc(1 * s, -9.6 * s, 0.6 * s, 0, TAU); c.fill();
    },

    /* ── overlays ─────────────────────────────────────────────── */

    _pops: function (c) {
      var self = this;
      this.pops.forEach(function (f) {
        var a = Math.max(0, 1 - f.t / 1.1);
        c.globalAlpha = a; c.fillStyle = f.c;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '900 ' + Math.round(self.W * 0.06) + 'px system-ui, sans-serif';
        c.fillText(f.text, self.W / 2, self.H * 0.5 - f.t * self.H * 0.14);
      });
      c.globalAlpha = 1;
    },

    _hud: function (c) {
      var W = this.W;
      // score
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillStyle = 'rgba(0,0,0,.35)'; c.font = '900 20px system-ui, sans-serif';
      c.fillText(this.A.emoji + ' ' + this.A.name, 14, 12);
      c.fillStyle = '#fff'; c.fillText(this.A.emoji + ' ' + this.A.name, 13, 11);
      c.fillStyle = '#ffd24c'; c.font = '900 24px system-ui, sans-serif';
      c.fillText('⭐ ' + this.score, 14, 36);
      // belly meter, top-centre
      var bw = Math.min(W * 0.5, 200), bx = W / 2 - bw / 2, by = 16, bh = 14;
      c.fillStyle = 'rgba(0,0,0,.28)';
      c.beginPath(); if (c.roundRect) c.roundRect(bx, by, bw, bh, bh / 2); else c.rect(bx, by, bw, bh); c.fill();
      c.fillStyle = this.belly > 70 ? '#ff8a5b' : '#9df08a';
      var fw = Math.max(bh, bw * this.belly / 100);
      c.beginPath(); if (c.roundRect) c.roundRect(bx, by, fw, bh, bh / 2); else c.rect(bx, by, fw, bh); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '800 10px system-ui, sans-serif'; c.fillText('BELLY', W / 2, by + bh / 2 + 0.5);
    },

    _joystick: function (c) {
      if (!this.stickBase) {
        // a hint ring where the thumb lives
        var hx = this.W * 0.18, hy = this.H * 0.8;
        c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 2;
        c.beginPath(); c.arc(hx, hy, 34, 0, TAU); c.stroke();
        c.fillStyle = 'rgba(255,255,255,.16)'; c.beginPath(); c.arc(hx, hy, 20, 0, TAU); c.fill();
        return;
      }
      var b = this.stickBase, s = this.stick || { x: 0, y: 0 };
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
      c.beginPath(); c.arc(b.x, b.y, 40, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.beginPath(); c.arc(b.x + s.x * 34, b.y + s.y * 34, 22, 0, TAU); c.fill();
    }
  };

  AnimalSim.hash = hash;                    // exposed for testing
  global.AnimalSim = AnimalSim;
})(window);
