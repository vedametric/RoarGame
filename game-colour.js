/*
 * game-colour.js — "COLOURING"
 *
 * A colouring book. Pick a colour, tap a bit of the picture, and it fills in
 * up to the lines. That is all a colouring book is, and a five-year-old with a
 * finger is quicker at it than an adult with a crayon.
 *
 * The pictures are drawn in code — black outlines on white, painted with
 * canvas paths in a 100 × 130 space that is scaled to whatever the phone
 * gives us — so there are no image files and every line is as crisp as the
 * screen. Two layers: the colours underneath, the lines on top. A tap floods
 * the colour layer up to the nearest line, and because the lines are painted
 * over it again every frame they never smudge, whatever gets filled.
 *
 * Every picture is saved as she goes, so the one she coloured yesterday is
 * still coloured today, and finishing every last patch is worth confetti.
 */
(function (global) {
  'use strict';

  var SAVED_DONE = 'colour.done';
  var SAVED_PIC  = 'colour.pic.';     // + picture id → the colour layer, as a PNG

  var PALETTE = [
    '#ff3b30', '#ff8a2b', '#ffd60a', '#34c759', '#00b3a4', '#31d8ff',
    '#2f6bff', '#8e5cff', '#ff5cb8', '#ffb3c7', '#8b5a2b', '#111111'
  ];

  var W0 = 100, H0 = 130;               // the space every picture is drawn in
  var TAU = Math.PI * 2;

  function circle(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  function poly(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function ellipse(c, x, y, rx, ry, rot) {
    c.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0));
    c.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  }
  function star(c, x, y, r, n) {
    n = n || 5;
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * 0.45 : r;
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }
  function heart(c, x, y, s) {
    c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
    c.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
    c.closePath();
  }
  function cloud(c, x, y, s) {
    circle(c, x - s * 0.9, y, s * 0.55);
    circle(c, x - s * 0.25, y - s * 0.4, s * 0.7);
    circle(c, x + s * 0.45, y - s * 0.15, s * 0.6);
    circle(c, x + s * 0.95, y + s * 0.1, s * 0.45);
    c.rect(x - s * 0.9, y - s * 0.02, s * 1.85, s * 0.55);
  }
  function sun(c, x, y, r) {
    circle(c, x, y, r);
    for (var i = 0; i < 8; i++) {
      var a = i * TAU / 8;
      c.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3);
      c.lineTo(x + Math.cos(a) * r * 1.9, y + Math.sin(a) * r * 1.9);
    }
  }

  /* Each picture is a function that paints its outlines with three brushes:
       L(fn) — lines: whatever fn draws is stroked;
       U(fn) — a blob: the inside is wiped clean first, then stroked, so a
               cloud made of circles is one cloud and not seven slivers, and a
               wheel sitting on a car does not cut a crescent out of the body;
       S(fn) — solid: filled in as line, for a pupil or a doorknob that is too
               small to be worth colouring.
     The order matters: a blob wipes out whatever was drawn under it. */
  var PICTURES = [
    { id: 'house', name: 'a house', emoji: '🏠', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 100, 100, 30); });                 // ground
      L(function () { sun(c, 84, 18, 8); });
      U(function () { cloud(c, 22, 22, 8); });
      L(function () {
        c.rect(22, 60, 56, 40);                                     // walls
        poly(c, [[16, 60], [50, 30], [84, 60]]);                    // roof
        c.rect(62, 36, 8, 14);                                      // chimney
        c.rect(43, 76, 14, 24);                                     // door
        c.rect(28, 68, 11, 11); c.moveTo(33.5, 68); c.lineTo(33.5, 79);   // windows
        c.moveTo(28, 73.5); c.lineTo(39, 73.5);
        c.rect(61, 68, 11, 11); c.moveTo(66.5, 68); c.lineTo(66.5, 79);
        c.moveTo(61, 73.5); c.lineTo(72, 73.5);
      });
      S(function () { circle(c, 54, 89, 1.4); });                   // knob
      L(function () { c.moveTo(10, 109); c.lineTo(10, 118); c.moveTo(90, 110); c.lineTo(90, 118); });
      U(function () { circle(c, 10, 104, 6); circle(c, 90, 106, 5); });   // trees
    } },
    { id: 'fish', name: 'a fish', emoji: '🐠', draw: function (c, L, U, S) {
      L(function () {
        c.moveTo(0, 20); c.quadraticCurveTo(25, 12, 50, 20);
        c.quadraticCurveTo(75, 28, 100, 20);                        // the water line
        c.rect(0, 112, 100, 18);                                    // sand
        c.moveTo(80, 112); c.quadraticCurveTo(82, 96, 78, 88);      // weed
        c.moveTo(86, 112); c.quadraticCurveTo(90, 100, 86, 92);
        c.moveTo(12, 112); c.quadraticCurveTo(14, 100, 10, 92);
        poly(c, [[70, 70], [96, 52], [92, 70], [96, 88]]);          // tail, tucked under the body
        c.moveTo(40, 56); c.quadraticCurveTo(50, 32, 60, 56);       // top fin
        c.moveTo(40, 84); c.quadraticCurveTo(50, 110, 60, 84);      // bottom fin
      });
      U(function () { ellipse(c, 48, 70, 30, 18); });               // body
      L(function () {
        c.moveTo(50, 60); c.quadraticCurveTo(62, 70, 50, 80);       // stripes
        c.moveTo(38, 58); c.quadraticCurveTo(50, 70, 38, 82);
        c.moveTo(20, 74); c.quadraticCurveTo(24, 78, 28, 74);       // smile
      });
      U(function () { circle(c, 28, 66, 5); });                     // eye
      S(function () { circle(c, 29, 66, 2); });
      U(function () { circle(c, 22, 44, 4); circle(c, 16, 34, 3); circle(c, 26, 30, 2.5); }); // bubbles
    } },
    { id: 'flower', name: 'a flower', emoji: '🌸', draw: function (c, L, U, S) {
      L(function () {
        c.moveTo(50, 60); c.lineTo(50, 112);                        // stem
        c.moveTo(30, 112); c.lineTo(70, 112); c.lineTo(64, 130); c.lineTo(36, 130); c.closePath(); // pot
        c.rect(28, 108, 44, 6);                                     // pot rim
        sun(c, 86, 14, 7);
        c.moveTo(10, 16); c.quadraticCurveTo(14, 8, 18, 16);        // a little butterfly
        c.moveTo(10, 16); c.quadraticCurveTo(14, 24, 18, 16);
      });
      U(function () { ellipse(c, 38, 84, 11, 5, -0.7); ellipse(c, 62, 96, 11, 5, 0.7); });  // leaves
      for (var i = 0; i < 6; i++) {
        (function (a) {
          U(function () { ellipse(c, 50 + Math.cos(a) * 19, 40 + Math.sin(a) * 19, 11, 7, a); });
        })(i * TAU / 6 + Math.PI / 2);   // one petal points straight down the stem
      }
      U(function () { circle(c, 50, 40, 10); });                    // middle
    } },
    { id: 'butterfly', name: 'a butterfly', emoji: '🦋', draw: function (c, L, U, S) {
      L(function () {
        c.rect(0, 116, 100, 14);                                    // grass
        c.moveTo(47, 35); c.quadraticCurveTo(38, 22, 34, 18);       // feelers
        c.moveTo(53, 35); c.quadraticCurveTo(62, 22, 66, 18);
      });
      S(function () { circle(c, 34, 18, 1.8); circle(c, 66, 18, 1.8); });
      U(function () { ellipse(c, 27, 54, 22, 18, -0.4); ellipse(c, 73, 54, 22, 18, 0.4); });  // top wings
      U(function () { ellipse(c, 30, 88, 18, 15, 0.4); ellipse(c, 70, 88, 18, 15, -0.4); }); // bottom wings
      L(function () { circle(c, 24, 54, 7); circle(c, 76, 54, 7); circle(c, 29, 90, 5); circle(c, 71, 90, 5); }); // spots
      U(function () { ellipse(c, 50, 70, 5, 26); });                // body
      U(function () { circle(c, 50, 40, 6); });                     // head
      S(function () { circle(c, 48, 39, 1.3); circle(c, 52, 39, 1.3); });
      U(function () { circle(c, 12, 20, 4); circle(c, 88, 108, 4); });   // little flowers
    } },
    { id: 'rocket', name: 'a rocket', emoji: '🚀', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 118, 100, 12); });                  // launch pad
      U(function () { star(c, 15, 20, 7); star(c, 84, 32, 6); star(c, 20, 100, 6); star(c, 86, 100, 7); });
      U(function () { circle(c, 82, 12, 6); });                     // the moon
      U(function () { poly(c, [[35, 66], [22, 90], [35, 84]]); poly(c, [[65, 66], [78, 90], [65, 84]]); }); // fins
      U(function () { poly(c, [[42, 88], [50, 114], [58, 88]]); }); // flame
      L(function () { poly(c, [[46, 90], [50, 104], [54, 90]]); });
      U(function () {
        c.moveTo(35, 88); c.lineTo(35, 44); c.quadraticCurveTo(50, 8, 65, 44); c.lineTo(65, 88); c.closePath();
      });
      L(function () {
        c.moveTo(35, 44); c.quadraticCurveTo(50, 32, 65, 44);       // nose cone
        c.moveTo(35, 82); c.lineTo(65, 82);                         // engine band
      });
      U(function () { circle(c, 50, 60, 8); });                     // window
      L(function () { circle(c, 50, 60, 5); });
    } },
    { id: 'car', name: 'a car', emoji: '🚗', draw: function (c, L, U, S) {
      L(function () {
        c.rect(0, 100, 100, 30);                                    // road
        c.moveTo(8, 116); c.lineTo(22, 116); c.moveTo(36, 116); c.lineTo(50, 116);
        c.moveTo(64, 116); c.lineTo(78, 116);
        sun(c, 16, 18, 8);
      });
      U(function () { cloud(c, 72, 22, 8); });
      U(function () {
        c.moveTo(10, 100); c.lineTo(10, 78); c.quadraticCurveTo(10, 72, 16, 72);
        c.lineTo(26, 72); c.lineTo(38, 52); c.lineTo(70, 52); c.lineTo(82, 72);
        c.lineTo(88, 72); c.quadraticCurveTo(94, 72, 94, 78); c.lineTo(94, 100); c.closePath();
      });
      L(function () {
        c.moveTo(26, 72); c.lineTo(82, 72);                          // where the roof meets
        poly(c, [[40, 56], [52, 56], [52, 70], [32, 70]]);           // windows
        poly(c, [[56, 56], [68, 56], [76, 70], [56, 70]]);
        c.rect(10, 86, 6, 5); c.rect(88, 86, 6, 5);                  // lights
      });
      U(function () { circle(c, 28, 100, 10); circle(c, 76, 100, 10); });   // wheels
      L(function () { circle(c, 28, 100, 4); circle(c, 76, 100, 4); });
    } },
    { id: 'cat', name: 'a cat', emoji: '🐱', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 124, 100, 6); });
      U(function () {
        c.moveTo(74, 96); c.quadraticCurveTo(96, 92, 92, 70);        // tail
        c.quadraticCurveTo(100, 84, 78, 104); c.closePath();
      });
      U(function () { ellipse(c, 50, 100, 24, 22); });               // body
      U(function () { ellipse(c, 38, 120, 8, 4.5); ellipse(c, 62, 120, 8, 4.5); });   // paws
      U(function () { poly(c, [[30, 34], [24, 8], [46, 26]]); poly(c, [[70, 34], [76, 8], [54, 26]]); }); // ears
      L(function () { poly(c, [[32, 28], [28, 14], [42, 25]]); poly(c, [[68, 28], [72, 14], [58, 25]]); });
      U(function () { circle(c, 50, 50, 26); });                     // head
      L(function () {
        c.moveTo(50, 62); c.lineTo(50, 65);
        c.moveTo(44, 66); c.quadraticCurveTo(50, 71, 56, 66);        // mouth
        c.moveTo(26, 56); c.lineTo(8, 52); c.moveTo(26, 60); c.lineTo(8, 62);   // whiskers
        c.moveTo(74, 56); c.lineTo(92, 52); c.moveTo(74, 60); c.lineTo(92, 62);
      });
      U(function () { circle(c, 40, 46, 5); circle(c, 60, 46, 5); });       // eyes
      S(function () { circle(c, 41, 46, 2); circle(c, 61, 46, 2); });
      U(function () { poly(c, [[45, 55], [55, 55], [50, 61]]); });    // nose
    } },
    { id: 'balloon', name: 'a hot air balloon', emoji: '🎈', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 118, 100, 12); sun(c, 88, 14, 7); });
      U(function () { cloud(c, 18, 96, 7); cloud(c, 84, 60, 6); });
      L(function () { c.moveTo(40, 84); c.lineTo(38, 98); c.moveTo(60, 84); c.lineTo(62, 98); });  // ropes
      U(function () { c.rect(38, 98, 24, 14); });                     // basket
      L(function () { c.moveTo(38, 105); c.lineTo(62, 105); c.moveTo(50, 98); c.lineTo(50, 112); });
      U(function () {
        c.moveTo(50, 86); c.quadraticCurveTo(10, 64, 18, 34); c.quadraticCurveTo(26, 6, 50, 6);
        c.quadraticCurveTo(74, 6, 82, 34); c.quadraticCurveTo(90, 64, 50, 86);   // the envelope
      });
      L(function () {
        c.moveTo(50, 6); c.quadraticCurveTo(28, 40, 50, 86);          // panels
        c.moveTo(50, 6); c.quadraticCurveTo(72, 40, 50, 86);
        c.moveTo(50, 6); c.lineTo(50, 86);
      });
    } },
    { id: 'icecream', name: 'an ice cream', emoji: '🍦', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 122, 100, 8); });
      U(function () { heart(c, 14, 30, 7); heart(c, 88, 90, 6); star(c, 86, 24, 7); star(c, 14, 96, 6); });
      U(function () { poly(c, [[30, 66], [70, 66], [50, 122]]); });   // cone
      L(function () {
        // the waffle: from one edge of the cone across to the other
        for (var t = 0; t < 1; t += 0.25) {
          var t2 = Math.min(1, t + 0.3);
          c.moveTo(30 + 20 * t, 66 + 56 * t); c.lineTo(70 - 20 * t2, 66 + 56 * t2);
          c.moveTo(70 - 20 * t, 66 + 56 * t); c.lineTo(30 + 20 * t2, 66 + 56 * t2);
        }
      });
      U(function () { circle(c, 50, 54, 20); });                      // bottom scoop
      U(function () { circle(c, 38, 36, 15); circle(c, 62, 36, 15); });   // the two on top
      U(function () { circle(c, 50, 22, 12); });
      L(function () { c.moveTo(50, 8); c.quadraticCurveTo(54, 2, 58, 4); });
      U(function () { circle(c, 50, 12, 4.5); });                     // cherry
    } },
    { id: 'rainbow', name: 'a rainbow', emoji: '🌈', draw: function (c, L, U, S) {
      L(function () {
        var r = [46, 40, 34, 28, 22, 16, 10];
        for (var i = 0; i < r.length; i++) { c.moveTo(50 - r[i], 90); c.arc(50, 90, r[i], Math.PI, 0); }
        c.moveTo(4, 90); c.lineTo(96, 90);                            // the bottom edge
        c.rect(0, 90, 100, 40);                                       // the ground
        sun(c, 84, 16, 8);
        c.moveTo(20, 110); c.lineTo(20, 122);                          // stems
        c.moveTo(50, 112); c.lineTo(50, 124);
        c.moveTo(78, 110); c.lineTo(78, 122);
      });
      U(function () { circle(c, 20, 106, 4.5); circle(c, 50, 108, 4.5); circle(c, 78, 106, 4.5); });  // flowers
      U(function () { cloud(c, 14, 92, 8); cloud(c, 86, 92, 8); });
    } },
    { id: 'bear', name: 'a teddy bear', emoji: '🧸', draw: function (c, L, U, S) {
      U(function () { heart(c, 90, 14, 6); heart(c, 10, 14, 6); });
      U(function () { ellipse(c, 18, 84, 9, 15, 0.5); ellipse(c, 82, 84, 9, 15, -0.5); });   // arms
      U(function () { ellipse(c, 50, 96, 26, 26); });                 // tummy
      L(function () { ellipse(c, 50, 100, 14, 14); });                // patch
      U(function () { ellipse(c, 32, 118, 11, 9); ellipse(c, 68, 118, 11, 9); });   // feet
      U(function () { circle(c, 25, 26, 10); circle(c, 75, 26, 10); });   // ears
      L(function () { circle(c, 25, 26, 5); circle(c, 75, 26, 5); });
      U(function () { circle(c, 50, 44, 26); });                      // head
      U(function () { ellipse(c, 50, 55, 11, 8); });                  // muzzle
      L(function () { c.moveTo(50, 53); c.lineTo(50, 59); c.moveTo(44, 59); c.quadraticCurveTo(50, 64, 56, 59); });
      S(function () { ellipse(c, 50, 51, 4, 2.5); });                 // nose
      U(function () { circle(c, 40, 40, 3.5); circle(c, 60, 40, 3.5); });   // eyes
      S(function () { circle(c, 40, 40, 1.4); circle(c, 60, 40, 1.4); });
    } },
    { id: 'dino', name: 'a dinosaur', emoji: '🦕', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 108, 100, 22); sun(c, 84, 16, 8); }); // ground
      U(function () { cloud(c, 60, 24, 7); });
      U(function () { circle(c, 12, 113, 4); circle(c, 90, 119, 4); });   // eggs
      U(function () {
        for (var i = 0; i < 4; i++) { var x = 36 + i * 10; poly(c, [[x, 76], [x + 5, 52], [x + 10, 76]]); }   // plates
      });
      U(function () { c.rect(30, 100, 9, 18); c.rect(54, 100, 9, 18); }); // legs
      U(function () {
        c.moveTo(70, 84); c.quadraticCurveTo(98, 78, 96, 58);          // tail
        c.quadraticCurveTo(100, 90, 70, 104); c.closePath();
      });
      U(function () {
        c.moveTo(20, 86); c.quadraticCurveTo(12, 50, 22, 26);          // neck
        c.lineTo(30, 26); c.quadraticCurveTo(30, 44, 36, 86); c.closePath();
      });
      U(function () { ellipse(c, 46, 90, 30, 20); });                 // body
      U(function () { ellipse(c, 24, 26, 12, 8); });                  // head
      S(function () { circle(c, 21, 24, 1.8); });
      L(function () { c.moveTo(30, 30); c.quadraticCurveTo(34, 30, 34, 27); });
    } }
  ];

  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var ColourGame = {
    running: false,
    PICTURES: PICTURES,
    PALETTE: PALETTE,

    start: function (cfg) {
      var self = this;
      this.stop();
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.fill = document.createElement('canvas');      // the colours
      this.fctx = this.fill.getContext('2d', { willReadFrequently: true });
      this.lines = document.createElement('canvas');     // the outlines
      this.lctx = this.lines.getContext('2d');
      this.burst = new global.Burst();

      this.done = {};
      try { this.done = JSON.parse(saved(SAVED_DONE, '{}')) || {}; } catch (e) {}
      this.colour = PALETTE[0];
      this.fills = 0;
      this.paused = false;
      this.running = true;
      this.pic = Math.max(0, Math.min(PICTURES.length - 1, cfg.pic | 0));

      this._paint();
      this._fit();
      this._open();

      this._onResize = function () { self._fit(); self._open(true); };
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

    /* ── the palette ──────────────────────────────────────────── */

    _paint: function () {
      var self = this, box = this.el.palette;
      if (!box) return;
      box.innerHTML = PALETTE.map(function (col) {
        return '<button class="co-swatch" type="button" data-colour="' + col +
               '" style="background:' + col + '" aria-label="colour"></button>';
      }).join('') +
      '<button class="co-swatch co-swatch--eraser" type="button" data-colour="#ffffff" aria-label="rub out">✕</button>';
      this._onPalette = function (e) {
        var b = e.target.closest ? e.target.closest('[data-colour]') : null;
        if (!b) return;
        self.pick(b.getAttribute('data-colour'));
      };
      box.addEventListener('click', this._onPalette);
      this._markPick();
    },

    pick: function (col) {
      this.colour = col;
      this._markPick();
      global.RoarAudio.sfx('tick');
    },

    _markPick: function () {
      var box = this.el.palette;
      if (!box) return;
      var all = box.querySelectorAll('[data-colour]');
      for (var i = 0; i < all.length; i++) {
        all[i].classList.toggle('is-picked', all[i].getAttribute('data-colour') === this.colour);
      }
    },

    /* ── fitting the picture to the screen ─────────────────────── */

    _fit: function () {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      this.W = this.canvas.clientWidth || 320;
      this.H = this.canvas.clientHeight || 420;
      this.canvas.width = Math.floor(this.W * d);
      this.canvas.height = Math.floor(this.H * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
      this.fill.width = this.lines.width = this.canvas.width;
      this.fill.height = this.lines.height = this.canvas.height;
      this.d = d;
      // The picture keeps its shape and sits in the middle of whatever is left.
      var s = Math.min(this.W / W0, this.H / H0) * 0.96;
      this.scale = s;
      this.ox = (this.W - W0 * s) / 2;
      this.oy = (this.H - H0 * s) / 2;
    },

    // Draw the outlines once per picture, and work out where they are so a
    // flood fill knows where to stop.
    _open: function (keep) {
      var p = PICTURES[this.pic], lc = this.lctx, d = this.d;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, this.lines.width, this.lines.height);
      lc.setTransform(d, 0, 0, d, 0, 0);
      lc.translate(this.ox, this.oy);
      lc.scale(this.scale, this.scale);
      lc.lineWidth = 2.2;
      lc.lineJoin = 'round';
      lc.lineCap = 'round';
      lc.strokeStyle = '#1a1230';
      lc.fillStyle = '#1a1230';
      p.draw(lc,
        function L(fn) { lc.beginPath(); fn(); lc.stroke(); },
        function U(fn) {
          // Stroked twice as wide, then the inside wiped: what is left is a
          // normal-width line sitting just outside the shape, and nothing at
          // all where the parts overlapped.
          lc.beginPath(); fn();
          lc.lineWidth = 4.4; lc.stroke(); lc.lineWidth = 2.2;
          lc.save(); lc.globalCompositeOperation = 'destination-out'; lc.fill(); lc.restore();
        },
        function S(fn) { lc.beginPath(); fn(); lc.fill(); });

      var w = this.lines.width, h = this.lines.height;
      var px = lc.getImageData(0, 0, w, h).data;
      this.wall = new Uint8Array(w * h);
      for (var i = 0, j = 3; i < w * h; i++, j += 4) this.wall[i] = px[j] > 110 ? 1 : 0;

      // The colours: what she did last time, or a clean white page.
      var fc = this.fctx, self = this;
      fc.setTransform(1, 0, 0, 1, 0, 0);
      fc.fillStyle = '#ffffff';
      fc.fillRect(0, 0, w, h);
      this.fills = 0;
      this.finished = false;
      var data = keep ? this._snapshot : saved(SAVED_PIC + p.id, null);
      if (data) {
        var img = new Image();
        img.onload = function () {
          if (!self.running || PICTURES[self.pic] !== p) return;
          fc.drawImage(img, 0, 0, w, h);
          self._check(true);
        };
        img.src = data;
      }
      this._render();
    },

    /* ── moving between pictures ───────────────────────────────── */

    next: function (dir) {
      if (!this.running) return;
      this.pic = (this.pic + (dir < 0 ? -1 : 1) + PICTURES.length) % PICTURES.length;
      try { global.Confetti.stop(); } catch (e) {}
      global.RoarAudio.sfx('puff');
      this._open();
    },

    clear: function () {
      if (!this.running) return;
      var fc = this.fctx;
      fc.setTransform(1, 0, 0, 1, 0, 0);
      fc.fillStyle = '#ffffff';
      fc.fillRect(0, 0, this.fill.width, this.fill.height);
      this.finished = false;
      this.fills = 0;
      try { localStorage.removeItem(SAVED_PIC + PICTURES[this.pic].id); } catch (e) {}
      global.RoarAudio.sfx('whoosh');
      this._render();
    },

    /* ── tapping ──────────────────────────────────────────────── */

    _bind: function () {
      var self = this;
      this._down = function (e) {
        var r = self.canvas.getBoundingClientRect();
        self.tap(e.clientX - r.left, e.clientY - r.top);
        e.preventDefault();
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
    },

    _unbind: function () {
      if (this._down) this.canvas.removeEventListener('pointerdown', this._down);
      if (this._onPalette && this.el.palette) this.el.palette.removeEventListener('click', this._onPalette);
      this._down = this._onPalette = null;
    },

    tap: function (x, y) {
      if (!this.running || this.paused) return false;
      var px = Math.floor(x * this.d), py = Math.floor(y * this.d);
      var w = this.fill.width, h = this.fill.height;
      if (px < 0 || py < 0 || px >= w || py >= h) return false;
      // A tap right on a line looks for the nearest bit of white beside it,
      // because a finger is a good deal wider than a line.
      var seed = this._nearOpen(px, py, Math.ceil(6 * this.d));
      if (seed < 0) { global.RoarAudio.sfx('warn'); return false; }
      this._flood(seed % w, (seed / w) | 0, this.colour);
      this.fills++;
      this.burst.emit(x, y, 12, [this.colour, '#ffffff', '#ffd24c'], { speed: 220, size: 5, life: 0.5 });
      global.RoarAudio.sfx(this.colour === '#ffffff' ? 'puff' : 'spawn');
      this._keep();
      this._check(false);
      this._render();
      return true;
    },

    _nearOpen: function (px, py, r) {
      var w = this.fill.width, h = this.fill.height, wall = this.wall;
      if (!wall[py * w + px]) return py * w + px;
      for (var rr = 1; rr <= r; rr++) {
        for (var dy = -rr; dy <= rr; dy++) {
          for (var dx = -rr; dx <= rr; dx++) {
            if (Math.abs(dx) !== rr && Math.abs(dy) !== rr) continue;
            var x = px + dx, y = py + dy;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            if (!wall[y * w + x]) return y * w + x;
          }
        }
      }
      return -1;
    },

    /* A scanline flood: fill this run, then look above and below it for the
       next. The lines are the only walls — whatever colour a patch is now, a
       tap on it repaints the whole patch, which is what "colouring it in" means. */
    _flood: function (sx, sy, colour) {
      var w = this.fill.width, h = this.fill.height, wall = this.wall;
      var img = this.fctx.getImageData(0, 0, w, h), px = img.data;
      var rgb = this._rgb(colour);
      var seen = new Uint8Array(w * h);
      var stack = [sy * w + sx];
      while (stack.length) {
        var i = stack.pop();
        var y = (i / w) | 0, x = i - y * w;
        // walk left to the wall
        while (x > 0 && !wall[i - 1] && !seen[i - 1]) { x--; i--; }
        var up = false, down = false;
        while (x < w && !wall[i] && !seen[i]) {
          seen[i] = 1;
          var o = i * 4;
          px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
          if (y > 0) {
            var a = i - w, ok = !wall[a] && !seen[a];
            if (ok && !up) stack.push(a);
            up = ok;
          }
          if (y < h - 1) {
            var b = i + w, ok2 = !wall[b] && !seen[b];
            if (ok2 && !down) stack.push(b);
            down = ok2;
          }
          x++; i++;
        }
      }
      this.fctx.putImageData(img, 0, 0);
    },

    _rgb: function (hex) {
      var n = parseInt(hex.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    // Is there any white left that is not a line? If not, she has finished it.
    // A few hundred device pixels of slack: a hair of white where two curves
    // meet is not a patch she has missed.
    _check: function (quiet) {
      var w = this.fill.width, h = this.fill.height, wall = this.wall;
      var px = this.fctx.getImageData(0, 0, w, h).data;
      var left = 0;
      for (var i = 0, o = 0; i < w * h; i++, o += 4) {
        if (wall[i]) continue;
        if (px[o] > 245 && px[o + 1] > 245 && px[o + 2] > 245) { left++; if (left > 400) break; }
      }
      var was = this.finished;
      this.finished = left <= 400;
      if (this.finished && !was && !quiet) {
        var id = PICTURES[this.pic].id;
        if (!this.done[id]) {
          this.done[id] = 1;
          save(SAVED_DONE, JSON.stringify(this.done));
        }
        global.RoarAudio.sfx('win');
        try { global.Confetti.start(['#ff3b30', '#ffd60a', '#34c759', '#31d8ff', '#ff5cb8']); } catch (e) {}
        if (this.cfg.onDone) this.cfg.onDone(id);
      }
    },

    _keep: function () {
      try {
        this._snapshot = this.fill.toDataURL('image/png');
        save(SAVED_PIC + PICTURES[this.pic].id, this._snapshot);
      } catch (e) {}
    },

    doneCount: function () {
      var n = 0;
      for (var k in this.done) if (this.done[k]) n++;
      return n;
    },

    _render: function () {
      var e = this.el, p = PICTURES[this.pic];
      if (e.name) e.name.textContent = p.emoji + ' ' + p.name;
      if (e.count) e.count.textContent = (this.pic + 1) + ' / ' + PICTURES.length;
      if (e.best) e.best.textContent = '★ ' + this.doneCount();
      if (e.done) e.done.hidden = !this.finished;
    },

    /* ── the loop ─────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.burst.update(dt);
      this._draw();
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _draw: function () {
      var c = this.ctx, d = this.d;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.drawImage(this.fill, 0, 0);
      c.drawImage(this.lines, 0, 0);
      c.restore();
      c.setTransform(d, 0, 0, d, 0, 0);
      this.burst.draw(c);
    }
  };

  global.ColourGame = ColourGame;
})(window);
