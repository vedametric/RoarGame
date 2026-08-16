/*
 * game-grab.js — "GRAB IT!"
 *
 * The phone lies flat between the players (or in front of one, in solo). An
 * object pops up on the centre line, the same distance from every side.
 *
 * Everything is driven by discrete taps — there is no holding anything down.
 * Each tap walks your claw-arm one step closer. In SHOUT mode each separate
 * burst of noise counts as one step, so "roar, roar, roar" does the same job.
 *
 *   ⭐ treat   — a few steps, first claw there takes it
 *   🌟 golden  — double points, gone quickly
 *   💣 bomb    — do not touch it: points off and your arm freezes
 *   🔢 number  — needs EXACTLY that many taps. One too many and you bust.
 *
 * The number objects are why mashing does not pay: reaching the object starts
 * a short settle, and an extra tap during it overshoots.
 */
(function (global) {
  'use strict';

  var LEVELS = [
    { gap: 0.85, life: 3.2, radius: 46, need: 3, pNum: 0.16, pBomb: 0.00, pGold: 0.12 },
    { gap: 0.70, life: 2.8, radius: 42, need: 4, pNum: 0.22, pBomb: 0.14, pGold: 0.15 },
    { gap: 0.55, life: 2.4, radius: 38, need: 5, pNum: 0.26, pBomb: 0.20, pGold: 0.18 },
    { gap: 0.42, life: 2.0, radius: 34, need: 6, pNum: 0.30, pBomb: 0.26, pGold: 0.20 }
  ];

  var COMBO_STEPS = [1, 1, 1.5, 2, 2.5, 3];
  var SETTLE = 0.30;         // grace after arriving, during which a tap overshoots
  var FREEZE_TIME = 1.15;
  var ICE = '#e8f6ff', ICE_RIM = '#8fd8ff';
  var BASE_INSET = 104;
  var TREATS = ['⭐', '🍎', '🍌', '🎈', '🍩', '💎', '🍭', '🐟'];
  var EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  var BURST_GAP = 0.14;      // min silence before a new roar counts as a new step

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  var GrabGame = {
    running: false,

    start: function (cfg) {
      var self = this;
      var i;

      self.cfg = cfg;
      self.canvas = cfg.canvas;
      self.ctx = self.canvas.getContext('2d');
      self.players = cfg.players;
      self.n = cfg.players.length;              // 1 or 2
      self.duration = cfg.duration || 45;
      self.tapMode = cfg.inputMode === 'tap';

      self.scores = []; self.streaks = []; self.taps = [];
      self.reach = []; self.shown = []; self.pulse = [];
      self.frozen = []; self.busted = []; self.wasLoud = []; self.quietFor = [];
      for (i = 0; i < self.n; i++) {
        self.scores[i] = 0; self.streaks[i] = 0; self.taps[i] = 0;
        self.reach[i] = 0; self.shown[i] = 0; self.pulse[i] = 0;
        self.frozen[i] = 0; self.busted[i] = false;
        self.wasLoud[i] = false; self.quietFor[i] = 1;
      }

      self.level = 0;
      self.elapsed = 0;
      self.target = null;
      self.spawnIn = 1.1;
      self.settle = -1;
      self.settleBy = -1;
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

      // Solo plays up the screen from the bottom; two players face each other.
      this.line = this.n === 1 ? this.H * 0.34 : this.H / 2;
      this.bases = [{ x: this.W / 2, y: this.H - BASE_INSET }];
      if (this.n === 2) this.bases.push({ x: this.W / 2, y: BASE_INSET });
    },

    /* ── input ────────────────────────────────────────────────── */

    _bindTouch: function () {
      var self = this;
      var el = this.cfg.touchTarget || this.canvas;
      this.touchEl = el;

      // Solo owns the whole screen; otherwise your half is your button.
      var sideOf = function (y) {
        if (self.n === 1) return 0;
        var r = el.getBoundingClientRect();
        return (y - r.top) > r.height / 2 ? 0 : 1;
      };

      this._down = function (e) {
        self._tap(sideOf(e.clientY));
        e.preventDefault();
      };
      el.addEventListener('pointerdown', this._down, { passive: false });
    },

    _unbindTouch: function () {
      if (this.touchEl) this.touchEl.removeEventListener('pointerdown', this._down);
      this.touchEl = null;
    },

    // One step closer. Holding does nothing at all — only separate taps count.
    _tap: function (i) {
      if (i >= this.n) return;
      this.hintFade = 0;
      this.pulse[i] = 1;

      // Always answer a press with their sound. A tap that happens to land
      // between objects still counts for nothing, but silence would read as
      // a broken button.
      global.RoarAudio.playVoiceOnce(i, 0.9);

      if (this.frozen[i] > 0 || this.busted[i]) return;
      if (!this.target || this.grabbedBy >= 0) return;   // no pre-charging

      var t = this.target;
      this.taps[i]++;

      if (t.kind === 'bomb') {
        // Stepping onto a bomb is the player's own doing.
        if (this.taps[i] >= t.need) this._bomb(i);
        return;
      }

      if (this.taps[i] > t.need) { this._bust(i); return; }

      if (this.taps[i] === t.need) {
        if (t.kind === 'number') {
          // Arrived — but an extra tap in the next moment overshoots.
          if (this.settle < 0) { this.settle = SETTLE; this.settleBy = i; }
        } else {
          this._grab(i);
        }
      } else {
        global.RoarAudio.sfx('step');
      }
    },

    // SHOUT mode: every fresh burst of noise is one step.
    _listen: function (dt) {
      var f = global.RoarAudio.analyze();
      var a = global.RoarAudio.attribute(f);
      var i;

      for (i = 0; i < this.n; i++) {
        var mine = a.accepted && (this.n === 1 || a.best === i) && a.w[i] > 0.5;
        if (mine) {
          if (!this.wasLoud[i] && this.quietFor[i] >= BURST_GAP) this._tap(i);
          this.wasLoud[i] = true;
          this.quietFor[i] = 0;
        } else {
          this.wasLoud[i] = false;
          this.quietFor[i] += dt;
        }
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

      if (!this.tapMode) this._listen(dt);

      for (i = 0; i < this.n; i++) {
        if (this.frozen[i] > 0) this.frozen[i] -= dt;
        this.pulse[i] = Math.max(0, this.pulse[i] - dt * 3.2);

        // Position is a pure function of taps, so "exactly N" always holds.
        var want = this.target ? clamp(this.taps[i] / this.target.need, 0, 1.16) : 0;
        this.reach[i] = want;
        this.shown[i] += (want - this.shown[i]) * Math.min(1, dt * 18);
      }

      if (this.settle > 0) {
        this.settle -= dt;
        if (this.settle <= 0 && this.settleBy >= 0) {
          var who = this.settleBy;
          this.settle = -1; this.settleBy = -1;
          if (this.target && !this.busted[who]) this._grab(who);
        }
      }

      if (this.grabAnim > 0) {
        this.grabAnim -= dt;
        if (this.grabAnim <= 0) this._clear(L.gap);
      } else if (this.target) {
        this.target.age += dt;
        this.target.bob += dt;
        if (this.target.age >= this.target.life) this._expire();
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

    _clear: function (gap) {
      this.target = null;
      this.grabbedBy = -1;
      this.settle = -1;
      this.settleBy = -1;
      this.spawnIn = gap;
      for (var i = 0; i < this.n; i++) {
        this.taps[i] = 0;
        this.busted[i] = false;
        this.reach[i] = 0;
      }
    },

    _spawn: function (L) {
      var margin = Math.max(64, this.W * 0.24);
      var r = Math.random();
      var kind = r < L.pNum ? 'number'
        : r < L.pNum + L.pBomb ? 'bomb'
        : r < L.pNum + L.pBomb + L.pGold ? 'gold' : 'star';

      // Numbers go up with the level, so "exactly 10" shows up later on.
      var need = kind === 'number'
        ? 4 + Math.floor(Math.random() * (5 + this.level * 3))
        : (kind === 'gold' ? Math.max(2, L.need - 1) : L.need);

      this.target = {
        kind: kind,
        need: need,
        x: margin + Math.random() * (this.W - margin * 2),
        y: this.line,
        r: kind === 'gold' ? L.radius * 0.88 : L.radius,
        life: kind === 'number' ? L.life * 1.7 : (kind === 'gold' ? L.life * 0.72 : L.life),
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

    _grab: function (i) {
      var t = this.target;
      if (!t || this.grabbedBy >= 0) return;
      var p = this.players[i];
      var mult = this._combo(i);
      var base = 10 * (this.level + 1);
      if (t.kind === 'gold') base *= 2;
      if (t.kind === 'number') base += t.need * 5;      // bigger numbers pay more
      var pts = Math.round(base * mult);

      this.scores[i] += pts;
      this.streaks[i]++;
      if (this.n === 2) this.streaks[1 - i] = 0;
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
        sub: t.kind === 'number' ? 'PERFECT ' + t.need + '!'
           : newMult > 1 ? 'COMBO x' + newMult
           : (t.kind === 'gold' ? 'GOLDEN!' : '')
      });

      global.RoarAudio.sfx(t.kind === 'gold' || t.kind === 'number' ? 'gold' : 'grab');
      if (this.cfg.onScore) this.cfg.onScore(i, this.scores[i], newMult);
    },

    // Too many taps: out of the running for this object.
    _bust: function (i) {
      var t = this.target, p = this.players[i];
      this.busted[i] = true;
      this.streaks[i] = 0;
      this.shake = Math.max(this.shake, 0.8);
      this.taps[i] = t.need + 1;

      this.burst.emit(t.x, t.y, 14, ['#ff4d6d', '#ffffff'], { speed: 220, size: 6, life: 0.5 });
      this.floaters.push({
        x: t.x, y: t.y, vy: i === 0 ? -120 : 120, age: 0, life: 1,
        text: 'TOO MANY!', color: '#ff4d6d', flip: i === 1, sub: 'needed ' + t.need
      });
      global.RoarAudio.sfx('bust');

      // In solo there is nobody else to take it, so the object is done.
      if (this.n === 1) { this.grabAnim = 0.5; this.grabbedBy = -1; this.target.age = this.target.life; }
      if (this.cfg.onScore) this.cfg.onScore(i, this.scores[i], 1);
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
        this.burst.emit(t.x, t.y, 8, ['#6f6a8d'], { speed: 110, size: 4, life: 0.4 });
      } else {
        this.burst.emit(t.x, t.y, 10, ['#8b7fb0', '#5c4d86'], { speed: 130, size: 5, life: 0.5 });
        for (var i = 0; i < this.n; i++) this.streaks[i] = 0;
        global.RoarAudio.sfx('miss');
      }
      this._clear(LEVELS[this.level].gap * 0.75);
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
      for (i = 0; i < this.n; i++) this._drawArm(c, i);
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
      var g1 = c.createLinearGradient(0, H, 0, this.line);
      g1.addColorStop(0, 'rgba(255,138,43,' + (0.20 + this.pulse[0] * 0.25) + ')');
      g1.addColorStop(1, 'rgba(255,138,43,0)');
      c.fillStyle = g1;
      c.fillRect(0, this.line, W, H - this.line);

      if (this.n === 2) {
        var g2 = c.createLinearGradient(0, 0, 0, H * 0.5);
        g2.addColorStop(0, 'rgba(49,216,255,' + (0.20 + this.pulse[1] * 0.25) + ')');
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
      }

      for (i = 0; i < this.n; i++) {
        var b = this.bases[i], p = this.players[i];
        c.save();
        c.globalAlpha = 0.9;
        c.fillStyle = this.frozen[i] > 0 ? ICE : p.color;
        c.beginPath(); c.arc(b.x, b.y, 30, 0, 6.2832); c.fill();
        c.globalAlpha = 0.35;
        c.beginPath(); c.arc(b.x, b.y, 30 + this.pulse[i] * 20, 0, 6.2832); c.fill();
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
      c.arc(W / 2, this.line, 26 + beat * 12, 0, 6.2832);
      c.stroke();
      c.restore();
    },

    _drawTapHint: function (c, W, H) {
      c.save();
      c.globalAlpha = this.hintFade * 0.75;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 17px system-ui';
      for (var i = 0; i < this.n; i++) {
        c.save();
        c.translate(W / 2, i === 0 ? H - 46 : 46);
        if (i === 1) c.rotate(Math.PI);
        c.fillStyle = this.players[i].glow;
        c.fillText(this.n === 1 ? 'TAP TO STEP' : 'TAP YOUR SIDE', 0, 0);
        c.restore();
      }
      c.restore();
    },

    _drawArm: function (c, i) {
      var p = this.players[i], b = this.bases[i];
      var t = this.target;
      var tx = t ? t.x : this.W / 2;
      var ty = t ? t.y : this.line;
      var dx = tx - b.x, dy = ty - b.y;
      var full = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= full; dy /= full;

      var len = this.shown[i] * full;
      if (len < 6) return;

      var frozen = this.frozen[i] > 0;
      var busted = this.busted[i];
      var col = frozen ? ICE : (busted ? '#7c6f9c' : p.color);
      var glow = frozen ? ICE_RIM : (busted ? '#9c8fbc' : p.glow);

      var tipX = b.x + dx * len, tipY = b.y + dy * len;
      var px = -dy, py = dx;
      var wob = Math.sin(this.elapsed * 22) * this.pulse[i] * 12;
      if (frozen) wob += Math.sin(this.elapsed * 60) * 4;
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

      // One knuckle per step taken, so progress is countable at a glance.
      var steps = t ? Math.min(this.taps[i], t.need) : 0;
      c.globalAlpha = 0.85;
      for (var s = 1; s <= steps; s++) {
        var k = s / (t.need + 0.0001);
        if (k > this.shown[i] + 0.02) break;
        var kk = k / Math.max(this.shown[i], 0.0001);
        kk = clamp(kk, 0, 1);
        var qx = lerp(lerp(b.x, midX, kk), lerp(midX, tipX, kk), kk);
        var qy = lerp(lerp(b.y, midY, kk), lerp(midY, tipY, kk), kk);
        c.fillStyle = 'rgba(255,255,255,0.75)';
        c.beginPath(); c.arc(qx, qy, 4, 0, 6.2832); c.fill();
      }
      c.restore();

      this._drawClaw(c, tipX, tipY, dx, dy, p, i, frozen, busted);
    },

    _drawClaw: function (c, x, y, dx, dy, p, i, frozen, busted) {
      var ang = Math.atan2(dy, dx);
      var open = this.grabbedBy === i ? 0.25 : 1;
      var R = 30;

      c.save();
      c.translate(x, y);
      c.rotate(ang);
      c.fillStyle = frozen ? ICE : (busted ? '#7c6f9c' : p.color);
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
        if (!(p.animal && global.Animals && global.Animals.draw(c, p.animal, x, y + 2, R * 0.9))) {
          c.fillStyle = p.glow;
          c.beginPath(); c.arc(x, y, R * 0.45, 0, 6.2832); c.fill();
        }
      }
      if (frozen) {
        c.fillStyle = 'rgba(232,246,255,0.62)';
        c.fillRect(x - R, y - R, R * 2, R * 2);
      } else if (busted) {
        c.fillStyle = 'rgba(40,32,64,0.55)';
        c.fillRect(x - R, y - R, R * 2, R * 2);
      }
      c.restore();
      c.lineWidth = 5;
      c.strokeStyle = frozen ? ICE_RIM : (busted ? '#9c8fbc' : p.glow);
      c.stroke();
      c.restore();

      if (frozen) {
        c.save();
        c.font = '22px ' + EMOJI_FONT;
        c.textAlign = 'center'; c.textBaseline = 'middle';
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

      var bomb = t.kind === 'bomb', gold = t.kind === 'gold', num = t.kind === 'number';
      var settling = this.settle > 0;

      c.save();
      c.translate(t.x, t.y + bob);
      if (bomb) c.rotate(Math.sin(t.bob * 9) * 0.12);
      c.scale(s, s);

      var halo = c.createRadialGradient(0, 0, t.r * 0.3, 0, 0, t.r * 2.1);
      halo.addColorStop(0, bomb ? 'rgba(255,77,109,0.55)'
        : gold ? 'rgba(255,210,76,0.75)'
        : num ? 'rgba(157,240,138,0.6)' : 'rgba(255,232,154,0.55)');
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
          c.moveTo(0, -t.r * 1.15); c.lineTo(7, -t.r * 1.9); c.lineTo(-7, -t.r * 1.9);
          c.closePath(); c.fill();
        }
        c.restore();
      }

      c.fillStyle = bomb ? 'rgba(52,28,48,0.96)'
        : num ? (settling ? '#9df08a' : '#ffffff') : 'rgba(255,255,255,0.94)';
      c.beginPath(); c.arc(0, 0, t.r, 0, 6.2832); c.fill();

      c.lineWidth = 7;
      c.lineCap = 'round';
      c.strokeStyle = bomb ? '#ff4d6d' : (remain > 0.35 ? (num ? '#9df08a' : '#ffd24c') : '#ff4d6d');
      c.beginPath();
      c.arc(0, 0, t.r + 8, -Math.PI / 2, -Math.PI / 2 + 6.2832 * remain);
      c.stroke();

      if (num) {
        c.fillStyle = '#20103f';
        c.font = '900 ' + Math.round(t.r * 1.25) + 'px system-ui';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(t.need), 0, 2);
      } else {
        c.font = Math.round(t.r * 1.25) + 'px ' + EMOJI_FONT;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(t.emoji, 0, 2);
      }
      c.restore();

      if (bomb) this._sideLabel(c, t, "DON'T TAP!", '#ff4d6d');
      else if (num) this._sideLabel(c, t, 'TAP EXACTLY ' + t.need, '#9df08a');
    },

    // Written twice, one each way up, so both players can read it.
    _sideLabel: function (c, t, text, color) {
      c.save();
      c.globalAlpha = 0.6 + Math.sin(this.elapsed * 10) * 0.3;
      c.fillStyle = color;
      c.font = '900 15px system-ui';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var i = 0; i < this.n; i++) {
        c.save();
        c.translate(t.x, t.y + (i === 0 ? t.r + 34 : -t.r - 34));
        if (i === 1) c.rotate(Math.PI);
        c.fillText(text, 0, 0);
        c.restore();
      }
      c.restore();
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
        c.font = '900 38px system-ui';
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
        c.beginPath();
        c.arc(W - 22, y0 + i * gapY, i <= this.level ? 7 : 4.5, 0, 6.2832);
        c.fillStyle = i <= this.level ? '#ffd24c' : 'rgba(255,255,255,0.22)';
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
