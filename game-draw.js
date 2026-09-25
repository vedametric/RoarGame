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
  var GAL = 'draw.gallery';     // the saved pictures, newest first
  var GAL_MAX = 9;              // how many we keep before the oldest drops off
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
      this._buildSave();
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
      this._closeCamera();
      this._unbind();
      this._unbindSave();
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
        case 'save':  this.save(); return;
        case 'gallery': this.openGallery(); return;
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

    // The whole picture, on a white page, at any size — the live canvas uses
    // this.W, but the saved card paints it into a box of its own choosing.
    _paintInto: function (c, W, H) {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, W, H);
      for (var i = 0; i < this.items.length; i++) this._drawItem(c, this.items[i], null, W);
    },

    // A stroke is drawn a segment at a time, so a long one can be continued
    // from where it got to rather than redrawn from the start on every move.
    _drawItem: function (c, it, from, W) {
      W = W || this.W;
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
    },

    /* ── saving: her drawing, and a photo of her with it ──────────
       Tap 💾 SAVE and the front camera comes up with "smile!"; after a
       little countdown it snaps her, then the drawing and her face are
       painted together onto one card — "by Sienna 🦄" and the date — which
       is what gets kept and shared. The camera is only ever open during
       those few seconds, and every path hands its tracks straight back. */

    _buildSave: function () {
      var self = this, e = this.el;
      var cam = e.cam || {}, sv = e.saved || {}, gal = e.gallery || {};
      function on(el, fn) { if (el) { el.addEventListener('click', fn); } }
      this._saveHandlers = [];
      function bind(el, fn) { if (el) { el.addEventListener('click', fn); self._saveHandlers.push([el, fn]); } }

      bind(cam.skip, function () { self._closeCamera(); self._finishSave(null); });
      bind(cam.snap, function () { self._snap(); });
      bind(sv.share, function () { self.doShare(); });
      bind(sv.keep, function () { if (sv.wrap) sv.wrap.hidden = true; });
      bind(sv.again, function () { if (sv.wrap) sv.wrap.hidden = true; self.clear(); });
      bind(sv.gallery, function () { if (sv.wrap) sv.wrap.hidden = true; self.openGallery(); });
      bind(gal.close, function () { if (gal.wrap) gal.wrap.hidden = true; });
      if (gal.wrap) bind(gal.wrap, function (ev) { if (ev.target === gal.wrap) gal.wrap.hidden = true; });
      if (sv.wrap) bind(sv.wrap, function (ev) { if (ev.target === sv.wrap) sv.wrap.hidden = true; });
      if (gal.grid) {
        var gridFn = function (ev) {
          var b = ev.target.closest ? ev.target.closest('[data-gal]') : null;
          if (!b) return;
          var list = self.readGallery(), it = list[parseInt(b.getAttribute('data-gal'), 10)];
          if (it) { if (gal.wrap) gal.wrap.hidden = true; self._showSaved(it.img); }
        };
        gal.grid.addEventListener('click', gridFn);
        this._saveHandlers.push([gal.grid, gridFn]);
      }
      void on;
    },

    _unbindSave: function () {
      if (!this._saveHandlers) return;
      this._saveHandlers.forEach(function (h) { h[0].removeEventListener('click', h[1]); });
      this._saveHandlers = null;
    },

    save: function () {
      if (!this.items.length) {
        global.RoarAudio.sfx('spellbad');
        try { global.Say.speak('Draw something first!'); } catch (e) {}
        return;
      }
      global.RoarAudio.sfx('tick');
      this._openCamera();
    },

    /* ── the camera ───────────────────────────────────────────── */

    _openCamera: function () {
      var self = this, cam = this.el.cam || {};
      if (!cam.wrap) { this._finishSave(null); return; }
      cam.wrap.hidden = false;
      if (cam.count) cam.count.textContent = '';
      if (cam.hint) cam.hint.textContent = 'Smile! 📸';
      try { global.Say.speak('Smile!'); } catch (e) {}
      var md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) { this._noCamera(); return; }
      md.getUserMedia({ video: { facingMode: 'user', width: 640, height: 640 }, audio: false })
        .then(function (stream) {
          if (!self.running || !cam.wrap || cam.wrap.hidden) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            return;
          }
          self._stream = stream;
          if (cam.video) {
            cam.video.srcObject = stream;
            cam.video.muted = true;
            cam.video.setAttribute('playsinline', '');
            var pr = cam.video.play();
            if (pr && pr.catch) pr.catch(function () {});
          }
          self._countdown(3);
        })
        .catch(function () { self._noCamera(); });
    },

    // No camera, or she said no to it: keep the drawing anyway, just without
    // her face on it, and say so rather than failing silently.
    _noCamera: function () {
      this._closeCamera();
      try { global.Say.speak('Saved your drawing!'); } catch (e) {}
      this._finishSave(null);
    },

    _countdown: function (n) {
      var self = this, cam = this.el.cam || {};
      if (!this.running || !cam.wrap || cam.wrap.hidden) return;
      if (cam.count) cam.count.textContent = n > 0 ? String(n) : '';
      if (n > 0) {
        try { global.RoarAudio.sfx('tick'); } catch (e) {}
        this._cdTimer = setTimeout(function () { self._countdown(n - 1); }, 850);
      } else {
        this._snap();
      }
    },

    _snap: function () {
      var cam = this.el.cam || {}, v = cam.video, photo = null;
      clearTimeout(this._cdTimer);
      if (v && v.videoWidth) {
        var S = 480, pc = document.createElement('canvas');
        pc.width = pc.height = S;
        var pctx = pc.getContext('2d');
        var side = Math.min(v.videoWidth, v.videoHeight);
        // Mirror the front camera so it reads like a mirror, not back-to-front.
        pctx.save();
        pctx.translate(S, 0); pctx.scale(-1, 1);
        pctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, S, S);
        pctx.restore();
        photo = pc;
        try { global.RoarAudio.sfx('gold'); } catch (e) {}
      }
      this._closeCamera();
      this._finishSave(photo);
    },

    _closeCamera: function () {
      clearTimeout(this._cdTimer);
      var cam = (this.el && this.el.cam) || {};
      if (this._stream) {
        try { this._stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        this._stream = null;
      }
      if (cam.video) { try { cam.video.pause(); } catch (e) {} cam.video.srcObject = null; }
      if (cam.wrap) cam.wrap.hidden = true;
    },

    /* ── the finished card ────────────────────────────────────── */

    _finishSave: function (photo) {
      var url = this._compose(photo);
      this._saveToGallery(url);
      this._showSaved(url);
      try { global.RoarAudio.sfx('sparkle'); } catch (e) {}
    },

    _compose: function (photo) {
      var ratio = Math.min(1.7, Math.max(1.0, this.H / this.W));
      var CW = 760, M = 30, DW = CW - 2 * M, DH = Math.round(DW * ratio);
      var capH = 128, CH = M + DH + capH + M;
      var card = document.createElement('canvas');
      card.width = CW; card.height = CH;
      var c = card.getContext('2d');

      function rrect(x, y, w, h, r) {
        c.beginPath();
        if (c.roundRect) c.roundRect(x, y, w, h, r);
        else { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
               c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
      }

      // the card itself
      c.fillStyle = '#fbf3e4';
      rrect(0, 0, CW, CH, 34); c.fill();

      // the drawing, painted into its own box and dropped in with a frame
      var d = document.createElement('canvas');
      d.width = DW; d.height = DH;
      this._paintInto(d.getContext('2d'), DW, DH);
      c.save();
      rrect(M, M, DW, DH, 18); c.clip();
      c.drawImage(d, M, M);
      c.restore();
      c.lineWidth = 6; c.strokeStyle = '#ffffff';
      rrect(M, M, DW, DH, 18); c.stroke();
      c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.12)';
      rrect(M, M, DW, DH, 18); c.stroke();

      // caption
      var capY = M + DH + capH * 0.42;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#7a3fb0';
      c.font = '900 40px system-ui, -apple-system, "Segoe UI", sans-serif';
      c.fillText('by Sienna 🦄', CW / 2, capY);
      c.fillStyle = 'rgba(60,40,90,.6)';
      c.font = '600 22px system-ui, -apple-system, sans-serif';
      var when = '';
      try { when = new Date().toLocaleDateString(); } catch (e) {}
      c.fillText(when, CW / 2, capY + 40);

      // her photo, a round badge on the corner of the drawing
      if (photo) {
        var PD = 156, cx = M + DW - PD * 0.36, cy = M + DH - PD * 0.36;
        c.save();
        c.beginPath(); c.arc(cx, cy, PD / 2, 0, Math.PI * 2); c.clip();
        c.drawImage(photo, cx - PD / 2, cy - PD / 2, PD, PD);
        c.restore();
        c.lineWidth = 8; c.strokeStyle = '#ffd24c';
        c.beginPath(); c.arc(cx, cy, PD / 2, 0, Math.PI * 2); c.stroke();
        c.lineWidth = 3; c.strokeStyle = '#ffffff';
        c.beginPath(); c.arc(cx, cy, PD / 2 - 5, 0, Math.PI * 2); c.stroke();
      }

      try { return card.toDataURL('image/jpeg', 0.85); }
      catch (e) { return card.toDataURL(); }
    },

    _showSaved: function (url) {
      var sv = this.el.saved || {};
      if (!sv.wrap) return;
      if (sv.img) sv.img.src = url;
      if (sv.hint) sv.hint.textContent = navigator.share ? '' : 'Press and hold the picture to save it 💾';
      sv.wrap.hidden = false;
    },

    doShare: function (url) {
      var self = this, sv = this.el.saved || {};
      url = url || (sv.img && sv.img.src);
      if (!url) return;
      if (navigator.share && typeof fetch === 'function') {
        fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
          var file = new File([b], 'sienna-drawing.png', { type: b.type || 'image/png' });
          if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('no files');
          return navigator.share({ files: [file], title: 'My drawing', text: 'Look what I drew! 🎨' });
        }).catch(function () { self._shareHint(); });
      } else {
        this._shareHint();
      }
    },

    _shareHint: function () {
      var sv = this.el.saved || {};
      if (sv.hint) sv.hint.textContent = 'Press and hold the picture to save it 💾';
    },

    /* ── the gallery ──────────────────────────────────────────── */

    readGallery: function () {
      try { var g = JSON.parse(saved(GAL, '[]')); return Array.isArray(g) ? g : []; }
      catch (e) { return []; }
    },

    _saveToGallery: function (url) {
      var g = this.readGallery();
      g.unshift({ img: url, at: Date.now() });
      while (g.length > GAL_MAX) g.pop();
      // If it will not fit, drop the oldest and try again rather than lose it all.
      while (g.length) {
        try { localStorage.setItem(GAL, JSON.stringify(g)); return; }
        catch (e) { g.pop(); }
      }
    },

    openGallery: function () {
      var gal = this.el.gallery || {};
      if (!gal.wrap) return;
      this._renderGallery();
      gal.wrap.hidden = false;
      try { global.RoarAudio.sfx('tick'); } catch (e) {}
    },

    _renderGallery: function () {
      var gal = this.el.gallery || {}, list = this.readGallery();
      if (!gal.grid) return;
      if (!list.length) {
        gal.grid.innerHTML = '<p class="dr-gal-empty">No pictures yet.<br>Draw one and tap 💾 to save it!</p>';
        return;
      }
      gal.grid.innerHTML = list.map(function (it, i) {
        return '<button class="dr-gal-item" type="button" data-gal="' + i + '">' +
               '<img src="' + it.img + '" alt="a saved drawing"></button>';
      }).join('');
    }
  };

  global.DrawGame = DrawGame;
})(window);
