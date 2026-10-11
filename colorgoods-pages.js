/*
 * colorgoods-pages.js — more pages to colour in, for COLORING GOODS.
 *
 * Drawn the same way as the COLOURING game's twelve (see game-colour.js):
 * black outlines in a 100 × 130 space, with three brushes — L lines, U blobs
 * (the inside wiped clean, so a shape sits in front of what is behind it),
 * S solids. Back to front, because a blob wipes out whatever is under it.
 */
(function (global) {
  'use strict';

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
  function smile(c, x, y, w) { c.moveTo(x - w, y); c.quadraticCurveTo(x, y + w * 0.9, x + w, y); }
  function eyes(U, S, c, x1, x2, y, r) {
    U(function () { circle(c, x1, y, r); circle(c, x2, y, r); });
    S(function () { circle(c, x1 + r * 0.2, y, r * 0.42); circle(c, x2 + r * 0.2, y, r * 0.42); });
  }

  var PAGES = [
    { id: 'castle', name: 'a castle', emoji: '🏰', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 112, 100, 18); sun(c, 50, 14, 7); });
      U(function () { cloud(c, 50, 38, 7); });
      U(function () { c.rect(14, 56, 72, 56); });                      // the wall
      L(function () { for (var x = 14; x < 86; x += 12) c.rect(x, 50, 6, 6); });   // battlements
      U(function () { c.rect(8, 40, 20, 72); c.rect(72, 40, 20, 72); });   // towers
      U(function () { poly(c, [[6, 40], [18, 18], [30, 40]]); poly(c, [[70, 40], [82, 18], [94, 40]]); });   // roofs
      L(function () {
        c.moveTo(18, 18); c.lineTo(18, 8); c.lineTo(28, 11); c.lineTo(18, 14);   // flags
        c.moveTo(82, 18); c.lineTo(82, 8); c.lineTo(92, 11); c.lineTo(82, 14);
      });
      U(function () {
        c.moveTo(40, 112); c.lineTo(40, 90); c.quadraticCurveTo(50, 76, 60, 90); c.lineTo(60, 112); c.closePath();   // gate
      });
      L(function () { c.moveTo(50, 84); c.lineTo(50, 112); c.moveTo(40, 98); c.lineTo(60, 98); });
      U(function () {
        c.rect(15, 60, 6, 9); c.rect(79, 60, 6, 9);                     // windows
        c.rect(15, 80, 6, 9); c.rect(79, 80, 6, 9);
        c.rect(30, 68, 7, 10); c.rect(63, 68, 7, 10);
      });
      L(function () { c.moveTo(0, 122); c.lineTo(100, 122); });
    } },
    { id: 'unicorn', name: 'a unicorn', emoji: '🦄', draw: function (c, L, U, S) {
      U(function () { star(c, 12, 14, 6); star(c, 88, 24, 5); heart(c, 90, 8, 4); });
      L(function () { c.rect(0, 116, 100, 14); });
      U(function () {
        c.moveTo(74, 86); c.quadraticCurveTo(100, 70, 92, 104);           // tail
        c.quadraticCurveTo(96, 92, 80, 96); c.closePath();
      });
      U(function () { c.rect(28, 96, 9, 22); c.rect(44, 98, 9, 20); c.rect(58, 96, 9, 22); c.rect(70, 94, 9, 24); });   // legs
      U(function () { ellipse(c, 52, 86, 28, 18); });                  // body
      U(function () {
        c.moveTo(30, 74); c.quadraticCurveTo(14, 60, 20, 40);           // neck
        c.lineTo(36, 44); c.quadraticCurveTo(40, 60, 46, 78); c.closePath();
      });
      U(function () {
        circle(c, 24, 34, 6); circle(c, 30, 26, 6); circle(c, 36, 36, 6); circle(c, 40, 48, 6); circle(c, 44, 60, 6);   // mane
      });
      U(function () { ellipse(c, 22, 38, 14, 10, -0.3); });              // head
      U(function () { ellipse(c, 10, 42, 7, 5); });                    // nose
      S(function () { circle(c, 7, 42, 1); });
      U(function () { poly(c, [[22, 29], [26, 10], [30, 28]]); });     // horn
      L(function () { c.moveTo(24, 22); c.lineTo(28, 20); c.moveTo(25, 17); c.lineTo(28, 15); });
      U(function () { poly(c, [[30, 30], [34, 20], [36, 30]]); });     // ear
      U(function () { circle(c, 20, 36, 3); });
      S(function () { circle(c, 20.5, 36, 1.3); });
    } },
    { id: 'puppy', name: 'a puppy', emoji: '🐶', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 120, 100, 10); });
      U(function () { ellipse(c, 88, 110, 9, 4); c.rect(80, 108, 16, 4); ellipse(c, 80, 110, 3, 4); ellipse(c, 96, 110, 3, 4); });   // bone
      U(function () {
        c.moveTo(72, 92); c.quadraticCurveTo(90, 80, 84, 66);            // tail
        c.quadraticCurveTo(92, 86, 76, 100); c.closePath();
      });
      U(function () { ellipse(c, 50, 100, 26, 20); });                 // body
      U(function () { ellipse(c, 34, 120, 9, 5); ellipse(c, 64, 120, 9, 5); });   // paws
      L(function () { c.moveTo(31, 118); c.lineTo(31, 123); c.moveTo(37, 118); c.lineTo(37, 123); c.moveTo(61, 118); c.lineTo(61, 123); c.moveTo(67, 118); c.lineTo(67, 123); });
      U(function () { c.rect(28, 78, 44, 7); });                       // collar
      L(function () { circle(c, 50, 86, 3); });
      U(function () { ellipse(c, 24, 48, 9, 20, 0.25); ellipse(c, 76, 48, 9, 20, -0.25); });   // ears
      U(function () { circle(c, 50, 46, 26); });                       // head
      U(function () { ellipse(c, 50, 58, 13, 9); });                   // muzzle
      S(function () { ellipse(c, 50, 54, 4.5, 3); });                  // nose
      L(function () { c.moveTo(50, 57); c.lineTo(50, 61); smile(c, 50, 61, 6); });
      L(function () { c.moveTo(50, 66); c.quadraticCurveTo(52, 72, 56, 70); });   // tongue
      eyes(U, S, c, 40, 60, 42, 4);
      U(function () { circle(c, 26, 42, 4); });                        // a patch
    } },
    { id: 'bunny', name: 'a bunny', emoji: '🐰', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 120, 100, 10); });
      U(function () {
        poly(c, [[80, 100], [96, 94], [92, 116]]);                      // carrot
      });
      L(function () { c.moveTo(94, 95); c.lineTo(98, 88); c.moveTo(92, 95); c.lineTo(92, 86); c.moveTo(90, 96); c.lineTo(86, 88); c.moveTo(88, 100); c.lineTo(92, 102); c.moveTo(86, 106); c.lineTo(90, 108); });
      U(function () { circle(c, 70, 104, 6); });                        // tail
      U(function () { ellipse(c, 50, 100, 24, 20); });                 // body
      U(function () { ellipse(c, 36, 120, 10, 5); ellipse(c, 64, 120, 10, 5); });   // feet
      U(function () { ellipse(c, 38, 26, 7, 20, 0.15); ellipse(c, 62, 26, 7, 20, -0.15); });   // ears
      L(function () { ellipse(c, 38, 27, 3, 13, 0.15); ellipse(c, 62, 27, 3, 13, -0.15); });
      U(function () { circle(c, 50, 58, 22); });                       // head
      U(function () { circle(c, 44, 66, 6); circle(c, 56, 66, 6); });  // cheeks
      S(function () { poly(c, [[47, 60], [53, 60], [50, 64]]); });     // nose
      L(function () { c.moveTo(50, 64); c.lineTo(50, 68); c.moveTo(47, 70); c.lineTo(53, 70); c.moveTo(48, 70); c.lineTo(48, 73); c.moveTo(52, 70); c.lineTo(52, 73); });
      L(function () { c.moveTo(28, 62); c.lineTo(14, 60); c.moveTo(28, 66); c.lineTo(14, 70); c.moveTo(72, 62); c.lineTo(86, 60); c.moveTo(72, 66); c.lineTo(86, 70); });   // whiskers
      eyes(U, S, c, 42, 58, 54, 3.5);
    } },
    { id: 'cupcake', name: 'a cupcake', emoji: '🧁', draw: function (c, L, U, S) {
      U(function () { heart(c, 12, 20, 5); heart(c, 88, 30, 4); star(c, 86, 12, 5); star(c, 14, 44, 4); });
      U(function () { poly(c, [[26, 84], [74, 84], [68, 124], [32, 124]]); });   // the case
      L(function () { for (var x = 34; x <= 66; x += 8) { c.moveTo(x, 84); c.lineTo(x - (x - 50) * 0.12, 124); } });
      U(function () { ellipse(c, 50, 84, 28, 8); });                   // rim
      U(function () { ellipse(c, 50, 76, 27, 12); });                  // frosting, bottom
      U(function () { ellipse(c, 50, 64, 21, 10); });
      U(function () { ellipse(c, 50, 54, 14, 8); });
      U(function () { circle(c, 50, 44, 8); });                        // the top swirl
      U(function () { circle(c, 50, 36, 5); });                        // cherry
      L(function () { c.moveTo(50, 31); c.quadraticCurveTo(52, 24, 58, 24); });
      L(function () {                                                   // sprinkles
        c.moveTo(38, 72); c.lineTo(42, 70); c.moveTo(56, 74); c.lineTo(60, 76); c.moveTo(44, 60); c.lineTo(47, 63);
        c.moveTo(54, 62); c.lineTo(58, 60); c.moveTo(34, 80); c.lineTo(38, 79); c.moveTo(62, 80); c.lineTo(66, 82);
      });
    } },
    { id: 'owl', name: 'an owl', emoji: '🦉', draw: function (c, L, U, S) {
      U(function () { star(c, 14, 14, 4); star(c, 30, 28, 3); star(c, 84, 40, 3); });
      U(function () {                                                   // moon
        c.moveTo(84, 8); c.arc(78, 18, 11, -1.1, 1.1); c.arc(84, 18, 11, 1.4, -1.4, true); c.closePath();
      });
      U(function () { c.rect(0, 108, 100, 8); });                      // branch
      L(function () { c.moveTo(10, 108); c.quadraticCurveTo(8, 100, 14, 96); c.moveTo(88, 116); c.quadraticCurveTo(92, 124, 86, 128); });
      U(function () { ellipse(c, 50, 78, 28, 34); });                  // body
      U(function () { ellipse(c, 26, 82, 8, 22, 0.2); ellipse(c, 74, 82, 8, 22, -0.2); });   // wings
      U(function () { ellipse(c, 50, 90, 16, 18); });                  // tummy
      L(function () { for (var y = 82; y <= 102; y += 7) { c.moveTo(40, y); c.quadraticCurveTo(45, y + 4, 50, y); c.quadraticCurveTo(55, y + 4, 60, y); } });
      U(function () { poly(c, [[28, 50], [22, 32], [40, 44]]); poly(c, [[72, 50], [78, 32], [60, 44]]); });   // ear tufts
      U(function () { circle(c, 38, 58, 11); circle(c, 62, 58, 11); });   // eye rings
      eyes(U, S, c, 38, 62, 58, 6);
      U(function () { poly(c, [[46, 66], [54, 66], [50, 74]]); });     // beak
      L(function () {                                                   // feet
        c.moveTo(40, 108); c.lineTo(36, 114); c.moveTo(42, 108); c.lineTo(42, 114); c.moveTo(44, 108); c.lineTo(48, 114);
        c.moveTo(56, 108); c.lineTo(52, 114); c.moveTo(58, 108); c.lineTo(58, 114); c.moveTo(60, 108); c.lineTo(64, 114);
      });
    } },
    { id: 'boat', name: 'a sailing boat', emoji: '⛵', draw: function (c, L, U, S) {
      L(function () { sun(c, 16, 16, 7); });
      L(function () {                                                   // seagulls
        c.moveTo(70, 22); c.quadraticCurveTo(74, 18, 78, 22); c.quadraticCurveTo(82, 18, 86, 22);
        c.moveTo(56, 34); c.quadraticCurveTo(59, 31, 62, 34); c.quadraticCurveTo(65, 31, 68, 34);
      });
      U(function () { cloud(c, 40, 20, 6); });
      L(function () {                                                   // the sea
        c.rect(0, 104, 100, 26);
        for (var y = 112; y < 130; y += 8) { c.moveTo(0, y); for (var x = 0; x < 100; x += 20) c.quadraticCurveTo(x + 10, y - 5, x + 20, y); }
      });
      U(function () { poly(c, [[12, 90], [88, 90], [76, 106], [24, 106]]); });   // hull
      L(function () { c.moveTo(16, 96); c.lineTo(84, 96); });
      L(function () { c.moveTo(50, 90); c.lineTo(50, 30); });          // mast
      U(function () { poly(c, [[52, 32], [84, 84], [52, 84]]); });     // main sail
      U(function () { poly(c, [[47, 44], [47, 84], [22, 84]]); });     // jib
      L(function () { c.moveTo(50, 30); c.lineTo(50, 24); c.lineTo(60, 27); c.lineTo(50, 30); });   // flag
      U(function () { circle(c, 36, 98, 2.5); circle(c, 50, 98, 2.5); circle(c, 64, 98, 2.5); });   // portholes
    } },
    { id: 'train', name: 'a train', emoji: '🚂', draw: function (c, L, U, S) {
      U(function () { cloud(c, 18, 14, 5); cloud(c, 30, 26, 6); });    // puffs
      L(function () { c.rect(0, 112, 100, 6); for (var x = 4; x < 100; x += 12) c.rect(x, 118, 6, 8); });   // track
      U(function () { c.rect(66, 66, 30, 36); });                      // carriage
      L(function () { c.rect(71, 72, 8, 10); c.rect(83, 72, 8, 10); });
      U(function () { c.rect(6, 66, 54, 36); });                       // engine body
      U(function () { c.rect(36, 44, 22, 24); });                      // cab
      L(function () { c.rect(40, 50, 14, 10); });
      U(function () { c.rect(10, 46, 10, 20); });                      // chimney
      U(function () { ellipse(c, 15, 46, 8, 3); });
      U(function () { poly(c, [[2, 102], [12, 102], [8, 110], [0, 110]]); });   // cow catcher
      U(function () { circle(c, 18, 104, 8); circle(c, 44, 104, 8); circle(c, 74, 104, 7); circle(c, 90, 104, 7); });   // wheels
      S(function () { circle(c, 18, 104, 2); circle(c, 44, 104, 2); circle(c, 74, 104, 2); circle(c, 90, 104, 2); });
      L(function () { c.moveTo(18, 104); c.lineTo(44, 104); });
      U(function () { circle(c, 22, 80, 5); });                        // headlamp
    } },
    { id: 'turtle', name: 'a turtle', emoji: '🐢', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 112, 100, 18); for (var x = 6; x < 100; x += 14) { c.moveTo(x, 112); c.lineTo(x + 3, 104); c.moveTo(x + 3, 112); c.lineTo(x + 6, 106); } });
      L(function () { sun(c, 84, 16, 7); });
      U(function () { cloud(c, 22, 20, 6); });
      U(function () { ellipse(c, 24, 100, 9, 6, 0.6); ellipse(c, 76, 100, 9, 6, -0.6); });   // back legs
      U(function () { ellipse(c, 28, 108, 9, 6, -0.4); ellipse(c, 72, 108, 9, 6, 0.4); });   // front legs
      U(function () { poly(c, [[50, 104], [44, 116], [56, 116]]); });  // tail
      U(function () { ellipse(c, 50, 86, 34, 20); });                  // shell rim
      U(function () { ellipse(c, 50, 80, 28, 16); });                  // shell
      L(function () {                                                   // the pattern
        circle(c, 50, 78, 7);
        circle(c, 34, 80, 5); circle(c, 66, 80, 5); circle(c, 42, 70, 4.5); circle(c, 58, 70, 4.5); circle(c, 42, 89, 4.5); circle(c, 58, 89, 4.5);
      });
      U(function () { circle(c, 88, 72, 10); });                       // head
      U(function () { c.rect(74, 70, 12, 8); });                       // neck
      U(function () { circle(c, 90, 69, 2.5); });
      S(function () { circle(c, 90.5, 69, 1); });
      L(function () { smile(c, 92, 76, 3); });
    } },
    { id: 'ladybird', name: 'a ladybird', emoji: '🐞', draw: function (c, L, U, S) {
      U(function () {                                                   // the leaf
        c.moveTo(6, 124); c.quadraticCurveTo(20, 60, 94, 56); c.quadraticCurveTo(90, 124, 6, 124); c.closePath();
      });
      L(function () { c.moveTo(10, 120); c.quadraticCurveTo(44, 90, 88, 60); for (var i = 1; i < 5; i++) { var t = i / 5; var x = 10 + (88 - 10) * t, y = 120 + (60 - 120) * t; c.moveTo(x, y); c.lineTo(x + 8, y + 8); c.moveTo(x, y); c.lineTo(x - 10, y - 4); } });
      L(function () {                                                   // legs
        c.moveTo(28, 64); c.lineTo(18, 56); c.moveTo(24, 78); c.lineTo(12, 78); c.moveTo(28, 92); c.lineTo(18, 100);
        c.moveTo(72, 64); c.lineTo(82, 56); c.moveTo(76, 78); c.lineTo(88, 78); c.moveTo(72, 92); c.lineTo(82, 100);
      });
      U(function () { ellipse(c, 50, 78, 26, 26); });                  // body
      L(function () { c.moveTo(50, 56); c.lineTo(50, 104); });
      U(function () { circle(c, 38, 70, 4.5); circle(c, 62, 70, 4.5); circle(c, 34, 86, 4); circle(c, 66, 86, 4); circle(c, 44, 94, 3.5); circle(c, 56, 94, 3.5); });   // spots
      U(function () { circle(c, 50, 50, 11); });                       // head
      L(function () { c.moveTo(44, 42); c.quadraticCurveTo(38, 30, 30, 30); c.moveTo(56, 42); c.quadraticCurveTo(62, 30, 70, 30); });   // feelers
      U(function () { circle(c, 30, 30, 2.5); circle(c, 70, 30, 2.5); });
      eyes(U, S, c, 46, 54, 48, 2.5);
      L(function () { smile(c, 50, 54, 3); });
    } },
    { id: 'snowman', name: 'a snowman', emoji: '⛄', draw: function (c, L, U, S) {
      L(function () {                                                   // snowflakes
        [[12, 14], [86, 22], [20, 50], [90, 60]].forEach(function (p) {
          for (var i = 0; i < 3; i++) { var a = i * Math.PI / 3; c.moveTo(p[0] - Math.cos(a) * 4, p[1] - Math.sin(a) * 4); c.lineTo(p[0] + Math.cos(a) * 4, p[1] + Math.sin(a) * 4); }
        });
      });
      L(function () { c.moveTo(0, 118); c.quadraticCurveTo(50, 108, 100, 118); c.lineTo(100, 130); c.lineTo(0, 130); c.closePath(); });
      L(function () { c.moveTo(30, 90); c.lineTo(10, 76); c.moveTo(16, 80); c.lineTo(14, 72); c.moveTo(70, 90); c.lineTo(90, 76); c.moveTo(84, 80); c.lineTo(86, 72); });   // arms
      U(function () { circle(c, 50, 100, 22); });                      // bottom
      U(function () { circle(c, 50, 68, 17); });                       // middle
      S(function () { circle(c, 50, 64, 1.8); circle(c, 50, 72, 1.8); circle(c, 50, 98, 1.8); circle(c, 50, 106, 1.8); });   // buttons
      U(function () { c.rect(34, 50, 32, 7); poly(c, [[60, 56], [68, 70], [60, 72], [56, 57]]); });   // scarf
      U(function () { circle(c, 50, 38, 14); });                       // head
      U(function () { c.rect(32, 24, 36, 5); c.rect(38, 8, 24, 17); });   // hat
      L(function () { c.rect(38, 20, 24, 4); });
      eyes(U, S, c, 45, 55, 36, 2.2);
      U(function () { poly(c, [[50, 40], [50, 44], [64, 43]]); });     // carrot nose
      L(function () { for (var x = 44; x <= 56; x += 4) circle(c, x, 47 - Math.abs(x - 50) * 0.3, 0.9); });   // the smile, in pebbles
    } },
    { id: 'robot', name: 'a robot', emoji: '🤖', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 122, 100, 8); });
      U(function () { star(c, 12, 16, 5); star(c, 88, 12, 4); });
      U(function () { c.rect(30, 104, 12, 18); c.rect(58, 104, 12, 18); });   // legs
      U(function () { c.rect(26, 118, 20, 6); c.rect(54, 118, 20, 6); });     // feet
      U(function () { c.rect(10, 60, 10, 30); c.rect(80, 60, 10, 30); });     // arms
      U(function () { circle(c, 15, 94, 6); circle(c, 85, 94, 6); });         // hands
      L(function () { c.moveTo(12, 96); c.lineTo(12, 100); c.moveTo(18, 96); c.lineTo(18, 100); c.moveTo(82, 96); c.lineTo(82, 100); c.moveTo(88, 96); c.lineTo(88, 100); });
      U(function () { c.rect(22, 54, 56, 50); });                      // body
      L(function () { c.rect(30, 62, 40, 18); });                      // screen
      L(function () { c.moveTo(34, 72); c.lineTo(44, 66); c.lineTo(52, 74); c.lineTo(60, 68); c.lineTo(66, 72); });
      U(function () { circle(c, 34, 92, 4); circle(c, 50, 92, 4); circle(c, 66, 92, 4); });   // buttons
      L(function () { c.moveTo(50, 54); c.lineTo(50, 46); });          // neck
      U(function () { c.rect(28, 14, 44, 32); });                      // head
      L(function () { c.moveTo(50, 14); c.lineTo(50, 6); });           // antenna
      U(function () { circle(c, 50, 5, 3); });
      U(function () { c.rect(18, 24, 10, 12); c.rect(72, 24, 10, 12); });   // ears
      U(function () { circle(c, 40, 28, 6); circle(c, 60, 28, 6); });  // eyes
      S(function () { circle(c, 41, 28, 2.5); circle(c, 61, 28, 2.5); });
      L(function () { c.rect(38, 37, 24, 4); c.moveTo(44, 37); c.lineTo(44, 41); c.moveTo(50, 37); c.lineTo(50, 41); c.moveTo(56, 37); c.lineTo(56, 41); });   // mouth
    } },
    { id: 'cake', name: 'a birthday cake', emoji: '🎂', draw: function (c, L, U, S) {
      U(function () { star(c, 12, 16, 5); star(c, 86, 28, 4); heart(c, 88, 10, 4); heart(c, 14, 44, 3.5); });
      U(function () { ellipse(c, 50, 118, 44, 8); });                  // plate
      U(function () { c.rect(14, 92, 72, 26); });                      // bottom tier
      U(function () { ellipse(c, 50, 92, 36, 7); });
      L(function () { for (var x = 20; x < 86; x += 11) { c.moveTo(x, 100); c.quadraticCurveTo(x + 5.5, 108, x + 11, 100); } });   // icing drips
      U(function () { c.rect(24, 64, 52, 28); });                      // top tier
      U(function () { ellipse(c, 50, 64, 26, 6); });
      L(function () { for (var x = 28; x < 76; x += 10) { c.moveTo(x, 70); c.quadraticCurveTo(x + 5, 78, x + 10, 70); } });
      U(function () { circle(c, 32, 86, 2.5); circle(c, 50, 88, 2.5); circle(c, 68, 86, 2.5); });   // cherries
      L(function () { c.rect(34, 44, 5, 20); c.rect(47, 40, 5, 24); c.rect(60, 44, 5, 20); });   // candles
      L(function () { c.moveTo(34, 50); c.lineTo(39, 50); c.moveTo(34, 56); c.lineTo(39, 56); c.moveTo(47, 48); c.lineTo(52, 48); c.moveTo(47, 56); c.lineTo(52, 56); c.moveTo(60, 50); c.lineTo(65, 50); c.moveTo(60, 56); c.lineTo(65, 56); });
      U(function () { ellipse(c, 36.5, 38, 2.5, 5); ellipse(c, 49.5, 34, 2.5, 5); ellipse(c, 62.5, 38, 2.5, 5); });   // flames
    } },
    { id: 'appletree', name: 'an apple tree', emoji: '🍎', draw: function (c, L, U, S) {
      L(function () { c.rect(0, 112, 100, 18); sun(c, 86, 16, 7); });
      U(function () { cloud(c, 18, 20, 6); });
      U(function () { c.rect(42, 80, 16, 32); });                      // trunk
      L(function () { c.moveTo(46, 90); c.lineTo(45, 108); c.moveTo(53, 86); c.lineTo(54, 104); });
      U(function () {                                                   // the crown
        circle(c, 50, 46, 24); circle(c, 28, 60, 16); circle(c, 72, 60, 16); circle(c, 34, 36, 14); circle(c, 66, 36, 14); circle(c, 50, 70, 16);
      });
      U(function () { circle(c, 36, 52, 4.5); circle(c, 60, 44, 4.5); circle(c, 50, 68, 4.5); circle(c, 70, 66, 4.5); circle(c, 26, 66, 4.5); circle(c, 48, 36, 4.5); });   // apples
      L(function () { [[36, 52], [60, 44], [50, 68], [70, 66], [26, 66], [48, 36]].forEach(function (p) { c.moveTo(p[0], p[1] - 4.5); c.lineTo(p[0] + 1.5, p[1] - 7.5); }); });
      U(function () { circle(c, 14, 108, 4); circle(c, 86, 110, 4); });   // fallen apples
      L(function () { c.moveTo(70, 80); c.lineTo(70, 100); c.moveTo(84, 80); c.lineTo(84, 100); c.rect(66, 100, 22, 4); });   // a swing
    } }
  ];

  global.ColorGoodsPages = PAGES;
})(window);
