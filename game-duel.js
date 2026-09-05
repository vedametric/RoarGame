/*
 * game-duel.js — "SPACE DUEL"
 *
 * The little game you play with whoever lives on the planet you just landed
 * on. Both of you have the same job to do and whoever finishes first wins.
 *
 * Three different jobs, picked at random, so it is not the same game twice:
 *   GRAB   things fall out of the sky — collect ten before the alien does
 *   POP    bubbles appear all over — pop ten before the alien does
 *   RACE   tap as fast as you can — first one across the line
 *
 * It is deliberately weighted her way. The alien works at a steady pace that
 * a child who is actually trying will beat comfortably, and it eases off if
 * she falls behind. But it never stops: put the phone down and it finishes
 * on its own and wins, because a reward you cannot lose is not a reward.
 *
 * It also never nags. Losing gets a cheerful "next time" from an alien that
 * is plainly pleased to have met her.
 */
(function (global) {
  'use strict';

  var TARGET = 10;              // things to collect, in the collecting games
  var RACE_TAPS = 26;           // taps to get across, in the race
  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  /* The alien's pace. It is set from how long it should take a child who is
     playing properly: at ONE_EVERY seconds a thing, doing nothing at all
     loses in about fifteen seconds, and tapping at any real rate wins. */
  var ONE_EVERY = 1.45;
  var BEHIND_HELP = 0.55;       // how much it eases off when she is behind
  var AHEAD_PUSH = 1.22;        // and hurries when she is miles ahead

  var GAMES = [
    { id: 'grab', name: 'CATCH THE STARS',
      how: 'Tap the falling things!', target: TARGET },
    { id: 'pop',  name: 'POP THE BUBBLES',
      how: 'Pop them before they float away!', target: TARGET },
    { id: 'race', name: 'RACE!',
      how: 'Tap as fast as you can!', target: RACE_TAPS }
  ];

  var FALLING = ['⭐', '💎', '🍬', '🪐', '☄️', '🍭'];
  var SAVED = 'duel.won';

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var DuelGame = {
    running: false,

    /* cfg: { canvas, els: {title, how, you, them, over, overTitle, overMsg,
                            again, done}, planet, onOver } */
    start: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');

      this.planet = cfg.planet || 'THE MOON';
      this.alien = global.Aliens.of(this.planet);
      this.won = parseInt(saved(SAVED, '0'), 10) || 0;
      this.paused = false;
      this.running = true;

      this._fit();
      this._newRound(cfg.game);

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
      clearTimeout(this._endT);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      this._unbind();
      try { global.Confetti.stop(); } catch (e) {}
    },

    setPaused: function (on) {
      this.paused = !!on;
      this.last = performance.now();
    },

    // A different job each time, and never the same one twice running.
    _newRound: function (forced) {
      var pool = GAMES.filter(function (g) {
        return g.id !== DuelGame.lastGame;
      });
      this.game = forced
        ? (GAMES.filter(function (g) { return g.id === forced; })[0] || pool[0])
        : pool[(Math.random() * pool.length) | 0];
      DuelGame.lastGame = this.game.id;

      this.t = 0;
      this.mine = 0;
      this.theirs = 0;
      this.over = false;
      this.iWon = false;
      this.things = [];
      this.pops = [];
      this.spawn = 0;
      this.alienAcc = 0;
      this.shake = 0;
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this._newRound();
      global.RoarAudio.sfx('go');
    },

    /* ── the canvas ───────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 420;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    },

    _bind: function () {
      var self = this;
      this._tap = function (e) {
        if (!self.running || self.over || self.paused) return;
        var r = self.canvas.getBoundingClientRect();
        self.hit(e.clientX - r.left, e.clientY - r.top);
        e.preventDefault();
      };
      this.canvas.addEventListener('pointerdown', this._tap, { passive: false });
    },

    _unbind: function () {
      if (this._tap) this.canvas.removeEventListener('pointerdown', this._tap);
    },

    /* A tap. In the race any tap counts; in the other two it has to land on
       something, and the target is generous — small fingers miss. */
    hit: function (x, y) {
      if (this.over) return false;

      if (this.game.id === 'race') {
        this.mine++;
        this.shake = 0.5;
        global.RoarAudio.sfx('step');
        this._checkDone();
        return true;
      }

      var best = -1, bestD = 1e9;
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        if (o.gone) continue;
        var d = Math.hypot(o.x - x, o.y - y);
        if (d < o.r * 2.1 && d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return false;

      var got = this.things[best];
      got.gone = true;
      this.mine++;
      this.pops.push({ x: got.x, y: got.y, age: 0, life: 0.5, text: '+1' });
      global.RoarAudio.sfx(this.game.id === 'pop' ? 'puff' : 'nom');
      this._checkDone();
      return true;
    },

    _checkDone: function () {
      if (this.mine >= this.game.target) this._finish(true);
    },

    _finish: function (mine) {
      if (this.over) return;
      this.over = true;
      this.iWon = !!mine;
      if (mine) {
        this.won++;
        save(SAVED, String(this.won));
        global.RoarAudio.sfx('win');
        try {
          global.Confetti.start(['#ffd24c', '#7ec8ff', '#e6b3ff', '#9df08a', '#ffffff']);
        } catch (e) {}
      } else {
        global.RoarAudio.sfx('birdaww');
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.iWon, this.won);
    },

    /* ── the loop ─────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this._update(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _update: function (dt) {
      this.t += dt;
      this.shake = Math.max(0, this.shake - dt * 3);

      for (var i = this.pops.length - 1; i >= 0; i--) {
        var p = this.pops[i];
        p.age += dt;
        if (p.age > p.life) this.pops.splice(i, 1);
      }

      if (!this.over) {
        this._alien(dt);
        if (this.game.id !== 'race') this._things(dt);
      }
      this._render();
    },

    /* The opponent. It works at a steady pace, eases off when she is behind
       and hurries a little when she is a long way ahead — so the finish is
       usually close, and usually hers. */
    _alien: function (dt) {
      var lead = this.mine - this.theirs;
      var pace = ONE_EVERY;
      // It eases off for someone who is playing and behind — but not for
      // someone who has not started, or putting the phone down would be a way
      // of making it wait for you.
      if (lead < 0 && this.mine > 0) pace *= 1 + BEHIND_HELP;
      else if (lead > 3) pace /= AHEAD_PUSH;   // she is miles ahead: it hurries
      this.alienAcc += dt;
      if (this.alienAcc >= pace) {
        this.alienAcc -= pace;
        this.theirs++;
        if (this.theirs >= this.game.target) this._finish(false);
      }
    },

    _things: function (dt) {
      var i, o;
      this.spawn -= dt;
      var want = this.game.id === 'grab' ? 0.42 : 0.55;
      if (this.spawn <= 0 && this.things.filter(function (x) { return !x.gone; }).length < 6) {
        this.spawn = want;
        this.things.push(this.game.id === 'grab' ? this._faller() : this._bubble());
      }

      for (i = this.things.length - 1; i >= 0; i--) {
        o = this.things[i];
        o.age += dt;
        if (o.gone) {
          o.fade = (o.fade || 0) + dt;
          if (o.fade > 0.3) this.things.splice(i, 1);
          continue;
        }
        if (this.game.id === 'grab') {
          o.y += o.vy * dt;
          o.x += Math.sin(o.age * 2 + o.wob) * 22 * dt;
          if (o.y > this.H + o.r) this.things.splice(i, 1);
        } else {
          o.y -= o.vy * dt;                       // bubbles drift upwards
          o.x += Math.sin(o.age * 1.7 + o.wob) * 26 * dt;
          o.r = o.r0 * (1 + Math.sin(o.age * 3) * 0.06);
          if (o.y < -o.r * 2) this.things.splice(i, 1);
        }
      }
    },

    _faller: function () {
      var s = Math.min(this.W, this.H);
      return {
        kind: 'fall', emoji: FALLING[(Math.random() * FALLING.length) | 0],
        x: rnd(this.W * 0.12, this.W * 0.88), y: -s * 0.08,
        vy: rnd(s * 0.30, s * 0.44), r: s * 0.055, r0: s * 0.055,
        age: 0, wob: rnd(0, 6.28)
      };
    },

    _bubble: function () {
      var s = Math.min(this.W, this.H);
      var r = rnd(s * 0.05, s * 0.085);
      return {
        kind: 'bub', hue: (Math.random() * 360) | 0,
        x: rnd(r * 2, this.W - r * 2), y: this.H + r,
        vy: rnd(s * 0.16, s * 0.28), r: r, r0: r,
        age: 0, wob: rnd(0, 6.28)
      };
    },

    /* ── the screen around it ─────────────────────────────────── */

    _render: function () {
      var e = this.el;
      if (e.title) e.title.textContent = this.game.name;
      if (e.how) e.how.textContent = this.game.how;
      if (e.you) e.you.textContent = this.mine + ' / ' + this.game.target;
      if (e.them) {
        e.them.textContent = this.alien.name + ' ' + this.theirs + ' / ' + this.game.target;
      }
      if (e.bar) {
        e.bar.style.setProperty('--me', (this.mine / this.game.target * 100) + '%');
        e.bar.style.setProperty('--them', (this.theirs / this.game.target * 100) + '%');
      }
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overTitle) {
            e.overTitle.textContent = this.iWon ? 'YOU WIN! 🏆' : this.alien.name + ' won!';
          }
          if (e.overMsg) {
            e.overMsg.textContent = this.iWon
              ? this.alien.name + ' says you are the fastest they have ever met.'
              : 'So close! ' + this.alien.name + ' wants another go.';
          }
          if (e.overWins) e.overWins.textContent = '🏆 ' + this.won;
        }
      }
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);
      c.save();
      if (this.shake > 0.01) {
        c.translate(rnd(-2, 2) * this.shake, rnd(-2, 2) * this.shake);
      }

      this._ground(c, W, H);

      // the alien, over on its side of the ground, working away
      var s = Math.min(W, H) * 0.30;
      var mood = this.over ? (this.iWon ? 'lose' : 'win') : 'busy';
      global.Aliens.draw(c, this.planet, W * 0.74, H * 0.88, s, this.t, mood);

      if (this.game.id === 'race') this._race(c, W, H);
      else this._thingsDraw(c);

      this._popsDraw(c);
      c.restore();
    },

    _ground: function (c, W, H) {
      var a = this.alien;
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(10,6,26,0)');
      g.addColorStop(1, a.dark);
      c.globalAlpha = 0.35;
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;

      c.fillStyle = a.dark;
      c.beginPath();
      c.moveTo(0, H * 0.93);
      c.quadraticCurveTo(W / 2, H * 0.88, W, H * 0.93);
      c.lineTo(W, H); c.lineTo(0, H);
      c.closePath();
      c.fill();
    },

    // The race: two runners crossing the screen, her against the alien.
    _race: function (c, W, H) {
      var s = Math.min(W, H);
      var lane = [H * 0.36, H * 0.60];
      var pad = W * 0.12;
      var run = W - pad * 2;

      // the finish line
      c.save();
      c.setLineDash([8, 8]);
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(W - pad, H * 0.24);
      c.lineTo(W - pad, H * 0.72);
      c.stroke();
      c.restore();
      c.font = '900 12px system-ui, sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.textAlign = 'center';
      c.fillText('FINISH', W - pad, H * 0.20);

      [[this.mine, lane[0], '#9df08a', 'YOU'],
       [this.theirs, lane[1], this.alien.skin, this.alien.name]].forEach(function (r, i) {
        var k = clamp(r[0] / RACE_TAPS, 0, 1);
        var x = pad + run * k;
        // the lane
        c.strokeStyle = 'rgba(255,255,255,0.12)';
        c.lineWidth = s * 0.075;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(pad, r[1]); c.lineTo(W - pad, r[1]); c.stroke();
        // how far along
        c.strokeStyle = r[2];
        c.globalAlpha = 0.5;
        c.beginPath(); c.moveTo(pad, r[1]); c.lineTo(x, r[1]); c.stroke();
        c.globalAlpha = 1;
        // the runner
        c.font = (s * 0.075) + 'px system-ui, sans-serif';
        c.fillStyle = r[2];
        c.textAlign = 'center';
        c.beginPath();
        c.arc(x, r[1], s * 0.036, 0, 6.2832);
        c.fill();
        c.fillStyle = '#0c0620';
        c.font = '900 ' + (s * 0.028) + 'px system-ui, sans-serif';
        c.fillText(i ? '👽' : '🚀', x, r[1] + s * 0.012);
      }, this);

      // and something to tell her what to do
      if (this.mine === 0 && this.t % 1.2 < 0.7) {
        c.font = '900 ' + (s * 0.055) + 'px system-ui, sans-serif';
        c.fillStyle = '#ffd24c';
        c.textAlign = 'center';
        c.fillText('TAP! TAP! TAP!', W / 2, H * 0.15);
      }
    },

    _thingsDraw: function (c) {
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        var fade = o.gone ? clamp(1 - (o.fade || 0) / 0.3, 0, 1) : 1;
        var grow = o.gone ? 1 + (1 - fade) * 0.8 : 1;
        c.save();
        c.globalAlpha = fade;
        if (o.kind === 'bub') {
          var g = c.createRadialGradient(o.x - o.r * 0.3, o.y - o.r * 0.35, o.r * 0.1,
                                         o.x, o.y, o.r * grow);
          g.addColorStop(0, 'hsla(' + o.hue + ',100%,92%,0.95)');
          g.addColorStop(0.7, 'hsla(' + o.hue + ',90%,70%,0.45)');
          g.addColorStop(1, 'hsla(' + o.hue + ',90%,60%,0.18)');
          c.fillStyle = g;
          c.beginPath(); c.arc(o.x, o.y, o.r * grow, 0, 6.2832); c.fill();
          c.strokeStyle = 'rgba(255,255,255,0.7)';
          c.lineWidth = 1.5;
          c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.85)';
          c.beginPath();
          c.arc(o.x - o.r * 0.32, o.y - o.r * 0.34, o.r * 0.18, 0, 6.2832);
          c.fill();
        } else {
          c.font = (o.r * 2.2 * grow) + 'px ' + EMOJI;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(o.emoji, o.x, o.y);
        }
        c.restore();
      }
    },

    _popsDraw: function (c) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var i = 0; i < this.pops.length; i++) {
        var p = this.pops[i];
        var k = 1 - p.age / p.life;
        c.globalAlpha = clamp(k * 1.6, 0, 1);
        c.font = '900 22px system-ui, sans-serif';
        c.fillStyle = '#ffd24c';
        c.fillText(p.text, p.x, p.y - (1 - k) * 30);
      }
      c.restore();
    }
  };

  DuelGame.GAMES = GAMES;        // exposed for testing
  DuelGame.TARGET = TARGET;
  DuelGame.RACE_TAPS = RACE_TAPS;
  global.DuelGame = DuelGame;
})(window);
