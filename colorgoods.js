/*
 * colorgoods.js — "COLORING GOODS"
 *
 * The colouring app Sienna likes, rebuilt as a page of our own. It is a whole
 * little app rather than a game: a home with a slideshow and tiles, a shelf of
 * pages to colour in, a feed, a gallery with SAVED / CANVAS / DRAWING, and the
 * canvas itself — home · bin · undo · redo · Save along the top, four brush
 * sizes and a strip of markers underneath, and a row of tools: rubber, potion
 * (fills a patch), dropper, smudge, and the marker boxes that swap the strip.
 *
 * It runs two ways and the code does not care which:
 *   - inside Roar Battle, over everything, from the MINI GAMES shelf; the
 *     ✕ EXIT pill at the top hands you back to the shelf.
 *   - on its own page, colorgoods.html, with its own manifest and icon, so
 *     it can be added to the home screen as its own app. EXIT there goes
 *     to Roar Battle's page.
 *
 * The page is a 1200 × 1200 white canvas; the outlines of a colouring page
 * sit on a second canvas over it, so they can never be painted over or
 * rubbed out. Undo and redo are snapshots of the page, ten deep. What she is
 * working on is kept in localStorage after every stroke — the free canvas as
 * one page, each colouring page as its own — so closing the app loses
 * nothing. Save puts a copy in the gallery, which is also what the feed and
 * the SPOTLIGHT tile show.
 */
(function (global) {
  'use strict';

  var K = {
    gallery: 'cg.gallery',      // the saved pictures, newest first
    wip: 'cg.wip',              // the free canvas, as she left it
    pic: 'cg.pic.',             // + page id → that colouring page, as she left it
    user: 'cg.user',            // { name, face }
    sound: 'cg.sound',          // 'off' to silence the clicks
    drawGal: 'draw.gallery'     // Roar's DRAWING game keeps its pictures here
  };
  var SIZE = 1200;              // the page, in pixels, whatever the screen
  var UNDO_MAX = 10;
  var GAL_MAX = 30;
  var BRUSH = [9, 18, 32, 56];  // S · M · L · XL, in page pixels
  var INK = '#1a1230';          // the outlines, same as the COLOURING game

  /* ── little helpers ───────────────────────────────────────── */

  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) { return false; } return true; }
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function json(k, d) { try { var v = JSON.parse(load(k, 'null')); return v === null ? d : v; } catch (e) { return d; } }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function hsl(h, s, l) { return 'hsl(' + h + ',' + s + '%,' + l + '%)'; }
  function ago(t) {
    var s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
    try { return new Date(t).toLocaleDateString(); } catch (e) { return ''; }
  }

  // A data: URL as a Blob, synchronously — the share sheet has to open inside
  // the tap that asked for it, and iOS will not wait for a fetch().
  function dataURLToBlob(u) {
    var comma = u.indexOf(','), head = u.slice(0, comma), body = u.slice(comma + 1);
    var mime = (/:(.*?)[;,]/.exec(head) || [])[1] || 'image/jpeg';
    var bin = /;base64/i.test(head) ? atob(body) : decodeURIComponent(body);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function shareImage(url, name) {
    if (navigator.share) {
      try {
        var file = new File([dataURLToBlob(url)], name, { type: 'image/jpeg' });
        if (!navigator.canShare || navigator.canShare({ files: [file] })) {
          var pr = navigator.share({ files: [file], title: 'ColorGoods', text: 'Look what I made! 🎨' });
          if (pr && pr.catch) pr.catch(function () {});
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function downloadImage(url, name) {
    var a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // The hand-lettered fonts come from Google; without them the app falls back
  // to Chalkboard on an iPhone, which is close enough to not matter.
  function ensureFonts() {
    if (document.getElementById('cg-fonts')) return;
    var l = document.createElement('link');
    l.id = 'cg-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Gochi+Hand&family=Patrick+Hand&display=swap';
    document.head.appendChild(l);
  }

  // A click for every tap: Roar's own sounds when it is there, a tiny blip
  // of our own on the stand-alone page.
  var actx = null;
  function sfx(name) {
    if (load(K.sound, 'on') === 'off') return;
    if (global.RoarAudio && global.RoarAudio.sfx) { try { global.RoarAudio.sfx(name === 'win' ? 'win' : 'tick'); return; } catch (e) {} }
    try {
      actx = actx || new (global.AudioContext || global.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'triangle'; o.frequency.value = name === 'win' ? 880 : 660;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.1);
    } catch (e) {}
  }

  /* ── the pictures ─────────────────────────────────────────── */

  var TAU = Math.PI * 2;

  // The COLOURING game's outlines, drawn in a 100 × 130 space, scaled to fit
  // whatever box we have. Three brushes: L lines, U blobs (wiped inside so
  // overlapping circles are one cloud), S solids — see game-colour.js.
  function paintLines(c, pic, W, H, lw, x0, y0) {
    var s = Math.min(W / 100, H / 130) * 0.92;
    var ox = (W - 100 * s) / 2, oy = (H - 130 * s) / 2;
    c.save();
    c.setTransform(1, 0, 0, 1, x0 || 0, y0 || 0);
    if (!x0 && !y0) c.clearRect(0, 0, W, H);     // a page of its own starts clean
    c.translate(ox, oy); c.scale(s, s);
    c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = INK; c.fillStyle = INK;
    pic.draw(c,
      function L(fn) { c.beginPath(); fn(); c.stroke(); },
      function U(fn) {
        c.beginPath(); fn();
        c.lineWidth = lw * 2; c.stroke(); c.lineWidth = lw;
        c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
      },
      function S(fn) { c.beginPath(); fn(); c.fill(); });
    c.restore();
  }

  function pictures() { return (global.ColourGame && global.ColourGame.PICTURES) || []; }
  function picture(id) {
    var ps = pictures();
    for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i];
    return null;
  }

  /* ── the markers ──────────────────────────────────────────── */

  function shades(h, sat) {
    var L = [84, 70, 58, 46, 36], S = sat || [100, 100, 85, 60, 45], out = [];
    for (var i = 0; i < 5; i++) out.push(hsl(h, S[i], L[i]));
    return out;
  }
  function ring(n, s, l) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(hsl(Math.round(i * 360 / n), s, l));
    return out;
  }

  // Each box is a strip. The first one opens with the colour wheel and white,
  // as the real one does; the rest are just colours.
  var SETS = [
    { id: 'classic', box: '#2b2b2b', lid: '#111', name: 'markers',
      colours: ['wheel', '#ffffff'].concat(
        shades(52), shades(32), shades(5), shades(335), shades(275), shades(220), shades(195),
        shades(150), shades(105), shades(25, [60, 60, 55, 50, 45]),
        ['#e6e6e6', '#bdbdbd', '#8a8a8a', '#4a4a4a', '#111111']) },
    { id: 'soft', box: '#5bb8ff', lid: '#2f8fe0', name: 'soft markers',
      colours: ['#bfe3d2', '#c9e4e6', '#86c8c2', '#5fbfb4', '#2d6f7f', '#5cb3c6', '#b9dbe8'].concat(ring(18, 70, 82), ring(12, 55, 70)) },
    { id: 'bright', box: '#7be04a', lid: '#4fb825', name: 'bright markers',
      colours: ring(24, 100, 55).concat(ring(12, 100, 45)) },
    { id: 'earth', box: '#b8793a', lid: '#8a5424', name: 'earth markers',
      colours: ['#f6e7c1', '#e9c98a', '#d4a05a', '#b8793a', '#8a5424', '#5c3614', '#3a220d',
                '#dfe8c8', '#b9cd8a', '#8fae5a', '#5f8a3a', '#3e6126', '#9ec9c0', '#5b8f88',
                '#d9c2a5', '#a68a6d', '#6f5a45', '#cfd5d8', '#8f9ba3', '#4d5a63'] },
    { id: 'skin', box: '#ffb48a', lid: '#f08a56', name: 'skin tones',
      colours: ['#ffe6d5', '#ffd3b8', '#f7bf9a', '#e9a97f', '#d8936a', '#c57b54', '#a9663f',
                '#8d5330', '#6e3f23', '#51301a', '#3a2212', '#ffd9e6', '#f5c0cf', '#e8a7b7'] }
  ];

  /* ── the icons, drawn ─────────────────────────────────────── */

  var I = {
    home:   '<svg viewBox="0 0 48 48"><path class="fill" d="M8 22 24 8l16 14v18H8z"/><path d="M4 24 24 6l20 18"/><path class="heart" d="M24 34c-4-3-7-6-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 3-3 6-7 9z" fill="none"/></svg>',
    color:  '<svg viewBox="0 0 48 48"><path class="fill" d="M30 6l12 12-14 14-12-12z"/><path d="M16 20l-5 5c-3 3-3 7 0 10s7 3 10 0l5-5"/><path d="M8 40c3-1 5-3 6-6"/></svg>',
    feed:   '<svg viewBox="0 0 48 48"><rect class="fill" x="6" y="6" width="16" height="16" rx="3"/><rect class="fill" x="26" y="6" width="16" height="16" rx="3"/><rect class="fill" x="6" y="26" width="16" height="16" rx="3"/><rect class="fill" x="26" y="26" width="16" height="16" rx="3"/><path class="heart" d="M14 18c-3-2-5-4-5-6a2.6 2.6 0 0 1 5-1 2.6 2.6 0 0 1 5 1c0 2-2 4-5 6z"/><path class="heart" d="M34 18c-3-2-5-4-5-6a2.6 2.6 0 0 1 5-1 2.6 2.6 0 0 1 5 1c0 2-2 4-5 6z"/></svg>',
    gallery:'<svg viewBox="0 0 48 48"><path class="fill" d="M6 10c6-2 12-2 18 2 6-4 12-4 18-2v28c-6-2-12-2-18 2-6-4-12-4-18-2z"/><path d="M24 12v28"/><path class="star" d="M34 16l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z"/></svg>',
    settings:'<svg viewBox="0 0 48 48"><path class="fill" d="M24 4l4 4h6l2 6 5 3-1 6 3 5-4 4v6l-6 2-3 5-6-1-5 3-4-4h-6l-2-6-5-3 1-6-3-5 4-4v-6l6-2 3-5 6 1z"/><circle cx="24" cy="24" r="6"/></svg>',
    // the canvas's top row
    edHome: '<svg viewBox="0 0 24 24" fill="#666" stroke="none"><path d="M12 3 3 11h2.5v9h5v-6h3v6h5v-9H21z"/></svg>',
    trash:  '<svg viewBox="0 0 24 24" fill="#666" stroke="none"><path d="M9 3h6l1 2h4v2H4V5h4zM6 8h12l-1 13H7z"/><path d="M9.5 10h1.4v9H9.5zm3.6 0h1.4v9h-1.4z" fill="#fff"/></svg>',
    undo:   '<svg viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7 4 11l5 4"/><path d="M4 11h9a6 6 0 0 1 0 12h-2"/></svg>',
    redo:   '<svg viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 7l5 4-5 4"/><path d="M20 11h-9a6 6 0 0 0 0 12h2"/></svg>',
    check:  '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>',
    // the gallery cards
    down:   '<svg viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="M8 10l4 4 4-4"/><path d="M4 15v4h16v-4"/></svg>',
    heart:  '<svg viewBox="0 0 24 24"><path d="M12 20c-5-3.5-8-7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 13 17 16.5 12 20z"/></svg>',
    heartF: '<svg viewBox="0 0 24 24" fill="#ff5c7a"><path d="M12 20c-5-3.5-8-7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 13 17 16.5 12 20z"/></svg>',
    play:   '<svg viewBox="0 0 24 24"><path d="M9 7v10l8-5z" stroke-linejoin="round"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M13 3h3c.3 2.4 1.7 3.8 4 4v3c-1.5 0-2.9-.5-4-1.3V15a5 5 0 1 1-5-5v3a2 2 0 1 0 2 2z"/></svg>',
    // dialogs
    dHome:  '<svg viewBox="0 0 24 24"><path d="M12 3 3 11h2.5v9h5v-6h3v6h5v-9H21z"/></svg>',
    dArrow: '<svg class="arrow" viewBox="0 0 60 40"><path d="M52 20H10"/><path d="M22 8 10 20l12 12"/></svg>',
    dTrash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zM6 8h12l-1 13H7z"/><path d="M9.5 10h1.4v9H9.5zm3.6 0h1.4v9h-1.4z" fill="#fff"/></svg>',
    dHeart: '<svg viewBox="0 0 24 24"><path d="M12 20c-5-3.5-8-7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 13 17 16.5 12 20z"/></svg>',
    // tools
    eraser: '<svg viewBox="0 0 64 64"><g transform="rotate(-25 32 32)"><rect x="10" y="22" width="44" height="20" rx="6" fill="#f0f0f0" stroke="#333" stroke-width="2"/><path d="M10 28a6 6 0 0 1 6-6h12v20H16a6 6 0 0 1-6-6z" fill="#e8534a"/><path d="M36 22h12a6 6 0 0 1 6 6v8a6 6 0 0 1-6 6H36z" fill="#4a8fe8"/><rect x="10" y="22" width="44" height="20" rx="6" fill="none" stroke="#333" stroke-width="2"/></g></svg>',
    potion: '<svg viewBox="0 0 64 64"><path d="M26 8h12v14l12 22a8 8 0 0 1-7 12H21a8 8 0 0 1-7-12l12-22z" fill="#fff" stroke="#222" stroke-width="2.4" stroke-linejoin="round"/><path d="M19 34c8-3 16 5 26 0l5 10a8 8 0 0 1-7 12H21a8 8 0 0 1-7-12z" fill="#ff9ac2"/><path d="M15 44c10-4 22 4 34-2a8 8 0 0 1-7 14H21a8 8 0 0 1-7-12z" fill="#8fd6ff"/><path d="M14.5 50c12-3 24 4 35-1a8 8 0 0 1-6.5 7H21a8 8 0 0 1-6.5-6z" fill="#ffe66d"/><circle cx="30" cy="46" r="2" fill="#fff"/><circle cx="40" cy="40" r="1.6" fill="#fff"/><path d="M12 10l2 4 4 2-4 2-2 4-2-4-4-2 4-2zM54 20l1.4 2.6L58 24l-2.6 1.4L54 28l-1.4-2.6L50 24l2.6-1.4z" fill="#ffd34d" stroke="#222" stroke-width="1.2"/></svg>',
    dropper:'<svg viewBox="0 0 64 64"><path d="M44 8l12 12-6 6-2-2-22 22-10 2 2-10 22-22-2-2z" fill="#fff" stroke="#222" stroke-width="2.4" stroke-linejoin="round"/><path d="M48 14l-6 6 4 4 6-6z" fill="#222"/><path d="M16 36 20 40" stroke="#222" stroke-width="2.4"/><path d="M14 48l-6 8" stroke="#222" stroke-width="3" stroke-linecap="round"/></svg>',
    smudge: '<svg viewBox="0 0 64 64"><defs><radialGradient id="cgs" cx="40%" cy="35%"><stop offset="0" stop-color="#ffe66d"/><stop offset=".45" stop-color="#ff7ac0"/><stop offset=".8" stop-color="#7a8cff"/><stop offset="1" stop-color="#5de0ff"/></radialGradient></defs><path d="M30 6c8-2 14 4 16 10 6 2 10 8 8 14-1 6-8 8-10 14-4 6-12 6-18 2-6 2-14-2-14-9-4-5-2-13 4-16 0-7 6-13 14-15z" fill="url(#cgs)" stroke="#222" stroke-width="2"/><text x="26" y="58" font-size="30" text-anchor="middle">👆</text></svg>'
  };

  // A box of markers: a case with its lid up, a row of coloured tops inside.
  function boxSVG(set) {
    var dots = '', cols = set.colours.filter(function (c) { return c !== 'wheel' && c !== '#ffffff'; });
    for (var r = 0; r < 3; r++) for (var i = 0; i < 7; i++) {
      var col = cols[(r * 7 + i * 3) % cols.length];
      dots += '<circle cx="' + (14 + i * 6) + '" cy="' + (30 + r * 6) + '" r="2.4" fill="' + col + '"/>';
    }
    return '<svg viewBox="0 0 64 64">' +
      '<path d="M8 24h48l-4-10H12z" fill="' + set.lid + '" stroke="#222" stroke-width="2" stroke-linejoin="round"/>' +
      '<rect x="8" y="24" width="48" height="30" rx="4" fill="' + set.box + '" stroke="#222" stroke-width="2"/>' +
      '<rect x="11" y="27" width="42" height="22" rx="2" fill="#f4f4f4" stroke="#222" stroke-width="1.2"/>' +
      dots + '</svg>';
  }

  /* ── the pictures on the home page, drawn ─────────────────── */

  var PASTEL = ['#ffd6e8', '#fff3b0', '#d6f5e3', '#d6e9ff', '#ead6ff', '#ffe4c9', '#e0f7fa'];
  var EMOJI = ['🌈', '🦋', '🌸', '⭐', '🚀', '🐠', '🍦', '🎈', '🧸', '🦄', '🌻', '🐱'];
  var EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';

  // A wall of little squares: animal faces, emoji, and colouring pages, so the
  // slideshow looks like a wall of other people's pictures.
  function drawCollage(cv, seed) {
    var W = cv.width = 1120, H = cv.height = 540, c = cv.getContext('2d');
    var n = 7, t = W / n, r = seed;
    function rnd() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
    var faces = global.Animals ? global.Animals.list() : [], pics = pictures();
    for (var y = 0; y < Math.ceil(H / t); y++) for (var x = 0; x < n; x++) {
      var px = x * t, py = y * t, k = Math.floor(rnd() * 3);
      c.fillStyle = PASTEL[Math.floor(rnd() * PASTEL.length)];
      c.fillRect(px, py, t, t);
      if (k === 0 && faces.length) {
        global.Animals.draw(c, faces[Math.floor(rnd() * faces.length)].key, px + t / 2, py + t * 0.54, t * 0.3);
      } else if (k === 1 && pics.length) {
        paintLines(c, pics[Math.floor(rnd() * pics.length)], t * 0.84, t * 0.84, 2.6, px + t * 0.08, py + t * 0.08);
      } else {
        c.font = Math.round(t * 0.55) + 'px ' + EMOJI_FONT;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(EMOJI[Math.floor(rnd() * EMOJI.length)], px + t / 2, py + t * 0.55);
      }
    }
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.fillRect(0, 0, W, H);
  }

  // The SPOTLIGHT when there is nothing saved yet: a cat by a pond.
  function drawPond(cv) {
    var W = cv.width = 600, H = cv.height = 600, c = cv.getContext('2d');
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#dff3e4'); g.addColorStop(1, '#bfe6c6');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.fillStyle = '#7fcde6';
    c.beginPath(); c.ellipse(W * 0.55, H * 0.66, W * 0.42, H * 0.22, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.beginPath(); c.ellipse(W * 0.5, H * 0.62, W * 0.26, H * 0.1, 0, 0, TAU); c.fill();
    var pads = [[0.3, 0.7], [0.7, 0.75], [0.6, 0.58], [0.82, 0.62]];
    pads.forEach(function (p) {
      c.fillStyle = '#5fb86a';
      c.beginPath(); c.ellipse(W * p[0], H * p[1], 44, 26, 0, 0.3, TAU - 0.3); c.lineTo(W * p[0], H * p[1]); c.fill();
      c.fillStyle = '#ff9ac2';
      c.beginPath(); c.arc(W * p[0] + 6, H * p[1] - 18, 12, 0, TAU); c.fill();
    });
    c.strokeStyle = '#5c8a3a'; c.lineWidth = 8; c.lineCap = 'round';
    [0.14, 0.2, 0.9].forEach(function (x) {
      c.beginPath(); c.moveTo(W * x, H * 0.55); c.lineTo(W * x + 6, H * 0.2); c.stroke();
      c.fillStyle = '#8a5a2b'; c.beginPath(); c.ellipse(W * x + 6, H * 0.2, 12, 34, 0, 0, TAU); c.fill();
    });
    if (global.Animals) global.Animals.draw(c, 'tiger', W * 0.25, H * 0.38, 86);
    c.font = '70px ' + EMOJI_FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('🐸', W * 0.45, H * 0.82); c.fillText('🦋', W * 0.72, H * 0.3); c.fillText('🌸', W * 0.08, H * 0.88);
  }

  // A colouring page on a soft background, for the fourth tile.
  function drawPage(cv, pic, bg) {
    var W = cv.width = 600, H = cv.height = 600, c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    if (pic) paintLines(c, pic, W * 0.84, H, 2.6, W * 0.08, 0.01);
  }

  /* ══════════════════════════════════════════════════════════
     THE CANVAS — the editor
     ══════════════════════════════════════════════════════════ */

  var Editor = {
    el: null, ctx: null, lines: null, lctx: null, wall: null,
    pic: null,              // the colouring page open, or null for the free canvas
    tool: 'pen',            // pen | eraser | fill | dropper | smudge
    colour: hsl(52, 100, 84),
    size: 3,
    set: 0,
    undo: [], redo: [],
    stroke: null, pointer: null,
    saveTimer: 0,

    build: function (root) {
      var self = this;
      var ed = document.createElement('div');
      ed.className = 'cg-editor'; ed.hidden = true;
      ed.innerHTML =
        '<div class="cg-ed-top">' +
          '<button class="cg-pill cg-pill--sq" data-ed="home" aria-label="home">' + I.edHome + '</button>' +
          '<button class="cg-pill cg-pill--sq" data-ed="clear" aria-label="clear the page">' + I.trash + '</button>' +
          '<button class="cg-pill cg-pill--sq" data-ed="undo" aria-label="undo">' + I.undo + '</button>' +
          '<button class="cg-pill cg-pill--sq" data-ed="redo" aria-label="redo">' + I.redo + '</button>' +
          '<button class="cg-pill cg-save" data-ed="save">' + I.check + ' Save</button>' +
        '</div>' +
        '<div class="cg-stage"><canvas class="cg-paint"></canvas><canvas class="cg-lines"></canvas></div>' +
        '<div class="cg-ed-colours">' +
          '<div class="cg-sizes">' +
            '<button class="cg-size" data-size="3" aria-label="extra large brush"></button>' +
            '<button class="cg-size" data-size="2" aria-label="large brush"></button>' +
            '<button class="cg-size" data-size="1" aria-label="medium brush"></button>' +
            '<button class="cg-size" data-size="0" aria-label="small brush"></button>' +
          '</div>' +
          '<div class="cg-strip"></div>' +
        '</div>' +
        '<div class="cg-ed-tools"><div class="cg-tools">' +
          '<button class="cg-tool" data-tool="eraser" aria-label="rubber">' + I.eraser + '</button>' +
          '<button class="cg-tool" data-tool="fill" aria-label="potion: fill a patch">' + I.potion + '</button>' +
          '<button class="cg-tool" data-tool="dropper" aria-label="pick a colour from the page">' + I.dropper + '</button>' +
          '<button class="cg-tool" data-tool="smudge" aria-label="smudge">' + I.smudge + '</button>' +
          SETS.map(function (s, i) {
            return '<button class="cg-tool cg-tool--set" data-set="' + i + '" aria-label="' + s.name + '">' + boxSVG(s) + '</button>';
          }).join('') +
        '</div></div>';
      root.appendChild(ed);
      this.el = ed;
      this.stage = ed.querySelector('.cg-stage');
      this.canvas = ed.querySelector('.cg-paint');
      this.lines = ed.querySelector('.cg-lines');
      this.canvas.width = this.canvas.height = SIZE;
      this.lines.width = this.lines.height = SIZE;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.lctx = this.lines.getContext('2d', { willReadFrequently: true });
      this.strip = ed.querySelector('.cg-strip');

      ed.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b) return;
        if (b.hasAttribute('data-ed')) self.action(b.getAttribute('data-ed'));
        else if (b.hasAttribute('data-size')) { self.size = +b.getAttribute('data-size'); self.pickTool('pen', true); sfx('tick'); }
        else if (b.hasAttribute('data-tool')) { self.pickTool(b.getAttribute('data-tool')); sfx('tick'); }
        else if (b.hasAttribute('data-set')) { self.pickSet(+b.getAttribute('data-set')); sfx('tick'); }
        else if (b.hasAttribute('data-colour')) { self.pickColour(b.getAttribute('data-colour')); sfx('tick'); }
      });
      // The wheel is an <input type=color> behind the rainbow circle.
      this.strip.addEventListener('input', function (e) {
        if (e.target && e.target.type === 'color') self.pickColour(e.target.value);
      });

      this.stage.addEventListener('pointerdown', function (e) { self.down(e); });
      this.stage.addEventListener('pointermove', function (e) { self.move(e); });
      this.stage.addEventListener('pointerup', function (e) { self.up(e); });
      this.stage.addEventListener('pointercancel', function (e) { self.up(e); });
      this.stage.addEventListener('touchstart', function (e) { e.preventDefault(); }, { passive: false });
      this.stage.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });

      this.pickSet(0);
      this.pickTool('pen');
    },

    /* ── opening a page ──────────────────────────────────────── */

    open: function (picId) {
      var self = this;
      this.pic = picId ? picture(picId) : null;
      this.undo = []; this.redo = [];
      this.el.hidden = false;
      this.fit();
      this.drawLines();
      // A white page, then whatever she left on it last time.
      var c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#fff'; c.fillRect(0, 0, SIZE, SIZE);
      var kept = load(this.pic ? K.pic + this.pic.id : K.wip, null);
      if (kept) {
        var img = new Image();
        img.onload = function () { if (!self.el.hidden) c.drawImage(img, 0, 0, SIZE, SIZE); };
        img.src = kept;
      }
      this.pickTool('pen');
      this.buttons();
    },

    close: function () {
      this.flushSave();
      this.el.hidden = true;
      this.stroke = null; this.pointer = null;
    },

    fit: function () {
      var w = this.stage.clientWidth, h = this.stage.clientHeight;
      var s = Math.max(100, Math.min(w - 24, h - 24));
      this.canvas.style.width = this.lines.style.width = s + 'px';
      this.canvas.style.height = this.lines.style.height = s + 'px';
      this.scale = s / SIZE;
    },

    drawLines: function () {
      var lc = this.lctx;
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, SIZE, SIZE);
      this.wall = null;
      if (!this.pic) return;
      paintLines(lc, this.pic, SIZE, SIZE, 2.2);
      // Where the lines are, so a fill knows where to stop.
      var px = lc.getImageData(0, 0, SIZE, SIZE).data, wall = new Uint8Array(SIZE * SIZE);
      for (var i = 0, j = 3; i < wall.length; i++, j += 4) wall[i] = px[j] > 110 ? 1 : 0;
      this.wall = wall;
    },

    /* ── the controls ────────────────────────────────────────── */

    pickSet: function (i) {
      var self = this;
      this.set = i;
      var set = SETS[i];
      this.strip.innerHTML = set.colours.map(function (col) {
        if (col === 'wheel') {
          return '<button class="cg-swatch cg-swatch--wheel" type="button" aria-label="any colour">' +
                 '<input type="color" value="#ff66aa" aria-label="pick any colour"></button>';
        }
        return '<button class="cg-swatch" type="button" data-colour="' + col + '" style="background:' + col + '" aria-label="colour"></button>';
      }).join('');
      this.strip.scrollLeft = 0;
      var sets = this.el.querySelectorAll('[data-set]');
      for (var k = 0; k < sets.length; k++) sets[k].classList.toggle('is-on', k === i);
      this.markColour();
      // Swapping the box is a way of picking a colour, so it is the pen again.
      if (this.tool !== 'pen') this.pickTool('pen', true);
      self.strip.scrollTo && self.strip.scrollTo({ left: 0 });
    },

    pickColour: function (col) {
      this.colour = col;
      this.markColour();
      this.pickTool('pen', true);
    },

    markColour: function () {
      var sw = this.strip.querySelectorAll('[data-colour]');
      for (var i = 0; i < sw.length; i++) sw[i].classList.toggle('is-on', sw[i].getAttribute('data-colour') === this.colour);
      this.el.style.setProperty('--cg-cur', this.colour);
      var sizes = this.el.querySelectorAll('[data-size]');
      for (var k = 0; k < sizes.length; k++) sizes[k].classList.toggle('is-on', +sizes[k].getAttribute('data-size') === this.size);
    },

    pickTool: function (t, quiet) {
      this.tool = t;
      var tools = this.el.querySelectorAll('[data-tool]');
      for (var i = 0; i < tools.length; i++) tools[i].classList.toggle('is-on', tools[i].getAttribute('data-tool') === t);
      this.markColour();
      if (!quiet && App.running) {
        var hint = { eraser: 'Rubber: rub it out', fill: 'Potion: tap a patch to fill it', dropper: 'Dropper: tap a colour on the page', smudge: 'Smudge: rub to blend' }[t];
        if (hint) App.toast(hint);
      }
    },

    buttons: function () {
      var u = this.el.querySelector('[data-ed="undo"]'), r = this.el.querySelector('[data-ed="redo"]');
      if (u) u.disabled = !this.undo.length;
      if (r) r.disabled = !this.redo.length;
    },

    action: function (what) {
      var self = this;
      sfx('tick');
      if (what === 'home') {
        App.dialog({ icon: I.dHome + I.dArrow, title: 'GO BACK HOME?', no: 'NO', yes: 'YES',
                     onYes: function () { App.closeEditor(); } });
      } else if (what === 'clear') {
        App.dialog({ icon: I.dTrash, title: 'CLEAR THE PAGE?', no: 'NO', yes: 'YES',
                     onYes: function () { self.snapshot(); self.ctx.fillStyle = '#fff'; self.ctx.fillRect(0, 0, SIZE, SIZE); self.changed(); } });
      } else if (what === 'undo') {
        if (!this.undo.length) return;
        this.redo.push(this.ctx.getImageData(0, 0, SIZE, SIZE));
        this.ctx.putImageData(this.undo.pop(), 0, 0);
        this.changed();
      } else if (what === 'redo') {
        if (!this.redo.length) return;
        this.undo.push(this.ctx.getImageData(0, 0, SIZE, SIZE));
        this.ctx.putImageData(this.redo.pop(), 0, 0);
        this.changed();
      } else if (what === 'save') {
        App.saveToGallery(this.composite(1000), this.pic ? 'saved' : 'canvas', this.pic && this.pic.id);
        sfx('win');
        App.toast('Saved to Gallery ✓');
      }
    },

    // Before anything that changes the page: keep a copy to go back to.
    snapshot: function () {
      this.undo.push(this.ctx.getImageData(0, 0, SIZE, SIZE));
      while (this.undo.length > UNDO_MAX) this.undo.shift();
      this.redo = [];
    },

    // After anything that changed it: the buttons, and the copy on disk.
    changed: function () {
      var self = this;
      this.buttons();
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(function () { self.flushSave(); }, 700);
    },

    flushSave: function () {
      clearTimeout(this.saveTimer);
      if (!this.ctx) return;
      var key = this.pic ? K.pic + this.pic.id : K.wip;
      var url;
      try { url = this.canvas.toDataURL('image/jpeg', 0.92); } catch (e) { return; }
      if (!save(key, url)) {
        // Out of room: the oldest saved pictures go before her work does.
        App.trimGallery(5);
        save(key, url);
      }
    },

    // The finished picture: the page with the outlines on top, at a size that
    // fits in localStorage thirty times over.
    composite: function (px) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = px;
      var c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, px, px);
      c.drawImage(this.canvas, 0, 0, px, px);
      c.drawImage(this.lines, 0, 0, px, px);
      try { return cv.toDataURL('image/jpeg', 0.88); } catch (e) { return cv.toDataURL(); }
    },

    /* ── the finger ──────────────────────────────────────────── */

    at: function (e) {
      var r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
    },

    down: function (e) {
      if (this.pointer !== null) return;             // one finger at a time
      if (e.button && e.button !== 0) return;
      var p = this.at(e);
      if (p.x < -40 || p.y < -40 || p.x > SIZE + 40 || p.y > SIZE + 40) return;
      this.pointer = e.pointerId;
      try { this.stage.setPointerCapture(e.pointerId); } catch (x) {}
      var t = this.tool;
      if (t === 'dropper') {
        this.dropper(p);
        this.pointer = null;
        return;
      }
      if (t === 'fill') {
        this.snapshot();
        this.fill(p);
        this.changed();
        this.pointer = null;
        return;
      }
      this.snapshot();
      this.stroke = { last: p, mid: p, n: 0 };
      if (t === 'smudge') { this.smudge(p); return; }
      // A tap is a dot.
      var c = this.ctx;
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = t === 'eraser' ? '#fff' : this.colour;
      c.beginPath(); c.arc(p.x, p.y, BRUSH[this.size] / 2, 0, TAU); c.fill();
    },

    move: function (e) {
      if (e.pointerId !== this.pointer || !this.stroke) return;
      var p = this.at(e), s = this.stroke;
      if (this.tool === 'smudge') {
        // Smudge every few pixels along the way, not just where the events land.
        var dx = p.x - s.last.x, dy = p.y - s.last.y, d = Math.sqrt(dx * dx + dy * dy);
        var step = Math.max(4, BRUSH[this.size] * 0.35), n = Math.max(1, Math.floor(d / step));
        for (var i = 1; i <= n; i++) this.smudge({ x: s.last.x + dx * i / n, y: s.last.y + dy * i / n });
        s.last = p;
        return;
      }
      var c = this.ctx;
      var mid = { x: (s.last.x + p.x) / 2, y: (s.last.y + p.y) / 2 };
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = this.tool === 'eraser' ? '#fff' : this.colour;
      c.lineWidth = BRUSH[this.size];
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(s.mid.x, s.mid.y);
      c.quadraticCurveTo(s.last.x, s.last.y, mid.x, mid.y);
      c.stroke();
      s.last = p; s.mid = mid; s.n++;
    },

    up: function (e) {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      if (this.stroke) { this.stroke = null; this.changed(); }
    },

    dropper: function (p) {
      var x = clamp(Math.round(p.x), 0, SIZE - 1), y = clamp(Math.round(p.y), 0, SIZE - 1);
      var d = this.ctx.getImageData(x, y, 1, 1).data;
      var hex = '#' + [d[0], d[1], d[2]].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
      this.pickColour(hex);
      App.toast('Got it!');
      sfx('tick');
    },

    // Blend the paint under the finger: a soft blur, strongest in the middle
    // of the circle and nothing at its edge, so it looks rubbed, not boxed.
    smudge: function (p) {
      var r = Math.round(BRUSH[this.size] * 0.9 + 6), D = r * 2;
      var x0 = Math.round(p.x) - r, y0 = Math.round(p.y) - r;
      if (x0 + D <= 0 || y0 + D <= 0 || x0 >= SIZE || y0 >= SIZE) return;
      var c = this.ctx, img = c.getImageData(x0, y0, D, D), src = img.data;
      var out = new Uint8ClampedArray(src), tmp = new Uint8ClampedArray(src.length);
      var k = Math.max(2, Math.round(r / 3)), W = D, H = D, x, y, ch, sum, cnt, i, j;
      // Horizontal then vertical box blur.
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) for (ch = 0; ch < 3; ch++) {
        sum = 0; cnt = 0;
        for (i = -k; i <= k; i++) { j = x + i; if (j >= 0 && j < W) { sum += src[(y * W + j) * 4 + ch]; cnt++; } }
        tmp[(y * W + x) * 4 + ch] = sum / cnt;
      }
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        var dx = x - r, dy = y - r, t = 1 - Math.sqrt(dx * dx + dy * dy) / r;
        if (t <= 0) continue;
        t = Math.min(1, t * 1.6) * 0.85;
        for (ch = 0; ch < 3; ch++) {
          sum = 0; cnt = 0;
          for (i = -k; i <= k; i++) { j = y + i; if (j >= 0 && j < H) { sum += tmp[(j * W + x) * 4 + ch]; cnt++; } }
          var o = (y * W + x) * 4 + ch;
          out[o] = src[o] + (sum / cnt - src[o]) * t;
        }
      }
      img.data.set(out);
      c.putImageData(img, x0, y0);
    },

    // The potion: flood the patch under the finger with the colour, stopping
    // at the outlines and at anything of a different colour.
    fill: function (p) {
      var W = SIZE, H = SIZE, wall = this.wall;
      var sx = clamp(Math.round(p.x), 0, W - 1), sy = clamp(Math.round(p.y), 0, H - 1);
      if (wall) {
        // A tap on a line fills the nearest open patch, so aiming need not be exact.
        var found = null;
        for (var rr = 0; rr <= 10 && !found; rr++) {
          for (var yy = -rr; yy <= rr && !found; yy++) for (var xx = -rr; xx <= rr; xx++) {
            var qx = sx + xx, qy = sy + yy;
            if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
            if (!wall[qy * W + qx]) { found = [qx, qy]; break; }
          }
        }
        if (!found) return;
        sx = found[0]; sy = found[1];
      }
      var c = this.ctx, img = c.getImageData(0, 0, W, H), d = img.data;
      var i0 = (sy * W + sx) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2];
      var col = this.rgb(this.colour), TOL = 48 * 48 * 3;
      if (Math.abs(col[0] - r0) + Math.abs(col[1] - g0) + Math.abs(col[2] - b0) < 6) return;   // already that colour
      var seen = new Uint8Array(W * H), stack = [sx, sy];
      function same(i) {
        var dr = d[i] - r0, dg = d[i + 1] - g0, db = d[i + 2] - b0;
        return dr * dr + dg * dg + db * db <= TOL;
      }
      while (stack.length) {
        var y = stack.pop(), x = stack.pop(), idx = y * W + x;
        if (seen[idx]) continue;
        // Walk left to the edge of the patch, then paint rightwards.
        while (x > 0 && !seen[idx - 1] && !(wall && wall[idx - 1]) && same((idx - 1) * 4)) { x--; idx--; }
        var up = false, dn = false;
        while (x < W && !seen[idx] && !(wall && wall[idx]) && same(idx * 4)) {
          seen[idx] = 1;
          d[idx * 4] = col[0]; d[idx * 4 + 1] = col[1]; d[idx * 4 + 2] = col[2]; d[idx * 4 + 3] = 255;
          if (y > 0) {
            var a = idx - W, ok = !seen[a] && !(wall && wall[a]) && same(a * 4);
            if (ok && !up) { stack.push(x, y - 1); up = true; } else if (!ok) up = false;
          }
          if (y < H - 1) {
            var bb = idx + W, ok2 = !seen[bb] && !(wall && wall[bb]) && same(bb * 4);
            if (ok2 && !dn) { stack.push(x, y + 1); dn = true; } else if (!ok2) dn = false;
          }
          x++; idx++;
        }
      }
      c.putImageData(img, 0, 0);
    },

    rgb: function (col) {
      var cv = document.createElement('canvas'); cv.width = cv.height = 1;
      var c = cv.getContext('2d');
      c.fillStyle = col; c.fillRect(0, 0, 1, 1);
      var d = c.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    }
  };

  /* ══════════════════════════════════════════════════════════
     THE APP — home, colour, feed, gallery, settings
     ══════════════════════════════════════════════════════════ */

  var App = {
    running: false,
    root: null, opts: {},
    page: 'home', tab: 'saved',
    slide: 0, slideTimer: 0,

    open: function (opts) {
      var self = this;
      this.opts = opts || {};
      ensureFonts();
      if (!this.root) this.build(this.opts.root);
      this.root.hidden = false;
      this.running = true;
      this.go('home');
      this.user();
      if (!this._resize) {
        this._resize = function () { if (!Editor.el.hidden) Editor.fit(); };
        global.addEventListener('resize', this._resize);
      }
      if (this.opts.page === 'canvas') this.openEditor(null);
      return self;
    },

    close: function () {
      this.closeEditor();
      clearInterval(this.slideTimer);
      this.running = false;
      if (this.root) this.root.hidden = true;
    },

    exit: function () {
      sfx('tick');
      this.close();
      if (this.opts.onExit) this.opts.onExit();
    },

    build: function (root) {
      var self = this;
      root.classList.add('cg');
      root.innerHTML =
        '<div class="cg-app">' +
          '<header class="cg-head">' +
            '<button class="cg-exit" data-go="exit" aria-label="Exit to Roar Battle">✕ EXIT</button>' +
            '<div class="cg-logo"><b>Color</b>Goods<sup>™</sup><small>.com</small></div>' +
            '<button class="cg-signin" data-go="signin"><span class="cg-user">SIGN IN</span><i class="cg-avatar"></i></button>' +
          '</header>' +
          '<div class="cg-pages">' +
            '<section class="cg-page" data-page="home"><div class="cg-col"></div></section>' +
            '<section class="cg-page" data-page="color"><div class="cg-col"></div></section>' +
            '<section class="cg-page" data-page="feed"><div class="cg-col"></div></section>' +
            '<section class="cg-page" data-page="gallery"><div class="cg-col"></div></section>' +
            '<section class="cg-page" data-page="settings"><div class="cg-col"></div></section>' +
          '</div>' +
          '<nav class="cg-nav">' +
            '<button data-nav="home">' + I.home + 'HOME</button>' +
            '<button data-nav="color">' + I.color + 'COLOR</button>' +
            '<button data-nav="feed">' + I.feed + 'FEED</button>' +
            '<button data-nav="gallery">' + I.gallery + 'GALLERY</button>' +
            '<button data-nav="settings">' + I.settings + 'SETTINGS</button>' +
          '</nav>' +
        '</div>' +
        '<div class="cg-toast"></div>';
      this.root = root;
      this.toastEl = root.querySelector('.cg-toast');
      Editor.build(root);

      root.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-nav],[data-go],[data-act]') : null;
        if (!b || !root.contains(b)) return;
        if (b.hasAttribute('data-nav')) { sfx('tick'); self.go(b.getAttribute('data-nav')); }
        else if (b.hasAttribute('data-go')) self.doGo(b.getAttribute('data-go'), b);
        else if (b.hasAttribute('data-act')) self.doAct(b.getAttribute('data-act'), b);
      });
    },

    go: function (page) {
      this.page = page;
      var pages = this.root.querySelectorAll('.cg-page');
      for (var i = 0; i < pages.length; i++) pages[i].classList.toggle('is-on', pages[i].getAttribute('data-page') === page);
      var nav = this.root.querySelectorAll('[data-nav]');
      for (var k = 0; k < nav.length; k++) nav[k].classList.toggle('is-on', nav[k].getAttribute('data-nav') === page);
      clearInterval(this.slideTimer);
      if (page === 'home') this.renderHome();
      else if (page === 'color') this.renderColor();
      else if (page === 'feed') this.renderFeed();
      else if (page === 'gallery') this.renderGallery();
      else if (page === 'settings') this.renderSettings();
      var sec = this.root.querySelector('.cg-page.is-on');
      if (sec) sec.scrollTop = 0;
    },

    doGo: function (where, b) {
      sfx('tick');
      if (where === 'exit') return this.exit();
      if (where === 'signin') return this.signIn();
      if (where === 'canvas') return this.openEditor(null);
      if (where === 'pic') return this.openEditor(b.getAttribute('data-pic'));
      if (where === 'tab') { this.tab = b.getAttribute('data-tab'); return this.renderGallery(); }
      if (where === 'gallery') { this.tab = b.getAttribute('data-tab') || this.tab; return this.go('gallery'); }
      this.go(where);
    },

    /* ── home ────────────────────────────────────────────────── */

    SLIDES: [
      { id: 'color', kicker: 'ColorGoods', title: 'Color', text: 'Pages to colour in.', seed: 11, go: 'color' },
      { id: 'spot', kicker: 'ColorGoods', title: 'Spotlight', text: 'Your newest picture.', seed: 23, go: 'gallery' },
      { id: 'replay', replay: true, go: 'home' },
      { id: 'canvas', kicker: 'ColorGoods', title: 'Canvas', text: 'Your cozy space for new Creations.', seed: 7, go: 'canvas' },
      { id: 'feed', kicker: 'ColorGoods', title: 'Feed', text: 'Everything you have made.', seed: 31, go: 'feed' },
      { id: 'gallery', kicker: 'ColorGoods', title: 'Gallery', text: 'Saved, Canvas and Drawing.', seed: 41, go: 'gallery' },
      { id: 'signin', kicker: 'ColorGoods', title: 'Sign in', text: 'Pick your name and your face.', seed: 53, go: 'signin' }
    ],

    renderHome: function () {
      var self = this, box = this.root.querySelector('[data-page="home"] .cg-col');
      var gal = this.gallery(), latest = gal[0];
      var pics = pictures();
      box.innerHTML =
        '<div class="cg-hero"><div class="cg-hero-track">' +
          this.SLIDES.map(function (s) {
            if (s.replay) {
              return '<div class="cg-slide cg-slide--replay" data-go="home"><div class="cg-play">' + I.play + '</div>' +
                     '<b>REPLAY</b><small>COMING SOON</small></div>';
            }
            return '<div class="cg-slide" data-go="' + s.go + '"><canvas></canvas>' +
                   '<div class="cg-slide-card"><i>' + s.kicker + '<sup>™</sup></i><b>' + s.title + '</b><p>' + s.text + '</p></div></div>';
          }).join('') +
        '</div></div>' +
        '<div class="cg-dots">' + this.SLIDES.map(function () { return '<i></i>'; }).join('') + '</div>' +
        '<div class="cg-grid">' +
          '<button class="cg-tile" data-go="gallery" data-tab="' + (latest && latest.kind === 'saved' ? 'saved' : 'canvas') + '" aria-label="spotlight">' +
            (latest ? '<img src="' + latest.img + '" alt="">' : '<canvas data-draw="pond"></canvas>') +
            '<span class="cg-badge">' + I.heart + ' SPOTLIGHT</span>' +
          '</button>' +
          '<button class="cg-tile cg-tile--line" data-go="canvas"><b>Canvas</b></button>' +
          '<div class="cg-tile cg-tile--text"><p>Join the fun! Follow us on TikTok.</p><span class="cg-tiktok">' + I.tiktok + '</span></div>' +
          '<button class="cg-tile" data-go="color" aria-label="colour a page"><canvas data-draw="page"></canvas></button>' +
        '</div>';

      // The pictures, painted now the canvases exist.
      var slides = box.querySelectorAll('.cg-slide canvas');
      for (var i = 0, k = 0; i < this.SLIDES.length; i++) {
        if (this.SLIDES[i].replay) continue;
        drawCollage(slides[k++], this.SLIDES[i].seed);
      }
      var pond = box.querySelector('[data-draw="pond"]');
      if (pond) drawPond(pond);
      var page = box.querySelector('[data-draw="page"]');
      if (page) drawPage(page, picture('dino') || pics[0], '#ead6ff');

      // The slideshow: swipe it, tap it, or leave it to turn by itself.
      var hero = box.querySelector('.cg-hero'), track = box.querySelector('.cg-hero-track');
      var dots = box.querySelectorAll('.cg-dots i');
      this.slide = 3;
      function show(n, snap) {
        self.slide = (n + self.SLIDES.length) % self.SLIDES.length;
        track.style.transition = snap ? 'none' : '';
        track.style.transform = 'translateX(' + (-self.slide * 100) + '%)';
        for (var d = 0; d < dots.length; d++) dots[d].classList.toggle('is-on', d === self.slide);
      }
      show(this.slide, true);
      function arm() { clearInterval(self.slideTimer); self.slideTimer = setInterval(function () { show(self.slide + 1); }, 4500); }
      arm();
      var sx = 0, sy = 0, dx = 0, swiping = false;
      hero.addEventListener('touchstart', function (e) {
        var t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; swiping = false;
        clearInterval(self.slideTimer);
        track.style.transition = 'none';
      }, { passive: true });
      hero.addEventListener('touchmove', function (e) {
        var t = e.touches[0]; dx = t.clientX - sx;
        if (!swiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(t.clientY - sy)) swiping = true;
        if (swiping) track.style.transform = 'translateX(calc(' + (-self.slide * 100) + '% + ' + dx + 'px))';
      }, { passive: true });
      hero.addEventListener('touchend', function () {
        track.style.transition = '';
        if (swiping && Math.abs(dx) > 40) show(self.slide + (dx < 0 ? 1 : -1)); else show(self.slide);
        if (swiping) { hero.dataset.swiped = '1'; setTimeout(function () { delete hero.dataset.swiped; }, 50); }
        arm();
      });
      hero.addEventListener('click', function (e) { if (hero.dataset.swiped) { e.stopPropagation(); e.preventDefault(); } }, true);
    },

    /* ── colour: the pages ───────────────────────────────────── */

    renderColor: function () {
      var box = this.root.querySelector('[data-page="color"] .cg-col');
      var pics = pictures(), done = {};
      this.gallery().forEach(function (g) { if (g.pic) done[g.pic] = 1; });
      if (!pics.length) { box.innerHTML = '<div class="cg-empty">No pages to colour yet.</div>'; return; }
      box.innerHTML = '<div class="cg-h">PICK A PAGE TO COLOR</div><div class="cg-pics">' +
        pics.map(function (p) {
          return '<button class="cg-pic' + (done[p.id] ? ' is-done' : '') + '" data-go="pic" data-pic="' + p.id + '" aria-label="' + esc(p.name) + '"><canvas></canvas></button>';
        }).join('') + '</div>';
      var cvs = box.querySelectorAll('.cg-pic canvas');
      for (var i = 0; i < cvs.length; i++) {
        cvs[i].width = 200; cvs[i].height = 260;
        paintLines(cvs[i].getContext('2d'), pics[i], 200, 260, 2.4);
      }
    },

    /* ── the gallery ─────────────────────────────────────────── */

    gallery: function () {
      var g = json(K.gallery, []);
      return Array.isArray(g) ? g : [];
    },
    putGallery: function (g) {
      while (g.length) {
        if (save(K.gallery, JSON.stringify(g))) return true;
        g.pop();                   // out of room: the oldest goes
      }
      return false;
    },
    saveToGallery: function (url, kind, pic) {
      var g = this.gallery();
      g.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: kind, pic: pic || null, img: url, at: Date.now(), likes: 0, liked: false });
      while (g.length > GAL_MAX) g.pop();
      this.putGallery(g);
    },
    trimGallery: function (n) {
      var g = this.gallery();
      g.splice(Math.max(0, g.length - n), n);
      this.putGallery(g);
    },
    drawGallery: function () {
      var g = json(K.drawGal, []);
      return Array.isArray(g) ? g.map(function (it, i) { return { id: 'd' + i, kind: 'drawing', img: it.img, at: it.at || 0, likes: 0 }; }) : [];
    },

    renderGallery: function () {
      var self = this, box = this.root.querySelector('[data-page="gallery"] .cg-col');
      var tab = this.tab, list;
      if (tab === 'drawing') list = this.drawGallery();
      else list = this.gallery().filter(function (g) { return g.kind === tab; });
      var empty = { saved: 'Nothing saved yet.<br>Pick a page in COLOR, colour it in, and tap Save!',
                    canvas: 'Nothing here yet.<br>Make something on the Canvas and tap Save!',
                    drawing: 'Nothing here yet.<br>Pictures from the DRAWING game show up here.' }[tab];
      box.innerHTML =
        '<div class="cg-tabs">' +
          ['saved', 'canvas', 'drawing'].map(function (t) {
            return '<button class="cg-pill' + (t === tab ? ' is-on' : '') + '" data-go="tab" data-tab="' + t + '">' + t.toUpperCase() + '</button>';
          }).join('') +
        '</div>' +
        (list.length ? '<div class="cg-cards">' + list.map(function (it) {
          return '<div class="cg-card" data-id="' + it.id + '">' +
            '<button class="cg-card-img" data-act="open" aria-label="open this picture"><img src="' + it.img + '" alt=""></button>' +
            '<div class="cg-card-row">' +
              '<button class="cg-pill cg-pill--sq" data-act="download" aria-label="download">' + I.down + '</button>' +
              '<button class="cg-pill cg-pill--sq" data-act="delete" aria-label="delete">' + I.trash + '</button>' +
              '<button class="cg-pill cg-share" data-act="share">' + I.heart.replace('<svg', '<svg fill="none" stroke-width="2"') + ' SHARE</button>' +
            '</div></div>';
        }).join('') + '</div>'
        : '<div class="cg-empty">' + empty + (tab === 'canvas' ? '<br><button class="cg-pill cg-pill--ink" data-go="canvas">OPEN THE CANVAS</button>' : '') + '</div>');
      self.list = list;
    },

    doAct: function (act, b) {
      var self = this, card = b.closest('.cg-card,.cg-post'), id = card && card.getAttribute('data-id');
      var it = null, list = this.list || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) it = list[i];
      if (!it) return;
      sfx('tick');
      if (act === 'share') {
        if (!shareImage(it.img, 'colorgoods.jpg')) this.toast('Press and hold the picture to save it');
      } else if (act === 'download') {
        downloadImage(it.img, 'colorgoods-' + it.id + '.jpg');
        this.toast('Downloading…');
      } else if (act === 'delete') {
        this.dialog({ icon: I.dTrash, title: 'DELETE THIS PICTURE?', no: 'NO', yes: 'YES', onYes: function () {
          if (it.kind === 'drawing') {
            var g = json(K.drawGal, []), n = +it.id.slice(1);
            if (Array.isArray(g)) { g.splice(n, 1); save(K.drawGal, JSON.stringify(g)); }
          } else {
            self.putGallery(self.gallery().filter(function (x) { return x.id !== it.id; }));
          }
          self.go(self.page);
        } });
      } else if (act === 'open') {
        this.openEditor(it.pic || null, it.img);
      } else if (act === 'like') {
        var g = this.gallery();
        for (var k = 0; k < g.length; k++) if (g[k].id === it.id) {
          g[k].liked = !g[k].liked; g[k].likes = Math.max(0, (g[k].likes || 0) + (g[k].liked ? 1 : -1));
          b.classList.toggle('is-on', g[k].liked);
          b.querySelector('span').textContent = g[k].likes || '';
        }
        this.putGallery(g);
        this.list = g;
      }
    },

    /* ── the feed ────────────────────────────────────────────── */

    renderFeed: function () {
      var box = this.root.querySelector('[data-page="feed"] .cg-col');
      var u = json(K.user, null), name = (u && u.name) || 'ME', face = u && u.face && global.Animals ? global.Animals.avatar(u.face, { color: '#ffd6e8', glow: '#fff3b0' }) : '';
      var list = this.gallery();
      this.list = list;
      if (!list.length) {
        box.innerHTML = '<div class="cg-empty">Nothing in the feed yet.<br>Every picture you save shows up here.' +
                        '<br><button class="cg-pill cg-pill--ink" data-go="canvas">OPEN THE CANVAS</button></div>';
        return;
      }
      box.innerHTML = list.map(function (it) {
        return '<div class="cg-post" data-id="' + it.id + '">' +
          '<div class="cg-post-head"><i class="cg-avatar' + (face ? ' has-face' : '') + '"' + (face ? ' style="background-image:url(' + face + ')"' : '') + '></i>' +
          '<b>' + esc(name.toUpperCase()) + '</b><small>' + ago(it.at) + '</small></div>' +
          '<img src="' + it.img + '" alt="">' +
          '<div class="cg-post-row"><button class="cg-like' + (it.liked ? ' is-on' : '') + '" data-act="like">' + I.heart + '<span>' + (it.likes || '') + '</span></button>' +
          '<button class="cg-pill cg-pill--sq" data-act="share" aria-label="share">' + I.down + '</button></div>' +
        '</div>';
      }).join('');
    },

    /* ── settings ────────────────────────────────────────────── */

    renderSettings: function () {
      var self = this, box = this.root.querySelector('[data-page="settings"] .cg-col');
      var u = json(K.user, null), standalone = !!(navigator.standalone || (global.matchMedia && matchMedia('(display-mode: standalone)').matches));
      box.innerHTML = '<div class="cg-set">' +
        '<button class="cg-pill" data-set="sound">SOUND <span>' + (load(K.sound, 'on') === 'off' ? 'off' : 'on') + '</span></button>' +
        '<button class="cg-pill" data-go="signin">' + (u ? 'SIGNED IN AS ' + esc(u.name.toUpperCase()) : 'SIGN IN') + ' <span>' + (u ? 'change' : 'name + face') + '</span></button>' +
        (u ? '<button class="cg-pill" data-set="signout">SIGN OUT</button>' : '') +
        '<button class="cg-pill" data-set="clear-page">CLEAR THE CANVAS <span>start fresh</span></button>' +
        '<button class="cg-pill cg-pill--warn" data-set="clear-all">DELETE ALL PICTURES</button>' +
        (this.opts.standaloneURL && !standalone ? '<button class="cg-pill cg-pill--ink" data-set="own">OPEN AS ITS OWN APP <span>for the home screen</span></button>' : '') +
        '<p>' + (standalone ? 'You are running from the home screen. ✓' :
          'To put just this app on the home screen: ' + (this.opts.standaloneURL ? 'tap OPEN AS ITS OWN APP, then ' : '') +
          'tap Share in Safari and choose <b>Add to Home Screen</b>. It opens full screen, straight into ColorGoods.') + '</p>' +
        '<p>Pictures live on this phone only — nothing is uploaded anywhere.</p>' +
        '<button class="cg-pill" data-go="exit">✕ BACK TO ROAR BATTLE</button>' +
      '</div>';
      box.onclick = function (e) {
        var b = e.target.closest ? e.target.closest('[data-set]') : null;
        if (!b) return;
        var what = b.getAttribute('data-set');
        sfx('tick');
        if (what === 'sound') { save(K.sound, load(K.sound, 'on') === 'off' ? 'on' : 'off'); self.renderSettings(); }
        else if (what === 'signout') { drop(K.user); self.user(); self.renderSettings(); }
        else if (what === 'own') { location.href = self.opts.standaloneURL; }
        else if (what === 'clear-page') {
          self.dialog({ icon: I.dTrash, title: 'CLEAR THE CANVAS?', onYes: function () { drop(K.wip); self.toast('Canvas cleared'); } });
        } else if (what === 'clear-all') {
          self.dialog({ icon: I.dTrash, title: 'DELETE ALL PICTURES?', onYes: function () {
            drop(K.gallery); drop(K.wip);
            pictures().forEach(function (p) { drop(K.pic + p.id); });
            self.toast('All gone');
          } });
        }
      };
    },

    /* ── sign in: a name and a face, kept on the phone ───────── */

    user: function () {
      var u = json(K.user, null), name = this.root.querySelector('.cg-user'), av = this.root.querySelector('.cg-head .cg-avatar');
      if (u && u.name) {
        name.textContent = u.name.toUpperCase();
        if (u.face && global.Animals) {
          av.classList.add('has-face');
          av.style.backgroundImage = 'url(' + global.Animals.avatar(u.face, { color: '#ffd6e8', glow: '#fff3b0' }) + ')';
        }
      } else {
        name.textContent = 'SIGN IN';
        av.classList.remove('has-face');
        av.style.backgroundImage = '';
      }
    },

    signIn: function () {
      var self = this, u = json(K.user, {}) || {}, faces = global.Animals ? global.Animals.list() : [];
      var face = u.face || (faces[0] && faces[0].key);
      this.dialog({
        icon: I.dHeart, title: 'WHO ARE YOU?', no: 'NO', yes: 'YES',
        body: '<input class="cg-field" type="text" maxlength="14" placeholder="your name" value="' + esc(u.name || '') + '" autocomplete="off">' +
              (faces.length ? '<div class="cg-faces">' + faces.map(function (f) {
                return '<button type="button" data-face="' + f.key + '" class="' + (f.key === face ? 'is-on' : '') + '" style="background-image:url(' + global.Animals.avatar(f.key, { color: '#ffd6e8', glow: '#fff3b0' }) + ')" aria-label="' + f.name + '"></button>';
              }).join('') + '</div>' : ''),
        onBody: function (box) {
          box.addEventListener('click', function (e) {
            var b = e.target.closest ? e.target.closest('[data-face]') : null;
            if (!b) return;
            face = b.getAttribute('data-face');
            var all = box.querySelectorAll('[data-face]');
            for (var i = 0; i < all.length; i++) all[i].classList.toggle('is-on', all[i] === b);
            sfx('tick');
          });
        },
        onYes: function (box) {
          var name = (box.querySelector('.cg-field').value || '').trim();
          if (!name) { drop(K.user); } else { save(K.user, JSON.stringify({ name: name, face: face })); }
          self.user();
          if (self.page === 'settings') self.renderSettings();
          if (self.page === 'feed') self.renderFeed();
        }
      });
    },

    /* ── the canvas ──────────────────────────────────────────── */

    openEditor: function (picId, img) {
      clearInterval(this.slideTimer);
      Editor.open(picId);
      if (img) {
        // Opening a saved picture puts it back on the page to carry on with.
        var im = new Image();
        im.onload = function () {
          if (Editor.el.hidden) return;
          Editor.ctx.fillStyle = '#fff'; Editor.ctx.fillRect(0, 0, SIZE, SIZE);
          Editor.ctx.drawImage(im, 0, 0, SIZE, SIZE);
          Editor.changed();
        };
        im.src = img;
      }
    },

    closeEditor: function () {
      if (Editor.el && !Editor.el.hidden) {
        Editor.close();
        this.go('home');
      }
    },

    /* ── the dialog, and the toast ───────────────────────────── */

    dialog: function (o) {
      var self = this, dim = document.createElement('div');
      dim.className = 'cg-dim';
      dim.innerHTML = '<div class="cg-dialog">' +
        '<div class="cg-dlg-icon">' + (o.icon || '') + '</div>' +
        '<h2>' + o.title + '</h2>' +
        (o.body ? '<div class="cg-dlg-body">' + o.body + '</div>' : '') +
        '<div class="cg-dlg-row"><button class="cg-pill" data-dlg="no">' + (o.no || 'NO') + '</button>' +
        '<button class="cg-pill" data-dlg="yes">' + (o.yes || 'YES') + '</button></div></div>';
      this.root.appendChild(dim);
      var body = dim.querySelector('.cg-dlg-body');
      if (o.onBody && body) o.onBody(body);
      dim.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-dlg]') : null;
        if (!b && e.target !== dim) return;
        e.stopPropagation();
        sfx('tick');
        dim.remove();
        if (b && b.getAttribute('data-dlg') === 'yes' && o.onYes) o.onYes(body || dim);
        else if (o.onNo) o.onNo();
      });
      var field = dim.querySelector('input[type="text"]');
      if (field) setTimeout(function () { try { field.focus(); } catch (e) {} }, 50);
    },

    toast: function (msg) {
      var self = this, t = this.toastEl;
      if (!t) return;
      t.textContent = msg;
      t.classList.add('is-on');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 1600);
    }
  };

  global.ColorGoods = {
    open: function (opts) { return App.open(opts); },
    close: function () { App.close(); },
    get running() { return App.running; },
    SETS: SETS
  };
})(window);
