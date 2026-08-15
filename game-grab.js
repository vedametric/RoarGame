/*
 * game-grab.js — "GRAB IT!"
 *
 * The phone lies flat between two players. Something pops up on the centre
 * line, exactly the same distance from each side. Hold your half of the screen
 * (or shout, in voice mode) and your claw-arm shoots out towards it; let go and
 * it springs back. First claw to touch it takes it.
 *
 * Not everything is worth grabbing:
 *   ⭐ star   — points
 *   🌟 golden — double points, but it does not hang around
 *   💣 bomb   — grab it and you lose points and your arm freezes solid
 *
 * Four levels over 45 seconds: things appear faster, vanish sooner, shrink,
 * and the arms get heavier.
 */
(function (global) {
  'use strict';

  var LEVELS = [
    { gap: 1.25, life: 2.50, reachTime: 0.55, radius: 46, bomb: 0.00, gold: 0.12 },
    { gap: 0.95, life: 2.00, reachTime: 0.60, radius: 42, bomb: 0.16, gold: 0.16 },
    { gap: 0.72, life: 1.60, reachTime: 0.66, radius: 37, bomb: 0.24, gold: 0.20 },
    { gap: 0.52, life: 1.25, reachTime: 0.72, radius: 33, bomb: 0.30, gold: 0.24 }
  ];

  var COMBO_STEPS = [1, 1, 1.5, 2, 2.5, 3];   // indexed by streak, last value repeats
  var RETRACT_TIME = 0.75;
  var IDLE_CAP = 0.80;       // you cannot camp on the spot with nothing to grab
  var FREEZE_TIME = 1.15;    // bomb penalty
  var ICE = '#e8f6ff', ICE_RIM = '#8fd8ff';
  var BASE_INSET = 104;
  var TREATS = ['⭐', '🍎', '🍌', '🎈', '🍩', '💎', '🍭', '🐟'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  var GrabGame = {
    running: false,

    start: function (cfg) {
      var self = this;
      self.cfg = cfg;
      self.canvas = cfg.canvas;
      self.ctx = self.canvas.getContext('2d');
      self.players = cfg.players;
      self.duration = cfg.duration || 45;
      self.tapMode = cfg.inputMode === 'tap';

      self.scores = [0, 0];
      self.streaks = [0, 0];
      self.reach = [0, 0];
      self.wobble = [0, 0];
      self.pulse = [0, 0];
      self.frozen = [0, 0];
      self.held = [false, false];
      self.tapKick = [0, 0];
      self.level = 0;
      self.elapsed = 0;
      self.target = null;
      self.spawnIn = 1.1;
      self.shake = 0;
      self.hintFade = 1;
      self.floaters = [];
      self.burst = new global.Burst();
      self.grabbedBy = -1;
      self.grabAnim = 0;
      self.running = true;

      self._onResize = function () { self._fit(); };
      addEventListener('resize', self._onResize);
      self._fit();
      if (self.tapMode) self._bindTouch();

      self.last = performance.now();
      self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._unbindTouch();
      global.RoarAudio.stopAllVoices();
    },

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || innerWidth;
      this.H = this.canvas.clientHeight || innerHeight;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this.bases = [
        { x: this.W / 2, y: this.H - BASE_INSET },
        { x: this.W / 2, y: BASE_INSET }
      ];
    },

    /* ── touch: each player owns their half of the screen ─────── */

    _bindTouch: function () {
      var self = this;
      var el = this.cfg.touchTarget || this.canvas;
      this.touchEl = el;
      this.pointers = {};

      // Which half was touched decides who it belongs to — kids can press
      // anywhere on their own side rather than hunting for a button.
      var sideOf = function (y) {
        var r = el.getBoundingClientRect();
        return (y - r.top) > r.height / 2 ? 0 : 1;
      };

      this._down = function (e) {
        var i = sideOf(e.clientY);
        self.pointers[e.pointerId] = i;
        self._press(i, true);
        e.preventDefault();
      };
      this._up = function (e) {
        var i = self.pointers[e.pointerId];
        if (i === undefined) return;
        delete self.pointers[e.pointerId];
        // Only release if this player has no other finger down.
        for (var k in self.pointers) if (self.pointers[k] === i) return;
        self._press(i, false);
      };

      el.addEventListener('pointerdown', this._down, { passive: false });
      el.addEventListener('pointerup', this._up);
      el.addEventListener('pointercancel', this._up);
      el.addEventListener('pointerleave', this._up);
    },

    _unbindTouch: function () {
      var el = this.touchEl;
      if (!el) return;
      el.removeEventListener('pointerdown', this._down);
      el.removeEventListener('pointerup', this._up);
      el.removeEventListener('pointercancel', this._up);
      el.removeEventListener('pointerleave', this._up);
      this.touchEl = null;
    },

    _press: function (i, on) {
      if (this.held[i] === on) return;
      this.held[i] = on;
      if (on) {
        this.hintFade = 0;
        this.tapKick[i] = 1;                 // rewards a fast press-press-press
        if (this.frozen[i] <= 0) global.RoarAudio.startVoice(i);
      } else {
        global.RoarAudio.stopVoice(i);
      }
    },

    /* ── main loop ────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;

      self._update(dt);
      self._draw(dt);

      if (self.running) self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _update: function (dt) {
      var i;
      this.elapsed += dt;

      var lv = Math.min(LEVELS.length - 1, Math.floor(this.elapsed / (this.duration / LEVELS.length)));
      if (lv !== this.level) {
        this.level = lv;
        global.RoarAudio.sfx('level');
        if (this.cfg.onLevel) this.cfg.onLevel(lv + 1);
      }
      var L = LEVELS[this.level];

      var push = this._input(dt);

      var cap = (this.target && this.grabbedBy < 0) ? 1.02 : IDLE_CAP;
      for (i = 0; i < 2; i++) {
        if (this.frozen[i] > 0) {
          this.frozen[i] -= dt;
          if (this.frozen[i] <= 0 && this.held[i]) global.RoarAudio.startVoice(i);
          push[i] = 0;
        }
        this.tapKick[i] = Math.max(0, this.tapKick[i] - dt * 4);

        var before = this.reach[i];
        if (push[i] > 0.04 && this.grabbedBy < 0) {
          this.reach[i] += (push[i] / L.reachTime) * dt;
          this.pulse[i] = Math.min(1, this.pulse[i] + push[i] * dt * 5);
        } else {
          this.reach[i] -= dt / RETRACT_TIME;
          this.pulse[i] = Math.max(0, this.pulse[i] - dt * 2.2);
        }
        this.reach[i] = clamp(this.reach[i], 0, cap);
        this.wobble[i] = this.wobble[i] * 0.88 + (this.reach[i] - before) * 26;
      }

      if (this.grabAnim > 0) {
        this.grabAnim -= dt;
        if (this.grabAnim <= 0) { this.target = null; this.grabbedBy = -1; this.spawnIn = L.gap; }
      } else if (this.target) {
        this.target.age += dt;
        this.target.bob += dt;
        if (this.target.age >= this.target.life) this._expire();
        else {
          var hit = -1;
          if (this.reach[0] >= 1 && this.reach[1] >= 1) hit = this.reach[0] >= this.reach[1] ? 0 : 1;
          else if (this.reach[0] >= 1) hit = 0;
          else if (this.reach[1] >= 1) hit = 1;
          if (hit >= 0) this._touch(hit);
        }
      } else {
        this.spawnIn -= dt;
        if (this.spawnIn <= 0 && this.elapsed < this.duration - 0.4) this._spawn(L);
      }

      for (i = this.floaters.length - 1; i >= 0; i--) {
        var fl = this.floaters[i];
        fl.age += dt;
        fl.y += fl.vy * dt;
        fl.vy *= 0.94;
        if (fl.age > fl.life) this.floaters.splice(i, 1);
      }

      this.burst.update(dt);
      this.shake = Math.max(0, this.shake - dt * 3.2);
      this.hintFade = Math.max(0, this.hintFade - dt * 0.25);

      if (this.elapsed >= this.duration) {
        this.stop();
        if (this.cfg.onEnd) this.cfg.onEnd(this.scores.slice());
      }
    },

    // How hard each player is pushing this frame, 0..1.
    _input: function (dt) {
      var push = [0, 0], i;

      if (this.tapMode) {
        for (i = 0; i < 2; i++) {
          // Holding gives a steady push; each fresh press adds a little kick,
          // so drumming out "roar-roar-roar" beats leaning on it.
          push[i] = (this.held[i] ? 0.92 : 0) + this.tapKick[i] * 0.5;
          push[i] = clamp(push[i], 0, 1.25);
        }
        return push;
      }

      var f = global.RoarAudio.analyze();
      var a = global.RoarAudio.attribute(f);
      if (!a.accepted) return push;

      var gate = global.RoarAudio.gate();
      var strength = Math.pow(clamp((f.level - gate) / (1 - gate), 0, 1), 0.7);
      for (i = 0; i < 2; i++) push[i] = clamp(a.w[i] * 1.7, 0, 1) * strength;
      return push;
    },

    _spawn: function (L) {
      var margin = Math.max(64, this.W * 0.24);
      var r = Math.random();
      var kind = r < L.bomb ? 'bomb' : (r < L.bomb + L.gold ? 'gold' : 'star');

      this.target = {
        kind: kind,
        x: margin + Math.random() * (this.W - margin * 2),
        y: this.H / 2,
        r: kind === 'gold' ? L.radius * 0.88 : L.radius,
        life: kind === 'gold' ? L.life * 0.72 : L.life,
        age: 0,
        bob: Math.random() * 6.28,
        emoji: kind === 'bomb' ? '💣' : (kind === 'gold' ? '🌟' : TREATS[(Math.random() * TREATS.length) | 0]),
        scale: 0
      };
      global.RoarAudio.sfx(kind === 'bomb' ? 'warn' : 'spawn');
    },

    _combo: function (i) {
      return COMBO_STEPS[Math.min(this.streaks[i], COMBO_STEPS.length - 1)];
    },

    _touch: function (i) {
      if (this.target.kind === 'bomb') this._bomb(i);
      else this._grab(i);
    },

    _grab: function (i) {
      var t = this.target, p = this.players[i];
      var mult = this._combo(i);
      var base = 10 * (this.level + 1) * (t.kind === 'gold' ? 2 : 1);
      var pts = Math.round(base * mult);

      this.scores[i] += pts;
      this.streaks[i]++;
      this.streaks[1 - i] = 0;
      this.grabbedBy = i;
      this.grabAnim = 0.28;
      this.shake = t.kind === 'gold' ? 1.3 : 1;

      var colors = t.kind === 'gold'
        ? ['#ffd24c', '#fff3b0', '#ffffff', p.glow]
        : [p.color, p.glow, '#ffffff', '#ffe89a'];
      this.burst.emit(t.x, t.y, t.kind === 'gold' ? 40 : 26, colors, { speed: 400, size: 9 });

      var newMult = this._combo(i);
      this.floaters.push({
        x: t.x, y: t.y, vy: i === 0 ? -150 : 150, age: 0, life: 0.9,
        text: '+' + pts, color: t.kind === 'gold' ? '#ffd24c' : p.glow, flip: i === 1,
        sub: newMult > 1 ? 'COMBO x' + newMult : (t.kind === 'gold' ? 'GOLDEN!' : '')
      });

      global.RoarAudio.sfx(t.kind === 'gold' ? 'gold' : 'grab');
      // Their own voice cheering the grab is the best part of tap mode.
      if (this.tapMode && !this.held[i]) global.RoarAudio.playVoiceOnce(i, 0.85);
      if (this.cfg.onScore) this.cfg.onScore(i, this.scores[i], newMult);
    },

    _bomb: function (i) {
      var t = this.target, p = this.players[i];
      var pts = Math.min(this.scores[i], 15);

      this.scores[i] -= pts;
      this.streaks[i] = 0;
      this.frozen[i] = FREEZE_TIME;
      this.grabbedBy = i;
      this.grabAnim = 0.28;
      this.shake = 1.6;
      this.reach[i] = 0;

      global.RoarAudio.stopVoice(i);
      this.burst.emit(t.x, t.y, 34, ['#ff4d6d', '#ff9f1c', '#2b2b3d', '#ffffff'], { speed: 460, size: 10 });
      this.floaters.push({
        x: t.x, y: t.y, vy: i === 0 ? -140 : 140, age: 0, life: 1,
        text: pts ? '-' + pts : 'OUCH!', color: '#ff4d6d', flip: i === 1, sub: 'FROZEN!'
      });

      global.RoarAudio.sfx('bomb');
      if (this.cfg.onScore) this.cfg.onScore(i, this.scores[i], 1);
    },

    _expire: function () {
      var t = this.target;
      if (t.kind === 'bomb') {
        // Letting a bomb go is the correct play, so it just fizzles out.
        this.burst.emit(t.x, t.y, 8, ['#6f6a8d'], { speed: 110, size: 4, life: 0.4 });
      } else {
        this.burst.emit(t.x, t.y, 10, ['#8b7fb0', '#5c4d86'], { speed: 130, size: 5, life: 0.5 });
        this.streaks[0] = this.streaks[1] = 0;
        global.RoarAudio.sfx('miss');
      }
      this.target = null;
      this.spawnIn = LEVELS[this.level].gap * 0.75;
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function (dt) {
      var c = this.ctx, W = this.W, H = this.H, i;

      c.save();
      if (this.shake > 0) {
        var s = this.shake * this.shake * 9;
        c.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      }

      c.clearRect(-20, -20, W + 40, H + 40);
      this._drawField(c, W, H);
      if (!this.target) this._drawHint(c, W, H);
      for (i = 0; i < 2; i++) this._drawArm(c, i);
      if (this.target) this._drawTarget(c, dt);

      this.burst.draw(c);
      this._drawFloaters(c);
      this._drawTimer(c, W, H);
      this._drawLevelPips(c, W, H);
      if (this.tapMode && this.hintFade > 0) this._drawTapHint(c, W, H);
      c.restore();
    },

    _drawField: function (c, W, H) {
      var i;
      var g1 = c.createLinearGradient(0, H, 0, H * 0.5);
      g1.addColorStop(0, 'rgba(255,138,43,' + (0.20 + this.pulse[0] * 0.22) + ')');
      g1.addColorStop(1, 'rgba(255,138,43,0)');
      c.fillStyle = g1;
      c.fillRect(0, H * 0.5, W, H * 0.5);

      var g2 = c.createLinearGradient(0, 0, 0, H * 0.5);
      g2.addColorStop(0, 'rgba(49,216,255,' + (0.20 + this.pulse[1] * 0.22) + ')');
      g2.addColorStop(1, 'rgba(49,216,255,0)');
      c.fillStyle = g2;
      c.fillRect(0, 0, W, H * 0.5);

      c.save();
      c.setLineDash([10, 12]);
      c.lineWidth = 2;
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      c.moveTo(0, H / 2); c.lineTo(W, H / 2);
      c.stroke();
      c.restore();

      for (i = 0; i < 2; i++) {
        var b = this.bases[i], p = this.players[i];
        c.save();
        c.globalAlpha = 0.9;
        c.fillStyle = this.frozen[i] > 0 ? ICE : p.color;
        c.beginPath();
        c.arc(b.x, b.y, 30, 0, 6.2832);
        c.fill();
        c.globalAlpha = 0.35;
        c.beginPath();
        c.arc(b.x, b.y, 30 + this.pulse[i] * 16, 0, 6.2832);
        c.fill();
        c.restore();
      }
    },

    _drawHint: function (c, W, H) {
      var beat = (Math.sin(this.elapsed * 5) + 1) / 2;
      c.save();
      c.globalAlpha = 0.16 + beat * 0.2;
      c.strokeStyle = '#ffe89a';
      c.lineWidth = 3;
      c.setLineDash([6, 10]);
      c.beginPath();
      c.arc(W / 2, H / 2, 26 + beat * 12, 0, 6.2832);
      c.stroke();
      c.restore();
    },

    // Fades out once both players have figured out the controls.
    _drawTapHint: function (c, W, H) {
      c.save();
      c.globalAlpha = this.hintFade * 0.75;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 17px system-ui';
      for (var i = 0; i < 2; i++) {
        c.save();
        c.translate(W / 2, i === 0 ? H - 46 : 46);
        if (i === 1) c.rotate(Math.PI);
        c.fillStyle = this.players[i].glow;
        c.fillText('HOLD YOUR SIDE', 0, 0);
        c.restore();
      }
      c.restore();
    },

    _drawArm: function (c, i) {
      var p = this.players[i], b = this.bases[i];
      var t = this.target;
      var tx = t ? t.x : this.W / 2;
      var ty = t ? t.y : this.H / 2;
      var dx = tx - b.x, dy = ty - b.y;
      var full = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= full; dy /= full;

      var len = this.reach[i] * full;
      if (len < 6) return;

      var frozen = this.frozen[i] > 0;
      var col = frozen ? ICE : p.color;
      var glow = frozen ? ICE_RIM : p.glow;

      var tipX = b.x + dx * len, tipY = b.y + dy * len;
      var px = -dy, py = dx;
      var wob = clamp(this.wobble[i], -34, 34);
      if (frozen) wob += Math.sin(this.elapsed * 60) * 4;      // shivers
      var midX = b.x + dx * len * 0.5 + px * wob;
      var midY = b.y + dy * len * 0.5 + py * wob;

      c.save();
      c.lineCap = 'round';

      c.globalAlpha = 0.30;
      c.strokeStyle = glow;
      c.lineWidth = 34;
      c.beginPath(); c.moveTo(b.x, b.y); c.quadraticCurveTo(midX, midY, tipX, tipY); c.stroke();

      c.globalAlpha = 1;
      c.strokeStyle = col;
      c.lineWidth = 21;
      c.beginPath(); c.moveTo(b.x, b.y); c.quadraticCurveTo(midX, midY, tipX, tipY); c.stroke();

      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 5;
      c.beginPath(); c.moveTo(b.x, b.y); c.quadraticCurveTo(midX, midY, tipX, tipY); c.stroke();

      c.globalAlpha = 0.55;
      c.fillStyle = 'rgba(0,0,0,0.22)';
      for (var s = 1; s <= 6; s++) {
        var k = s / 7;
        var qx = lerp(lerp(b.x, midX, k), lerp(midX, tipX, k), k);
        var qy = lerp(lerp(b.y, midY, k), lerp(midY, tipY, k), k);
        c.beginPath(); c.arc(qx, qy, 4.5, 0, 6.2832); c.fill();
      }
      c.restore();

      this._drawClaw(c, tipX, tipY, dx, dy, p, i, frozen);
    },

    _drawClaw: function (c, x, y, dx, dy, p, i, frozen) {
      var ang = Math.atan2(dy, dx);
      var open = this.grabbedBy === i ? 0.25 : 1;
      var R = 30;

      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.fillStyle = frozen ? ICE : p.color;
      for (var k = -1; k <= 1; k++) {
        c.save();
        c.rotate(k * 0.62 * open);
        c.beginPath();
        c.moveTo(R * 0.4, -7);
        c.quadraticCurveTo(R * 1.45, -5, R * 1.75, 0);
        c.quadraticCurveTo(R * 1.45, 5, R * 0.4, 7);
        c.closePath();
        c.fill();
        c.restore();
      }
      c.restore();

      c.save();
      c.beginPath();
      c.arc(x, y, R, 0, 6.2832);
      c.closePath();
      c.save();
      c.clip();
      if (p.img && p.img.complete && p.img.naturalWidth) {
        c.drawImage(p.img, x - R, y - R, R * 2, R * 2);
      } else {
        c.fillStyle = p.color;
        c.fillRect(x - R, y - R, R * 2, R * 2);
        c.font = '30px system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(p.emoji || '🐾', x, y + 1);
      }
      if (frozen) {
        c.fillStyle = 'rgba(232,246,255,0.62)';
        c.fillRect(x - R, y - R, R * 2, R * 2);
      }
      c.restore();
      c.lineWidth = 5;
      c.strokeStyle = frozen ? ICE_RIM : p.glow;
      c.stroke();
      c.restore();

      if (frozen) {
        c.save();
        c.font = '22px system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('🧊', x, y - R - 12);
        c.restore();
      }
    },

    _drawTarget: function (c, dt) {
      var t = this.target;
      var grabbing = this.grabbedBy >= 0;
      t.scale = grabbing ? Math.max(0, t.scale - dt * 5) : Math.min(1, t.scale + dt * 7);

      var remain = 1 - t.age / t.life;
      var bob = Math.sin(t.bob * 3.4) * 4;
      var s = t.scale * (grabbing ? 1 : 1 + Math.sin(t.bob * 6) * 0.05);
      if (s <= 0.01) return;

      var bomb = t.kind === 'bomb', gold = t.kind === 'gold';

      c.save();
      c.translate(t.x, t.y + bob);
      if (bomb) c.rotate(Math.sin(t.bob * 9) * 0.12);
      c.scale(s, s);

      var halo = c.createRadialGradient(0, 0, t.r * 0.3, 0, 0, t.r * 2.1);
      halo.addColorStop(0, bomb ? 'rgba(255,77,109,0.55)'
        : gold ? 'rgba(255,210,76,0.75)' : 'rgba(255,232,154,0.55)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = halo;
      c.beginPath(); c.arc(0, 0, t.r * 2.1, 0, 6.2832); c.fill();

      if (gold) {
        c.save();
        c.rotate(this.elapsed * 2);
        c.fillStyle = 'rgba(255,232,154,0.30)';
        for (var k = 0; k < 8; k++) {
          c.rotate(6.2832 / 8);
          c.beginPath();
          c.moveTo(0, -t.r * 1.15);
          c.lineTo(7, -t.r * 1.9);
          c.lineTo(-7, -t.r * 1.9);
          c.closePath();
          c.fill();
        }
        c.restore();
      }

      c.fillStyle = bomb ? 'rgba(52,28,48,0.96)' : 'rgba(255,255,255,0.94)';
      c.beginPath(); c.arc(0, 0, t.r, 0, 6.2832); c.fill();

      c.lineWidth = 7;
      c.lineCap = 'round';
      c.strokeStyle = bomb ? '#ff4d6d' : (remain > 0.35 ? (gold ? '#ffd24c' : '#ffd24c') : '#ff4d6d');
      c.beginPath();
      c.arc(0, 0, t.r + 8, -Math.PI / 2, -Math.PI / 2 + 6.2832 * remain);
      c.stroke();

      c.font = Math.round(t.r * 1.25) + 'px system-ui';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(t.emoji, 0, 2);
      c.restore();

      if (bomb) {
        // Say it out loud — a symbol alone is not enough for a 5-year-old.
        c.save();
        c.globalAlpha = 0.55 + Math.sin(this.elapsed * 12) * 0.35;
        c.fillStyle = '#ff4d6d';
        c.font = '900 15px system-ui';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (var i = 0; i < 2; i++) {
          c.save();
          c.translate(t.x, t.y + (i === 0 ? t.r + 34 : -t.r - 34));
          if (i === 1) c.rotate(Math.PI);
          c.fillText("DON'T GRAB!", 0, 0);
          c.restore();
        }
        c.restore();
      }
    },

    _drawFloaters: function (c) {
      for (var i = 0; i < this.floaters.length; i++) {
        var f = this.floaters[i];
        var k = 1 - f.age / f.life;
        c.save();
        c.globalAlpha = clamp(k * 1.7, 0, 1);
        c.translate(f.x, f.y);
        if (f.flip) c.rotate(Math.PI);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = f.color;
        c.strokeStyle = 'rgba(0,0,0,0.35)';
        c.lineWidth = 4;
        c.font = '900 40px system-ui';
        c.strokeText(f.text, 0, 0);
        c.fillText(f.text, 0, 0);
        if (f.sub) {
          c.font = '900 20px system-ui';
          c.fillStyle = '#fff';
          c.strokeText(f.sub, 0, 30);
          c.fillText(f.sub, 0, 30);
        }
        c.restore();
      }
    },

    _drawTimer: function (c, W, H) {
      var left = 1 - clamp(this.elapsed / this.duration, 0, 1);
      var h = H * 0.44, x = 16, y = H / 2 - h / 2;

      c.save();
      c.fillStyle = 'rgba(255,255,255,0.12)';
      this._roundRect(c, x, y, 9, h, 5); c.fill();

      var fh = h * left;
      c.fillStyle = left > 0.25 ? '#9df08a' : '#ff4d6d';
      this._roundRect(c, x, y + (h - fh) / 2, 9, fh, 5); c.fill();

      if (left < 0.25) {
        c.globalAlpha = 0.35 + Math.sin(this.elapsed * 14) * 0.35;
        c.fillStyle = '#ff4d6d';
        this._roundRect(c, x - 3, y + (h - fh) / 2 - 3, 15, fh + 6, 7); c.fill();
      }
      c.restore();
    },

    _drawLevelPips: function (c, W, H) {
      var n = LEVELS.length, gapY = 26;
      var y0 = H / 2 - ((n - 1) * gapY) / 2;
      c.save();
      for (var i = 0; i < n; i++) {
        var on = i <= this.level;
        c.beginPath();
        c.arc(W - 22, y0 + i * gapY, on ? 7 : 4.5, 0, 6.2832);
        c.fillStyle = on ? '#ffd24c' : 'rgba(255,255,255,0.22)';
        c.fill();
      }
      c.restore();
    },

    _roundRect: function (c, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
  };

  global.GrabGame = GrabGame;
})(window);
