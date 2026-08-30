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
  var CRUISE = 8.6;          // out of the sky; somewhere ahead to aim for
  var LAND = 12.4;           // close enough that it is a place, not a dot
  var TOUCH = 15.0;          // down
  var END = 19.0;            // curtain

  /* ── where it goes ────────────────────────────────────────────
     A different planet every launch, so the tenth one is still worth
     watching. Each is a real place with the colours it really has, and a
     line about it she can hold on to. */
  var PLANETS = [
    { name: 'THE MOON', short: 'the moon', sky: '#04040c',
      body: '#ddd9cd', spot: '#a9a598', ground: '#8d8a83', deep: '#3a3835',
      fact: 'no wind, no rain, no sound' },
    { name: 'MARS', short: 'Mars', sky: '#2a1008',
      body: '#d1603a', spot: '#9c4526', ground: '#c1502b', deep: '#4a1c0e',
      fact: 'the rusty red one' },
    { name: 'VENUS', short: 'Venus', sky: '#3a2408',
      body: '#e8c07a', spot: '#c69a52', ground: '#e0b46a', deep: '#6a4a1c',
      fact: 'hotter than an oven' },
    { name: 'JUPITER', short: 'Jupiter', sky: '#241608',
      body: '#e0b48a', spot: '#a86b4a', ground: '#d8a878', deep: '#5a3320',
      fact: 'the biggest one of all', bands: true, eye: true },
    { name: 'SATURN', short: 'Saturn', sky: '#1c1a0c',
      body: '#f0dfa8', spot: '#c9b276', ground: '#e8d69c', deep: '#5c5030',
      fact: 'the one with the rings', rings: true, bands: true },
    { name: 'NEPTUNE', short: 'Neptune', sky: '#070f26',
      body: '#4a7fd8', spot: '#2d549c', ground: '#4477cc', deep: '#16264e',
      fact: 'windier than anywhere', bands: true },
    { name: 'MERCURY', short: 'Mercury', sky: '#0c0a08',
      body: '#b3ada4', spot: '#7d786f', ground: '#a8a29a', deep: '#3c3833',
      fact: 'closest to the sun' },
    { name: 'PLUTO', short: 'Pluto', sky: '#0a0812',
      body: '#d8c4ad', spot: '#a8917a', ground: '#cdb9a2', deep: '#443a30',
      fact: 'small, far, and very cold', heart: true }
  ];

  /* ...and something different waiting when she gets there. This is the part
     that makes it worth launching again: the planet tells her where she is,
     the welcome tells her it was worth going. */
  var WELCOMES = [
    { emoji: ['👽', '🛸', '👽'], say: 'The aliens came to say hello!', sfx: 'alien' },
    { emoji: ['🦄', '🌈'],       say: 'A space unicorn lives here!',   sfx: 'sparkle' },
    { emoji: ['🎉', '🎂', '🎈'], say: 'It is somebody’s birthday!',    sfx: 'win' },
    { emoji: ['🤖', '🔧'],       say: 'A little robot rolled over.',   sfx: 'spawn' },
    { emoji: ['🐧', '❄️', '🐧'], say: 'Penguins! On another planet!',  sfx: 'puff' },
    { emoji: ['🍦', '🍩', '🍪'], say: 'The whole ground is pudding.',  sfx: 'nom' },
    { emoji: ['🦖'],             say: 'A space dinosaur says hi.',     sfx: 'thud' },
    { emoji: ['💎', '💎', '💎'], say: 'Diamonds, everywhere you look!', sfx: 'gold' },
    { emoji: ['🐙', '🫧'],       say: 'A friendly space octopus!',     sfx: 'puff' },
    { emoji: ['🎸', '🥁', '👽'], say: 'The aliens are in a band.',     sfx: 'level' },
    { emoji: ['🐈', '🧶'],       say: 'A cat got here before you.',    sfx: 'sparkle' },
    { emoji: ['🌺', '🌷', '🌻'], say: 'Flowers grow here too.',        sfx: 'spellgood' },
    { emoji: ['⚽', '🥅'],       say: 'Fancy a game of football?',     sfx: 'grab' },
    { emoji: ['👑'],             say: 'They made you the queen!',      sfx: 'gold' }
  ];

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

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

      // Somewhere new every time, and never the same place twice running.
      var pool = PLANETS.filter(function (p) { return p.name !== Rocket.lastPlanet; });
      this.planet = pool[(Math.random() * pool.length) | 0];
      Rocket.lastPlanet = this.planet.name;
      var wpool = WELCOMES.filter(function (w) { return w.say !== Rocket.lastWelcome; });
      this.welcome = wpool[(Math.random() * wpool.length) | 0];
      Rocket.lastWelcome = this.welcome.say;
      this.guests = [];
      this.dust = [];
      this.landed = false;

      for (var i = 0; i < 150; i++) {
        this.stars.push({ x: Math.random(), y: Math.random(), r: rnd(0.4, 1.6),
                          tw: rnd(0, 6.28) });
      }
      // Cloud height in metres, so the rocket genuinely passes through them.
      for (i = 0; i < 14; i++) {
        this.clouds.push({ x: rnd(-0.2, 1.2), h: rnd(220, 1100),
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
      clearTimeout(this._partyT);
      try { global.Confetti.stop(); } catch (e) {}
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
      this._once('space', CRUISE - 0.6, function () {
        if (self0.cfg.word) {
          self0.cfg.word.textContent = '🌍 SPACE!';
          self0.cfg.word.className = 'launch-word is-space is-on';
        }
        global.RoarAudio.sfx('win');
      });
      // Where are we going? Announced once she is out of the sky and the
      // planet has come into view ahead.
      this._once('going', CRUISE + 1.0, function () {
        if (self0.cfg.word) {
          self0.cfg.word.innerHTML = '<small>next stop</small>' + self0.planet.name;
          self0.cfg.word.className = 'launch-word is-where is-on';
        }
        global.RoarAudio.sfx('spawn');
      });
      this._once('quiet', LAND - 0.4, function () {
        if (self0.cfg.word) self0.cfg.word.className = 'launch-word is-gone';
      });
      this._once('touch', TOUCH, function () { self0._touchdown(); });

      /* thrust — the engine builds before it can lift its own weight, which
         is why a real rocket sits still for a moment in all that fire */
      var burn = clamp((t - IGNITE) / 0.6, 0, 1);
      if (t >= CLEAR && t < CRUISE) {
        // It gets lighter as it burns, so it keeps accelerating all the way up.
        var thrust = 26 + Math.min(150, (t - CLEAR) * 34);
        this.vel += thrust * dt;
        this.alt += this.vel * dt;
      } else if (t >= CRUISE) {
        // Out of the sky the engine cuts and it coasts, the way they do — and
        // then lights again to set itself down.
        this.alt += this.vel * dt;
        burn = t >= LAND && t < TOUCH ? clamp((t - LAND) / 0.5, 0, 1) * 0.85 : 0;
        if (this.landed) burn = 0;
      }

      // How close the planet is, 0 the moment it is spotted and 1 standing on
      // it — one number, so the disc ahead and the ground underfoot are the
      // same thing seen at two distances rather than two different drawings.
      this.near = clamp((t - CRUISE) / (TOUCH - CRUISE), 0, 1);
      this.down = clamp((t - LAND) / (TOUCH - LAND), 0, 1);

      // The shake is worst at ignition, when it is straining against the pad.
      this.shake = t < CRUISE
        ? burn * (t < CLEAR ? 1 : Math.max(0, 1 - (t - CLEAR) / 3.5)) * 9
        : (this.landed ? Math.max(0, 1 - (t - this.landAt) / 0.5) * 5 : 0);

      if (this.air) {
        this.air.setBurner(burn);
        this.air.setWind(t < CRUISE ? burn * clamp(this.vel / 90, 0, 1) * 0.9 : 0);
      }

      this.burn = burn;              // the flame is drawn from this, not re-guessed
      this._smoke(dt, burn);
      this._guests(dt);

      if (t >= END) this._finish();
    },

    /* ── arriving ─────────────────────────────────────────────────
       The legs touch, the dust goes up, and whoever lives here comes out to
       see who it is. */

    _touchdown: function () {
      this.landed = true;
      this.landAt = this.t;
      this.vel = 0;
      global.RoarAudio.sfx('thud');
      // dust kicked out sideways, since there is nothing to hold it up
      var y = this._horizonY(), s = this._scale();
      for (var i = 0; i < 90; i++) {
        var a = rnd(0, 6.2832);
        this.smoke.push({
          x: this.W / 2 + Math.cos(a) * rnd(0, 12), y: y - rnd(0, 6),
          vx: Math.cos(a) * rnd(80, 300), vy: rnd(-40, 30),
          r: rnd(6, 18), grow: rnd(20, 50),
          life: rnd(0.8, 1.8), age: 0, hot: 0, pad: false, moon: true
        });
      }
      if (this.cfg.word) {
        this.cfg.word.innerHTML = '<small>you landed on</small>' + this.planet.name +
                                  '<small>' + this.planet.fact + '</small>';
        this.cfg.word.className = 'launch-word is-arrived is-on';
      }

      // and the welcome party, a moment later, so it reads as two events
      var self = this;
      this._partyT = setTimeout(function () {
        if (!self.running) return;
        // Alternating sides, working outwards, so the rocket in the middle is
        // never covered up and the group looks arranged rather than dropped.
        var SIDE = [-1, 1, -1, 1];
        var OUT = [2.3, 2.3, 4.1, 4.1];
        self.welcome.emoji.forEach(function (e, i) {
          self.guests.push({
            emoji: e, at: i, age: -i * 0.18,
            x: self.W / 2 + SIDE[i % 4] * OUT[i % 4] * s + rnd(-4, 4),
            hop: rnd(0, 6.28)
          });
        });
        global.RoarAudio.sfx(self.welcome.sfx);
        if (self.cfg.word) {
          self.cfg.word.innerHTML = self.welcome.emoji.join(' ') +
                                    '<small>' + self.welcome.say + '</small>';
          self.cfg.word.className = 'launch-word is-welcome is-on';
        }
        try {
          global.Confetti.start(['#ffd24c', '#7ec8ff', '#e6b3ff', '#9df08a', '#ffffff']);
        } catch (e) {}
      }, 1300);
    },

    _guests: function (dt) {
      for (var i = 0; i < this.guests.length; i++) this.guests[i].age += dt;
    },

    // The top edge of the planet: a dot in the distance to begin with, the
    // ground under the legs by the end. One curve the whole way.
    _planetGeom: function () {
      var W = this.W, H = this.H;
      var k = this.near || 0;
      var e = k * k;                          // it swells fast as you close in
      var r0 = W * 0.035, r1 = W * 3.4;
      var r = r0 + (r1 - r0) * e;
      var cy = H * 0.40 + (H * 0.78 + r1 - H * 0.40) * e;
      return { cx: W / 2, cy: cy, r: r, top: cy - r };
    },

    _horizonY: function () {
      return this._planetGeom().top;
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
      var y = Math.max(holdY, padY - climb);
      // Coming in to land it settles down onto the surface, legs first.
      if (this.down > 0) {
        var sit = this._horizonY() - this._scale() * 1.32;
        var k = this.down * this.down * (3 - 2 * this.down);   // ease it in
        y = y + (sit - y) * k;
      }
      return y;
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
        if (this.t > CLEAR && this.t < CRUISE) p.y += this.vel * (this.H / 260) * dt * 0.55;
        // Dust on an airless world does not billow, it flies flat and drops.
        if (p.moon) { p.vy += 90 * dt; p.grow *= 0.985; }
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
      this._planet(c, W, H);
      this._smokeDraw(c);
      this._guestsDraw(c);
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
      // Close in, the planet's own sky takes over from plain black.
      if (this.down > 0) {
        c.globalAlpha = clamp(this.down * 0.8, 0, 0.8);
        c.fillStyle = this.planet.sky;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
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
      // There is no weather above the air, and certainly none on the way to
      // another planet — so they go, rather than hanging about in space.
      var air = clamp(1 - (alt - 1000) / 500, 0, 1) * (1 - clamp(this.near || 0, 0, 1) * 4);
      if (air <= 0) return;
      c.save();
      c.globalAlpha = air;
      for (var i = 0; i < this.clouds.length; i++) {
        var cl = this.clouds[i];
        // Screen position from the height difference: above you until you
        // reach it, below you once you are past.
        var y = H * HOLD_Y + (alt - cl.h) * (H / 260) * 0.85;
        if (y < -H * 0.4 || y > H * 1.4) continue;
        var w = cl.w * W, near = clamp(1 - Math.abs(alt - cl.h) / 1400, 0.25, 1);
        c.globalAlpha = cl.o * near * air;
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

    /* ── the planet ───────────────────────────────────────────────
       Drawn once, as a sphere, at whatever size the approach has reached.
       A long way off that is a coloured dot; at the end the same sphere is
       so large that its edge is the horizon and its face is the ground. */

    _planet: function (c, W, H) {
      if (!this.near) return;
      var p = this.planet, g = this._planetGeom();
      var lit = -0.32, litY = -0.30;             // where the sun is

      c.save();
      c.beginPath();
      c.arc(g.cx, g.cy, g.r, 0, 6.2832);
      c.clip();

      // the body, lit from one side
      var ball = c.createRadialGradient(
        g.cx + g.r * lit, g.cy + g.r * litY, g.r * 0.05,
        g.cx, g.cy, g.r);
      ball.addColorStop(0, p.ground);
      ball.addColorStop(0.55, p.body);
      ball.addColorStop(1, p.deep);
      c.fillStyle = ball;
      c.fillRect(g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);

      if (p.bands) {
        // Jupiter, Saturn and Neptune are striped, and the stripes are what
        // make them recognisable at a glance.
        c.fillStyle = p.spot;
        c.globalAlpha = 0.5;
        for (var b = -5; b <= 5; b++) {
          var by = g.cy + b * g.r * 0.17;
          var bh = g.r * (0.045 + 0.03 * Math.abs(Math.sin(b * 1.7)));
          c.fillRect(g.cx - g.r, by, g.r * 2, bh);
        }
        c.globalAlpha = 1;
      } else {
        // craters and patches, in fixed places so they do not crawl
        c.fillStyle = p.spot;
        c.globalAlpha = 0.55;
        for (var i = 0; i < 12; i++) {
          var a = i * 2.399;                    // spread evenly round the disc
          var rr = Math.sqrt((i + 0.5) / 12) * g.r * 0.86;
          c.beginPath();
          c.arc(g.cx + Math.cos(a) * rr, g.cy + Math.sin(a) * rr,
                g.r * (0.05 + (i % 4) * 0.028), 0, 6.2832);
          c.fill();
        }
        c.globalAlpha = 1;
      }
      if (p.eye) {                              // Jupiter's great red spot
        c.fillStyle = '#c4553a';
        c.beginPath();
        c.ellipse(g.cx + g.r * 0.26, g.cy + g.r * 0.16, g.r * 0.17, g.r * 0.10, 0, 0, 6.2832);
        c.fill();
      }
      if (p.heart) {                            // Pluto's, which is really there
        c.fillStyle = 'rgba(255,248,232,0.75)';
        c.beginPath();
        c.ellipse(g.cx - g.r * 0.12, g.cy + g.r * 0.16, g.r * 0.16, g.r * 0.19, -0.5, 0, 6.2832);
        c.ellipse(g.cx + g.r * 0.14, g.cy + g.r * 0.16, g.r * 0.16, g.r * 0.19, 0.5, 0, 6.2832);
        c.fill();
      }

      // the edge falls into shadow, which is what makes it a ball
      var shade = c.createRadialGradient(
        g.cx + g.r * lit, g.cy + g.r * litY, g.r * 0.2, g.cx, g.cy, g.r);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(0.72, 'rgba(0,0,0,0.10)');
      shade.addColorStop(1, 'rgba(0,0,0,0.62)');
      c.fillStyle = shade;
      c.fillRect(g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);
      c.restore();

      // rings, drawn round the outside once we are far enough back to see them
      if (p.rings && this.near < 0.72) {
        c.save();
        c.translate(g.cx, g.cy);
        c.scale(1, 0.28);
        c.strokeStyle = 'rgba(240,225,180,0.75)';
        c.lineWidth = g.r * 0.10;
        c.beginPath(); c.arc(0, 0, g.r * 1.55, 0, 6.2832); c.stroke();
        c.strokeStyle = 'rgba(240,225,180,0.40)';
        c.lineWidth = g.r * 0.05;
        c.beginPath(); c.arc(0, 0, g.r * 1.80, 0, 6.2832); c.stroke();
        c.restore();
      }

      // Close in, the sphere's own shading leaves the ground almost black —
      // the lit side is miles off screen. So the surface underfoot gets its
      // own light, anchored to the horizon rather than to the centre.
      if (this.down > 0.02) {
        var hy = g.top;
        c.save();
        c.globalAlpha = clamp(this.down, 0, 1);
        var soil = c.createLinearGradient(0, hy, 0, H);
        soil.addColorStop(0, p.ground);
        soil.addColorStop(0.35, mix(p.ground, p.deep, 0.45));
        soil.addColorStop(1, p.deep);
        c.fillStyle = soil;
        c.beginPath();
        c.arc(g.cx, g.cy, g.r, Math.PI, 0);       // just the cap above centre
        c.lineTo(W, H); c.lineTo(0, H);
        c.closePath();
        c.fill();
        c.restore();
      }

      // a rim of light along the top edge, once it is the horizon
      if (this.down > 0.05) {
        c.save();
        c.globalAlpha = clamp(this.down, 0, 1) * 0.5;
        c.strokeStyle = p.body;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(g.cx, g.cy, g.r, Math.PI * 1.15, Math.PI * 1.85);
        c.stroke();
        c.restore();
      }
    },

    // Whoever lives here, bouncing out to meet her.
    _guestsDraw: function (c) {
      if (!this.guests.length) return;
      var s = this._scale(), y = this._horizonY();
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      for (var i = 0; i < this.guests.length; i++) {
        var g = this.guests[i];
        if (g.age <= 0) continue;
        var pop = Math.min(1, g.age * 3.2);
        var hop = Math.abs(Math.sin(g.age * 4 + g.hop)) * s * 0.5;
        var size = s * 1.1 * (pop < 1 ? pop * (2 - pop) : 1);
        c.font = size + 'px ' + EMOJI;
        c.fillText(g.emoji, g.x, y + s * 0.15 - hop);
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
      var burn = this.burn == null ? clamp((this.t - IGNITE) / 0.5, 0, 1) : this.burn;

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
      var label = this.landed ? 'landed on ' + this.planet.short
        : this.t >= CRUISE ? 'on the way to ' + this.planet.short
        : (m > 999 ? (m / 1000).toFixed(1) + ' km' : m + ' m') + ' up';
      c.save();
      c.globalAlpha = clamp((this.t - CLEAR) / 0.5, 0, 1) *
                      clamp((END - this.t) / 0.6, 0, 1);
      c.textAlign = 'center';
      c.font = '900 15px system-ui, sans-serif';
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillText(label, W / 2, H - 26);
      c.restore();
    }
  };

  Rocket.END = END;
  global.RocketLaunch = Rocket;
})(window);
