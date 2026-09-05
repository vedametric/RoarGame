/*
 * aliens.js — who lives where
 *
 * One alien per planet, and no two of them look remotely alike. They are all
 * drawn rather than typed: an emoji would give every planet the same green
 * head, and the whole point is that landing on Neptune should feel like a
 * different place from landing on Mars.
 *
 * Each is built from the same parts — a body, some eyes, arms, legs and
 * something on top — so they animate the same way, but the shapes, counts and
 * colours are all different. They blink, they breathe, and they cheer.
 */
(function (global) {
  'use strict';

  /* body: 'blob' | 'tall' | 'round' | 'fluff' | 'ring' | 'jelly' | 'tin' | 'fuzz'
     eyes: how many, laid out across the face
     arms/legs: how many pairs
     top:  'antenna' | 'flame' | 'halo' | 'ears' | 'none' */
  var ALIENS = {
    'THE MOON': { name: 'Blip',   body: 'blob',  skin: '#b9c6d8', dark: '#7d8ea6',
                  eyes: 3, arms: 1, legs: 1, top: 'antenna', eye: '#1b2233',
                  glow: '#dbe6f5', hello: 'Blip waves all three eyes at you.' },
    'MARS':      { name: 'Krug',  body: 'tall',  skin: '#e0674a', dark: '#a8412a',
                  eyes: 2, arms: 2, legs: 1, top: 'ears', eye: '#2b0f08',
                  glow: '#ffb199', hello: 'Krug has four arms and uses them all.' },
    'VENUS':     { name: 'Sizzle', body: 'round', skin: '#f5b942', dark: '#c1832a',
                  eyes: 1, arms: 1, legs: 1, top: 'flame', eye: '#3a2000',
                  glow: '#ffe0a0', hello: 'Sizzle is warm to stand next to.' },
    'JUPITER':   { name: 'Bramble', body: 'fluff', skin: '#d9a06a', dark: '#9c6b3f',
                  eyes: 5, arms: 1, legs: 0, top: 'none', eye: '#241205',
                  glow: '#ffd9a8', hello: 'Bramble is mostly fluff and five eyes.' },
    'SATURN':    { name: 'Halo',  body: 'ring',  skin: '#f2e2a8', dark: '#c3ad66',
                  eyes: 2, arms: 1, legs: 0, top: 'halo', eye: '#3b3315',
                  glow: '#fff6cf', hello: 'Halo floats, and never touches the ground.' },
    'NEPTUNE':   { name: 'Splish', body: 'jelly', skin: '#5a9bea', dark: '#2f66b4',
                  eyes: 2, arms: 0, legs: 0, top: 'none', eye: '#06172f',
                  glow: '#bfe0ff', hello: 'Splish is a bit wobbly and very fast.' },
    'MERCURY':   { name: 'Tik',   body: 'tin',   skin: '#c9cdd4', dark: '#8a9099',
                  eyes: 2, arms: 1, legs: 1, top: 'antenna', eye: '#22c9ff',
                  glow: '#e6f6ff', hello: 'Tik is made of metal and never gets tired.' },
    'PLUTO':     { name: 'Mo',    body: 'fuzz',  skin: '#f0e6dc', dark: '#c2b1a1',
                  eyes: 2, arms: 1, legs: 1, top: 'ears', eye: '#2a2018',
                  glow: '#ffffff', hello: 'Mo is very cold and very cuddly.' }
  };

  var ORDER = ['THE MOON', 'MARS', 'VENUS', 'JUPITER', 'SATURN', 'NEPTUNE',
               'MERCURY', 'PLUTO'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* Draw one, standing on (x, y) — the ground under its feet, not its middle,
     so it can be planted on a surface without any arithmetic at the call site.
     `s` is roughly how tall it is. `mood` is 'idle' | 'busy' | 'win' | 'lose'. */
  function draw(c, kind, x, y, s, t, mood) {
    var a = ALIENS[kind] || ALIENS['THE MOON'];
    mood = mood || 'idle';

    // Everything breathes; when it is working it bobs much harder.
    var rate = mood === 'busy' ? 9 : mood === 'win' ? 7 : 2.2;
    var amp = mood === 'busy' ? 0.09 : mood === 'win' ? 0.13 : 0.03;
    var bob = Math.sin(t * rate) * s * amp;
    var squash = 1 + Math.sin(t * rate) * (mood === 'busy' ? 0.06 : 0.02);

    c.save();
    c.translate(x, y - bob);

    // a soft shadow, so it is standing on the ground rather than floating
    c.save();
    c.globalAlpha = 0.28;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(0, bob, s * 0.34, s * 0.08, 0, 0, 6.2832);
    c.fill();
    c.restore();

    var h = s * 0.72;                 // body height
    var w = s * 0.42;                 // body half-width
    var cy = -h * 0.62;               // body centre

    legs(c, a, s, t, mood);
    arms(c, a, s, cy, t, mood);
    body(c, a, w, h, cy, squash);
    topper(c, a, s, cy, h, t, mood);
    eyes(c, a, w, cy, s, t, mood);

    c.restore();
  }

  function body(c, a, w, h, cy, squash) {
    c.save();
    c.translate(0, cy);
    c.scale(1 / squash, squash);
    c.fillStyle = a.skin;
    c.beginPath();

    switch (a.body) {
      case 'tall':                              // narrow and upright
        c.ellipse(0, 0, w * 0.72, h * 0.66, 0, 0, 6.2832);
        break;
      case 'round':                             // a ball
        c.arc(0, 0, w * 1.02, 0, 6.2832);
        break;
      case 'fluff':                             // wide and shaggy
        // Curves between the tufts, not straight lines: joined up with lineTo
        // it came out as a brown polygon rather than anything furry.
        var N = 11, pts = [];
        for (var i = 0; i < N; i++) {
          var ang = (i / N) * 6.2832;
          var rr = w * (1.00 + (i % 2 ? 0.13 : -0.03));
          pts.push([Math.cos(ang) * rr, Math.sin(ang) * rr * 0.86]);
        }
        c.moveTo((pts[0][0] + pts[N - 1][0]) / 2, (pts[0][1] + pts[N - 1][1]) / 2);
        for (i = 0; i < N; i++) {
          var cur = pts[i], nxt = pts[(i + 1) % N];
          c.quadraticCurveTo(cur[0], cur[1], (cur[0] + nxt[0]) / 2, (cur[1] + nxt[1]) / 2);
        }
        c.closePath();
        break;
      case 'ring':                              // a floating head, no body
        c.ellipse(0, 0, w * 0.94, h * 0.44, 0, 0, 6.2832);
        break;
      case 'jelly':                             // a dome with a wobbly hem
        c.moveTo(-w, h * 0.36);
        c.quadraticCurveTo(-w, -h * 0.62, 0, -h * 0.62);
        c.quadraticCurveTo(w, -h * 0.62, w, h * 0.36);
        for (var j = 0; j < 5; j++) {
          c.quadraticCurveTo(w - (w * 2 / 5) * (j + 0.5), h * (j % 2 ? 0.20 : 0.52),
                             w - (w * 2 / 5) * (j + 1), h * 0.36);
        }
        c.closePath();
        break;
      case 'tin':                               // a box
        c.rect(-w * 0.8, -h * 0.55, w * 1.6, h * 1.05);
        break;
      case 'fuzz':                              // a soft heap
        c.ellipse(0, h * 0.02, w * 1.05, h * 0.56, 0, 0, 6.2832);
        break;
      default:                                  // blob
        c.ellipse(0, 0, w, h * 0.6, 0, 0, 6.2832);
    }
    c.fill();

    // one darker side, which is what stops it looking like a paper cut-out
    c.save();
    c.clip();
    var g = c.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = g;
    c.fillRect(-w * 1.4, -h, w * 2.8, h * 2.4);
    c.restore();

    // fluff and fuzz get a furry edge
    if (a.body === 'fluff' || a.body === 'fuzz') {
      c.strokeStyle = a.dark;
      c.lineWidth = Math.max(1, w * 0.06);
      c.stroke();
    }
    c.restore();
  }

  function eyes(c, a, w, cy, s, t, mood) {
    var n = a.eyes;
    // A blink every few seconds, and never while it is celebrating.
    var blink = mood === 'win' ? 1 : (Math.sin(t * 1.7) > 0.985 ? 0.1 : 1);
    var r = s * (n > 3 ? 0.055 : n === 1 ? 0.16 : 0.085);
    var spread = n === 1 ? 0 : w * 1.05;

    for (var i = 0; i < n; i++) {
      var ex = n === 1 ? 0 : -spread / 2 + (spread / (n - 1)) * i;
      var ey = cy - s * 0.04 + (n > 3 ? Math.sin(i * 2.1) * s * 0.05 : 0);
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(ex, ey, r, r * blink, 0, 0, 6.2832);
      c.fill();
      if (blink > 0.5) {
        // the pupil drifts, which is most of what makes it feel alive
        c.fillStyle = a.eye;
        c.beginPath();
        c.arc(ex + Math.sin(t * 1.1 + i) * r * 0.28,
              ey + Math.cos(t * 0.9 + i) * r * 0.2, r * 0.48, 0, 6.2832);
        c.fill();
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.beginPath();
        c.arc(ex - r * 0.2, ey - r * 0.28, r * 0.18, 0, 6.2832);
        c.fill();
      }
    }

    // a mouth, which is where the mood actually shows
    c.strokeStyle = a.eye;
    c.lineWidth = Math.max(1.5, s * 0.028);
    c.lineCap = 'round';
    c.beginPath();
    var my = cy + s * 0.14;
    if (mood === 'win') {
      c.arc(0, my - s * 0.03, s * 0.09, 0.15, Math.PI - 0.15);
    } else if (mood === 'lose') {
      c.arc(0, my + s * 0.08, s * 0.09, Math.PI + 0.2, -0.2);
    } else if (mood === 'busy') {
      c.moveTo(-s * 0.06, my); c.lineTo(s * 0.06, my);       // concentrating
    } else {
      c.arc(0, my - s * 0.02, s * 0.07, 0.25, Math.PI - 0.25);
    }
    c.stroke();
  }

  function arms(c, a, s, cy, t, mood) {
    if (!a.arms) return;
    var swing = mood === 'busy' ? Math.sin(t * 11) * 0.9
              : mood === 'win' ? Math.sin(t * 8) * 1.1 : Math.sin(t * 1.6) * 0.18;
    c.strokeStyle = a.dark;
    c.lineWidth = Math.max(2, s * 0.055);
    c.lineCap = 'round';
    for (var pair = 0; pair < a.arms; pair++) {
      // Low on the body, where arms go — up level with the eyes they read as
      // extra antennae rather than arms.
      var y = cy + s * (pair ? 0.16 : 0.05);
      [-1, 1].forEach(function (side) {
        var ang = side * (0.95 + swing * side) - (mood === 'win' ? side * 1.25 : 0);
        var ex = side * s * 0.22 + Math.sin(ang) * s * 0.28;
        var ey = y - Math.cos(ang) * s * 0.28 * (mood === 'win' ? 1 : -0.25);
        c.beginPath();
        c.moveTo(side * s * 0.22, y);
        // a bend at the elbow, so it is an arm and not a spike
        c.quadraticCurveTo(side * s * 0.30, y + s * 0.04, ex, ey);
        c.stroke();
        c.fillStyle = a.skin;
        c.beginPath();
        c.arc(ex, ey, s * 0.045, 0, 6.2832);
        c.fill();
      });
    }
  }

  function legs(c, a, s, t, mood) {
    if (!a.legs) return;
    var step = mood === 'busy' ? Math.sin(t * 12) * s * 0.05 : 0;
    c.strokeStyle = a.dark;
    c.lineWidth = Math.max(2, s * 0.06);
    c.lineCap = 'round';
    [-1, 1].forEach(function (side) {
      c.beginPath();
      c.moveTo(side * s * 0.13, -s * 0.22);
      c.lineTo(side * s * 0.15 + step * side, -s * 0.01);
      c.stroke();
    });
  }

  function topper(c, a, s, cy, h, t, mood) {
    var top = cy - h * 0.52;
    c.save();
    switch (a.top) {
      case 'antenna':
        c.strokeStyle = a.dark;
        c.lineWidth = Math.max(1.5, s * 0.028);
        c.beginPath();
        c.moveTo(0, top);
        c.quadraticCurveTo(s * 0.06, top - s * 0.14, s * 0.02 + Math.sin(t * 3) * s * 0.03,
                           top - s * 0.22);
        c.stroke();
        c.fillStyle = a.glow;
        c.beginPath();
        c.arc(s * 0.02 + Math.sin(t * 3) * s * 0.03, top - s * 0.24, s * 0.045, 0, 6.2832);
        c.fill();
        break;
      case 'flame':
        c.fillStyle = '#ff8a2b';
        c.beginPath();
        c.moveTo(-s * 0.09, top);
        c.quadraticCurveTo(0, top - s * (0.24 + Math.sin(t * 9) * 0.04), s * 0.09, top);
        c.closePath();
        c.fill();
        c.fillStyle = '#ffd24c';
        c.beginPath();
        c.moveTo(-s * 0.045, top);
        c.quadraticCurveTo(0, top - s * (0.14 + Math.sin(t * 11) * 0.03), s * 0.045, top);
        c.closePath();
        c.fill();
        break;
      case 'halo':
        c.strokeStyle = a.glow;
        c.lineWidth = Math.max(2, s * 0.035);
        c.save();
        c.translate(0, top - s * 0.10);
        c.scale(1, 0.3);
        c.beginPath();
        c.arc(0, 0, s * 0.30, 0, 6.2832);
        c.stroke();
        c.restore();
        break;
      case 'ears':
        c.fillStyle = a.skin;
        [-1, 1].forEach(function (side) {
          c.beginPath();
          c.moveTo(side * s * 0.16, top + s * 0.06);
          c.quadraticCurveTo(side * s * 0.30, top - s * 0.22,
                             side * s * 0.05, top - s * 0.02);
          c.closePath();
          c.fill();
        });
        break;
    }
    c.restore();
  }

  global.Aliens = {
    draw: draw,
    of: function (planet) { return ALIENS[planet] || ALIENS['THE MOON']; },
    kinds: ORDER,
    all: ALIENS
  };
})(window);
