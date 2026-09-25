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
  var BG = 'draw.bg';           // a selfie behind the drawing, for DECORATE ME
  var GAL = 'draw.gallery';     // the saved pictures, newest first
  var GAL_MAX = 9;              // how many we keep before the oldest drops off
  var MAX_ITEMS = 400;          // strokes and stickers kept on one page
  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  var PALETTE = [
    '#111111', '#ff3b30', '#ff8a2b', '#ffd60a', '#34c759', '#00b3a4', '#31d8ff',
    '#2f6bff', '#8e5cff', '#ff5cb8', '#ffb3c7', '#8b5a2b', '#9e9e9e'
  ];
  var SIZES = [0.012, 0.028, 0.06];     // thin, medium, fat — as a share of the width
  // Sunglasses, hats, hearts and cool stuff — for decorating a photo of her.
  var STICKERS = ['🕶️', '😎', '🎩', '🧢', '👑', '👒', '❤️', '💖', '💋', '⭐',
                  '✨', '🌈', '🦄', '🎀', '🔥', '💫', '🐱', '🐶', '🌸', '🦋'];

  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }

  // A data: URL to a Blob, done synchronously — iOS Safari only lets the
  // share sheet open from inside the tap that asked for it, so there is no
  // room for an async fetch() first: by the time it resolved, the tap would
  // no longer count as a user gesture and iOS would silently refuse to share.
  function dataURLToBlob(u) {
    var comma = u.indexOf(','), head = u.slice(0, comma), body = u.slice(comma + 1);
    var mime = (/:(.*?)[;,]/.exec(head) || [])[1] || 'image/jpeg';
    var bin = /;base64/i.test(head) ? atob(body) : decodeURIComponent(body);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
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
      this._loadBg();               // a selfie she left behind, if any

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
        case 'photo': this.decorate(); return;
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
      this.bg = null; this.bgImg = null;      // a clean page loses the selfie too
      try { localStorage.removeItem(BG); } catch (e) {}
      global.RoarAudio.sfx('whoosh');
      this._keep();
      this._draw();
      this._mark();
    },

    /* ── DECORATE ME: a selfie behind the drawing ────────────────
       She takes a photo of herself, it becomes the background, and every pen
       and sticker lands on top of it — sunglasses, a hat, hearts, a scribble.
       Saving then keeps the decorated photo itself, so her face is the whole
       picture, not a badge in the corner. */

    decorate: function () {
      var self = this;
      global.RoarAudio.sfx('tick');
      this._openCamera(function (photo) {
        if (!photo) { self._toast("Couldn't open the camera 📷"); return; }
        self._setBackground(photo.toDataURL('image/jpeg', 0.85));
        self.tool = 'sticker';                 // straight into decorating
        self._mark();
        self._toast('Now decorate it! 😎');
        try { global.Say.speak('Now decorate it!'); } catch (e) {}
      });
    },

    _setBackground: function (dataUrl) {
      var self = this;
      this.bg = dataUrl;
      var img = new Image();
      img.onload = function () { if (self.running) { self.bgImg = img; self._draw(); } };
      img.src = dataUrl;
      try { save(BG, dataUrl); } catch (e) {}
    },

    _loadBg: function () {
      var self = this, d = saved(BG, null);
      this.bg = d || null; this.bgImg = null;
      if (!d) return;
      var img = new Image();
      img.onload = function () { if (self.running) { self.bgImg = img; self._draw(); } };
      img.src = d;
    },

    // Cover-fit a square photo into a box, centred, so her face fills it with
    // no white bars however the box is shaped.
    _drawBg: function (c, img, W, H) {
      if (!img || !img.width) return;
      var s = Math.max(W / img.width, H / img.height);
      var w = img.width * s, h = img.height * s;
      c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
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
      if (this.bgImg) this._drawBg(c, this.bgImg, this.W, this.H);
      for (var i = 0; i < this.items.length; i++) this._drawItem(c, this.items[i]);
    },

    // The whole picture — selfie behind, pens and stickers on top — at any
    // size, so the live canvas and the saved card paint from the same routine.
    _paintInto: function (c, W, H) {
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, W, H);
      if (this.bgImg) this._drawBg(c, this.bgImg, W, H);
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
      var self = this;
      if (!this.items.length && !this.bg) {
        global.RoarAudio.sfx('spellbad');
        try { global.Say.speak('Draw something first!'); } catch (e) {}
        this._toast('Draw something first! ✏️');
        return;
      }
      global.RoarAudio.sfx('tick');
      // If she decorated a selfie, her face is already the picture — no need
      // to snap again. A plain drawing gets the smile-and-snap so the saved
      // card still comes with a photo of her.
      if (this.bg) { this._finishSave(null); }
      else { this._openCamera(function (photo) { self._finishSave(photo); }); }
    },

    // A little message that slides in and fades — so a tap always shows it did
    // something, even on a phone with the sound turned off.
    _toast: function (msg) {
      var t = this.el.toast;
      if (!t) return;
      t.textContent = msg;
      t.hidden = false;
      t.classList.remove('is-in');
      void t.offsetWidth;                 // restart the animation
      t.classList.add('is-in');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(function () { t.classList.remove('is-in'); t.hidden = true; }, 1800);
    },

    /* ── the camera ───────────────────────────────────────────── */

    // Opens the front camera, counts down, snaps, and hands the photo (a
    // square canvas) to `onDone` — or null if there was no camera. The
    // countdown only starts once the video actually has a frame, so the snap
    // is never a black rectangle from a camera that had not warmed up yet.
    _openCamera: function (onDone) {
      var self = this, cam = this.el.cam || {};
      this._onSnap = onDone || function () {};
      if (!cam.wrap) { this._noCamera(); return; }
      cam.wrap.hidden = false;
      if (cam.count) cam.count.textContent = '';
      if (cam.hint) cam.hint.textContent = 'Smile! 📸';
      try { global.Say.speak('Smile!'); } catch (e) {}
      var md = navigator.mediaDevices;
      if (!md || !md.getUserMedia) { this._noCamera(); return; }
      // If nothing comes back at all, don't leave her staring at a frozen
      // "Smile!" — give up after a few seconds.
      clearTimeout(this._camGiveUp);
      this._camGiveUp = setTimeout(function () { if (!self._stream) self._noCamera(); }, 7000);
      md.getUserMedia({ video: { facingMode: 'user', width: 640, height: 640 }, audio: false })
        .then(function (stream) {
          clearTimeout(self._camGiveUp);
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
          self._whenReady(0);
        })
        .catch(function () { self._noCamera(); });
    },

    // Wait (up to ~4s) for the video to actually carry a frame before the
    // countdown, so a cold camera never gets snapped as black.
    _whenReady: function (tries) {
      var self = this, cam = this.el.cam || {}, v = cam.video;
      if (!this.running || !cam.wrap || cam.wrap.hidden) return;
      if ((v && v.videoWidth > 0) || tries > 40) { this._countdown(3); return; }
      this._cdTimer = setTimeout(function () { self._whenReady(tries + 1); }, 100);
    },

    // No camera, or she said no to it: hand back no photo. The caller decides
    // what that means (save the drawing alone; or a DECORATE ME that just
    // steps back).
    _noCamera: function () {
      var done = this._onSnap || function () {};
      this._onSnap = null;
      this._closeCamera();
      done(null);
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
      var done = this._onSnap || function () {};
      this._onSnap = null;
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
      done(photo);
    },

    _closeCamera: function () {
      clearTimeout(this._cdTimer);
      clearTimeout(this._camGiveUp);
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

    // The saved card. Three shapes, all with her face big and clear:
    //   • decorated a selfie  → one panel: the photo with her decorations.
    //   • plain drawing + snap → two panels: her photo on top, drawing below.
    //   • drawing, no camera   → one panel: the drawing on its own.
    _compose: function (photo) {
      var self = this;
      var ratio = Math.min(1.6, Math.max(1.0, this.H / this.W));
      var CW = 760, M = 30, DW = CW - 2 * M, capH = 128, gap = 22;
      var twoPanel = !this.bg && !!photo;

      var PP = DW;                                   // square photo panel
      var DH = Math.round(DW * (twoPanel ? Math.min(1.2, ratio) : ratio));
      var CH = M + (twoPanel ? PP + gap : 0) + DH + capH + M;

      var card = document.createElement('canvas');
      card.width = CW; card.height = CH;
      var c = card.getContext('2d');

      function rrect(x, y, w, h, r) {
        c.beginPath();
        if (c.roundRect) c.roundRect(x, y, w, h, r);
        else { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
               c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
      }
      function panel(x, y, w, h, render) {
        var d = document.createElement('canvas');
        d.width = w; d.height = h;
        render(d.getContext('2d'), w, h);
        c.save(); rrect(x, y, w, h, 18); c.clip(); c.drawImage(d, x, y); c.restore();
        c.lineWidth = 6; c.strokeStyle = '#ffffff'; rrect(x, y, w, h, 18); c.stroke();
        c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.12)'; rrect(x, y, w, h, 18); c.stroke();
      }

      c.fillStyle = '#fbf3e4';
      rrect(0, 0, CW, CH, 34); c.fill();

      var y = M;
      if (twoPanel) {
        panel(M, y, DW, PP, function (d, w, h) {
          d.fillStyle = '#000'; d.fillRect(0, 0, w, h);
          self._drawBg(d, photo, w, h);
        });
        y += PP + gap;
      }
      panel(M, y, DW, DH, function (d, w, h) { self._paintInto(d, w, h); });
      y += DH;

      var capY = y + capH * 0.42;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#7a3fb0';
      c.font = '900 40px system-ui, -apple-system, "Segoe UI", sans-serif';
      c.fillText('by Sienna 🦄', CW / 2, capY);
      c.fillStyle = 'rgba(60,40,90,.6)';
      c.font = '600 22px system-ui, -apple-system, sans-serif';
      var when = '';
      try { when = new Date().toLocaleDateString(); } catch (e) {}
      c.fillText(when, CW / 2, capY + 40);

      try { return card.toDataURL('image/jpeg', 0.85); }
      catch (e) { return card.toDataURL(); }
    },

    _showSaved: function (url) {
      var sv = this.el.saved || {};
      if (!sv.wrap) return;
      if (sv.img) sv.img.src = url;
      if (sv.hint) sv.hint.textContent = navigator.share ? 'kept in 🖼️ my pictures' : 'Press and hold the picture to save it, or find it in 🖼️ my pictures';
      sv.wrap.hidden = false;
    },

    // "Save to Photos": on a phone this hands the finished card to the system
    // share sheet, where "Save Image" drops it into the camera roll. A web
    // page cannot write to the Photos app itself — the sheet is the only door
    // — so where there is no share sheet we fall back to the long-press hint,
    // and either way the picture is already safe in MY PICTURES.
    doShare: function (url) {
      var sv = this.el.saved || {};
      url = url || (sv.img && sv.img.src);
      if (!url) return;
      if (navigator.share) {
        try {
          var file = new File([dataURLToBlob(url)], 'sienna-drawing.jpg', { type: 'image/jpeg' });
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            // Called straight away, still inside the tap, so iOS allows it.
            var pr = navigator.share({ files: [file], title: 'My drawing', text: 'Look what I drew! 🎨' });
            if (pr && pr.catch) pr.catch(function () {});   // they cancelled — no error to the child
            return;
          }
        } catch (e) { /* fall through to the hint */ }
      }
      this._shareHint();
    },

    _shareHint: function () {
      var sv = this.el.saved || {};
      if (sv.hint) sv.hint.textContent = 'Press and hold the picture to save it, or find it in 🖼️ my pictures';
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
