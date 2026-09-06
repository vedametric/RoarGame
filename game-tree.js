/*
 * game-tree.js — "GROW A TREE"
 *
 * A seed in a patch of sand. It tells you what it wants — a drink, some sun,
 * or something to eat — and you give it that. Give it the right thing and it
 * grows a little; give it the wrong thing and it cries, droops, and dries
 * back down again.
 *
 * Grow it all the way and it blossoms and fruits, and then the fruit is
 * yours: tap it to pick it. It fruits again, and again, for as long as you
 * keep looking after it.
 *
 * The whole game is one idea a five-year-old already half knows — living
 * things need particular things, and guessing is not the same as knowing.
 * So the tree always says what it wants, in a bubble over its head, and
 * getting it right is a matter of looking rather than luck.
 */
(function (global) {
  'use strict';

  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
  var SAVED = 'tree.best';
  var WILTS = 3;                   // wrong answers before it dries up for good
  var ASK_EVERY = 2.6;             // how long you get to think about it

  /* What it can ask for. Three things, plainly different to look at, and the
     one it wants is always the one drawn in the bubble. */
  var NEEDS = [
    { id: 'water', emoji: '💧', name: 'a drink', colour: '#4fb3e8' },
    { id: 'sun',   emoji: '☀️', name: 'sunshine', colour: '#ffd24c' },
    { id: 'food',  emoji: '🌱', name: 'some food', colour: '#9df08a' }
  ];

  /* How far it has got. Every right answer moves it up one, every wrong one
     moves it down. The last stage is the one that fruits. */
  var STAGES = [
    { name: 'a seed',      trunk: 0.00, leaves: 0.00 },
    { name: 'a sprout',    trunk: 0.14, leaves: 0.10 },
    { name: 'a seedling',  trunk: 0.30, leaves: 0.22 },
    { name: 'a sapling',   trunk: 0.52, leaves: 0.40 },
    { name: 'a young tree', trunk: 0.76, leaves: 0.66 },
    { name: 'a big tree',  trunk: 1.00, leaves: 1.00 }
  ];
  var GROWN = STAGES.length - 1;

  var FRUITS = ['🍎', '🍊', '🍐', '🍑', '🍋', '🍒'];

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var TreeGame = {
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
      try { global.Confetti.stop(); } catch (e) {}
    },

    setPaused: function (on) { this.paused = !!on; this.last = performance.now(); },

    _newGame: function () {
      this.t = 0;
      this.score = 0;
      this.picked = 0;
      this.wilts = 0;
      this.stage = 0;
      this.grow = 0;              // eases towards this.stage, so it swells
      this.wilting = 0;           // how sorry for itself it is right now
      this.cheer = 0;             // ...and how pleased
      this.fruit = [];
      this.drops = [];
      this.over = false;
      this.newBest = false;
      this.fruitKind = FRUITS[(Math.random() * FRUITS.length) | 0];
      this._ask();
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this._newGame();
      global.RoarAudio.sfx('go');
    },

    // What does it want next? Never the same thing twice running, so she has
    // to actually look rather than learning a rhythm.
    _ask: function () {
      var last = this.want;
      var pool = NEEDS.filter(function (n) { return !last || n.id !== last.id; });
      this.want = pool[(Math.random() * pool.length) | 0];
      this.asked = this.t;
      this.bubble = 0;            // pops in
      return this.want;
    },

    /* ── the patch ────────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 420;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this.groundY = this.H * 0.82;
      this.unit = Math.min(this.W, this.H * 0.62);   // how big a grown tree is
    },

    _bind: function () {
      var self = this;
      this._tap = function (e) {
        if (!self.running || self.paused || self.over) return;
        var r = self.canvas.getBoundingClientRect();
        self.tapAt(e.clientX - r.left, e.clientY - r.top);
        e.preventDefault();
      };
      this.canvas.addEventListener('pointerdown', this._tap, { passive: false });
    },

    _unbind: function () {
      if (this._tap) this.canvas.removeEventListener('pointerdown', this._tap);
    },

    // Ripe fruit first: if her finger is over an apple she means the apple,
    // not whatever is behind it.
    tapAt: function (x, y) {
      for (var i = 0; i < this.fruit.length; i++) {
        var f = this.fruit[i];
        if (!f.ripe) continue;
        if (Math.hypot(f.x - x, f.y - y) < this.unit * 0.11) return this.pick(i);
      }
      return false;
    },

    /* Giving it something. `id` is one of the three needs. */
    give: function (id) {
      if (!this.running || this.over) return false;
      var right = this.want && id === this.want.id;

      if (right) {
        this.cheer = 1;
        this.drops.push({ kind: this.want.id, age: 0, life: 0.9 });
        global.RoarAudio.sfx('spellgood');
        if (this.stage < GROWN) {
          this.stage++;
          this.score += 20;
          if (this.stage === GROWN) this._fruiting();
        } else {
          // Already grown: looking after it makes more fruit instead.
          this.score += 10;
          this._fruiting();
        }
        this._ask();
      } else {
        // The wrong thing. It cries and shrinks back.
        this.wilting = 1;
        this.wilts++;
        global.RoarAudio.sfx('birdaww');
        this.stage = Math.max(0, this.stage - 1);
        // Any fruit it was holding drops off unripe.
        this.fruit = [];
        if (this.wilts >= WILTS) this._finish();
        else this._ask();
      }
      this._render();
      return right;
    },

    // Hang some fruit on it, if there is room.
    _fruiting: function () {
      if (this.stage < GROWN) return;
      var want = Math.min(5, this.fruit.length + 2);
      while (this.fruit.length < want) {
        // Out towards the edge of the canopy and never straight in front:
        // fruit hung in the middle sat right on top of the tree's face.
        var side = Math.random() < 0.5 ? -1 : 1;
        this.fruit.push({
          a: side * rnd(0.55, 1.25),         // where on the canopy
          r: rnd(0.68, 0.98),
          ripe: false, born: 0, wob: rnd(0, 6.28)
        });
      }
      global.RoarAudio.sfx('sparkle');
    },

    pick: function (i) {
      var f = this.fruit[i];
      if (!f || !f.ripe) return false;
      this.fruit.splice(i, 1);
      this.picked++;
      this.score += 50;
      this.cheer = 1;
      global.RoarAudio.sfx('nom');
      this.drops.push({ kind: 'pick', age: 0, life: 0.8, x: f.x, y: f.y });
      this._render();
      return true;
    },

    _finish: function () {
      this.over = true;
      this.stage = 0;
      this.fruit = [];
      global.RoarAudio.sfx('bust');
      if (this.score > this.best) {
        this.best = this.score;
        this.newBest = true;
        save(SAVED, String(this.best));
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#9df08a', '#ffd24c', '#ff8a8a', '#ffffff']); } catch (e) {}
      } else {
        this.newBest = false;
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.score, this.best, this.newBest);
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.wilts) e.wilts.textContent = '💚'.repeat(Math.max(0, WILTS - this.wilts));
      if (e.stage) e.stage.textContent = STAGES[this.stage].name;
      if (e.want) {
        e.want.textContent = this.want ? this.want.emoji : '';
        e.want.setAttribute('aria-label', this.want ? 'It wants ' + this.want.name : '');
      }
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overScore) e.overScore.textContent = this.score;
          if (e.overPicked) e.overPicked.textContent = this.picked === 1
            ? 'you picked 1 fruit' : 'you picked ' + this.picked + ' fruit';
          if (e.overBest) {
            e.overBest.textContent = this.newBest ? '🎉 A NEW BEST!' : 'best ★ ' + this.best;
            e.overBest.classList.toggle('is-new', !!this.newBest);
          }
        }
      }
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
      var i;
      this.t += dt;
      this.bubble = Math.min(1, (this.bubble || 0) + dt * 4);
      this.wilting = Math.max(0, this.wilting - dt * 0.9);
      this.cheer = Math.max(0, this.cheer - dt * 1.4);
      // The tree swells towards whatever stage it is on rather than snapping,
      // which is most of why growing it feels like growing it.
      this.grow += (this.stage - this.grow) * clamp(dt * 3.2, 0, 1);

      for (i = this.drops.length - 1; i >= 0; i--) {
        var d = this.drops[i];
        d.age += dt;
        if (d.age > d.life) this.drops.splice(i, 1);
      }
      if (this.over) return;

      // Fruit takes a moment to ripen, and only ripe fruit can be picked.
      for (i = 0; i < this.fruit.length; i++) {
        var f = this.fruit[i];
        f.born += dt;
        if (!f.ripe && f.born > 0.9) { f.ripe = true; }
      }
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      c.clearRect(0, 0, W, H);

      var sky = c.createLinearGradient(0, 0, 0, this.groundY);
      sky.addColorStop(0, '#2b5f9e');
      sky.addColorStop(1, '#8fc9e8');
      c.fillStyle = sky;
      c.fillRect(0, 0, W, this.groundY);

      // sun, dimmer while the tree is unhappy
      c.save();
      c.globalAlpha = 0.75 - this.wilting * 0.4;
      c.fillStyle = '#ffe08a';
      c.beginPath();
      c.arc(W * 0.82, H * 0.13, this.unit * 0.09, 0, 6.2832);
      c.fill();
      c.restore();

      this._sand(c, W, H);
      this._tree(c, W, H);
      this._bubble(c, W, H);
      this._dropsDraw(c, W, H);
    },

    /* What it wants, said where she is already looking. The row of buttons
       below the canvas says it too, but a child watching the tree should not
       have to look away from the tree to find out what it needs. */
    _bubble: function (c, W, H) {
      if (this.over || !this.want) return;
      var u = this.unit;
      var pop = clamp(this.bubble || 0, 0, 1);
      var r = u * 0.11 * (pop < 1 ? pop * (2 - pop) : 1);
      var x = W / 2 + u * 0.30, y = H * 0.16;

      c.save();
      c.globalAlpha = 0.94;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(x, y, r, 0, 6.2832);
      c.fill();
      // the little tail of the bubble, pointing down at the tree
      [0.55, 0.34].forEach(function (k, i) {
        c.beginPath();
        c.arc(x - r * (0.7 + i * 0.5), y + r * (0.9 + i * 0.55), r * k * 0.45, 0, 6.2832);
        c.fill();
      });
      c.strokeStyle = 'rgba(40,60,40,0.20)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.stroke();

      c.font = (r * 1.15) + 'px ' + EMOJI;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.want.emoji, x, y + r * 0.04);
      c.restore();
    },

    // The patch it is planted in — sand, because a tree growing out of sand is
    // a better picture than a tree growing out of a lawn.
    _sand: function (c, W, H) {
      var g = c.createLinearGradient(0, this.groundY, 0, H);
      g.addColorStop(0, '#e8cf9a');
      g.addColorStop(1, '#b99a63');
      c.fillStyle = g;
      c.fillRect(0, this.groundY, W, H - this.groundY);

      // a few grains, in fixed places so they do not crawl about
      c.fillStyle = 'rgba(120,95,55,0.28)';
      for (var i = 0; i < 40; i++) {
        var x = ((i * 97) % 100) / 100 * W;
        var y = this.groundY + ((i * 53) % 100) / 100 * (H - this.groundY);
        c.fillRect(x, y, 3, 2);
      }
      // the little mound it is planted in
      c.fillStyle = '#c9a970';
      c.beginPath();
      c.ellipse(W / 2, this.groundY + 4, this.unit * 0.20, this.unit * 0.045, 0, 0, 6.2832);
      c.fill();
    },

    _tree: function (c, W, H) {
      var u = this.unit;
      var k = clamp(this.grow / GROWN, 0, 1);
      var st = STAGES[Math.min(STAGES.length - 1, Math.round(this.grow))];
      var trunkH = u * (0.06 + 0.42 * k);
      var trunkW = u * (0.018 + 0.055 * k);
      var leafR = u * (0.05 + 0.24 * k);
      var x = W / 2, base = this.groundY;

      // A sad tree leans over and goes grey-green; a happy one stands up and
      // bounces.
      var sad = this.wilting;
      var lean = sad * 0.22 * Math.sin(this.t * 1.4);
      var bounce = this.cheer * Math.sin(this.t * 12) * u * 0.02;

      c.save();
      c.translate(x, base);
      c.rotate(lean);

      if (this.stage === 0 && this.grow < 0.4) {
        // just a seed, sitting in the mound
        c.fillStyle = '#8a6a3a';
        c.beginPath();
        c.ellipse(0, -u * 0.02, u * 0.022, u * 0.032, 0.3, 0, 6.2832);
        c.fill();
        c.restore();
        this._face(c, x, base - u * 0.10, u * 0.06, sad);
        return;
      }

      // trunk
      c.fillStyle = sad > 0.3 ? '#6e5a3f' : '#7d5a34';
      c.beginPath();
      c.moveTo(-trunkW, 0);
      c.quadraticCurveTo(-trunkW * 0.7, -trunkH * 0.6, -trunkW * 0.5, -trunkH);
      c.lineTo(trunkW * 0.5, -trunkH);
      c.quadraticCurveTo(trunkW * 0.7, -trunkH * 0.6, trunkW, 0);
      c.closePath();
      c.fill();

      // a couple of branches once it is big enough to have any
      if (k > 0.45) {
        c.strokeStyle = '#7d5a34';
        c.lineWidth = trunkW * 0.55;
        c.lineCap = 'round';
        [-1, 1].forEach(function (side) {
          c.beginPath();
          c.moveTo(side * trunkW * 0.4, -trunkH * 0.62);
          c.quadraticCurveTo(side * leafR * 0.5, -trunkH * 0.78,
                             side * leafR * 0.62, -trunkH * 0.95);
          c.stroke();
        });
      }

      // canopy: three overlapping blobs, greener when happy
      var green = sad > 0.3 ? '#7f9b5e' : '#3f9b4f';
      var lit = sad > 0.3 ? '#9db97a' : '#63c46a';
      var cy = -trunkH - leafR * 0.55 + bounce;
      [[0, 0, 1], [-0.62, 0.28, 0.72], [0.62, 0.28, 0.72]].forEach(function (b) {
        c.fillStyle = b[2] === 1 ? green : lit;
        c.beginPath();
        c.arc(b[0] * leafR, cy + b[1] * leafR, leafR * (0.78 * b[2] + 0.22), 0, 6.2832);
        c.fill();
      });
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath();
      c.arc(-leafR * 0.3, cy - leafR * 0.35, leafR * 0.34, 0, 6.2832);
      c.fill();

      // blossom on the way to fruiting
      if (this.stage >= GROWN && !this.fruit.length) {
        c.fillStyle = '#ffb3f0';
        for (var i = 0; i < 6; i++) {
          var a = i * 1.05;
          c.beginPath();
          c.arc(Math.sin(a) * leafR * 0.7, cy + Math.cos(a) * leafR * 0.55,
                leafR * 0.09, 0, 6.2832);
          c.fill();
        }
      }

      // the fruit, remembered in canopy coordinates so it hangs on properly
      for (i = 0; i < this.fruit.length; i++) {
        var f = this.fruit[i];
        var fx = Math.sin(f.a) * leafR * f.r;
        var fy = cy + Math.cos(f.a) * leafR * f.r * 0.75 + leafR * 0.15;
        var pop = clamp(f.born / 0.5, 0, 1);
        var sway = Math.sin(this.t * 2 + f.wob) * leafR * 0.03;
        var size = u * 0.075 * (f.ripe ? 1 : 0.6) * (pop < 1 ? pop * (2 - pop) : 1);
        // remembered in screen space too, so a tap can find it
        f.x = x + fx + sway; f.y = base + fy;
        c.save();
        c.globalAlpha = f.ripe ? 1 : 0.55;
        if (f.ripe) {
          var glow = c.createRadialGradient(fx + sway, fy, 1, fx + sway, fy, size);
          glow.addColorStop(0, 'rgba(255,255,200,0.55)');
          glow.addColorStop(1, 'rgba(255,255,200,0)');
          c.fillStyle = glow;
          c.beginPath(); c.arc(fx + sway, fy, size, 0, 6.2832); c.fill();
        }
        c.font = size + 'px ' + EMOJI;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(this.fruitKind, fx + sway, fy);
        c.restore();
      }
      c.restore();

      this._face(c, x, base - trunkH - leafR * 0.35, leafR * 0.55, sad);
    },

    // A face on the canopy, because a tree that cries has to have somewhere
    // to cry from.
    _face: function (c, x, y, r, sad) {
      c.save();
      c.translate(x, y);
      var blink = Math.sin(this.t * 1.6) > 0.98 ? 0.12 : 1;

      [-1, 1].forEach(function (side) {
        c.fillStyle = '#fff';
        c.beginPath();
        c.ellipse(side * r * 0.42, 0, r * 0.26, r * 0.26 * blink, 0, 0, 6.2832);
        c.fill();
        if (blink > 0.5) {
          c.fillStyle = '#20301a';
          c.beginPath();
          c.arc(side * r * 0.42, r * (sad > 0.3 ? 0.08 : 0.02), r * 0.13, 0, 6.2832);
          c.fill();
        }
      });

      c.strokeStyle = '#20301a';
      c.lineWidth = Math.max(1.5, r * 0.10);
      c.lineCap = 'round';
      c.beginPath();
      if (sad > 0.3) c.arc(0, r * 0.85, r * 0.30, Math.PI + 0.3, -0.3);
      else c.arc(0, r * 0.42, r * 0.28, 0.25, Math.PI - 0.25);
      c.stroke();

      // tears, while it is upset
      if (sad > 0.05) {
        c.fillStyle = 'rgba(120,200,255,' + clamp(sad, 0, 1) + ')';
        [-1, 1].forEach(function (side) {
          var drop = ((1 - sad) * 2.2 % 1) * r * 1.6;
          c.beginPath();
          c.ellipse(side * r * 0.42, r * 0.34 + drop, r * 0.09, r * 0.14, 0, 0, 6.2832);
          c.fill();
        });
      }
      c.restore();
    },

    // Whatever she just gave it, arriving.
    _dropsDraw: function (c, W, H) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var i = 0; i < this.drops.length; i++) {
        var d = this.drops[i];
        var k = d.age / d.life;
        c.globalAlpha = clamp(1 - k, 0, 1);
        if (d.kind === 'pick') {
          c.font = '900 ' + (this.unit * 0.09) + 'px system-ui, sans-serif';
          c.fillStyle = '#ffd24c';
          c.fillText('+50', d.x, d.y - k * this.unit * 0.2);
        } else {
          var n = NEEDS.filter(function (x) { return x.id === d.kind; })[0];
          if (!n) continue;
          c.font = (this.unit * 0.11) + 'px ' + EMOJI;
          // falls from the top of the screen onto the tree
          c.fillText(n.emoji, W / 2, H * 0.12 + k * (this.groundY - H * 0.28));
        }
      }
      c.restore();
    }
  };

  TreeGame.NEEDS = NEEDS;         // exposed for testing
  TreeGame.STAGES = STAGES;
  TreeGame.GROWN = GROWN;
  TreeGame.WILTS = WILTS;
  global.TreeGame = TreeGame;
})(window);
