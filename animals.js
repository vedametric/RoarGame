/*
 * animals.js — the ten animal faces, drawn as real artwork.
 *
 * These used to be emoji baked into a canvas, which is fragile: canvas text
 * does not reliably fall back to a colour emoji font, so on some phones the
 * avatars came out as blank discs. Everything here is plain paths, so it
 * renders identically everywhere with no font involved at all.
 *
 * Each face is drawn in a unit space centred on (0, 0) with radius 1, then
 * scaled — so the same drawing serves the picker tile, the round avatar and
 * the medallion on the end of the claw.
 */
(function (global) {
  'use strict';

  function eyes(c, dx, dy, r, white) {
    for (var s = -1; s <= 1; s += 2) {
      if (white) {
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(s * dx, dy, r * 1.7, 0, 6.2832); c.fill();
      }
      c.fillStyle = '#2a2036';
      c.beginPath(); c.arc(s * dx, dy, r, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.beginPath(); c.arc(s * dx + r * 0.32, dy - r * 0.34, r * 0.34, 0, 6.2832); c.fill();
    }
  }

  function ellipse(c, x, y, rx, ry, rot, fill) {
    c.fillStyle = fill;
    c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); c.fill();
  }

  var FACES = {
    rabbit: function (c) {
      ellipse(c, -0.30, -0.86, 0.16, 0.52, -0.12, '#f3eef7');
      ellipse(c, 0.30, -0.86, 0.16, 0.52, 0.12, '#f3eef7');
      ellipse(c, -0.30, -0.86, 0.08, 0.36, -0.12, '#f5a8c0');
      ellipse(c, 0.30, -0.86, 0.08, 0.36, 0.12, '#f5a8c0');
      ellipse(c, 0, 0.05, 0.78, 0.70, 0, '#f8f4fb');
      eyes(c, 0.30, -0.05, 0.11, false);
      ellipse(c, 0, 0.22, 0.13, 0.10, 0, '#f5849f');
      c.strokeStyle = '#d9cfe4'; c.lineWidth = 0.045; c.lineCap = 'round';
      for (var s = -1; s <= 1; s += 2) {
        for (var k = -1; k <= 1; k++) {
          c.beginPath();
          c.moveTo(s * 0.18, 0.28);
          c.lineTo(s * 0.72, 0.28 + k * 0.16);
          c.stroke();
        }
      }
    },

    cow: function (c) {
      ellipse(c, -0.74, -0.30, 0.26, 0.18, -0.5, '#f2ece6');
      ellipse(c, 0.74, -0.30, 0.26, 0.18, 0.5, '#f2ece6');
      ellipse(c, -0.52, -0.66, 0.13, 0.16, -0.4, '#efe0c2');
      ellipse(c, 0.52, -0.66, 0.13, 0.16, 0.4, '#efe0c2');
      ellipse(c, 0, 0, 0.80, 0.74, 0, '#f7f2ec');
      ellipse(c, -0.40, -0.34, 0.30, 0.24, -0.3, '#3b3140');
      ellipse(c, 0.46, 0.10, 0.22, 0.28, 0.3, '#3b3140');
      eyes(c, 0.30, -0.14, 0.11, false);
      ellipse(c, 0, 0.38, 0.42, 0.28, 0, '#f2a6b8');
      ellipse(c, -0.15, 0.34, 0.07, 0.09, 0, '#d17f96');
      ellipse(c, 0.15, 0.34, 0.07, 0.09, 0, '#d17f96');
    },

    lion: function (c) {
      c.fillStyle = '#c9762c';
      for (var i = 0; i < 14; i++) {
        var a = (i / 14) * 6.2832;
        ellipse(c, Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.30, 0.30, 0, '#c9762c');
      }
      ellipse(c, 0, 0, 0.74, 0.70, 0, '#e8a33f');
      ellipse(c, 0, 0.10, 0.62, 0.56, 0, '#f6c46a');
      eyes(c, 0.26, -0.10, 0.10, false);
      ellipse(c, 0, 0.22, 0.13, 0.10, 0, '#5a3b28');
      c.strokeStyle = '#5a3b28'; c.lineWidth = 0.05; c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, 0.30); c.lineTo(0, 0.42); c.stroke();
      c.beginPath(); c.arc(-0.12, 0.42, 0.12, 0, Math.PI); c.stroke();
      c.beginPath(); c.arc(0.12, 0.42, 0.12, 0, Math.PI); c.stroke();
    },

    giraffe: function (c) {
      c.strokeStyle = '#a8763a'; c.lineWidth = 0.07; c.lineCap = 'round';
      for (var s = -1; s <= 1; s += 2) {
        c.beginPath(); c.moveTo(s * 0.26, -0.62); c.lineTo(s * 0.32, -0.94); c.stroke();
        ellipse(c, s * 0.33, -0.98, 0.10, 0.09, 0, '#6f4a22');
      }
      ellipse(c, -0.72, -0.16, 0.22, 0.14, -0.4, '#e8b95e');
      ellipse(c, 0.72, -0.16, 0.22, 0.14, 0.4, '#e8b95e');
      ellipse(c, 0, -0.10, 0.62, 0.62, 0, '#f2c96f');
      ellipse(c, -0.30, -0.34, 0.16, 0.14, 0, '#b9803a');
      ellipse(c, 0.32, -0.24, 0.13, 0.15, 0, '#b9803a');
      ellipse(c, -0.34, 0.06, 0.12, 0.12, 0, '#b9803a');
      eyes(c, 0.26, -0.16, 0.10, false);
      ellipse(c, 0, 0.46, 0.40, 0.30, 0, '#f7e0ad');
      ellipse(c, -0.13, 0.40, 0.06, 0.08, 0, '#7a5a30');
      ellipse(c, 0.13, 0.40, 0.06, 0.08, 0, '#7a5a30');
    },

    seal: function (c) {
      ellipse(c, 0, 0.02, 0.76, 0.70, 0, '#9fb3c8');
      ellipse(c, 0, 0.20, 0.52, 0.46, 0, '#c3d3e2');
      eyes(c, 0.28, -0.16, 0.13, false);
      ellipse(c, 0, 0.16, 0.12, 0.09, 0, '#3b3140');
      c.strokeStyle = '#3b3140'; c.lineWidth = 0.04; c.lineCap = 'round';
      c.beginPath(); c.arc(-0.12, 0.30, 0.14, 0.1, Math.PI - 0.1); c.stroke();
      c.beginPath(); c.arc(0.12, 0.30, 0.14, 0.1, Math.PI - 0.1); c.stroke();
      c.strokeStyle = 'rgba(60,50,70,.5)'; c.lineWidth = 0.03;
      for (var s = -1; s <= 1; s += 2) {
        for (var k = -1; k <= 1; k++) {
          c.beginPath(); c.moveTo(s * 0.16, 0.22); c.lineTo(s * 0.62, 0.18 + k * 0.14); c.stroke();
        }
      }
    },

    penguin: function (c) {
      ellipse(c, 0, 0, 0.78, 0.76, 0, '#39344a');
      ellipse(c, 0, 0.16, 0.54, 0.58, 0, '#f7f4fa');
      eyes(c, 0.24, -0.10, 0.11, false);
      c.fillStyle = '#f5a623';
      c.beginPath();
      c.moveTo(-0.20, 0.22); c.lineTo(0.20, 0.22); c.lineTo(0, 0.52);
      c.closePath(); c.fill();
      c.fillStyle = '#d98b12';
      c.beginPath();
      c.moveTo(-0.10, 0.36); c.lineTo(0.10, 0.36); c.lineTo(0, 0.52);
      c.closePath(); c.fill();
    },

    shark: function (c) {
      c.fillStyle = '#7f94ab';
      c.beginPath();
      c.moveTo(-0.10, -0.62); c.lineTo(0.18, -1.02); c.lineTo(0.30, -0.60);
      c.closePath(); c.fill();
      ellipse(c, 0, 0, 0.80, 0.68, 0, '#8fa5bd');
      ellipse(c, 0, 0.30, 0.66, 0.42, 0, '#dfe8f1');
      eyes(c, 0.34, -0.22, 0.10, false);
      c.fillStyle = '#33293f';
      c.beginPath();
      c.moveTo(-0.62, 0.20);
      c.quadraticCurveTo(0, 0.72, 0.62, 0.20);
      c.quadraticCurveTo(0, 0.42, -0.62, 0.20);
      c.closePath(); c.fill();
      c.fillStyle = '#fff';
      for (var i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(i * 0.20 - 0.06, 0.26);
        c.lineTo(i * 0.20 + 0.06, 0.26);
        c.lineTo(i * 0.20, 0.40);
        c.closePath(); c.fill();
      }
    },

    tiger: function (c) {
      ellipse(c, -0.62, -0.52, 0.20, 0.20, 0, '#e07f2a');
      ellipse(c, 0.62, -0.52, 0.20, 0.20, 0, '#e07f2a');
      ellipse(c, 0, 0, 0.78, 0.72, 0, '#f2952f');
      c.fillStyle = '#3a2a20';
      var stripes = [[-0.46, -0.52, 0.34], [0.46, -0.52, -0.34], [-0.62, -0.10, 0.1], [0.62, -0.10, -0.1]];
      for (var i = 0; i < stripes.length; i++) {
        ellipse(c, stripes[i][0], stripes[i][1], 0.08, 0.24, stripes[i][2], '#3a2a20');
      }
      ellipse(c, 0, 0.28, 0.50, 0.34, 0, '#fbe6cf');
      eyes(c, 0.28, -0.14, 0.11, false);
      ellipse(c, 0, 0.20, 0.12, 0.09, 0, '#c25a4a');
      c.strokeStyle = '#3a2a20'; c.lineWidth = 0.045; c.lineCap = 'round';
      c.beginPath(); c.arc(-0.12, 0.36, 0.12, 0, Math.PI); c.stroke();
      c.beginPath(); c.arc(0.12, 0.36, 0.12, 0, Math.PI); c.stroke();
    },

    elephant: function (c) {
      ellipse(c, -0.72, -0.05, 0.36, 0.46, -0.2, '#a9a3b8');
      ellipse(c, 0.72, -0.05, 0.36, 0.46, 0.2, '#a9a3b8');
      ellipse(c, 0, -0.05, 0.62, 0.62, 0, '#bdb7cc');
      eyes(c, 0.26, -0.18, 0.10, false);
      c.strokeStyle = '#bdb7cc'; c.lineWidth = 0.26; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, 0.24);
      c.quadraticCurveTo(0.06, 0.66, -0.16, 0.86);
      c.stroke();
      c.fillStyle = '#f5f0e4';
      for (var s = -1; s <= 1; s += 2) {
        c.beginPath();
        c.moveTo(s * 0.22, 0.30); c.lineTo(s * 0.32, 0.30); c.lineTo(s * 0.40, 0.62);
        c.closePath(); c.fill();
      }
    },

    dino: function (c) {
      c.fillStyle = '#4f9b52';
      for (var i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(-0.30 + i * 0.22, -0.66);
        c.lineTo(-0.20 + i * 0.22, -1.00);
        c.lineTo(-0.08 + i * 0.22, -0.66);
        c.closePath(); c.fill();
      }
      ellipse(c, 0, -0.02, 0.74, 0.68, 0, '#63bb63');
      ellipse(c, 0, 0.30, 0.62, 0.40, 0, '#8ed88a');
      eyes(c, 0.30, -0.24, 0.11, true);
      c.fillStyle = '#33293f';
      c.beginPath();
      c.moveTo(-0.52, 0.34);
      c.quadraticCurveTo(0, 0.74, 0.52, 0.34);
      c.quadraticCurveTo(0, 0.52, -0.52, 0.34);
      c.closePath(); c.fill();
      c.fillStyle = '#fff';
      for (i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(i * 0.24 - 0.05, 0.38);
        c.lineTo(i * 0.24 + 0.05, 0.38);
        c.lineTo(i * 0.24, 0.50);
        c.closePath(); c.fill();
      }
      ellipse(c, -0.30, 0.14, 0.06, 0.05, 0, '#3f8a44');
      ellipse(c, 0.34, 0.16, 0.06, 0.05, 0, '#3f8a44');
    }
  };

  var LIST = [
    { key: 'rabbit',   name: 'Rabbit' },
    { key: 'cow',      name: 'Cow' },
    { key: 'lion',     name: 'Lion' },
    { key: 'giraffe',  name: 'Giraffe' },
    { key: 'seal',     name: 'Seal' },
    { key: 'penguin',  name: 'Penguin' },
    { key: 'shark',    name: 'Shark' },
    { key: 'tiger',    name: 'Tiger' },
    { key: 'elephant', name: 'Elephant' },
    { key: 'dino',     name: 'Dino' }
  ];

  var cache = {};

  var Animals = {
    list: function () { return LIST.slice(); },

    // Draw a face centred on (x, y) at the given radius, into any context.
    draw: function (c, key, x, y, radius) {
      var f = FACES[key];
      if (!f) return false;
      c.save();
      c.translate(x, y);
      c.scale(radius, radius);
      f(c);
      c.restore();
      return true;
    },

    // A round 320px avatar on the player's colours. Cached per animal+colour.
    avatar: function (key, skin) {
      var id = key + '|' + (skin ? skin.color : '');
      if (cache[id]) return cache[id];

      var S = 320;
      var cv = document.createElement('canvas');
      cv.width = cv.height = S;
      var c = cv.getContext('2d');

      var g = c.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, (skin && skin.glow) || '#ffd24c');
      g.addColorStop(1, (skin && skin.color) || '#ff8a2b');
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);

      c.save();
      c.globalAlpha = 0.16;
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(S / 2, S / 2, S * 0.40, 0, 6.2832); c.fill();
      c.restore();

      this.draw(c, key, S / 2, S * 0.52, S * 0.33);

      cache[id] = cv.toDataURL('image/png');
      return cache[id];
    }
  };

  global.Animals = Animals;
})(window);
