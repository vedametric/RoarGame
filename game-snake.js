/*
 * game-snake.js — "SNAKE"
 *
 * The old Nokia game, drawn properly. A snake with a face, a body that tapers
 * to the tail and bends round its own corners, and apples that sit in the
 * grass and shine.
 *
 * You steer it by dragging your finger anywhere on the board — flick the way
 * you want it to go — because a five-year-old has no arrow keys and the
 * buttons would take up half the screen.
 *
 * Kind, on purpose: the walls do not kill you, you come out the other side.
 * The only way to lose is to bite yourself, and even then the first bite of
 * the game is forgiven with a warning. It starts slow and speeds up as it
 * grows, so getting better at it is the thing that makes it harder.
 */
(function (global) {
  'use strict';

  var COLS = 15;
  var START = 4;              // segments to begin with
  var STEP0 = 0.34;           // seconds per move at the start
  var STEP_MIN = 0.11;        // and the fastest it will ever go
  var SPEED_EVERY = 3;        // apples between speed-ups
  var SWIPE = 22;             // pixels of drag before it counts as a flick
  var SAVED = 'snake.best';

  var DIRS = {
    up:    { x: 0, y: -1 }, down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },  right: { x: 1, y: 0 }
  };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  // Something to eat, and what it is worth. Apples mostly, with the odd treat.
  var FOOD = [
    { emoji: '🍎', points: 10, grow: 1, odds: 0.72 },
    { emoji: '🍓', points: 15, grow: 1, odds: 0.16 },
    { emoji: '🍰', points: 25, grow: 2, odds: 0.08 },
    { emoji: '⭐', points: 50, grow: 3, odds: 0.04 }
  ];
  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var SnakeGame = {
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

      this._onResize = function () { self._fit(); self._draw(); };
      addEventListener('resize', this._onResize);
      this._bind();

      this.last = performance.now();
      this.raf = requestAnimationFrame(function (t) { self._loop(t); });
      return this;
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      clearTimeout(this._overT);
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      this._unbind();
    },

    setPaused: function (on) {
      this.paused = !!on;
      this.last = performance.now();
      this._render();
    },

    _newGame: function () {
      var mid = (COLS / 2) | 0;
      this.snake = [];
      for (var i = 0; i < START; i++) this.snake.push({ x: mid - i, y: (this.rows / 2) | 0 });
      this.dir = 'right';
      this.want = 'right';
      this.queue = [];
      this.step = STEP0;
      this.acc = 0;
      this.score = 0;
      this.eaten = 0;
      this.over = false;
      this.warned = false;      // the one bite that is forgiven
      this.flash = 0;
      this.pops = [];
      this.food = null;
      this.grow = 0;
      this._dropFood();
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this._newGame();
      global.RoarAudio.sfx('go');
    },

    /* ── the board ────────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 320;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      // Square cells, as many rows as the board is tall enough for.
      this.cell = this.W / COLS;
      // Capped, so a very tall phone does not turn it into a corridor with
      // the snake lost somewhere in the middle.
      this.rows = clamp(Math.floor(this.H / this.cell), 8, 22);
      this.top = (this.H - this.rows * this.cell) / 2;
      if (this.snake) {
        // A rotation must never leave the snake outside the board.
        for (var i = 0; i < this.snake.length; i++) {
          this.snake[i].y = clamp(this.snake[i].y, 0, this.rows - 1);
        }
        if (this.food) this.food.y = clamp(this.food.y, 0, this.rows - 1);
      }
    },

    _dropFood: function () {
      var free = [];
      for (var y = 0; y < this.rows; y++) {
        for (var x = 0; x < COLS; x++) {
          if (!this._onSnake(x, y)) free.push({ x: x, y: y });
        }
      }
      if (!free.length) return;
      var spot = free[(Math.random() * free.length) | 0];
      var r = Math.random(), acc = 0, kind = FOOD[0];
      for (var i = 0; i < FOOD.length; i++) {
        acc += FOOD[i].odds;
        if (r <= acc) { kind = FOOD[i]; break; }
      }
      this.food = { x: spot.x, y: spot.y, kind: kind, born: 0 };
    },

    _onSnake: function (x, y, skipHead) {
      for (var i = skipHead ? 1 : 0; i < this.snake.length; i++) {
        if (this.snake[i].x === x && this.snake[i].y === y) return true;
      }
      return false;
    },

    /* ── fingers ──────────────────────────────────────────────────
       Drag anywhere. The flick registers as soon as the finger has moved far
       enough in one direction, so it turns while she is still moving rather
       than waiting for her to lift off. */

    _bind: function () {
      var self = this;
      this._down = function (e) {
        self.drag = { x: e.clientX, y: e.clientY, used: false };
        e.preventDefault();
      };
      this._move = function (e) {
        var d = self.drag;
        if (!d || d.used) return;
        var dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
        self.turn(Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'right' : 'left')
          : (dy > 0 ? 'down' : 'up'));
        // Let her keep going: the next flick starts from where this one ended.
        d.x = e.clientX; d.y = e.clientY;
        e.preventDefault();
      };
      this._up = function () { self.drag = null; };

      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      this.canvas.addEventListener('pointerup', this._up);
      this.canvas.addEventListener('pointercancel', this._up);

      // Arrow keys as well, for anyone playing on a laptop.
      this._key = function (e) {
        var k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
        if (k) { self.turn(k); e.preventDefault(); }
      };
      addEventListener('keydown', this._key);

      // ...and the on-screen pad, for a small finger that would rather press.
      this.btns = [];
      var pad = this.cfg.pad;
      if (!pad) return;
      var list = pad.querySelectorAll('[data-dir]');
      for (var i = 0; i < list.length; i++) {
        (function (el) {
          var go = function (e) { self.turn(el.getAttribute('data-dir')); e.preventDefault(); };
          el.addEventListener('pointerdown', go, { passive: false });
          self.btns.push({ el: el, go: go });
        })(list[i]);
      }
    },

    _unbind: function () {
      if (this._down) {
        this.canvas.removeEventListener('pointerdown', this._down);
        this.canvas.removeEventListener('pointermove', this._move);
        this.canvas.removeEventListener('pointerup', this._up);
        this.canvas.removeEventListener('pointercancel', this._up);
      }
      if (this._key) removeEventListener('keydown', this._key);
      for (var i = 0; this.btns && i < this.btns.length; i++) {
        this.btns[i].el.removeEventListener('pointerdown', this.btns[i].go);
      }
      this.btns = [];
    },

    /* Turns are queued, not overwritten.
       Two flicks can easily land inside one step — round a corner she will
       swipe down then left long before the snake has moved — and if each is
       judged against the direction the snake is still travelling, the second
       one is thrown away as a reversal and she ends up going the wrong way.
       So each turn is checked against the one queued in front of it, and the
       steps take them one at a time. Turning straight back on yourself is
       still refused: that is instant death, not a control. */
    turn: function (d) {
      if (!DIRS[d] || this.over || this.paused) return false;
      var from = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
      if (d === OPPOSITE[from] || d === from) return false;
      if (this.queue.length >= 2) return false;      // no further ahead than that
      this.queue.push(d);
      this.want = this.queue[0];
      return true;
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
      if (this.food) this.food.born += dt;
      this.flash = Math.max(0, this.flash - dt * 3);
      for (var i = this.pops.length - 1; i >= 0; i--) {
        var p = this.pops[i];
        p.age += dt;
        if (p.age > p.life) this.pops.splice(i, 1);
      }
      if (this.over) return;

      this.acc += dt;
      while (this.acc >= this.step) {
        this.acc -= this.step;
        this._move1();
        if (this.over) return;
      }
    },

    _move1: function () {
      if (this.queue.length) this.want = this.queue.shift();
      this.dir = this.want;
      var d = DIRS[this.dir];
      var head = this.snake[0];
      // The walls are a doorway, not a cliff: you come out the other side.
      var nx = (head.x + d.x + COLS) % COLS;
      var ny = (head.y + d.y + this.rows) % this.rows;

      if (this._onSnake(nx, ny)) {
        // The first bite of a game is a warning, not an ending.
        if (!this.warned) {
          this.warned = true;
          this.flash = 1;
          global.RoarAudio.sfx('warn');
          this._pop(head.x, head.y, 'oops!');
          // Turn her out of trouble rather than into it again.
          var away = ['up', 'down', 'left', 'right'].filter(function (k) {
            return k !== OPPOSITE[this.dir];
          }, this);
          for (var i = 0; i < away.length; i++) {
            var a = DIRS[away[i]];
            var ax = (head.x + a.x + COLS) % COLS, ay = (head.y + a.y + this.rows) % this.rows;
            if (!this._onSnake(ax, ay)) {
              this.queue.length = 0;
              this.want = this.dir = away[i];
              break;
            }
          }
          return;
        }
        this._gameOver();
        return;
      }

      this.snake.unshift({ x: nx, y: ny });

      if (this.food && nx === this.food.x && ny === this.food.y) {
        var f = this.food.kind;
        this.score += f.points;
        this.eaten++;
        this._pop(nx, ny, '+' + f.points);
        global.RoarAudio.sfx(f.points >= 50 ? 'gold' : 'nom');
        // Growing is the tail simply not being taken away for a few moves.
        this.grow = (this.grow || 0) + f.grow;
        if (this.eaten % SPEED_EVERY === 0) {
          this.step = Math.max(STEP_MIN, this.step * 0.9);
          global.RoarAudio.sfx('level');
        }
        this._dropFood();
      }

      if (this.grow > 0) this.grow--;
      else this.snake.pop();

      this._render();
    },

    _pop: function (x, y, text) {
      this.pops.push({ x: x, y: y, text: text, age: 0, life: 0.9 });
    },

    _gameOver: function () {
      this.over = true;
      this.flash = 1;
      global.RoarAudio.sfx('bust');
      if (this.score > this.best) {
        this.best = this.score;
        save(SAVED, String(this.best));
        this.newBest = true;
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#9df08a', '#ffd24c', '#7ec8ff', '#ffffff']); } catch (e) {}
        var self = this;
        this._overT = setTimeout(function () {
          try { global.Confetti.stop(); } catch (e) {}
        }, 2600);
      } else {
        this.newBest = false;
      }
      this._render();
      if (this.cfg.onOver) this.cfg.onOver(this.score, this.best, this.newBest);
    },

    /* ── the screen around the board ──────────────────────────── */

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.len) e.len.textContent = this.snake ? this.snake.length : 0;
      if (e.over) {
        e.over.hidden = !this.over;
        if (this.over) {
          if (e.overScore) e.overScore.textContent = this.score;
          if (e.overBest) {
            e.overBest.textContent = this.newBest ? '🎉 A NEW BEST!' : 'best ★ ' + this.best;
            e.overBest.classList.toggle('is-new', !!this.newBest);
          }
        }
      }
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H;
      var s = this.cell, top = this.top;
      c.clearRect(0, 0, W, H);

      /* the grass */
      var g = c.createLinearGradient(0, top, 0, top + this.rows * s);
      g.addColorStop(0, '#2c5f36');
      g.addColorStop(1, '#1d4526');
      c.fillStyle = g;
      c.fillRect(0, top, W, this.rows * s);

      // a checker, faint, so the grid reads without being a wireframe
      c.fillStyle = 'rgba(255,255,255,0.030)';
      for (var y = 0; y < this.rows; y++) {
        for (var x = (y % 2); x < COLS; x += 2) {
          c.fillRect(x * s, top + y * s, s, s);
        }
      }

      if (this.food) this._food(c, s, top);
      this._snake(c, s, top);
      this._popsDraw(c, s, top);

      // a red wash when she bites herself
      if (this.flash > 0.01) {
        c.fillStyle = 'rgba(255,70,70,' + (0.35 * this.flash) + ')';
        c.fillRect(0, top, W, this.rows * s);
      }
    },

    _food: function (c, s, top) {
      var f = this.food;
      // It arrives with a bounce and then breathes, so the eye finds it.
      var pop = Math.min(1, f.born * 5);
      var pulse = 1 + Math.sin(f.born * 3.4) * 0.05;
      var size = s * 0.82 * (pop < 1 ? pop * (2 - pop) : pulse);
      var cx = f.x * s + s / 2, cy = top + f.y * s + s / 2;

      c.save();
      // a glow underneath, brighter for the rarer things
      var glow = c.createRadialGradient(cx, cy, 1, cx, cy, s * 0.75);
      glow.addColorStop(0, 'rgba(255,240,180,' + (f.kind.points >= 25 ? 0.5 : 0.28) + ')');
      glow.addColorStop(1, 'rgba(255,240,180,0)');
      c.fillStyle = glow;
      c.beginPath(); c.arc(cx, cy, s * 0.75, 0, 6.2832); c.fill();

      c.font = size + 'px ' + EMOJI;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(f.kind.emoji, cx, cy + size * 0.04);
      c.restore();
    },

    // The body is drawn as one thick round-jointed line rather than a row of
    // squares — that is nearly all of the difference between this and 1997.
    _snake: function (c, s, top) {
      var n = this.snake.length;
      if (!n) return;
      var px = function (p) { return { x: p.x * s + s / 2, y: top + p.y * s + s / 2 }; };

      // Wrapping means consecutive segments can be on opposite sides of the
      // board; those pairs are drawn as separate strokes rather than a line
      // straight across the middle of everything.
      var runs = [[this.snake[0]]];
      for (var i = 1; i < n; i++) {
        var a = this.snake[i - 1], b = this.snake[i];
        var far = Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1;
        if (far) runs.push([b]); else runs[runs.length - 1].push(b);
      }

      c.save();
      c.lineJoin = 'round';
      c.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        // pass 0 is the dark outline, pass 1 the body on top of it
        c.strokeStyle = pass ? '#7ed957' : '#123b1c';
        c.lineWidth = s * (pass ? 0.66 : 0.82);
        for (var r = 0; r < runs.length; r++) {
          var run = runs[r];
          c.beginPath();
          var p0 = px(run[0]);
          c.moveTo(p0.x, p0.y);
          for (var j = 1; j < run.length; j++) {
            var p = px(run[j]);
            c.lineTo(p.x, p.y);
          }
          if (run.length === 1) c.lineTo(p0.x + 0.01, p0.y);
          c.stroke();
        }
      }

      // a lighter stripe down the middle, so it looks round
      c.strokeStyle = 'rgba(220,255,190,0.35)';
      c.lineWidth = s * 0.2;
      for (r = 0; r < runs.length; r++) {
        var rn = runs[r];
        c.beginPath();
        var q0 = px(rn[0]);
        c.moveTo(q0.x, q0.y);
        for (j = 1; j < rn.length; j++) { var q = px(rn[j]); c.lineTo(q.x, q.y); }
        if (rn.length === 1) c.lineTo(q0.x + 0.01, q0.y);
        c.stroke();
      }
      c.restore();

      /* the head, with a face — the thing that stops it being a worm */
      var h = px(this.snake[0]);
      var d = DIRS[this.dir];
      c.save();
      c.translate(h.x, h.y);
      c.rotate(Math.atan2(d.y, d.x));

      c.fillStyle = '#8ce85f';
      c.beginPath();
      c.ellipse(s * 0.06, 0, s * 0.46, s * 0.40, 0, 0, 6.2832);
      c.fill();
      c.strokeStyle = '#123b1c';
      c.lineWidth = s * 0.07;
      c.stroke();

      // eyes, both looking the way it is going
      [-1, 1].forEach(function (side) {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.ellipse(s * 0.14, side * s * 0.19, s * 0.15, s * 0.15, 0, 0, 6.2832);
        c.fill();
        c.fillStyle = '#14210f';
        c.beginPath();
        c.arc(s * 0.20, side * s * 0.20, s * 0.075, 0, 6.2832);
        c.fill();
      });

      // and a tongue, flicking
      if (!this.over && Math.sin(this.snake.length + Date.now() / 260) > 0.4) {
        c.strokeStyle = '#ff5a7a';
        c.lineWidth = s * 0.06;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(s * 0.48, 0);
        c.lineTo(s * 0.68, 0);
        c.moveTo(s * 0.68, 0);
        c.lineTo(s * 0.78, -s * 0.08);
        c.moveTo(s * 0.68, 0);
        c.lineTo(s * 0.78, s * 0.08);
        c.stroke();
      }
      c.restore();
    },

    _popsDraw: function (c, s, top) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (var i = 0; i < this.pops.length; i++) {
        var p = this.pops[i];
        var k = 1 - p.age / p.life;
        c.globalAlpha = clamp(k * 1.6, 0, 1);
        c.font = '900 ' + (s * 0.5) + 'px system-ui, sans-serif';
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(0,0,0,0.45)';
        c.fillStyle = '#ffd24c';
        var x = p.x * s + s / 2, y = top + p.y * s + s / 2 - (1 - k) * s * 0.9;
        c.strokeText(p.text, x, y);
        c.fillText(p.text, x, y);
      }
      c.restore();
    }
  };

  SnakeGame.COLS = COLS;        // exposed for testing
  SnakeGame.FOOD = FOOD;
  global.SnakeGame = SnakeGame;
})(window);
