/*
 * game-wordsearch.js — "WORD SEARCH"
 *
 * A grid of letters with words hidden in it. Drag a finger along a word to
 * find it. The words come from the SPELLING BEE list, with their pictures,
 * so a child who cannot read "FOX" yet can still hunt for the letters next
 * to the fox — and hears the word said when she finds it.
 *
 * It starts kindly: a six-by-six grid, four three-letter words, all of them
 * reading left to right or top to bottom. The grid grows and the words get
 * longer as the puzzles go by, and diagonals only turn up once she has
 * found her feet. Words never run backwards; that is a grown-up's puzzle.
 *
 * A wrong drag costs nothing but a wobble. There is a hint that shows where
 * a word starts, and tapping a word in the list reads it out.
 */
(function (global) {
  'use strict';

  var SAVED = 'ws.done';
  var MAX_TRIES = 200;
  var COLOURS = ['#ff8a2b', '#31d8ff', '#9df08a', '#ff5cb8', '#ffd24c', '#a78bfa', '#00b3a4', '#ff6b6b'];
  var COMMON = 'AAABCDEEEEFGHIIJKLMNNOOOPRRSSSTTUVWY';

  // The shape of each puzzle: grid size, how many words, how long, diagonals?
  function stage(round) {
    if (round <= 2) return { n: 6, words: 4, min: 3, max: 3, diag: false };
    if (round <= 4) return { n: 7, words: 5, min: 3, max: 4, diag: false };
    if (round <= 7) return { n: 8, words: 5, min: 3, max: 5, diag: true };
    if (round <= 10) return { n: 9, words: 6, min: 4, max: 6, diag: true };
    return { n: 10, words: 7, min: 4, max: 7, diag: true };
  }

  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];   // across, down, and the two diagonals

  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Every word from the spelling bee that is just letters, with its picture.
  function allWords() {
    var out = [], bands = global.SpellWords || [];
    for (var b = 0; b < bands.length; b++) {
      for (var i = 0; i < bands[b].length; i++) {
        var w = bands[b][i];
        if (/^[a-z]+$/i.test(w[0])) out.push({ word: w[0].toUpperCase(), lower: w[0].toLowerCase(), emoji: w[1] });
      }
    }
    return out;
  }

  /* Build one puzzle: choose the words, lay them in, fill the gaps. A word
     that will not fit after a fair number of tries is swapped for another,
     so a puzzle is never handed over with a word missing from the grid. */
  function build(st, pool) {
    var n = st.n;
    var grid = [], i;
    for (i = 0; i < n * n; i++) grid.push('');
    var want = shuffle(pool.filter(function (w) { return w.word.length >= st.min && w.word.length <= st.max; }));
    var dirs = st.diag ? DIRS : DIRS.slice(0, 2);
    var placed = [];
    for (i = 0; i < want.length && placed.length < st.words; i++) {
      var w = want[i], ok = false;
      if (placed.some(function (p) { return p.word === w.word || p.word.indexOf(w.word) >= 0 || w.word.indexOf(p.word) >= 0; })) continue;
      for (var t = 0; t < MAX_TRIES && !ok; t++) {
        var d = pick(dirs), L = w.word.length;
        var x0 = (Math.random() * (n - (d[0] ? L - 1 : 0))) | 0;
        var y0 = d[1] > 0 ? (Math.random() * (n - L + 1)) | 0
               : d[1] < 0 ? L - 1 + ((Math.random() * (n - L + 1)) | 0)
               : (Math.random() * n) | 0;
        var fits = true;
        for (var k = 0; k < L; k++) {
          var c = grid[(y0 + d[1] * k) * n + x0 + d[0] * k];
          if (c && c !== w.word.charAt(k)) { fits = false; break; }
        }
        if (!fits) continue;
        for (k = 0; k < L; k++) grid[(y0 + d[1] * k) * n + x0 + d[0] * k] = w.word.charAt(k);
        placed.push({ word: w.word, lower: w.lower, emoji: w.emoji, x: x0, y: y0, dx: d[0], dy: d[1], found: false });
        ok = true;
      }
    }
    for (i = 0; i < n * n; i++) if (!grid[i]) grid[i] = COMMON.charAt((Math.random() * COMMON.length) | 0);
    return { n: n, grid: grid, words: placed };
  }

  var WordSearch = {
    running: false,
    stage: stage,
    build: build,

    start: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.pool = allWords();
      this.done = parseInt(saved(SAVED, '0'), 10) || 0;
      this.round = 0;
      this.paused = false;
      this.running = true;
      this.sel = null;
      this.shake = 0;
      this.hint = null;
      this.pop = [];
      this._fit();
      this._next();

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

    setPaused: function (on) { this.paused = !!on; this.sel = null; this.last = performance.now(); },

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 320;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    },

    /* ── one puzzle after another ─────────────────────────────── */

    _next: function () {
      this.round++;
      var st = stage(this.round);
      this.puzzle = build(st, this.pool);
      this.over = false;
      this.celebrated = false;
      this.sel = null;
      this.hint = null;
      this.pop = [];
      try { global.Confetti.stop(); } catch (e) {}
      this._list();
      this._render();
    },

    next: function () {
      if (!this.running) return;
      global.RoarAudio.sfx('go');
      this._next();
    },

    _list: function () {
      var box = this.el.words;
      if (!box) return;
      box.innerHTML = this.puzzle.words.map(function (w, i) {
        return '<button class="ws-word' + (w.found ? ' is-found' : '') + '" type="button" data-word="' + i +
               '" style="--wc:' + COLOURS[i % COLOURS.length] + '">' +
               '<span aria-hidden="true">' + w.emoji + '</span><b>' + w.word + '</b></button>';
      }).join('');
    },

    say: function (i) {
      var w = this.puzzle.words[i];
      if (!w) return;
      try { global.Say.line('w-' + w.lower, w.lower); } catch (e) {}
    },

    // Show where a word starts, for a little while.
    showHint: function () {
      if (!this.running || this.over || this.paused) return;
      var left = this.puzzle.words.filter(function (w) { return !w.found; });
      if (!left.length) return;
      var w = pick(left);
      this.hint = { x: w.x, y: w.y, t: 2.2, i: this.puzzle.words.indexOf(w) };
      global.RoarAudio.sfx('spellhint');
      this.say(this.hint.i);
    },

    /* ── the grid on screen ───────────────────────────────────── */

    _cell: function () {
      var n = this.puzzle.n;
      var s = Math.min(this.W, this.H) / n;
      return { s: s, x0: (this.W - s * n) / 2, y0: (this.H - s * n) / 2 };
    },

    _at: function (px, py) {
      var g = this._cell(), n = this.puzzle.n;
      var x = Math.floor((px - g.x0) / g.s), y = Math.floor((py - g.y0) / g.s);
      if (x < 0 || y < 0 || x >= n || y >= n) return null;
      return { x: x, y: y };
    },

    _bind: function () {
      var self = this;
      function at(e) {
        var r = self.canvas.getBoundingClientRect();
        return self._at(e.clientX - r.left, e.clientY - r.top);
      }
      this._down = function (e) {
        if (!self.running || self.over || self.paused) return;
        e.preventDefault();
        try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        var c = at(e);
        if (!c) return;
        self.sel = { x: c.x, y: c.y, dx: 0, dy: 0, len: 1 };
        global.RoarAudio.sfx('tick');
      };
      this._move = function (e) {
        if (!self.sel) return;
        e.preventDefault();
        var r = self.canvas.getBoundingClientRect();
        self.drag(e.clientX - r.left, e.clientY - r.top);
      };
      this._up = function (e) {
        if (!self.sel) return;
        e.preventDefault();
        self.release();
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

    /* The finger is rarely on a perfect line, so the drag snaps to the
       nearest of the eight directions from where it started. */
    drag: function (px, py) {
      var s = this.sel, g = this._cell(), n = this.puzzle.n;
      var cx = g.x0 + (s.x + 0.5) * g.s, cy = g.y0 + (s.y + 0.5) * g.s;
      var dx = px - cx, dy = py - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < g.s * 0.6) { s.dx = 0; s.dy = 0; s.len = 1; return; }
      var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      var ux = Math.round(Math.cos(a * Math.PI / 4)), uy = Math.round(Math.sin(a * Math.PI / 4));
      var len = Math.round(dist / g.s) + 1;
      // never off the edge of the grid
      var maxLen = n;
      if (ux > 0) maxLen = Math.min(maxLen, n - s.x);
      if (ux < 0) maxLen = Math.min(maxLen, s.x + 1);
      if (uy > 0) maxLen = Math.min(maxLen, n - s.y);
      if (uy < 0) maxLen = Math.min(maxLen, s.y + 1);
      len = Math.max(1, Math.min(len, maxLen));
      if (s.dx !== ux || s.dy !== uy || s.len !== len) {
        s.dx = ux; s.dy = uy; s.len = len;
        global.RoarAudio.sfx('step');
      }
    },

    _selWord: function (s) {
      var n = this.puzzle.n, str = '';
      for (var k = 0; k < s.len; k++) str += this.puzzle.grid[(s.y + s.dy * k) * n + s.x + s.dx * k];
      return str;
    },

    release: function () {
      var s = this.sel;
      this.sel = null;
      if (!s || s.len < 2) return false;
      var str = this._selWord(s), i, w, hit = -1;
      for (i = 0; i < this.puzzle.words.length; i++) {
        w = this.puzzle.words[i];
        if (w.found) continue;
        var same = w.x === s.x && w.y === s.y && w.dx === s.dx && w.dy === s.dy && w.word.length === s.len;
        // The word backwards is the same word: the letters are all there and
        // in a line, and a child dragging from the wrong end still found it.
        var back = w.x === s.x + s.dx * (s.len - 1) && w.y === s.y + s.dy * (s.len - 1) &&
                   w.dx === -s.dx && w.dy === -s.dy && w.word.length === s.len;
        if ((same && str === w.word) || back) { hit = i; break; }
      }
      if (hit < 0) {
        this.shake = 1;
        global.RoarAudio.sfx('spellbad');
        return false;
      }
      w = this.puzzle.words[hit];
      w.found = true;
      this.pop.push({ i: hit, t: 0 });
      global.RoarAudio.sfx('gold');
      this.say(hit);
      this._list();
      if (this.puzzle.words.every(function (x) { return x.found; })) this._finish();
      this._render();
      return true;
    },

    _finish: function () {
      var self = this;
      this.over = true;
      this.done++;
      save(SAVED, String(this.done));
      this.hint = null;
      setTimeout(function () {
        if (!self.running || !self.over) return;
        self.celebrated = true;
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#ffd24c', '#9df08a', '#7ec8ff', '#ff8ac0']); } catch (e) {}
        self._render();
      }, 700);
      if (this.cfg.onOver) this.cfg.onOver(this.done);
    },

    _render: function () {
      var e = this.el, found = this.puzzle.words.filter(function (w) { return w.found; }).length;
      if (e.score) e.score.textContent = found + ' / ' + this.puzzle.words.length;
      if (e.note) e.note.textContent = 'puzzle ' + this.round + ' · ' + this.puzzle.n + '×' + this.puzzle.n;
      if (e.best) e.best.textContent = '★ ' + this.done;
      if (e.over) {
        var show = this.over && this.celebrated;
        e.over.hidden = !show;
        if (show && e.overScore) e.overScore.textContent = this.done;
      }
    },

    /* ── the loop ─────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) {
        this.shake = Math.max(0, this.shake - dt * 3);
        if (this.hint) { this.hint.t -= dt; if (this.hint.t <= 0) this.hint = null; }
        for (var i = this.pop.length - 1; i >= 0; i--) {
          this.pop[i].t += dt;
          if (this.pop[i].t > 0.6) this.pop.splice(i, 1);
        }
      }
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _capsule: function (c, x, y, dx, dy, len, g, pad) {
      var x1 = g.x0 + (x + 0.5) * g.s, y1 = g.y0 + (y + 0.5) * g.s;
      var x2 = g.x0 + (x + dx * (len - 1) + 0.5) * g.s, y2 = g.y0 + (y + dy * (len - 1) + 0.5) * g.s;
      c.lineCap = 'round';
      c.lineWidth = g.s * pad;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    },

    _draw: function () {
      var c = this.ctx, W = this.W, H = this.H, p = this.puzzle, n = p.n, g = this._cell();
      c.clearRect(0, 0, W, H);
      c.fillStyle = '#12213f';
      c.fillRect(0, 0, W, H);
      c.save();
      if (this.shake > 0.01) c.translate(Math.sin(this.shake * 40) * this.shake * 6, 0);

      // the paper
      c.fillStyle = '#fffaf0';
      c.beginPath();
      if (c.roundRect) c.roundRect(g.x0, g.y0, g.s * n, g.s * n, g.s * 0.3); else c.rect(g.x0, g.y0, g.s * n, g.s * n);
      c.fill();

      // words already found, each in its own colour
      var i, w;
      for (i = 0; i < p.words.length; i++) {
        w = p.words[i];
        if (!w.found) continue;
        c.strokeStyle = COLOURS[i % COLOURS.length];
        c.globalAlpha = 0.55;
        this._capsule(c, w.x, w.y, w.dx, w.dy, w.word.length, g, 0.78);
        c.globalAlpha = 1;
      }
      // the one being dragged
      if (this.sel && this.sel.len > 0) {
        c.strokeStyle = '#ffd24c';
        c.globalAlpha = 0.6;
        this._capsule(c, this.sel.x, this.sel.y, this.sel.dx, this.sel.dy, this.sel.len, g, 0.82);
        c.globalAlpha = 1;
      }
      // the hint: a ring on the first letter that swells and fades
      if (this.hint) {
        var k = Math.max(0, this.hint.t / 2.2), pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
        c.strokeStyle = COLOURS[this.hint.i % COLOURS.length];
        c.lineWidth = Math.max(3, g.s * 0.09);
        c.globalAlpha = 0.4 + 0.6 * k;
        c.beginPath();
        c.arc(g.x0 + (this.hint.x + 0.5) * g.s, g.y0 + (this.hint.y + 0.5) * g.s, g.s * (0.36 + pulse * 0.08), 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      }

      // the letters
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = '900 ' + Math.round(g.s * 0.52) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      for (var y = 0; y < n; y++) {
        for (var x = 0; x < n; x++) {
          var scale = 1;
          for (i = 0; i < this.pop.length; i++) {
            w = p.words[this.pop[i].i];
            var k2 = (x - w.x) * w.dx + (y - w.y) * w.dy;
            if (k2 >= 0 && k2 < w.word.length && w.x + w.dx * k2 === x && w.y + w.dy * k2 === y) {
              var t = this.pop[i].t;
              scale = 1 + 0.35 * Math.sin(Math.min(1, t / 0.6) * Math.PI);
            }
          }
          c.save();
          c.translate(g.x0 + (x + 0.5) * g.s, g.y0 + (y + 0.5) * g.s);
          c.scale(scale, scale);
          c.fillStyle = '#1a1230';
          c.fillText(p.grid[y * n + x], 0, g.s * 0.03);
          c.restore();
        }
      }
      c.restore();
    }
  };

  global.WordSearch = WordSearch;
})(window);
