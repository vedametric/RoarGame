/*
 * game-draw.js — "DRAWING"
 *
 * A blank page and a finger. Pick a colour and a size and draw; there is a
 * rainbow pen that changes colour as it goes, a rubber, stickers to stamp
 * on, undo, and a clean page.
 *
 * Nothing is drawn straight onto the screen. Every stroke and every sticker
 * goes into a list, and the picture is the list drawn from the top — which
 * is what makes undo a matter of taking the last thing off, and what lets
 * the whole picture be kept in localStorage as a few kilobytes of numbers
 * rather than a screenshot. The list is saved after every stroke, so the
 * drawing is still there tomorrow.
 *
 * Points are kept in page units (0–1 of the width), so a drawing made on one
 * phone looks the same on another, and turning the phone does not tear it.
 */
(function (global) {
  'use strict';

  var SAVED = 'draw.page';
  var MAX_ITEMS = 400;          // strokes and stickers kept on one page
  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  var PALETTE = [
    '#111111', '#ff3b30', '#ff8a2b', '#ffd60a', '#34c759', '#00b3a4', '#31d8ff',
    '#2f6bff', '#8e5cff', '#ff5cb8', '#ffb3c7', '#8b5a2b', '#9e9e9e'
  ];
  var SIZES = [0.012, 0.028, 0.06];     // thin, medium, fat — as a share of the width
  var STICKERS = ['⭐', '❤️', '🌈', '🦄', '🐱', '🐶', '🌸', '🦋', '🚀', '🍦', '🐸', '😀', '🐙', '🎈'];

  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }

  var DrawGame = {
    running: false,
    PALETTE: PALETTE,
    STICKERS: STICKERS,

    start: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');

      this.colour = PALETTE[1];
      this.size = 1;
      this.tool = 'pen';            // pen | rainbow | eraser | sticker
      this.sticker = STICKERS[0];
      this.items = [];
      try { this.items = JSON.parse(saved(SAVED, '[]')) || []; } catch (e) { this.items = []; }
      if (!Array.isArray(this.items)) this.items = [];
      this.stroke = null;
      this.paused = false;
      this.running = true;

      this._build();
      this._fit();
      this._onResize = function () { self._fit(); };
      addEventListener('resize', this._onResize);
      this._bind();
      this._render();
      return this;
    },

    stop: function () {
      this.running = false;
      if (this._onResize) removeEventListener('resize', this._onResize);
      this._onResize = null;
      this._unbind();
    },

    setPaused: function (on) { this.paused = !!on; this.stroke = null; },

    /* ── the tool rows ────────────────────────────────────────── */

    _build: function () {
      var self = this, e = this.el;
      if (e.palette) {
        e.palette.innerHTML = PALETTE.map(function (col) {
          return '<button class="co-swatch" type="button" data-colour="' + col +
                 '" style="background:' + col + '" aria-label="colour"></button>';
        }).join('');
      }
      if (e.stickers) {
        e.stickers.innerHTML = STICKERS.map(function (s) {
          return '<button class="dr-sticker" type="button" data-sticker="' + s + '">' + s + '</button>';
        }).join('');
      }
      this._onTools = function (ev) {
        var t = ev.target.closest ? ev.target.closest('[data-colour],[data-sticker],[data-tool],[data-size]') : null;
        if (!t) return;
        if (t.hasAttribute('data-colour')) { self.pickColour(t.getAttribute('data-colour')); return; }
        if (t.hasAttribute('data-sticker')) { self.pickSticker(t.getAttribute('data-sticker')); return; }
        if (t.hasAttribute('data-size')) { self.pickSize(parseInt(t.getAttribute('data-size'), 10)); return; }
        self.pickTool(t.getAttribute('data-tool'));
      };
      if (e.tools) e.tools.addEventListener('click', this._onTools);
      this._mark();
    },

    pickColour: function (col) {
      this.colour = col;
      if (this.tool !== 'pen') this.tool = 'pen';
      global.RoarAudio.sfx('tick');
      this._mark();
    },

    pickSize: function (i) {
      this.size = Math.max(0, Math.min(SIZES.length - 1, i));
      global.RoarAudio.sfx('tick');
      this._mark();
    },

    pickSticker: function (s) {
      this.sticker = s;
      this.tool = 'sticker';
      global.RoarAudio.sfx('tick');
      this._mark();
    },

    pickTool: function (tool) {
      switch (tool) {
        case 'undo':  this.undo(); return;
        case 'clear': this.clear(); return;
        case 'pen': case 'rainbow': case 'eraser': case 'sticker':
          this.tool = tool;
          global.RoarAudio.sfx('tick');
          this._mark();
          return;
      }
    },

    _mark: function () {
      var e = this.el, i, all;
      if (e.tools) {
        all = e.tools.querySelectorAll('[data-tool]');
        for (i = 0; i < all.length; i++) {
          var t = all[i].getAttribute('data-tool');
          all[i].classList.toggle('is-picked', t === this.tool);
        }
        all = e.tools.querySelectorAll('[data-size]');
        for (i = 0; i < all.length; i++) {
          all[i].classList.toggle('is-picked', parseInt(all[i].getAttribute('data-size'), 10) === this.size);
        }
        all = e.tools.querySelectorAll('[data-colour]');
        for (i = 0; i < all.length; i++) {
          all[i].classList.toggle('is-picked', this.tool === 'pen' && all[i].getAttribute('data-colour') === this.colour);
        }
        all = e.tools.querySelectorAll('[data-sticker]');
        for (i = 0; i < all.length; i++) {
          all[i].classList.toggle('is-picked', this.tool === 'sticker' && all[i].getAttribute('data-sticker') === this.sticker);
        }
      }
      if (e.stickers) e.stickers.hidden = this.tool !== 'sticker';
      if (e.palette) e.palette.hidden = this.tool === 'sticker';
      if (e.undo) e.undo.disabled = !this.items.length;
    },

    /* ── fitting ──────────────────────────────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 420;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this._draw();
    },

    /* ── drawing ──────────────────────────────────────────────── */

    _bind: function () {
      var self = this;
      function at(e) {
        var r = self.canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) / self.W, y: (e.clientY - r.top) / self.W };
      }
      this._down = function (e) {
        if (!self.running || self.paused) return;
        e.preventDefault();
        try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        var p = at(e);
        if (self.tool === 'sticker') { self.stamp(p.x, p.y); return; }
        self.begin(p.x, p.y);
      };
      this._move = function (e) {
        if (!self.stroke) return;
        e.preventDefault();
        var p = at(e);
        self.extend(p.x, p.y);
      };
      this._up = function (e) {
        if (!self.stroke) return;
        e.preventDefault();
        self.end();
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      this.canvas.addEventListener('pointerup', this._up, { passive: false });
      this.canvas.addEventListener('pointercancel', this._up, { passive: false });
    },

    _unbind: function () {
      if (this._down) {
        this.canvas.removeEventListener('pointerdown', this._down);
        this.canvas.removeEventListener('pointermove', this._move);
        this.canvas.removeEventListener('pointerup', this._up);
        this.canvas.removeEventListener('pointercancel', this._up);
      }
      if (this._onTools && this.el.tools) this.el.tools.removeEventListener('click', this._onTools);
      this._down = this._move = this._up = this._onTools = null;
    },

    begin: function (x, y) {
      var rainbow = this.tool === 'rainbow';
      this.stroke = {
        t: 's',
        c: this.tool === 'eraser' ? '#ffffff' : this.colour,
        w: SIZES[this.size] * (this.tool === 'eraser' ? 2 : 1),
        r: rainbow ? (Math.random() * 360) | 0 : -1,
        p: [x, y]
      };
      this.items.push(this.stroke);
      this._drawItem(this.ctx, this.stroke, this.stroke.p.length - 2);
    },

    extend: function (x, y) {
      var s = this.stroke, n = s.p.length;
      // Skip the jitter: only a point that has actually moved goes in.
      var dx = x - s.p[n - 2], dy = y - s.p[n - 1];
      if (dx * dx + dy * dy < 0.000004) return;
      s.p.push(x, y);
      this._drawItem(this.ctx, s, n - 2);
    },

    end: function () {
      if (!this.stroke) return;
      this.stroke = null;
      global.RoarAudio.sfx('step');
      this._trim();
      this._keep();
      this._mark();
    },

    stamp: function (x, y) {
      this.items.push({ t: 'k', e: this.sticker, x: x, y: y, w: SIZES[this.size] * 4 + 0.06 });
      this._drawItem(this.ctx, this.items[this.items.length - 1]);
      global.RoarAudio.sfx('puff');
      this._trim();
      this._keep();
      this._mark();
    },

    undo: function () {
      if (!this.items.length) return;
      this.items.pop();
      this.stroke = null;
      global.RoarAudio.sfx('whoosh');
      this._keep();
      this._draw();
      this._mark();
    },

    clear: function () {
      this.items = [];
      this.stroke = null;
      global.RoarAudio.sfx('whoosh');
      this._keep();
      this._draw();
      this._mark();
    },

    _trim: function () {
      // A page that goes on forever slows down every undo and every redraw;
      // a page this long has long since been coloured solid anyway.
      while (this.items.length > MAX_ITEMS) this.items.shift();
    },

    _keep: function () {
      save(SAVED, JSON.stringify(this.items.map(function (it) {
        if (it.t !== 's') return it;
        return { t: 's', c: it.c, w: it.w, r: it.r,
                 p: it.p.map(function (v) { return Math.round(v * 1000) / 1000; }) };
      })));
    },

    /* ── painting ─────────────────────────────────────────────── */

    _draw: function () {
      var c = this.ctx;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, this.W, this.H);
      for (var i = 0; i < this.items.length; i++) this._drawItem(c, this.items[i]);
    },

    // A stroke is drawn a segment at a time, so a long one can be continued
    // from where it got to rather than redrawn from the start on every move.
    _drawItem: function (c, it, from) {
      var W = this.W;
      if (it.t === 'k') {
        c.save();
        c.font = (it.w * W) + 'px ' + EMOJI;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#000';
        c.fillText(it.e, it.x * W, it.y * W);
        c.restore();
        return;
      }
      var p = it.p, n = p.length;
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.lineWidth = it.w * W;
      if (n <= 2) {
        // A tap is a dot.
        c.fillStyle = it.r >= 0 ? 'hsl(' + it.r + ',95%,55%)' : it.c;
        c.beginPath();
        c.arc(p[0] * W, p[1] * W, it.w * W / 2, 0, Math.PI * 2);
        c.fill();
        c.restore();
        return;
      }
      var start = from == null ? 0 : Math.max(0, from);
      if (it.r < 0) {
        c.strokeStyle = it.c;
        c.beginPath();
        c.moveTo(p[start] * W, p[start + 1] * W);
        for (var i = start + 2; i < n; i += 2) c.lineTo(p[i] * W, p[i + 1] * W);
        c.stroke();
      } else {
        // The rainbow pen: every segment a little further round the wheel,
        // counted from the start of the stroke so a redraw matches.
        for (var j = start + 2; j < n; j += 2) {
          c.strokeStyle = 'hsl(' + ((it.r + (j / 2) * 9) % 360) + ',95%,55%)';
          c.beginPath();
          c.moveTo(p[j - 2] * W, p[j - 1] * W);
          c.lineTo(p[j] * W, p[j + 1] * W);
          c.stroke();
        }
      }
      c.restore();
    },

    _render: function () {
      var e = this.el;
      if (e.count) e.count.textContent = this.items.length;
      this._mark();
    }
  };

  global.DrawGame = DrawGame;
})(window);
