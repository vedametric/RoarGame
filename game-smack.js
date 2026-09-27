/*
 * game-smack.js — "THE SMACK GAME"
 *
 * A big silly head floats in front of you and you get to smack it. A cartoon
 * hand follows your finger; tap and it swings in for a slap. Every smack the
 * head snaps aside, squashes, pulls a daft face — dizzy eyes, tongue out, a
 * big OW — a red hand-print lands on its cheek and stars spin off, then it
 * wobbles back upright on a spring and waits, breathing, for the next one.
 *
 * The head is drawn as a shaded ovoid in a tiny bit of real 3D: the eyes,
 * nose, mouth, brows and ears are pinned to points on the ball and projected
 * through the head's own turn, so when a smack rolls it to the side the whole
 * face rides round the curve and the far ear tucks away behind — it reads as
 * a head turning, not a picture sliding. All painted in code, no images.
 *
 * A fresh face is rolled every time the game loads (and on 🎲 NEW FACE): skin
 * and hair colour, hair style, the size and spacing of the eyes, the brows,
 * the nose, the ears, freckles, maybe glasses — so it's a different daftie to
 * smack each time. Nothing to lose: it just counts your smacks, and the ★
 * keeps your best.
 */
(function (global) {
  'use strict';

  var SAVED = 'smack.best';
  var TAU = Math.PI * 2;

  var SKIN = ['#ffdcb3', '#f1c27d', '#e5b07a', '#c68642', '#a56a3e', '#8d5524', '#ffe0bd', '#d9a066'];
  var HAIR = ['#2b1b0e', '#5a3a1b', '#8a5a2b', '#c9962f', '#e8c559', '#d94f4f', '#3b3b3b',
              '#6b4fa0', '#2f7bd9', '#e35aa0', '#4caf50', '#ff7a3d', '#c0c0c8'];
  var EYES = ['#3b2b1a', '#5a3a1b', '#2f6b8f', '#3b7a3b', '#555', '#7a4fae'];
  var HAIRDOS = ['short', 'puff', 'spikes', 'mohawk', 'bun', 'long', 'bald'];
  var NOSES = ['button', 'round', 'long'];
  var BACKS = ['#8ec5ff', '#ffd36e', '#a0e6a0', '#ffb0c8', '#c7b3ff', '#7fe0d4'];
  var OWS = ['Ow!', 'Ouch!', 'Hey!', 'Oof!', 'Yikes!', 'Ooh!', 'Boop!', 'Ooff!'];
  var EXPR = ['ow', 'dizzy', 'x', 'tongue', 'shock'];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Rotate a head-space point by yaw (around Y) then pitch (around X). Roll is
  // left to the canvas transform, so it isn't applied here.
  function rot(x, y, z, yaw, pitch) {
    var s, c, t;
    c = Math.cos(pitch); s = Math.sin(pitch); t = y * c - z * s; z = y * s + z * c; y = t;   // pitch X
    c = Math.cos(yaw);   s = Math.sin(yaw);   t = x * c + z * s; z = -x * s + z * c; x = t;   // yaw Y
    return { x: x, y: y, z: z };
  }

  var SmackGame = {
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
    },

    setPaused: function (on) {
      this.paused = !!on;
      this.last = performance.now();
    },

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 480;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this.rad = Math.min(this.W, this.H) * 0.27;
      this.cx = this.W / 2;
      this.cy = this.H * 0.46;
      this.f = this.rad * 4.5;                 // focal length: gentle perspective
    },

    _newGame: function () {
      this.score = 0;
      this.newFace();
      this._resetPose();
      this.hand = { x: this.W / 2, y: this.H * 0.86 };
      this.swing = null;
      this.marks = [];
      this.bits = [];
      this.pops = [];
      this.time = 0;
      this._render();
    },

    // Roll a brand-new daftie.
    newFace: function () {
      var f = {
        skin: pick(SKIN),
        hair: pick(HAIR),
        hairdo: pick(HAIRDOS),
        eyeC: pick(EYES),
        eyeSize: rand(0.85, 1.28),
        eyeGap: rand(0.34, 0.5),
        browAngle: rand(-0.5, 0.5),
        browThick: rand(0.7, 1.3),
        nose: pick(NOSES),
        ear: rand(0.85, 1.25),
        wide: rand(0.9, 1.06),
        tall: rand(0.98, 1.18),
        freckles: Math.random() < 0.45,
        glasses: Math.random() < 0.28,
        back: pick(BACKS)
      };
      f.cheek = 'rgba(255,120,120,.35)';
      f.hairDark = shade(f.hair, -0.28);
      f.skinDark = shade(f.skin, -0.22);
      f.skinLight = shade(f.skin, 0.16);
      this.face = f;
    },

    again: function () {
      if (!this.running) return;
      this.newFace();
      this._resetPose();
      this.marks = [];
      try { global.RoarAudio.sfx('sparkle'); } catch (e) {}
      try { global.Say.speak('New face!'); } catch (e) {}
    },

    _resetPose: function () {
      this.yaw = 0; this.yawV = 0;
      this.pitch = 0; this.pitchV = 0;
      this.roll = 0; this.rollV = 0;
      this.sq = 1; this.sqV = 0;             // vertical squash
      this.shake = 0;
      this.expr = null; this.exprT = 0;
    },

    /* ── input: the hand ─────────────────────────────────────────── */

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
        self.hand.x = p.x; self.hand.y = p.y;
        self._smack(p.x, p.y);
      };
      this._move = function (e) {
        if (!self.running || self.paused) return;
        var p = at(e);
        self.hand.x = p.x; self.hand.y = p.y;
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
    },

    _unbind: function () {
      if (!this._down) return;
      this.canvas.removeEventListener('pointerdown', this._down);
      this.canvas.removeEventListener('pointermove', this._move);
      this._down = this._move = null;
    },

    // Start a slap from (x,y). The hand darts to a contact point on the face
    // and back; whether it lands is decided at the swing's apex.
    _smack: function (x, y) {
      var dx = x - this.cx, dy = y - (this.cy);
      var reach = this.rad * 1.15;
      var near = Math.sqrt(dx * dx + dy * dy) <= reach;
      // Contact point: where they tapped if it's on the face, else the cheek.
      var cxp = near ? x : this.cx + (dx < 0 ? -1 : 1) * this.rad * 0.5;
      var cyp = near ? y : this.cy;
      this.swing = {
        t: 0, dur: 0.24,
        x0: x, y0: y,
        cx: cxp, cy: cyp,
        side: (cxp < this.cx) ? -1 : 1,
        hit: false, willHit: near
      };
      try { global.RoarAudio.sfx('whoosh'); } catch (e) {}
    },

    // The hand actually connects.
    _hit: function (sw) {
      this.score++;
      if (this.score > this.best) { this.best = this.score; save(SAVED, String(this.best)); }
      this._render();

      var side = sw.side;                     // -1 hit on its left, +1 on its right
      var power = rand(0.8, 1.25);
      // Knock it away from the hand, with a bit of random wobble.
      this.yawV  += side * 7.5 * power;
      this.rollV += side * 5.5 * power;
      this.pitchV += rand(-2, 3.5);
      this.sqV   -= 9 * power;                 // quick squash, springs back
      this.shake = 16 * power;

      this.expr = pick(EXPR); this.exprT = rand(0.75, 1.05);

      // A red hand-print on the cheek nearest the smack, pinned to the head so
      // it rides round as the head turns. Fades over a few seconds.
      this.marks.push({ nx: side * 0.55, ny: rand(-0.32, -0.05), nz: 0.72, life: 1 });
      if (this.marks.length > 8) this.marks.shift();

      // Stars and sweat off the contact point.
      for (var i = 0; i < 12; i++) {
        var a = rand(0, TAU), v = rand(0.15, 1) * this.H * 0.35;
        this.bits.push({ x: sw.cx, y: sw.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - this.H * 0.1,
          r: rand(6, 14), life: rand(0.45, 0.85), age: 0, star: Math.random() < 0.6, rot: rand(0, TAU) });
      }
      this.pops.push({ x: sw.cx, y: sw.cy - this.rad * 0.3, t: 0, big: power > 1.05 });

      try { global.RoarAudio.sfx('thud'); } catch (e) {}
      if (power > 1.05) { try { global.RoarAudio.sfx('bust'); } catch (e) {} }
      if (Math.random() < 0.55) { try { global.Say.speak(pick(OWS)); } catch (e) {} }
    },

    /* ── the loop ────────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this._step(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _step: function (dt) {
      this.time += dt;

      // Springs pull the head back upright; the impulses above set it swinging.
      this.yaw   = spring(this, 'yaw', 'yawV', dt, 42, 5.5);
      this.pitch = spring(this, 'pitch', 'pitchV', dt, 42, 5.5);
      this.roll  = spring(this, 'roll', 'rollV', dt, 46, 5.5);
      // squash springs toward 1
      this.sqV += (-(this.sq - 1) * 120 - this.sqV * 9) * dt;
      this.sq += this.sqV * dt;
      this.sq = clamp(this.sq, 0.6, 1.35);

      this.shake *= Math.exp(-dt * 9);
      if (this.shake < 0.4) this.shake = 0;

      if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.expr = null; }

      // The swing.
      if (this.swing) {
        var sw = this.swing;
        sw.t += dt;
        var k = sw.t / sw.dur;
        if (!sw.hit && k >= 0.45) { sw.hit = true; if (sw.willHit) this._hit(sw); }
        if (k >= 1) this.swing = null;
      }

      var i, o;
      for (i = this.bits.length - 1; i >= 0; i--) {
        o = this.bits[i];
        o.age += dt; o.vy += this.H * 1.2 * dt;
        o.x += o.vx * dt; o.y += o.vy * dt; o.rot += dt * 6;
        if (o.age >= o.life) this.bits.splice(i, 1);
      }
      for (i = this.marks.length - 1; i >= 0; i--) {
        this.marks[i].life -= dt * 0.32;
        if (this.marks[i].life <= 0) this.marks.splice(i, 1);
      }
      for (i = this.pops.length - 1; i >= 0; i--) {
        this.pops[i].t += dt;
        if (this.pops[i].t > 0.7) this.pops.splice(i, 1);
      }
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
    },

    /* ── drawing ─────────────────────────────────────────────────── */

    // Project a unit head-space point through the current yaw & pitch to a
    // face-local screen offset (roll & squash are applied by the transform).
    _project: function (nx, ny, nz) {
      var f = this.face;
      var p = rot(nx * this.rad * f.wide, ny * this.rad * f.tall, nz * this.rad * 0.95, this.yaw, this.pitch);
      var persp = this.f / (this.f - p.z);
      return { x: p.x * persp, y: -p.y * persp, z: p.z, s: persp };
    },

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      var f = this.face;

      // backdrop: a soft spotlight in this face's colour
      var bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, shade(f.back, 0.22));
      bg.addColorStop(1, shade(f.back, -0.18));
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      var spot = c.createRadialGradient(this.cx, this.cy, this.rad * 0.3, this.cx, this.cy, this.rad * 2.4);
      spot.addColorStop(0, 'rgba(255,255,255,.28)');
      spot.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = spot; c.fillRect(0, 0, W, H);

      var shx = this.shake ? rand(-this.shake, this.shake) : 0;
      var shy = this.shake ? rand(-this.shake, this.shake) : 0;

      c.save();
      c.translate(this.cx + shx, this.cy + shy);
      c.rotate(this.roll);
      c.scale(1 / this.sq, this.sq);            // squash tall/short, keep volume-ish

      this._neck(c);
      this._ears(c);
      this._head(c);
      this._hair(c);
      this._face(c);
      this._marks(c);

      c.restore();

      this._bits(c);
      this._hand(c);
      this._popText(c);
    },

    // shaded ovoid
    _head: function (c) {
      var f = this.face;
      var yaw = this.yaw, pitch = this.pitch;
      var Wd = Math.sqrt(Math.pow(this.rad * f.wide * Math.cos(yaw), 2) + Math.pow(this.rad * 0.95 * Math.sin(yaw), 2));
      var Hd = Math.sqrt(Math.pow(this.rad * f.tall * Math.cos(pitch), 2) + Math.pow(this.rad * 0.95 * Math.sin(pitch), 2));
      this._Wd = Wd; this._Hd = Hd;

      c.save();
      // chin shadow
      c.fillStyle = 'rgba(0,0,0,.12)';
      c.beginPath(); c.ellipse(0, Hd * 0.86, Wd * 0.7, Hd * 0.18, 0, 0, TAU); c.fill();

      var g = c.createRadialGradient(-Wd * 0.35, -Hd * 0.4, Wd * 0.15, 0, 0, Wd * 1.25);
      g.addColorStop(0, f.skinLight);
      g.addColorStop(0.55, f.skin);
      g.addColorStop(1, f.skinDark);
      c.fillStyle = g;
      c.beginPath(); c.ellipse(0, 0, Wd, Hd, 0, 0, TAU); c.fill();
      // rim light
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 3;
      c.beginPath(); c.ellipse(-Wd * 0.05, -Hd * 0.05, Wd * 0.96, Hd * 0.96, 0, Math.PI * 1.05, Math.PI * 1.75); c.stroke();
      c.restore();
    },

    _neck: function (c) {
      var f = this.face, Hd = this.rad * f.tall;
      c.save();
      c.fillStyle = f.skinDark;
      c.fillRect(-this.rad * 0.28, Hd * 0.55, this.rad * 0.56, Hd * 0.7);
      c.restore();
    },

    _ears: function (c) {
      var f = this.face, er = this.rad * 0.2 * f.ear;
      var sides = [-1, 1];
      for (var i = 0; i < sides.length; i++) {
        var p = this._project(sides[i] * 1.02, -0.02, 0.06);
        if (p.z < -this.rad * 0.15) continue;              // tucked behind on a turn
        c.save();
        c.translate(p.x, p.y);
        c.fillStyle = f.skin;
        c.strokeStyle = f.skinDark; c.lineWidth = 2;
        c.beginPath(); c.ellipse(0, 0, er * p.s, er * 1.25 * p.s, 0, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = f.skinDark;
        c.beginPath(); c.ellipse(0, 0, er * 0.45 * p.s, er * 0.7 * p.s, 0, 0, TAU); c.fill();
        c.restore();
      }
    },

    _hair: function (c) {
      var f = this.face;
      if (f.hairdo === 'bald') return;
      var Wd = this._Wd, Hd = this._Hd;
      c.save();
      c.fillStyle = f.hair;
      if (f.hairdo === 'short' || f.hairdo === 'long') {
        c.beginPath();
        c.ellipse(0, -Hd * 0.36, Wd * 1.02, Hd * 0.72, 0, Math.PI, TAU);
        c.fill();
        if (f.hairdo === 'long') {
          c.fillRect(-Wd * 1.0, -Hd * 0.4, Wd * 0.32, Hd * 1.5);
          c.fillRect(Wd * 0.68, -Hd * 0.4, Wd * 0.32, Hd * 1.5);
        }
      } else if (f.hairdo === 'puff') {
        for (var i = -2; i <= 2; i++) {
          c.beginPath(); c.ellipse(i * Wd * 0.4, -Hd * 0.78, Wd * 0.42, Hd * 0.4, 0, 0, TAU); c.fill();
        }
      } else if (f.hairdo === 'spikes') {
        for (var k = -3; k <= 3; k++) {
          c.beginPath();
          c.moveTo(k * Wd * 0.28 - Wd * 0.14, -Hd * 0.55);
          c.lineTo(k * Wd * 0.28, -Hd * 1.15);
          c.lineTo(k * Wd * 0.28 + Wd * 0.14, -Hd * 0.55);
          c.closePath(); c.fill();
        }
        c.beginPath(); c.ellipse(0, -Hd * 0.5, Wd * 0.95, Hd * 0.35, 0, Math.PI, TAU); c.fill();
      } else if (f.hairdo === 'mohawk') {
        c.beginPath();
        c.moveTo(-Wd * 0.18, -Hd * 0.6);
        c.lineTo(0, -Hd * 1.3);
        c.lineTo(Wd * 0.18, -Hd * 0.6);
        c.closePath(); c.fill();
      } else if (f.hairdo === 'bun') {
        c.beginPath(); c.ellipse(0, -Hd * 1.02, Wd * 0.32, Hd * 0.32, 0, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(0, -Hd * 0.5, Wd * 0.95, Hd * 0.4, 0, Math.PI, TAU); c.fill();
      }
      c.restore();
    },

    _face: function (c) {
      var f = this.face;
      var expr = this.expr;
      var le = this._project(-f.eyeGap, 0.16, 0.82);
      var re = this._project(f.eyeGap, 0.16, 0.82);
      var eR = this.rad * 0.15 * f.eyeSize;

      // brows
      var lb = this._project(-f.eyeGap, 0.42, 0.78);
      var rb = this._project(f.eyeGap, 0.42, 0.78);
      c.strokeStyle = f.hairDark; c.lineWidth = Math.max(3, this.rad * 0.05 * f.browThick); c.lineCap = 'round';
      var ba = (expr === 'ow' || expr === 'x') ? 0.5 : (expr === 'shock' ? -0.5 : f.browAngle);
      this._brow(c, lb, eR, ba, 1);
      this._brow(c, rb, eR, ba, -1);

      // eyes
      this._eye(c, le, eR, expr, 1);
      this._eye(c, re, eR, expr, -1);

      // glasses
      if (f.glasses) {
        c.strokeStyle = '#2a2a2a'; c.lineWidth = Math.max(2, this.rad * 0.02);
        c.beginPath(); c.ellipse(le.x, le.y, eR * 1.25, eR * 1.15, 0, 0, TAU); c.stroke();
        c.beginPath(); c.ellipse(re.x, re.y, eR * 1.25, eR * 1.15, 0, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(le.x + eR * 1.2, le.y); c.lineTo(re.x - eR * 1.2, re.y); c.stroke();
      }

      // blush + freckles
      var lc = this._project(-0.55, -0.18, 0.72), rc = this._project(0.55, -0.18, 0.72);
      c.fillStyle = f.cheek;
      c.beginPath(); c.ellipse(lc.x, lc.y, eR * 0.8, eR * 0.55, 0, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(rc.x, rc.y, eR * 0.8, eR * 0.55, 0, 0, TAU); c.fill();
      if (f.freckles) {
        c.fillStyle = f.skinDark;
        for (var s = -1; s <= 1; s += 2) {
          for (var i = 0; i < 3; i++) {
            var fp = this._project(s * (0.42 + i * 0.08), -0.16 + (i % 2) * 0.06, 0.78);
            c.beginPath(); c.arc(fp.x, fp.y, Math.max(1.5, this.rad * 0.012), 0, TAU); c.fill();
          }
        }
      }

      // nose
      this._nose(c);

      // mouth
      this._mouth(c, expr);
    },

    _brow: function (c, p, eR, angle, dir) {
      c.save();
      c.translate(p.x, p.y);
      c.beginPath();
      c.moveTo(-eR * 0.9 * dir, eR * 0.2 + angle * eR * 0.5 * dir);
      c.lineTo(eR * 0.9 * dir, -eR * 0.2 - angle * eR * 0.5 * dir);
      c.stroke();
      c.restore();
    },

    _eye: function (c, p, eR, expr, dir) {
      c.save();
      c.translate(p.x, p.y);
      c.scale(p.s, p.s);
      if (expr === 'x') {
        c.strokeStyle = '#222'; c.lineWidth = eR * 0.28; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-eR * 0.6, -eR * 0.6); c.lineTo(eR * 0.6, eR * 0.6);
        c.moveTo(eR * 0.6, -eR * 0.6); c.lineTo(-eR * 0.6, eR * 0.6); c.stroke();
        c.restore(); return;
      }
      if (expr === 'tongue') {                 // happy closed arcs
        c.strokeStyle = '#222'; c.lineWidth = eR * 0.24; c.lineCap = 'round';
        c.beginPath(); c.arc(0, eR * 0.2, eR * 0.7, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        c.restore(); return;
      }
      var big = expr === 'shock' ? 1.35 : (expr === 'ow' ? 0.7 : 1);
      // white
      c.fillStyle = '#fff';
      c.beginPath(); c.ellipse(0, 0, eR, eR * (expr === 'ow' ? 0.7 : 1.05) * big, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = 1.5; c.stroke();
      // pupil
      var px = 0, py = 0;
      if (expr === 'dizzy') {                  // spiral-ish wandering pupil
        px = Math.cos(this.time * 8 + dir) * eR * 0.35;
        py = Math.sin(this.time * 8 + dir) * eR * 0.35;
      }
      c.fillStyle = this.face.eyeC;
      c.beginPath(); c.arc(px, py, eR * (expr === 'shock' ? 0.4 : 0.5), 0, TAU); c.fill();
      c.fillStyle = '#000';
      c.beginPath(); c.arc(px, py, eR * 0.26, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(px - eR * 0.14, py - eR * 0.16, eR * 0.12, 0, TAU); c.fill();
      c.restore();
    },

    _nose: function (c) {
      var f = this.face, p = this._project(0, -0.05, 1.08);
      c.save();
      c.translate(p.x, p.y);
      c.fillStyle = f.skinDark;
      var n = this.rad * 0.12;
      if (f.nose === 'long') {
        c.beginPath(); c.ellipse(0, 0, n * 0.5, n * 1.1, 0, 0, TAU); c.fill();
      } else if (f.nose === 'round') {
        c.beginPath(); c.arc(0, 0, n * 0.85, 0, TAU); c.fill();
      } else {
        c.beginPath(); c.arc(0, 0, n * 0.6, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,.18)';
      c.beginPath(); c.arc(-n * 0.35, n * 0.2, n * 0.14, 0, TAU); c.fill();
      c.beginPath(); c.arc(n * 0.35, n * 0.2, n * 0.14, 0, TAU); c.fill();
      c.restore();
    },

    _mouth: function (c, expr) {
      var p = this._project(0, -0.5, 0.82);
      var m = this.rad * 0.32;
      c.save();
      c.translate(p.x, p.y);
      c.scale(p.s, p.s);
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (expr === 'ow' || expr === 'shock') {           // big open OW
        c.fillStyle = '#7a2230';
        c.beginPath(); c.ellipse(0, m * 0.1, m * 0.42, m * 0.5, 0, 0, TAU); c.fill();
        c.fillStyle = '#ff7a8a';
        c.beginPath(); c.ellipse(0, m * 0.28, m * 0.24, m * 0.2, 0, 0, TAU); c.fill();
      } else if (expr === 'tongue') {
        c.strokeStyle = '#222'; c.lineWidth = m * 0.12;
        c.beginPath(); c.arc(0, -m * 0.1, m * 0.42, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
        c.fillStyle = '#ff6b81';
        c.beginPath(); c.ellipse(m * 0.12, m * 0.22, m * 0.2, m * 0.28, 0, 0, TAU); c.fill();
      } else if (expr === 'dizzy') {                     // wavy line
        c.strokeStyle = '#222'; c.lineWidth = m * 0.1;
        c.beginPath();
        c.moveTo(-m * 0.4, 0);
        c.quadraticCurveTo(-m * 0.2, -m * 0.2, 0, 0);
        c.quadraticCurveTo(m * 0.2, m * 0.2, m * 0.4, 0);
        c.stroke();
      } else if (expr === 'x') {
        c.strokeStyle = '#222'; c.lineWidth = m * 0.1;
        c.beginPath(); c.arc(0, m * 0.2, m * 0.32, Math.PI, TAU); c.stroke();   // little o/frown
      } else {                                            // resting grin
        c.strokeStyle = '#7a2230'; c.lineWidth = m * 0.12;
        c.beginPath(); c.arc(0, -m * 0.1, m * 0.42, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke();
      }
      c.restore();
    },

    // red hand-prints, pinned to the head
    _marks: function (c) {
      for (var i = 0; i < this.marks.length; i++) {
        var m = this.marks[i], p = this._project(m.nx, m.ny, m.nz);
        if (p.z < -this.rad * 0.1) continue;
        c.save();
        c.globalAlpha = Math.max(0, Math.min(0.8, m.life * 0.8));
        c.translate(p.x, p.y);
        c.scale(p.s, p.s);
        c.fillStyle = '#ff3b5b';
        // palm + four little fingers
        c.beginPath(); c.ellipse(0, this.rad * 0.06, this.rad * 0.13, this.rad * 0.1, 0, 0, TAU); c.fill();
        for (var k = -2; k <= 1; k++) {
          c.beginPath(); c.ellipse(k * this.rad * 0.07 + this.rad * 0.035, -this.rad * 0.06, this.rad * 0.03, this.rad * 0.07, 0, 0, TAU); c.fill();
        }
        c.restore();
      }
      c.globalAlpha = 1;
    },

    /* ── stars, hand, pop text (all in plain screen space) ───────── */

    _bits: function (c) {
      for (var i = 0; i < this.bits.length; i++) {
        var b = this.bits[i];
        c.save();
        c.globalAlpha = Math.max(0, 1 - b.age / b.life);
        c.translate(b.x, b.y);
        c.rotate(b.rot);
        if (b.star) {
          c.fillStyle = '#ffd24c';
          this._star(c, b.r);
        } else {
          c.fillStyle = '#bfe3ff';
          c.beginPath(); c.ellipse(0, 0, b.r * 0.5, b.r * 0.8, 0, 0, TAU); c.fill();
        }
        c.restore();
      }
      c.globalAlpha = 1;
    },

    _star: function (c, r) {
      c.beginPath();
      for (var i = 0; i < 5; i++) {
        var a = -Math.PI / 2 + i * TAU / 5;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        var a2 = a + TAU / 10;
        c.lineTo(Math.cos(a2) * r * 0.45, Math.sin(a2) * r * 0.45);
      }
      c.closePath(); c.fill();
    },

    _hand: function (c) {
      var hx = this.hand.x, hy = this.hand.y, scale = 1, angle = 0;
      if (this.swing) {
        var sw = this.swing, k = clamp(sw.t / sw.dur, 0, 1);
        // dart in to contact and back out (a there-and-back curve)
        var e = Math.sin(k * Math.PI);
        hx = sw.x0 + (sw.cx - sw.x0) * e;
        hy = sw.y0 + (sw.cy - sw.y0) * e;
        scale = 1 + e * 0.35;
        angle = sw.side * e * 0.5;
      }
      var R = this.rad * 0.5 * scale;
      c.save();
      c.translate(hx, hy);
      c.rotate(angle);
      // shadow
      c.fillStyle = 'rgba(0,0,0,.18)';
      c.beginPath(); c.ellipse(6, 10, R * 0.72, R * 0.62, 0, 0, TAU); c.fill();
      // palm
      c.fillStyle = '#ffcf9a';
      c.strokeStyle = '#e0a877'; c.lineWidth = 3;
      c.beginPath(); c.ellipse(0, R * 0.15, R * 0.62, R * 0.55, 0, 0, TAU); c.fill(); c.stroke();
      // fingers
      for (var i = -1; i <= 2; i++) {
        c.save();
        c.translate(i * R * 0.3, -R * 0.45);
        c.beginPath(); c.ellipse(0, 0, R * 0.14, R * 0.34, 0, 0, TAU); c.fill(); c.stroke();
        c.restore();
      }
      // thumb
      c.save();
      c.translate(-R * 0.55, R * 0.1);
      c.rotate(-0.5);
      c.beginPath(); c.ellipse(0, 0, R * 0.14, R * 0.28, 0, 0, TAU); c.fill(); c.stroke();
      c.restore();
      c.restore();
    },

    _popText: function (c) {
      for (var i = 0; i < this.pops.length; i++) {
        var p = this.pops[i], k = p.t / 0.7;
        c.save();
        c.globalAlpha = Math.max(0, 1 - k);
        c.translate(p.x, p.y - k * this.H * 0.12);
        c.rotate((i % 2 ? -1 : 1) * 0.12);
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '900 ' + Math.round(this.rad * (p.big ? 0.7 : 0.5)) + 'px system-ui, sans-serif';
        c.lineWidth = 6; c.strokeStyle = '#fff';
        c.strokeText('SMACK!', 0, 0);
        c.fillStyle = '#ff3b5b';
        c.fillText('SMACK!', 0, 0);
        c.restore();
      }
      c.globalAlpha = 1;
    }
  };

  // Spring an angle back toward 0. Returns the new angle; writes back velocity.
  function spring(o, ak, vk, dt, k, damp) {
    o[vk] += (-o[ak] * k - o[vk] * damp) * dt;
    return o[ak] + o[vk] * dt;
  }

  // Lighten (t>0) or darken (t<0) a #rrggbb colour.
  function shade(hex, t) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    var n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function mix(v) { return Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t); }
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }

  SmackGame.shade = shade;               // exposed for testing
  global.SmackGame = SmackGame;
})(window);
