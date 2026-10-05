/*
 * game-make.js — "MAKE IT GAME"
 *
 * Sienna's game. A little plant stands in a pot under an empty sky, and a
 * speech bubble over its head says what it wants: SUN, WATER, RAIN, SNOW,
 * WIND, THUNDER, NIGHT or a RAINBOW. Along the bottom is a tray of weather to
 * drag — pick the one it asked for, drag it onto the plant, and let go.
 *
 * Whatever you drag, that weather really happens: the sky changes colour, rain
 * falls, snow drifts, the wind blows the leaves sideways, lightning cracks, the
 * stars come out. Dragging the wrong one is never punished, because making the
 * weather is the toy — you just don't get the point, and the plant asks again.
 * Drag the right one and the plant grows: seed, sprout, leaves, a bud, a
 * flower, a tree. That is the whole reward, and it never goes backwards.
 *
 * There is a ❓ HELP button, which is Sienna's own idea and the thing she was
 * most insistent about: "just in case you don't know what happened". Tap it and
 * the right one jumps up and glows, and a voice tells you what it wants. It is
 * free, it never runs out, and it costs you nothing.
 *
 * Nothing to lose here: no timer, no lives, no wrong answers that end anything.
 * The ★ keeps the most things you have ever made.
 */
(function (global) {
  'use strict';

  var SAVED = 'make.best';
  var TAU = Math.PI * 2;

  // Everything you can make. `sky` is the pair the sky fades to while it is
  // happening; `ask` is what the bubble says; `say` is what is read out.
  var THINGS = [
    { id: 'sun',     ask: 'SUN',     say: 'Sunshine!',   sky: ['#5ec8ff', '#bdf0ff'], dim: 0 },
    { id: 'water',   ask: 'WATER',   say: 'Water!',      sky: ['#4fb6e8', '#aee6ff'], dim: 0 },
    { id: 'rain',    ask: 'RAIN',    say: 'Rain!',       sky: ['#5c6f86', '#9fb3c6'], dim: 0.22 },
    { id: 'snow',    ask: 'SNOW',    say: 'Snow!',       sky: ['#8ba6bd', '#e6f2fb'], dim: 0.1 },
    { id: 'wind',    ask: 'WIND',    say: 'Wind!',       sky: ['#7fb8d4', '#d6eef7'], dim: 0 },
    { id: 'thunder', ask: 'THUNDER', say: 'Thunder!',    sky: ['#2f3550', '#5d6480'], dim: 0.4 },
    { id: 'night',   ask: 'NIGHT',   say: 'Night time!', sky: ['#13173a', '#3a2f6b'], dim: 0.6 },
    { id: 'rainbow', ask: 'RAINBOW', say: 'A rainbow!',  sky: ['#6ec8f0', '#ffe3c0'], dim: 0 }
  ];

  var BOW = ['#ff4d4d', '#ff9f1c', '#ffe14d', '#6ec531', '#4a9bff', '#9b5de5'];
  var CHEER = ['Lovely!', 'Well done!', 'That is it!', 'Yes!', 'Good one!'];

  // How the plant grows, one step per thing made. It never shrinks.
  var STAGES = 7;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function saved(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // '#rrggbb' pair, mixed — used to fade one sky into the next rather than
  // snapping, so the weather arrives instead of appearing.
  function mix(a, b, t) {
    var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    return 'rgb(' + Math.round(lerp(ar, br, t)) + ',' + Math.round(lerp(ag, bg, t)) + ',' + Math.round(lerp(ab, bb, t)) + ')';
  }

  var MakeGame = {
    running: false,
    THINGS: THINGS,

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
      this.drag = null;
      this.last = performance.now();
    },

    _newGame: function () {
      this.score = 0;
      this.stage = 0;          // how far the plant has grown
      this.grow = 0;           // what is drawn, which chases `stage`
      this.time = 0;
      this.drag = null;
      this.weather = null;     // { id, t, life } while something is happening
      this.sky = ['#8fd3f4', '#dff4ff'];   // a plain, empty sky to start
      this.drops = [];         // rain, snow, water, wind streaks
      this.flash = 0;          // the stars and clouds are laid out by _fit, not here
      this.shake = 0;
      this.hint = 0;           // the HELP glow on the right one
      this.wobble = 0;         // the plant's "no, not that one" shake
      this.cheer = 0;
      this.burst = new global.Burst();
      this._round();
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this._newGame();
      try { global.RoarAudio.sfx('go'); } catch (e) {}
    },

    /* ── a round ───────────────────────────────────────────────── */

    // Pick what it wants, then a trayful to choose from: the right one plus
    // three others, shuffled. Four is as many as a small child can weigh up at
    // once, and it keeps the right one a real choice rather than a giveaway.
    _round: function () {
      var want = this.want ? pick(THINGS.filter(function (t) { return t.id !== this.want.id; }, this)) : pick(THINGS);
      this.want = want;
      var rest = THINGS.filter(function (t) { return t.id !== want.id; });
      var tray = [want];
      while (tray.length < 4 && rest.length) tray.push(rest.splice((Math.random() * rest.length) | 0, 1)[0]);
      for (var i = tray.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, s = tray[i]; tray[i] = tray[j]; tray[j] = s; }
      this.tray = tray.map(function (t) { return { thing: t, pop: 0, glow: 0, home: null }; });
      this.bubblePop = 0;
      this.hint = 0;
      this._layout();
    },

    // The help button, and Sienna's reason for it: so you are never stuck
    // wondering what the game wants. It just tells you, out loud, for free.
    help: function () {
      if (!this.running || this.paused || !this.want) return;
      this.hint = 2.6;
      this.bubblePop = 1;
      try { global.RoarAudio.sfx('spellhint'); } catch (e) {}
      try { global.Say.speak('It wants ' + this.want.ask.toLowerCase() + '. Drag the ' + this.want.ask.toLowerCase() + '!'); } catch (e) {}
    },

    /* ── layout ────────────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 480;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      // Four tokens share the width, so a token is sized from the gap between
      // them rather than from the screen: they never touch, however narrow it is.
      var gap = this.W / 5;
      this.tokR = clamp(Math.min(gap * 0.38, this.H * 0.072), 18, 46);
      this.trayTop = this.H - (this.tokR * 2 + 26);
      this.trayY = this.trayTop + this.tokR + 13;
      this.groundY = this.trayTop - this.H * 0.105;
      this.potX = this.W / 2;
      this._layout();
      this._stars();
      this._clouds();
    },

    _layout: function () {
      if (!this.tray) return;
      var n = this.tray.length, gap = this.W / (n + 1);
      for (var i = 0; i < n; i++) {
        var t = this.tray[i];
        t.home = { x: gap * (i + 1), y: this.trayY };
        if (!t.pos) t.pos = { x: t.home.x, y: t.home.y };
      }
    },

    _stars: function () {
      this.stars = [];
      for (var i = 0; i < 40; i++) {
        this.stars.push({ x: rand(0, this.W), y: rand(0, this.groundY * 0.85), r: rand(1.1, 2.8), ph: rand(0, TAU) });
      }
    },

    // Two clouds drifting across an otherwise empty sky, so there is something
    // up there to look at while it is deciding what to ask for.
    _clouds: function () {
      this.clouds = [
        { x: this.W * 0.22, y: this.H * 0.13, r: this.W * 0.13, v: 7 },
        { x: this.W * 0.78, y: this.H * 0.22, r: this.W * 0.09, v: 4.5 }
      ];
    },

    /* ── dragging ──────────────────────────────────────────────── */

    _bind: function () {
      var self = this;
      function at(e) { var r = self.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

      this._down = function (e) {
        if (!self.running || self.paused) return;
        e.preventDefault();
        try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        var p = at(e);
        // a generous grab radius, because a small finger is not accurate
        var got = null, bestD = self.tokR * 2.1;
        for (var i = 0; i < self.tray.length; i++) {
          var t = self.tray[i], dx = p.x - t.pos.x, dy = p.y - t.pos.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < bestD) { bestD = d; got = t; }
        }
        if (!got) return;
        self.drag = { tok: got, id: e.pointerId, dx: got.pos.x - p.x, dy: got.pos.y - p.y };
        got.pop = 1;
        try { global.RoarAudio.sfx('grab'); } catch (err) {}
      };

      this._move = function (e) {
        if (!self.drag || self.drag.id !== e.pointerId) return;
        e.preventDefault();
        var p = at(e);
        self.drag.tok.pos.x = p.x + self.drag.dx;
        self.drag.tok.pos.y = p.y + self.drag.dy;
      };

      this._up = function (e) {
        if (!self.drag || (e && self.drag.id !== e.pointerId)) return;
        if (e) e.preventDefault();
        var tok = self.drag.tok;
        self.drag = null;
        self._drop(tok);
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

    // Let go of a token. Dropped anywhere above the tray counts as dropped on
    // the plant: aiming at a small target is the one thing guaranteed to lose a
    // four year old, and there is nothing else up there to hit.
    _drop: function (tok) {
      var onPlant = tok.pos.y < this.trayTop;
      tok.pos.x = tok.home.x; tok.pos.y = tok.home.y;   // it always goes back
      if (!onPlant) return;
      this._make(tok.thing);
      if (tok.thing.id === this.want.id) this._right();
      else this._wrong();
    },

    // Whatever you dropped, that weather happens. This is the toy, and it works
    // the same whether or not it was the one asked for.
    _make: function (thing) {
      this.weather = { id: thing.id, t: 0, life: 3.4 };
      this.drops = [];
      if (thing.id === 'thunder') { this.flash = 1; this.shake = 8; }
      try { global.RoarAudio.sfx(thing.id === 'thunder' ? 'thunder' : thing.id === 'sun' ? 'gold' : 'whoosh'); } catch (e) {}
    },

    _right: function () {
      var self = this;
      this.score += 1;
      if (this.stage < STAGES) this.stage += 1;
      if (this.score > this.best) { this.best = this.score; save(SAVED, String(this.best)); }
      this.cheer = 1.4;
      this.hint = 0;
      this.burst.emit(this.potX, this.groundY - this._plantH() * 0.8, 26, ['#ffe066', '#8bf0a8', '#ff7ab0', '#fff'], { speed: 280, life: 0.9, size: 8, gravity: 340 });
      try { global.RoarAudio.sfx('sparkle'); } catch (e) {}
      try { global.Say.speak(this.want.say + ' ' + pick(CHEER)); } catch (e) {}
      this._render();
      // a beat to enjoy the weather, then it asks for the next thing
      this._next = 1.5;
    },

    _wrong: function () {
      this.wobble = 0.7;
      this.bubblePop = 1;
      try { global.RoarAudio.sfx('miss'); } catch (e) {}
      // never a telling-off: it just says what it wanted again
      try { global.Say.speak('It wants ' + this.want.ask.toLowerCase() + '!'); } catch (e) {}
    },

    /* ── the loop ──────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this._step(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _step: function (dt) {
      var i, d;
      this.time += dt;
      this.grow = lerp(this.grow, this.stage, Math.min(1, 5 * dt));
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.shake *= Math.exp(-dt * 6); if (this.shake < 0.2) this.shake = 0;
      this.wobble = Math.max(0, this.wobble - dt);
      this.cheer = Math.max(0, this.cheer - dt);
      this.hint = Math.max(0, this.hint - dt);
      this.bubblePop = Math.min(1, this.bubblePop + dt * 3);
      for (var ci = 0; this.clouds && ci < this.clouds.length; ci++) {
        var cl = this.clouds[ci];
        cl.x += cl.v * dt * (this.weather && this.weather.id === 'wind' ? 14 : 1);
        if (cl.x - cl.r * 1.4 > this.W) cl.x = -cl.r * 1.4;
      }
      this.burst.update(dt);

      for (i = 0; i < this.tray.length; i++) {
        var t = this.tray[i];
        t.pop = Math.max(0, t.pop - dt * 2.4);
        t.glow = this.hint > 0 && t.thing.id === this.want.id ? Math.min(1, t.glow + dt * 5) : Math.max(0, t.glow - dt * 4);
        // tokens spring home unless one is being carried
        if (!this.drag || this.drag.tok !== t) {
          t.pos.x = lerp(t.pos.x, t.home.x, Math.min(1, 14 * dt));
          t.pos.y = lerp(t.pos.y, t.home.y, Math.min(1, 14 * dt));
        }
      }

      // the sky drifts toward whatever is happening, and back when it is over
      var want = this.weather ? THINGS.filter(function (x) { return x.id === this.weather.id; }, this)[0].sky : ['#8fd3f4', '#dff4ff'];
      this.sky = [want[0], want[1]];

      if (this.weather) {
        var w = this.weather;
        w.t += dt;
        this._fall(dt);
        if (w.t >= w.life) { this.weather = null; this.drops = []; }
      }

      for (i = this.drops.length - 1; i >= 0; i--) {
        d = this.drops[i];
        d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.sway) d.x += Math.sin(this.time * 2.4 + d.ph) * d.sway * dt;
        if (d.y > this.groundY + 6 || d.x < -40 || d.x > this.W + 40) this.drops.splice(i, 1);
      }

      if (this._next > 0) { this._next -= dt; if (this._next <= 0) this._round(); }
    },

    // New weather particles, at whatever rate that kind of weather calls for.
    _fall: function (dt) {
      var w = this.weather, k = clamp(Math.min(w.t / 0.4, (w.life - w.t) / 0.6), 0, 1);
      var n = 0, make = null;
      if (w.id === 'rain')  { n = 70 * dt * k; make = function (s) { return { x: rand(-20, s.W), y: -10, vx: 60, vy: rand(620, 820), len: rand(10, 18), kind: 'rain' }; }; }
      if (w.id === 'water') { n = 55 * dt * k; make = function (s) { return { x: s.potX + rand(-s.W * 0.16, s.W * 0.16), y: -10, vx: 0, vy: rand(420, 600), len: rand(7, 12), kind: 'water' }; }; }
      if (w.id === 'snow')  { n = 34 * dt * k; make = function (s) { return { x: rand(-10, s.W), y: -10, vx: 10, vy: rand(55, 110), r: rand(2, 4.5), sway: rand(18, 42), ph: rand(0, TAU), kind: 'snow' }; }; }
      if (w.id === 'wind')  { n = 26 * dt * k; make = function (s) { return { x: -40, y: rand(10, s.groundY - 10), vx: rand(520, 820), vy: rand(-18, 18), len: rand(26, 64), kind: 'wind' }; }; }
      for (var i = 0; i < n; i++) this.drops.push(make(this));
      // lightning cracks again now and then while the storm lasts
      if (w.id === 'thunder' && k > 0 && Math.random() < dt * 1.3) {
        this.flash = 1; this.shake = 6;
        try { global.RoarAudio.sfx('thunder'); } catch (e) {}
      }
    },

    /* ── drawing ───────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      c.save();
      if (this.shake) c.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
      this._sky(c);
      this._ground(c);
      this._weather(c);
      this._plant(c);
      this.burst.draw(c);
      this._bubble(c);
      c.restore();
      this._tray(c);         // the tray sits still whatever the sky is doing
      if (this.flash > 0.01) {
        c.save(); c.globalAlpha = this.flash * 0.75; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.restore();
      }
    },

    _sky: function (c) {
      var g = c.createLinearGradient(0, 0, 0, this.groundY);
      g.addColorStop(0, this.sky[0]); g.addColorStop(1, this.sky[1]);
      c.fillStyle = g; c.fillRect(0, 0, this.W, this.groundY + 2);

      var w = this.weather;
      // the idle clouds fade out as soon as real weather arrives
      var idle = w ? clamp(1 - w.t / 0.5, 0, 1) * clamp((w.life - w.t) / 0.5, 0, 1) : 1;
      if (idle > 0.01 && this.clouds) {
        c.save(); c.globalAlpha = idle * 0.85; c.fillStyle = '#ffffff';
        for (var ci = 0; ci < this.clouds.length; ci++) {
          var cl = this.clouds[ci];
          this._cloud(c, cl.x, cl.y, cl.r);
        }
        c.restore();
      }
      if (w && w.id === 'night') {
        var k = clamp(Math.min(w.t / 0.5, (w.life - w.t) / 0.5), 0, 1);
        c.save(); c.globalAlpha = k;
        for (var i = 0; i < this.stars.length; i++) {
          var s = this.stars[i];
          c.globalAlpha = k * (0.5 + 0.5 * Math.abs(Math.sin(this.time * 1.6 + s.ph)));
          c.fillStyle = '#fff'; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill();
        }
        c.globalAlpha = k;
        c.fillStyle = '#fff4cf'; c.beginPath(); c.arc(this.W * 0.78, this.H * 0.15, this.W * 0.075, 0, TAU); c.fill();
        c.globalAlpha = k * 0.25;
        c.fillStyle = '#d8c89a';
        c.beginPath(); c.arc(this.W * 0.80, this.H * 0.135, this.W * 0.02, 0, TAU); c.fill();
        c.beginPath(); c.arc(this.W * 0.755, this.H * 0.172, this.W * 0.013, 0, TAU); c.fill();
        c.restore();
      }
      if (w && w.id === 'sun') {
        var sk = clamp(Math.min(w.t / 0.4, (w.life - w.t) / 0.5), 0, 1);
        var sx = this.W * 0.76, sy = this.H * 0.15, r = this.W * 0.085;
        c.save(); c.globalAlpha = sk;
        c.strokeStyle = 'rgba(255,220,90,.85)'; c.lineWidth = 4; c.lineCap = 'round';
        for (var a = 0; a < 12; a++) {
          var an = a / 12 * TAU + this.time * 0.5;
          c.beginPath();
          c.moveTo(sx + Math.cos(an) * r * 1.35, sy + Math.sin(an) * r * 1.35);
          c.lineTo(sx + Math.cos(an) * r * (1.8 + Math.sin(this.time * 3 + a) * 0.12), sy + Math.sin(an) * r * 1.85);
          c.stroke();
        }
        c.fillStyle = '#ffd24c'; c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.fill();
        c.restore();
      }
      if (w && w.id === 'rainbow') {
        var rk = clamp(Math.min(w.t / 0.6, (w.life - w.t) / 0.6), 0, 1);
        c.save(); c.globalAlpha = rk * 0.9; c.lineWidth = this.H * 0.022; c.lineCap = 'butt';
        for (var b = 0; b < BOW.length; b++) {
          c.strokeStyle = BOW[b];
          c.beginPath();
          c.arc(this.W / 2, this.groundY, this.W * 0.42 - b * c.lineWidth, Math.PI, TAU);
          c.stroke();
        }
        c.restore();
      }
      if (w && (w.id === 'rain' || w.id === 'thunder')) {
        var ck = clamp(Math.min(w.t / 0.4, (w.life - w.t) / 0.5), 0, 1);
        c.save(); c.globalAlpha = ck * 0.9; c.fillStyle = w.id === 'thunder' ? '#3b4160' : '#7f8fa4';
        this._cloud(c, this.W * 0.3, this.H * 0.16, this.W * 0.19);
        this._cloud(c, this.W * 0.72, this.H * 0.12, this.W * 0.15);
        c.restore();
      }
      if (w && w.id === 'water') {
        var wk = clamp(Math.min(w.t / 0.3, (w.life - w.t) / 0.5), 0, 1);
        c.save(); c.globalAlpha = wk; this._can(c, this.potX, this.H * 0.16, this.W * 0.13); c.restore();
      }
    },

    _cloud: function (c, x, y, r) {
      c.beginPath();
      c.arc(x - r * 0.55, y + r * 0.12, r * 0.55, 0, TAU);
      c.arc(x, y - r * 0.18, r * 0.7, 0, TAU);
      c.arc(x + r * 0.6, y + r * 0.14, r * 0.5, 0, TAU);
      c.rect(x - r * 0.6, y + r * 0.1, r * 1.2, r * 0.5);
      c.fill();
    },

    // A watering can, tipped, so WATER is something somebody does rather than
    // weather that happens to you.
    _can: function (c, x, y, r) {
      c.save();
      c.translate(x, y); c.rotate(0.5);
      c.fillStyle = '#5ac8e8';
      c.beginPath(); c.roundRect ? c.roundRect(-r * 0.6, -r * 0.5, r * 1.2, r, r * 0.22) : c.rect(-r * 0.6, -r * 0.5, r * 1.2, r); c.fill();
      c.strokeStyle = '#5ac8e8'; c.lineWidth = r * 0.17; c.lineCap = 'round';
      c.beginPath(); c.moveTo(r * 0.55, -r * 0.3); c.lineTo(r * 1.15, -r * 0.05); c.stroke();
      c.beginPath(); c.arc(-r * 0.2, -r * 0.55, r * 0.42, Math.PI, TAU); c.stroke();
      c.restore();
    },

    _ground: function (c) {
      var g = c.createLinearGradient(0, this.groundY, 0, this.trayTop);
      g.addColorStop(0, '#5fae4a'); g.addColorStop(1, '#2f7a34');
      c.fillStyle = g; c.fillRect(0, this.groundY, this.W, this.trayTop - this.groundY + 2);
      var w = this.weather;
      if (w) {
        var th = THINGS.filter(function (x) { return x.id === w.id; })[0];
        var dk = th.dim * clamp(Math.min(w.t / 0.5, (w.life - w.t) / 0.5), 0, 1);
        if (dk > 0.01) {
          c.save(); c.globalAlpha = dk; c.fillStyle = '#121633';
          c.fillRect(0, this.groundY, this.W, this.trayTop - this.groundY + 2); c.restore();
        }
      }
      // a snowy ground while it snows, so the weather leaves a mark
      if (w && w.id === 'snow') {
        c.save(); c.globalAlpha = clamp(Math.min(w.t / 0.8, (w.life - w.t) / 0.8), 0, 1) * 0.9;
        c.fillStyle = '#eef7ff';
        c.beginPath(); c.moveTo(0, this.groundY + 6);
        for (var x = 0; x <= this.W; x += this.W / 8) c.quadraticCurveTo(x + this.W / 16, this.groundY - 4, x + this.W / 8, this.groundY + 6);
        c.lineTo(this.W, this.trayTop); c.lineTo(0, this.trayTop); c.fill();
        c.restore();
      }
    },

    _weather: function (c) {
      c.save();
      c.lineCap = 'round';
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        if (d.kind === 'snow') { c.fillStyle = '#fff'; c.beginPath(); c.arc(d.x, d.y, d.r, 0, TAU); c.fill(); }
        else if (d.kind === 'wind') {
          c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x - d.len, d.y); c.stroke();
        } else {
          c.strokeStyle = d.kind === 'water' ? '#5ec8ff' : '#aee0ff'; c.lineWidth = 3;
          c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x - d.vx * 0.012, d.y - d.len); c.stroke();
        }
      }
      // the bolt, drawn fresh each flash
      if (this.weather && this.weather.id === 'thunder' && this.flash > 0.25) {
        c.save(); c.globalAlpha = this.flash;
        c.strokeStyle = '#fff6b0'; c.lineWidth = 6; c.lineJoin = 'round';
        var bx = this.W * 0.3, by = this.H * 0.22;
        c.beginPath(); c.moveTo(bx, by);
        c.lineTo(bx - this.W * 0.05, by + this.H * 0.12);
        c.lineTo(bx + this.W * 0.02, by + this.H * 0.12);
        c.lineTo(bx - this.W * 0.06, by + this.H * 0.28);
        c.stroke(); c.restore();
      }
      c.restore();
    },

    _plantH: function () { return (this.H * 0.06) + this.grow * (this.H * 0.045); },

    // Pot, stem, leaves, and at the top of the tree a flower. It grows a step
    // every time you make the right thing, and it never grows back down.
    _plant: function (c) {
      var x = this.potX, base = this.groundY + 4, g = this.grow;
      var h = this._plantH();
      var sway = (this.weather && this.weather.id === 'wind' ? 0.34 : 0.05) * Math.sin(this.time * (this.weather && this.weather.id === 'wind' ? 7 : 1.6));
      if (this.wobble > 0) sway += Math.sin(this.time * 34) * 0.22 * (this.wobble / 0.7);
      var pop = 1 + (this.cheer > 0 ? Math.sin((1.4 - this.cheer) / 1.4 * Math.PI) * 0.14 : 0);

      // the pot
      c.save();
      c.fillStyle = '#c96a3f';
      c.beginPath();
      c.moveTo(x - this.W * 0.095, base - this.H * 0.055);
      c.lineTo(x + this.W * 0.095, base - this.H * 0.055);
      c.lineTo(x + this.W * 0.07, base + this.H * 0.03);
      c.lineTo(x - this.W * 0.07, base + this.H * 0.03);
      c.closePath(); c.fill();
      c.fillStyle = '#e07c4c';
      c.fillRect(x - this.W * 0.105, base - this.H * 0.072, this.W * 0.21, this.H * 0.022);
      c.fillStyle = '#5a3a24';
      c.fillRect(x - this.W * 0.093, base - this.H * 0.053, this.W * 0.186, this.H * 0.012);
      c.restore();

      var top = base - this.H * 0.055 - h * pop;
      c.save();
      c.translate(x, base - this.H * 0.05);
      c.rotate(sway * 0.25);
      c.translate(-x, -(base - this.H * 0.05));

      if (g < 0.4) {
        // a seed, before anything has been made for it
        c.fillStyle = '#8a5a2b';
        c.beginPath(); c.ellipse(x, base - this.H * 0.06, this.W * 0.022, this.W * 0.03, 0, 0, TAU); c.fill();
      } else {
        c.strokeStyle = '#3f9e3a'; c.lineWidth = clamp(4 + g * 1.6, 4, 12); c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x, base - this.H * 0.05);
        c.quadraticCurveTo(x + sway * 30, (base + top) / 2, x + sway * 48, top);
        c.stroke();
        // a pair of leaves per step, fanning out up the stem
        var pairs = Math.max(1, Math.round(g));
        for (var i = 0; i < pairs; i++) {
          var f = (i + 1) / (pairs + 0.6);
          var ly = lerp(base - this.H * 0.05, top, f), lx = x + sway * 48 * f;
          var lr = (this.W * 0.055) * (0.6 + 0.5 * (1 - f)) * pop;
          [-1, 1].forEach(function (sd) {
            c.save(); c.translate(lx, ly); c.rotate(sd * (0.75 + sway * 0.5) + (sd < 0 ? Math.PI : 0));
            c.fillStyle = i % 2 ? '#4fbe46' : '#3f9e3a';
            c.beginPath(); c.ellipse(lr * 0.8, 0, lr, lr * 0.46, 0, 0, TAU); c.fill();
            c.restore();
          });
        }
        // a bud, then a flower once it is fully grown
        if (g >= STAGES - 1.4) {
          var fx = x + sway * 48, fy = top, fr = this.W * 0.045 * pop;
          var open = clamp(g - (STAGES - 1.4), 0, 1);
          for (var p = 0; p < 6; p++) {
            var an = p / 6 * TAU + this.time * 0.3;
            c.fillStyle = '#ff7ab0';
            c.beginPath();
            c.ellipse(fx + Math.cos(an) * fr * open, fy + Math.sin(an) * fr * open, fr * 0.72, fr * 0.5, an, 0, TAU);
            c.fill();
          }
          c.fillStyle = '#ffd24c'; c.beginPath(); c.arc(fx, fy, fr * 0.55, 0, TAU); c.fill();
        } else if (g >= 2.4) {
          c.fillStyle = '#8bd46a';
          c.beginPath(); c.arc(x + sway * 48, top, this.W * 0.026 * pop, 0, TAU); c.fill();
        }
      }
      c.restore();
    },

    // What it wants, in a bubble over its head.
    _bubble: function (c) {
      if (!this.want) return;
      var text = this.want.ask;
      var h = clamp(this.H * 0.085, 40, 72), pad = h * 0.5;
      c.save();
      c.font = '900 ' + Math.round(h * 0.5) + 'px system-ui, -apple-system, Segoe UI, sans-serif';
      var w = Math.min(c.measureText(text).width + pad * 2, this.W - 28);
      var x = clamp(this.potX, w / 2 + 12, this.W - w / 2 - 12);
      var top = this.groundY + 4 - this.H * 0.055 - this._plantH();
      var y = clamp(top - h * 0.42 - h / 2 - this.H * 0.018, h / 2 + 8, this.groundY - h * 0.9);
      var pop = 0.92 + Math.sin(clamp(this.bubblePop, 0, 1) * Math.PI) * 0.12;
      c.translate(x, y); c.scale(pop, pop); c.translate(-x, -y);

      c.fillStyle = '#fff'; c.strokeStyle = '#2a2140'; c.lineWidth = 4;
      var r = h * 0.42, l = x - w / 2, t = y - h / 2;
      c.beginPath();
      if (c.roundRect) c.roundRect(l, t, w, h, r);
      else c.rect(l, t, w, h);
      c.fill(); c.stroke();
      // the tail, pointing down at the plant
      c.beginPath();
      c.moveTo(x - h * 0.22, t + h - 2); c.lineTo(x, t + h + h * 0.42); c.lineTo(x + h * 0.06, t + h - 2);
      c.closePath(); c.fillStyle = '#fff'; c.fill();
      c.strokeStyle = '#2a2140'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x - h * 0.22, t + h); c.lineTo(x, t + h + h * 0.42); c.lineTo(x + h * 0.06, t + h); c.stroke();
      c.fillStyle = '#fff'; c.fillRect(x - h * 0.2, t + h - 3, h * 0.24, 5);

      c.fillStyle = '#2a2140'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 ' + Math.round(h * 0.5) + 'px system-ui, -apple-system, Segoe UI, sans-serif';
      c.fillText(text, x, y + 1);
      c.restore();
    },

    /* ── the tray ──────────────────────────────────────────────── */

    _tray: function (c) {
      var R = this.tokR;
      c.save();
      c.fillStyle = 'rgba(12,8,28,.3)';
      c.fillRect(0, this.trayTop, this.W, this.H - this.trayTop);
      c.restore();
      for (var i = 0; i < this.tray.length; i++) {
        var t = this.tray[i];
        var held = this.drag && this.drag.tok === t;
        var s = R * (1 + t.pop * 0.12 + (held ? 0.16 : 0) + t.glow * 0.14);
        c.save();
        c.translate(t.pos.x, t.pos.y);
        if (t.glow > 0.01) {
          // the HELP glow: the one it asked for, jumping up and down
          c.translate(0, -Math.abs(Math.sin(this.time * 6)) * R * 0.3 * t.glow);
          c.save();
          c.globalAlpha = t.glow * 0.85; c.strokeStyle = '#ffd24c'; c.lineWidth = 5;
          c.beginPath(); c.arc(0, 0, s * 1.2, 0, TAU); c.stroke();
          c.restore();
        }
        c.fillStyle = 'rgba(255,255,255,.14)';
        c.beginPath(); c.arc(0, 0, s * 1.08, 0, TAU); c.fill();
        this._icon(c, t.thing.id, s);
        c.restore();
      }
    },

    // Each thing drawn in code at radius r, centred on the origin.
    _icon: function (c, id, r) {
      var i, a;
      if (id === 'sun') {
        c.strokeStyle = '#ffd24c'; c.lineWidth = r * 0.16; c.lineCap = 'round';
        for (i = 0; i < 8; i++) {
          a = i / 8 * TAU + this.time * 0.4;
          c.beginPath(); c.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
          c.lineTo(Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0); c.stroke();
        }
        c.fillStyle = '#ffc62e'; c.beginPath(); c.arc(0, 0, r * 0.56, 0, TAU); c.fill();
      } else if (id === 'water') {
        c.fillStyle = '#4fb6e8';
        c.beginPath();
        c.moveTo(0, -r * 0.88);
        c.bezierCurveTo(r * 0.72, -r * 0.1, r * 0.6, r * 0.78, 0, r * 0.78);
        c.bezierCurveTo(-r * 0.6, r * 0.78, -r * 0.72, -r * 0.1, 0, -r * 0.88);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,.55)';
        c.beginPath(); c.ellipse(-r * 0.2, r * 0.26, r * 0.14, r * 0.22, -0.4, 0, TAU); c.fill();
      } else if (id === 'rain' || id === 'thunder') {
        c.fillStyle = id === 'thunder' ? '#515873' : '#9fb3c6';
        this._cloud(c, 0, -r * 0.18, r * 0.78);
        if (id === 'thunder') {
          c.fillStyle = '#ffe066';
          c.beginPath();
          c.moveTo(r * 0.06, r * 0.1); c.lineTo(-r * 0.3, r * 0.56);
          c.lineTo(-r * 0.02, r * 0.56); c.lineTo(-r * 0.2, r * 1.0);
          c.lineTo(r * 0.36, r * 0.4); c.lineTo(r * 0.06, r * 0.4);
          c.closePath(); c.fill();
        } else {
          c.strokeStyle = '#6fc4ff'; c.lineWidth = r * 0.14; c.lineCap = 'round';
          for (i = -1; i <= 1; i++) {
            c.beginPath(); c.moveTo(i * r * 0.36, r * 0.42); c.lineTo(i * r * 0.36 - r * 0.1, r * 0.82); c.stroke();
          }
        }
      } else if (id === 'snow') {
        c.strokeStyle = '#fff'; c.lineWidth = r * 0.14; c.lineCap = 'round';
        for (i = 0; i < 3; i++) {
          a = i / 3 * Math.PI;
          c.beginPath(); c.moveTo(-Math.cos(a) * r * 0.86, -Math.sin(a) * r * 0.86);
          c.lineTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); c.stroke();
        }
        for (i = 0; i < 6; i++) {
          a = i / 6 * TAU;
          c.beginPath();
          c.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5);
          c.lineTo(Math.cos(a) * r * 0.5 + Math.cos(a + 0.9) * r * 0.26, Math.sin(a) * r * 0.5 + Math.sin(a + 0.9) * r * 0.26);
          c.stroke();
        }
      } else if (id === 'wind') {
        c.strokeStyle = '#eaf7ff'; c.lineWidth = r * 0.15; c.lineCap = 'round';
        for (i = -1; i <= 1; i++) {
          var y = i * r * 0.42, len = r * (i === 0 ? 0.95 : 0.7);
          c.beginPath();
          c.moveTo(-r * 0.9, y); c.lineTo(len - r * 0.2, y);
          c.quadraticCurveTo(len + r * 0.3, y, len, y + r * 0.3);
          c.stroke();
        }
      } else if (id === 'night') {
        // drawn as one crescent path — punching a hole with destination-out
        // would cut straight through the sky and the ground behind it
        c.fillStyle = '#ffe9a8';
        c.beginPath();
        c.moveTo(r * 0.26, -r * 0.8);
        c.bezierCurveTo(-r * 0.8, -r * 0.62, -r * 0.8, r * 0.62, r * 0.26, r * 0.8);
        c.bezierCurveTo(-r * 0.2, r * 0.36, -r * 0.2, -r * 0.36, r * 0.26, -r * 0.8);
        c.closePath(); c.fill();
        c.fillStyle = '#fff';
        [[r * 0.66, r * 0.42, r * 0.11], [r * 0.74, -r * 0.52, r * 0.08]].forEach(function (p) {
          c.beginPath(); c.arc(p[0], p[1], p[2], 0, TAU); c.fill();
        });
      } else if (id === 'rainbow') {
        c.lineWidth = r * 0.17; c.lineCap = 'butt';
        for (i = 0; i < BOW.length; i++) {
          c.strokeStyle = BOW[i];
          c.beginPath(); c.arc(0, r * 0.5, r * 0.92 - i * c.lineWidth, Math.PI, TAU); c.stroke();
        }
      }
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.note) e.note.textContent = this.stage >= STAGES ? '🌸 all grown!' : '🌱 make it grow';
    }
  };

  global.MakeGame = MakeGame;
})(window);
