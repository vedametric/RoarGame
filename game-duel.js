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
 * The alien plays for real. It picks a thing on the board, locks a beam onto
 * it, and takes it a moment later — so its score comes off the same board
 * hers does, and you can watch it earn every point.
 *
 * That beam is the whole game. It is a warning with a countdown on it: the
 * ring round the thing closes as the alien's grip tightens, and if she taps
 * it first she takes it out from under them. Stealing is the best thing in
 * the game and it is entirely her doing.
 *
 * It used to score off a timer instead, one point every 1.5 seconds whatever
 * was happening, while only about fourteen things fell in the fifteen seconds
 * it took to finish. She had to catch ten of fourteen — a seventy per cent
 * hit rate on moving targets — merely to draw. That is not a hard game, it is
 * a rigged one, and it is why the alien looked like it was loafing in the
 * corner: it was. Both now draw from one board, and the board is stocked for
 * two.
 *
 * Still weighted her way: the beam telegraphs for the best part of a second
 * before it takes anything, and it slows down further if she falls behind.
 * But it never stops — put the phone down and it wins on its own, because a
 * reward you cannot lose is not a reward.
 *
 * It also never nags. Losing gets a cheerful "next time" from an alien that
 * is plainly pleased to have met her.
 */
(function (global) {
  'use strict';

  var TARGET = 10;              // things to collect, in the collecting games
  var RACE_TAPS = 18;           // taps to get across, in the race
  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  /* How long the alien takes to finish on its own — about fifteen seconds in
     every game, so putting the phone down always loses at roughly the same
     speed. Its pace per thing is worked out from that and the target, because
     one rate for all three made the race take thirty-seven seconds to lose:
     the same pace, but twice as many things to do. */
  var ALIEN_SECS = 15;
  var BEHIND_HELP = 0.55;       // how much it eases off when she is behind
  var AHEAD_PUSH = 1.22;        // and hurries when she is miles ahead

  /* The beam. LOCK is how long the ring takes to close — her window to steal
     the thing — and COOL is the breath it takes between one and the next.
     They add up to the same 1.5 seconds a point that the timer used to take,
     so the alien is exactly as quick as it always was; the difference is that
     now it has to find something to take. */
  var LOCK = 0.95;
  var COOL = 0.55;

  var GAMES = [
    { id: 'grab', name: 'CATCH THE STARS',
      how: 'Tap the falling things!', target: TARGET },
    { id: 'pop',  name: 'POP THE BUBBLES',
      how: 'Pop them before they float away!', target: TARGET },
    { id: 'race', name: 'RACE!',
      how: 'Tap as fast as you can!', target: RACE_TAPS }
  ];
  GAMES.forEach(function (g) { g.pace = ALIEN_SECS / g.target; });

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
      // Where the alien is, what it is reaching for, and how far through its
      // grip is. It starts on its own side and comes out to work.
      this.al = { x: this.W ? this.W * 0.74 : 0, target: null,
                  lock: 0, lockFor: LOCK, cool: 0.6, startle: 0, took: 0 };
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
      // Turning the phone changes the board out from under the alien.
      if (this.al) this.al.x = clamp(this.al.x || this.W * 0.74, 0, this.W);
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
        if (d < o.r * 2.4 && d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) return false;

      var got = this.things[best];
      got.gone = true;
      this.mine++;

      /* Taking the one the alien had its beam on. This is the best thing in
         the game, so it is worth saying out loud rather than quietly adding
         one to her score like any other tap. */
      var stolen = this.al && this.al.target === got;
      if (stolen) {
        this.al.target = null;
        this.al.lock = 0;
        this.al.cool = COOL;
        this.al.startle = 1;
        this.pops.push({ x: got.x, y: got.y, age: 0, life: 0.9, text: 'STOLE IT!' });
        global.RoarAudio.sfx('sparkle');
      } else {
        this.pops.push({ x: got.x, y: got.y, age: 0, life: 0.5, text: '+1' });
        global.RoarAudio.sfx(this.game.id === 'pop' ? 'puff' : 'nom');
      }
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

    /* How hard it is trying. Eases off for someone who is playing and behind
       — but not for someone who has not started, or putting the phone down
       would be a way of making it wait for you. */
    _effort: function () {
      var lead = this.mine - this.theirs;
      if (lead < 0 && this.mine > 0) return 1 + BEHIND_HELP;   // slower
      if (lead > 3) return 1 / AHEAD_PUSH;                     // quicker
      return 1;
    },

    /* The opponent.
       In the race there is nothing on the board to take, so it runs on a
       clock and you watch it come down its own lane. In the other two it
       plays the board: find something, lock on, take it — and the locking is
       done out loud so she gets the chance to take it first. */
    _alien: function (dt) {
      if (this.game.id === 'race') {
        var pace = this.game.pace * this._effort();
        this.alienAcc += dt;
        if (this.alienAcc >= pace) {
          this.alienAcc -= pace;
          this.theirs++;
          if (this.theirs >= this.game.target) this._finish(false);
        }
        return;
      }

      var a = this.al;
      a.startle = Math.max(0, a.startle - dt * 1.6);

      // Whatever it was reaching for may have drifted off the board, or she
      // may have got there first.
      if (a.target && (a.target.gone || this.things.indexOf(a.target) < 0)) {
        a.target = null;
        a.lock = 0;
        if (a.cool <= 0) a.cool = COOL * 0.5;
      }

      if (a.cool > 0) {
        a.cool -= dt;
      } else if (!a.target) {
        a.target = this._pick();
        if (a.target) {
          a.lockFor = LOCK * this._effort();
          a.lock = a.lockFor;
        }
      } else {
        a.lock -= dt;
        if (a.lock <= 0) this._take(a.target);
      }

      // It slides along under whatever it is working on, so the beam is short
      // and you can see which thing is about to go.
      var want = a.target ? clamp(a.target.x, this.W * 0.14, this.W * 0.86)
                          : this.W * 0.74;
      a.x += (want - a.x) * clamp(dt * 2.8, 0, 1);
    },

    // How long a thing has left before it leaves the board on its own.
    _lifeLeft: function (o) {
      if (!o.vy) return 99;
      return this.game.id === 'grab'
        ? (this.H + o.r - o.y) / o.vy      // falling
        : (o.y + o.r * 2) / o.vy;          // rising
    },

    /* What to go for. Only things that will still be there when the grip
       closes — reaching for something about to fall off the bottom looks
       stupid and wastes its turn — and of those, the nearest, so it works its
       own side of the board and leaves her a share. */
    _pick: function () {
      var need = LOCK * this._effort() + 0.35;
      var best = null, bestD = 1e9;
      for (var i = 0; i < this.things.length; i++) {
        var o = this.things[i];
        if (o.gone || this._lifeLeft(o) < need) continue;
        var d = Math.abs(o.x - this.al.x);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best;
    },

    _take: function (o) {
      var a = this.al;
      o.gone = true;
      this.theirs++;
      a.took++;
      a.target = null;
      a.lock = 0;
      a.cool = COOL * this._effort();
      this.pops.push({ x: o.x, y: o.y, age: 0, life: 0.5, text: '−1', them: true });
      global.RoarAudio.sfx('alien');
      if (this.theirs >= this.game.target) this._finish(false);
    },

    _things: function (dt) {
      var i, o;
      this.spawn -= dt;
      /* Stocked for two. Six things at a time was barely enough for one: with
         the six-at-once cap and the time each took to cross, only about
         fourteen ever appeared in the fifteen seconds a round lasts, and she
         needed ten of them. Nine at a time, appearing faster — and because
         every one taken frees a slot at once, a board being actively played
         refills quicker than one being ignored. */
      var want = this.game.id === 'grab' ? 0.28 : 0.38;
      if (this.spawn <= 0 && this.things.filter(function (x) { return !x.gone; }).length < 9) {
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
        // Slower than they were, which is both easier to hit and longer on
        // the board — the two things the round was short of.
        vy: rnd(s * 0.24, s * 0.34), r: s * 0.055, r0: s * 0.055,
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

      // The alien, drawn where it has moved to rather than parked in the
      // corner, with a jolt when it has just been robbed.
      var s = Math.min(W, H) * 0.30;
      var mood = this.over ? (this.iWon ? 'lose' : 'win') : 'busy';
      var ax = (this.al ? this.al.x : W * 0.74) +
               (this.al && this.al.startle > 0.01
                 ? Math.sin(this.t * 42) * s * 0.09 * this.al.startle : 0);
      global.Aliens.draw(c, this.planet, ax, H * 0.88, s, this.t, mood);

      if (this.game.id === 'race') {
        this._race(c, W, H);
      } else {
        this._beam(c);          // under the things, so it never hides one
        this._thingsDraw(c);
        this._ring(c);          // and the countdown over the top of them
      }

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

    /* The beam, and the ring that closes around what it is holding.
       Drawn as thinly as it can be and still be unmissable: this is a small
       screen and every pixel spent on the alien's arm is a pixel of board she
       cannot see. The beam goes under the things; the ring goes over them. */

    _beamTo: function () {
      var a = this.al;
      if (!a || !a.target || a.target.gone || this.over) return null;
      return { a: a, o: a.target,
               grip: clamp(1 - a.lock / (a.lockFor || LOCK), 0, 1) };
    },

    _beam: function (c) {
      var b = this._beamTo();
      if (!b) return;
      var s = Math.min(this.W, this.H);
      var from = { x: b.a.x, y: this.H * 0.80 };
      var g = c.createLinearGradient(from.x, from.y, b.o.x, b.o.y);
      g.addColorStop(0, this.alien.skin);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.save();
      c.globalAlpha = 0.20 + b.grip * 0.35;
      c.strokeStyle = g;
      c.lineWidth = s * (0.012 + b.grip * 0.016);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(from.x, from.y);
      c.lineTo(b.o.x, b.o.y);
      c.stroke();
      c.restore();
    },

    _ring: function (c) {
      var b = this._beamTo();
      if (!b) return;
      var o = b.o;
      // The ring tightens onto the thing as the grip closes, so how long she
      // has is a size rather than a number.
      var r = o.r * (2.5 - b.grip * 1.1);
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.30)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(o.x, o.y, r, 0, 6.2832); c.stroke();

      c.strokeStyle = this.alien.skin;
      c.lineWidth = 3.5;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(o.x, o.y, r, -Math.PI / 2, -Math.PI / 2 + 6.2832 * b.grip);
      c.stroke();
      c.restore();
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
          c.fillStyle = '#fff';                 // see game-pairs.js
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
        // A steal is worth shouting about; a thing the alien took is worth
        // seeing go, in the alien's own colour so it is obvious who has it.
        var big = p.text.length > 3;
        c.font = '900 ' + (big ? 20 : 22) + 'px system-ui, sans-serif';
        c.fillStyle = p.them ? this.alien.skin : big ? '#9df08a' : '#ffd24c';
        c.fillText(p.text, p.x, p.y - (1 - k) * 30);
      }
      c.restore();
    }
  };

  DuelGame.GAMES = GAMES;        // exposed for testing
  DuelGame.TARGET = TARGET;
  DuelGame.RACE_TAPS = RACE_TAPS;
  DuelGame.LOCK = LOCK;
  DuelGame.COOL = COOL;
  global.DuelGame = DuelGame;
})(window);
