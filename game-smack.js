/*
 * game-smack.js — "THE SMACK GAME"
 *
 * A big daft 3D head in a spotlight, and a hand that follows your finger. Tap
 * and the hand winds up and slaps it. Built on Three.js (vendor/), so the head
 * is a real lit, shadowed ball with real eyelids that squint, a mouth that
 * opens, brows that knit and a hat that gets knocked clean off — and when a
 * smack lands the head is knocked round on its neck on angular springs, red
 * hand-prints stick to the cheek where the hand hit, tears fly, stars orbit
 * when it's dizzy, and a comic "SMACK!" pops at the point of impact.
 *
 * A fresh face is rolled every time the game loads, and on 🎲 NEW FACE: skin,
 * hair colour and style, eye size and spacing and colour, brows, nose, ears,
 * freckles, glasses, a moustache or beard, a hat. Everything is built from
 * primitives in code; there are no image assets.
 *
 * Gameplay: it counts your smacks, and quick smacks chain into a combo worth
 * more each hit. A big combo leaves the head dizzy, eyes spinning, until it
 * shakes itself off. A fast swipe across the face is a harder backhand. The ★
 * keeps your best. Nothing to lose.
 */
(function (global) {
  'use strict';

  var SAVED = 'smack.best';
  var TAU = Math.PI * 2;

  var SKIN = [0xffdcb3, 0xf1c27d, 0xe5b07a, 0xc68642, 0xa56a3e, 0x8d5524, 0xffe0bd, 0xd9a066];
  var HAIRC = [0x2b1b0e, 0x5a3a1b, 0x8a5a2b, 0xc9962f, 0xe8c559, 0xd94f4f, 0x3b3b3b, 0x6b4fa0, 0x2f7bd9, 0xe35aa0, 0x4caf50, 0xff7a3d, 0xc0c0c8];
  var EYEC = [0x3b2b1a, 0x5a3a1b, 0x2f6b8f, 0x3b7a3b, 0x555555, 0x7a4fae];
  var SHIRT = [0xff5252, 0x2f7bd9, 0x43a047, 0xffb300, 0x8e24aa, 0x00acc1, 0xf06292];
  var HAIRDOS = ['short', 'puff', 'spikes', 'mohawk', 'bun', 'long', 'curly', 'bald'];
  var HATS = ['none', 'none', 'top', 'cap', 'party', 'crown'];
  var NOSES = ['button', 'round', 'long'];
  var OWS = ['Ow!', 'Ouch!', 'Hey!', 'Oof!', 'Yikes!', 'Ooh!', 'Stop it!', 'Not the face!'];
  var WORDS = ['SMACK!', 'WHAP!', 'SLAP!', 'POW!', 'THWACK!'];
  var EXPR = ['ow', 'dizzy', 'shock', 'wince', 'tongue'];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function saved(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function spring(o, ak, vk, dt, k, damp) { o[vk] += (-o[ak] * k - o[vk] * damp) * dt; return o[ak] + o[vk] * dt; }

  var SmackGame = {
    running: false,

    start: function (cfg) {
      var self = this;
      this.stop();
      if (!global.THREE) { console.warn('SmackGame: THREE missing'); return this; }
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.best = parseInt(saved(SAVED, '0'), 10) || 0;
      this.paused = false;
      this.running = true;
      this._renderer();
      this._scene();
      this._fit();
      this._newGame();
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
      this._teardown();
    },

    setPaused: function (on) {
      this.paused = !!on;
      this.last = performance.now();
    },

    _renderer: function () {
      var T = global.THREE;
      if (this.renderer) return;
      var r = new T.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFSoftShadowMap;
      if ('outputColorSpace' in r) r.outputColorSpace = T.SRGBColorSpace; else r.outputEncoding = T.sRGBEncoding;
      this.renderer = r;
    },

    _fit: function () {
      var W = this.canvas.clientWidth || 320, H = this.canvas.clientHeight || 480;
      this.W = W; this.H = H;
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      this.renderer.setSize(W, H, false);
      if (this.camera) {
        this.camera.aspect = W / H;
        // keep the whole head in shot whatever the shape of the screen
        this.camera.fov = W / H < 0.7 ? 46 : 38;
        this.camera.updateProjectionMatrix();
      }
    },

    /* ── the studio ────────────────────────────────────────────── */

    _scene: function () {
      var T = global.THREE;
      var scene = this.scene = new T.Scene();
      scene.background = new T.Color(0x1d0f3a);
      this.camera = new T.PerspectiveCamera(38, 1, 0.1, 60);
      this.camera.position.set(0, 0.3, 7.6);
      this.camera.lookAt(0, -0.1, 0);
      this.camBase = this.camera.position.clone();

      // a lit backdrop and a floor to catch the shadow
      var bg = new T.Mesh(new T.PlaneGeometry(40, 30), new T.MeshBasicMaterial({ map: this._glowTex('#5b2fa8', '#1d0f3a'), fog: false }));
      bg.material._own = true; bg.position.set(0, 1, -7); scene.add(bg);
      var floor = new T.Mesh(new T.PlaneGeometry(40, 30), new T.MeshStandardMaterial({ color: 0x2a1656, roughness: 0.6, metalness: 0.1 }));
      floor.material._own = true; floor.rotation.x = -Math.PI / 2; floor.position.y = -3.2; floor.receiveShadow = true; scene.add(floor);
      this.floorY = -3.2;

      scene.add(new T.HemisphereLight(0xffffff, 0x3a2a66, 0.55));
      var key = new T.SpotLight(0xfff1dc, 1.35, 40, 0.7, 0.5, 1);
      key.position.set(3.5, 6.5, 6); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
      scene.add(key); scene.add(key.target);
      var fill = new T.PointLight(0x8ecbff, 0.55, 30); fill.position.set(-5, 1.5, 4); scene.add(fill);
      var rim = new T.DirectionalLight(0xff9de2, 0.8); rim.position.set(-2, 3, -5); scene.add(rim);

      this.raycaster = new T.Raycaster();
      this.handPlane = new T.Plane(new T.Vector3(0, 0, 1), -2.0);
      this._buildHand();
    },

    _teardown: function () {
      if (!this.scene) return;
      this.scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { if (m && m.map) m.map.dispose(); if (m) m.dispose(); }); }
      });
      while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
      this.scene = null; this.pivot = null; this.hand = null;
    },

    _newGame: function () {
      this.score = 0; this.combo = 0; this.lastHit = -9;
      this.marks = []; this.bits = []; this.stars = []; this.pops = [];
      this.time = 0; this.shake = 0;
      this.newFace();
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this.newFace();
      try { global.RoarAudio.sfx('sparkle'); } catch (e) {}
      try { global.Say.speak('New face!'); } catch (e) {}
      this._render();
    },

    /* ── building a face ───────────────────────────────────────── */

    newFace: function () {
      var T = global.THREE, self = this;
      if (this.pivot) { this._disposeGroup(this.pivot); this.scene.remove(this.pivot); }
      if (this.torso) { this._disposeGroup(this.torso); this.scene.remove(this.torso); }
      this.marks = []; this.stars.forEach(function (s) { self.scene.remove(s.s); }); this.stars = [];
      this.hatLoose = null;

      var F = this.F = {
        skin: pick(SKIN), hair: pick(HAIRC), hairdo: pick(HAIRDOS), hat: pick(HATS), eyeC: pick(EYEC), shirt: pick(SHIRT),
        wide: rand(0.86, 1.06), tall: rand(1.0, 1.22), depth: 0.96,
        eyeSize: rand(0.82, 1.25), eyeGap: rand(0.36, 0.5), eyeY: rand(0.1, 0.24),
        browAngle: rand(-0.35, 0.35), browThick: rand(0.7, 1.4), nose: pick(NOSES), noseS: rand(0.8, 1.3),
        ear: rand(0.8, 1.3), mouthW: rand(0.8, 1.25), freckles: Math.random() < 0.4, glasses: Math.random() < 0.3,
        mustache: Math.random() < 0.2, beard: Math.random() < 0.15, cheeks: rand(0.2, 0.5)
      };
      var skin = new T.MeshStandardMaterial({ color: F.skin, roughness: 0.62, metalness: 0 });
      var hairM = new T.MeshStandardMaterial({ color: F.hair, roughness: 0.75 });
      var dark = new T.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.4 });
      F.skinM = skin; F.hairM = hairM;

      // H pivots at the neck, so a smack turns the head on its neck
      var H = this.pivot = new T.Group(); H.position.set(0, -1.15, 0);
      var face = this.face = new T.Group(); face.position.set(0, 1.15, 0); H.add(face);
      var head = this.head = new T.Mesh(new T.SphereGeometry(1, 56, 40), skin);
      head.scale.set(F.wide, F.tall, F.depth); head.castShadow = true; head.receiveShadow = true; face.add(head);
      var chin = new T.Mesh(new T.SphereGeometry(0.55, 24, 16), skin); chin.position.set(0, -F.tall * 0.62, 0.22); chin.scale.set(1.15, 0.8, 0.9); face.add(chin);
      var neck = new T.Mesh(new T.CylinderGeometry(0.34, 0.4, 1.1, 18), skin); neck.position.set(0, 0.35, -0.05); neck.castShadow = true; H.add(neck);

      function on(nx, ny, nz, out) {
        var l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        var p = new T.Vector3(nx * F.wide, ny * F.tall, nz * F.depth);
        if (out) p.add(new T.Vector3(nx, ny, nz).multiplyScalar(out));
        return p;
      }
      function aim(obj, nx, ny, nz) { obj.lookAt(obj.position.clone().add(new T.Vector3(nx, ny, nz))); }

      // eyes — real eyeballs with eyelids that close
      this.eyes = [];
      [-1, 1].forEach(function (side) {
        var g = new T.Group(); var d = [side * F.eyeGap, F.eyeY, 0.8];
        g.position.copy(on(d[0], d[1], d[2], -0.05)); face.add(g); aim(g, d[0], d[1], d[2]);
        var r = 0.17 * F.eyeSize;
        var ball = new T.Mesh(new T.SphereGeometry(r, 24, 16), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })); g.add(ball);
        var iris = new T.Mesh(new T.SphereGeometry(r * 0.55, 16, 12), new T.MeshStandardMaterial({ color: F.eyeC, roughness: 0.3 })); iris.scale.z = 0.35; iris.position.z = r * 0.86; g.add(iris);
        var pupil = new T.Mesh(new T.SphereGeometry(r * 0.28, 12, 8), dark); pupil.scale.z = 0.3; pupil.position.z = r * 0.98; g.add(pupil);
        var glint = new T.Mesh(new T.SphereGeometry(r * 0.1, 6, 4), new T.MeshBasicMaterial({ color: 0xffffff })); glint.position.set(-r * 0.22, r * 0.25, r * 1.02); g.add(glint);
        var lidG = new T.SphereGeometry(r * 1.1, 24, 12, 0, TAU, 0, Math.PI / 2); lidG.rotateX(Math.PI / 2);
        var up = new T.Mesh(lidG, skin), lo = new T.Mesh(lidG, skin); g.add(up); g.add(lo);
        self.eyes.push({ g: g, iris: iris, pupil: pupil, up: up, lo: lo, r: r, side: side });
        // brow
        var brow = new T.Mesh(new T.TorusGeometry(r * 1.25, 0.03 + 0.02 * F.browThick, 8, 16, Math.PI * 0.85), hairM);
        var bd = [side * F.eyeGap, F.eyeY + 0.3, 0.76];
        brow.position.copy(on(bd[0], bd[1], bd[2], 0.04)); face.add(brow); aim(brow, bd[0], bd[1], bd[2]);
        brow.rotateZ(Math.PI * 0.075); brow.rotateZ(side * -F.browAngle);
        self.eyes[self.eyes.length - 1].brow = brow; brow.userData.side = side;
      });

      // nose
      var nose = new T.Group(); nose.position.copy(on(0, -0.02, 1, 0)); face.add(nose); aim(nose, 0, -0.1, 1);
      var ns = 0.13 * F.noseS;
      if (F.nose === 'long') { var nl = new T.Mesh(new T.CapsuleGeometry(ns * 0.7, ns * 2.2, 6, 12), skin); nl.rotation.x = Math.PI / 2 + 0.3; nl.position.z = ns * 1.2; nose.add(nl); }
      else { var nb = new T.Mesh(new T.SphereGeometry(F.nose === 'round' ? ns * 1.5 : ns, 16, 12), skin); nb.position.z = ns * 0.6; nose.add(nb); }
      [-1, 1].forEach(function (s) { var h = new T.Mesh(new T.SphereGeometry(ns * 0.22, 6, 4), dark); h.position.set(s * ns * 0.5, -ns * 0.55, ns * (F.nose === 'long' ? 1.9 : 0.9)); nose.add(h); });

      // mouth: an inside that opens, lips, teeth, tongue
      var mouth = this.mouth = new T.Group(); mouth.position.copy(on(0, -0.52, 0.86, -0.02)); face.add(mouth); aim(mouth, 0, -0.35, 1);
      var inside = new T.Mesh(new T.SphereGeometry(0.3 * F.mouthW, 20, 12), new T.MeshStandardMaterial({ color: 0x5a1220, roughness: 0.6 })); inside.scale.set(1.15, 0.08, 0.5); mouth.add(inside);
      var lips = new T.Mesh(new T.TorusGeometry(0.28 * F.mouthW, 0.045, 8, 22, Math.PI), new T.MeshStandardMaterial({ color: 0xc44d5a, roughness: 0.55 })); lips.rotation.z = Math.PI; lips.scale.y = 0.55; lips.position.z = 0.03; mouth.add(lips);
      var teeth = new T.Mesh(new T.BoxGeometry(0.4 * F.mouthW, 0.1, 0.06), new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })); teeth.position.set(0, 0.08, 0.06); teeth.visible = false; mouth.add(teeth);
      var tongue = new T.Mesh(new T.SphereGeometry(0.14 * F.mouthW, 12, 8), new T.MeshStandardMaterial({ color: 0xff6b81, roughness: 0.5 })); tongue.scale.set(1, 0.6, 1.4); tongue.position.set(0, -0.1, 0.12); tongue.visible = false; mouth.add(tongue);
      this.mouthParts = { inside: inside, lips: lips, teeth: teeth, tongue: tongue };

      // ears
      this.ears = [];
      [-1, 1].forEach(function (side) {
        var g = new T.Group(); g.position.copy(on(side, 0.02, 0.05, -0.08)); face.add(g); aim(g, side, 0, 0);
        var er = 0.26 * F.ear;
        var e = new T.Mesh(new T.SphereGeometry(er, 16, 12), skin); e.scale.set(1, 1.25, 0.45); e.castShadow = true; g.add(e);
        var inner = new T.Mesh(new T.SphereGeometry(er * 0.55, 12, 8), new T.MeshStandardMaterial({ color: F.skin, roughness: 0.8 })); inner.material.color.multiplyScalar(0.78); inner.scale.set(1, 1.2, 0.3); inner.position.z = er * 0.25; g.add(inner);
        self.ears.push(g);
      });

      // cheeks and freckles
      var blush = new T.MeshStandardMaterial({ color: 0xff7a8a, transparent: true, opacity: F.cheeks, roughness: 1 });
      [-1, 1].forEach(function (s) { var c = new T.Mesh(new T.SphereGeometry(0.24, 12, 8), blush); c.position.copy(on(s * 0.58, -0.22, 0.75, -0.06)); c.scale.z = 0.35; aim(c, s * 0.58, -0.22, 0.75); face.add(c); });
      if (F.freckles) for (var i = 0; i < 9; i++) { var fr = new T.Mesh(new T.SphereGeometry(0.03, 5, 4), new T.MeshStandardMaterial({ color: 0x6b3a1a, roughness: 1 })); var s = i % 2 ? 1 : -1; fr.position.copy(on(s * rand(0.3, 0.7), rand(-0.35, -0.08), 0.8, 0.005)); face.add(fr); }

      // hair
      this._hair(face, F, hairM, on, aim);
      if (F.glasses) this._glasses(face, F, on, aim);
      if (F.mustache) [-1, 1].forEach(function (s) { var m = new T.Mesh(new T.TorusGeometry(0.13, 0.04, 8, 12, Math.PI), hairM); m.position.copy(on(s * 0.16, -0.27, 0.95, 0.02)); aim(m, s * 0.16, -0.27, 0.95); m.rotateZ(s > 0 ? 0.3 : Math.PI - 0.3); face.add(m); });
      if (F.beard) { var bg = new T.SphereGeometry(1.03, 32, 16, 0, TAU, Math.PI * 0.58, Math.PI * 0.36); var beard = new T.Mesh(bg, hairM); beard.scale.set(F.wide, F.tall, F.depth); face.add(beard); }
      this._hat(face, F, on);

      this.scene.add(H);
      // torso, which stays put while the head takes the hits
      var torso = this.torso = new T.Group();
      var shirt = new T.MeshStandardMaterial({ color: F.shirt, roughness: 0.8 });
      var body = new T.Mesh(new T.CapsuleGeometry(1.15, 1.2, 8, 20), shirt); body.rotation.z = Math.PI / 2; body.position.set(0, -2.2, 0); body.scale.set(1, 1, 0.75); body.castShadow = true; body.receiveShadow = true; torso.add(body);
      var collar = new T.Mesh(new T.CylinderGeometry(0.5, 0.55, 0.2, 18), shirt); collar.position.set(0, -1.15, 0); torso.add(collar);
      this.scene.add(torso);

      H.updateMatrixWorld(true);
      this._resetPose();
      this.blinkT = rand(1.5, 4);
    },

    _hair: function (face, F, hairM, on, aim) {
      var T = global.THREE, i, s;
      var cap = function (theta, scale) { var g = new T.SphereGeometry(1.03, 40, 20, 0, TAU, 0, theta); var m = new T.Mesh(g, hairM); m.scale.set(F.wide * (scale || 1), F.tall * (scale || 1), F.depth * (scale || 1)); m.castShadow = true; return m; };
      switch (F.hairdo) {
        case 'short': { var c = cap(Math.PI * 0.42); c.rotation.x = -0.2; face.add(c); break; }
        case 'bun': { face.add(cap(Math.PI * 0.4)); var b = new T.Mesh(new T.SphereGeometry(0.36, 16, 12), hairM); b.position.copy(on(0, 0.95, -0.35, 0.15)); face.add(b); break; }
        case 'long': { face.add(cap(Math.PI * 0.44)); [-1, 1].forEach(function (sd) { var side = new T.Mesh(new T.CapsuleGeometry(0.3, 1.3, 6, 14), hairM); side.position.copy(on(sd * 0.98, -0.2, -0.15, 0.02)); side.position.y -= 0.45; side.castShadow = true; face.add(side); }); var back = new T.Mesh(new T.SphereGeometry(1, 24, 16), hairM); back.scale.set(F.wide * 0.95, F.tall * 1.15, 0.55); back.position.set(0, -0.5, -F.depth * 0.6); face.add(back); break; }
        case 'puff': for (i = 0; i < 11; i++) { s = new T.Mesh(new T.SphereGeometry(rand(0.3, 0.46), 14, 10), hairM); s.position.copy(on(rand(-0.8, 0.8), rand(0.55, 1), rand(-0.6, 0.5), 0.1)); s.castShadow = true; face.add(s); } break;
        case 'curly': for (i = 0; i < 26; i++) { s = new T.Mesh(new T.SphereGeometry(rand(0.16, 0.26), 10, 8), hairM); s.position.copy(on(rand(-1, 1), rand(0.35, 1), rand(-0.9, 0.7), 0.02)); face.add(s); } break;
        case 'spikes': for (i = 0; i < 9; i++) { var a = (i / 9) * TAU; var d = [Math.cos(a) * 0.55, 0.85, Math.sin(a) * 0.55]; s = new T.Mesh(new T.ConeGeometry(0.17, 0.8, 8), hairM); s.position.copy(on(d[0], d[1], d[2], 0.25)); aim(s, d[0], d[1], d[2]); s.rotateX(Math.PI / 2); s.castShadow = true; face.add(s); } face.add(cap(Math.PI * 0.3)); break;
        case 'mohawk': for (i = 0; i < 7; i++) { var z = 0.75 - i * 0.28; var dd = [0, 1, z]; s = new T.Mesh(new T.BoxGeometry(0.16, 0.9 - Math.abs(z) * 0.35, 0.26), hairM); s.position.copy(on(dd[0], dd[1], dd[2], 0.3)); aim(s, 0, 1, z * 0.6); s.rotateX(Math.PI / 2); s.castShadow = true; face.add(s); } break;
        default: break;
      }
    },

    _glasses: function (face, F, on, aim) {
      var T = global.THREE, m = new T.MeshStandardMaterial({ color: 0x222222, roughness: 0.35, metalness: 0.5 });
      var r = 0.24 * F.eyeSize;
      [-1, 1].forEach(function (s) { var ring = new T.Mesh(new T.TorusGeometry(r, 0.025, 8, 24), m); ring.position.copy(on(s * F.eyeGap, F.eyeY, 0.8, 0.16)); aim(ring, s * F.eyeGap, F.eyeY, 0.8); face.add(ring); });
      var bridge = new T.Mesh(new T.BoxGeometry(F.eyeGap * 2 * F.wide - r * 2 + 0.06, 0.03, 0.03), m); bridge.position.copy(on(0, F.eyeY + 0.02, 0.83, 0.2)); face.add(bridge);
      [-1, 1].forEach(function (s) { var arm = new T.Mesh(new T.BoxGeometry(0.03, 0.03, 1.0), m); arm.position.copy(on(s * 0.95, F.eyeY, 0.35, 0.05)); face.add(arm); });
    },

    _hat: function (face, F, on) {
      var T = global.THREE;
      this.hat = null;
      if (F.hat === 'none') return;
      var g = new T.Group(), top = on(0, 1, 0, 0);
      g.position.copy(top); g.position.y += 0.02;
      if (F.hat === 'top') {
        var m = new T.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
        var crown = new T.Mesh(new T.CylinderGeometry(0.55, 0.6, 0.9, 24), m); crown.position.y = 0.4; crown.castShadow = true; g.add(crown);
        var brim = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 0.07, 32), m); brim.position.y = -0.05; brim.castShadow = true; g.add(brim);
        var band = new T.Mesh(new T.CylinderGeometry(0.57, 0.62, 0.16, 24), new T.MeshStandardMaterial({ color: 0xd62828 })); band.position.y = 0.08; g.add(band);
        g.rotation.z = 0.12;
      } else if (F.hat === 'cap') {
        var cm = new T.MeshStandardMaterial({ color: pick([0xd62828, 0x2f7bd9, 0x43a047, 0xffb300]), roughness: 0.7 });
        var dome = new T.Mesh(new T.SphereGeometry(1.06, 32, 16, 0, TAU, 0, Math.PI * 0.4), cm); dome.scale.set(F.wide, F.tall, F.depth); dome.position.copy(top).multiplyScalar(-1); dome.position.y += 0; dome.castShadow = true; g.add(dome);
        var visor = new T.Mesh(new T.BoxGeometry(1.0, 0.06, 0.6), cm); visor.position.set(0, -0.28 * F.tall, F.depth * 0.95); visor.rotation.x = 0.15; g.add(visor);
        var button = new T.Mesh(new T.SphereGeometry(0.08, 8, 6), cm); button.position.y = 0.08; g.add(button);
      } else if (F.hat === 'party') {
        var pm = new T.MeshStandardMaterial({ color: pick([0xff5da2, 0x60d3ff, 0xffd84d, 0xc084fc]), roughness: 0.6 });
        var cone = new T.Mesh(new T.ConeGeometry(0.48, 1.1, 24), pm); cone.position.y = 0.5; cone.castShadow = true; g.add(cone);
        var pom = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), new T.MeshStandardMaterial({ color: 0xffffff })); pom.position.y = 1.08; g.add(pom);
        g.rotation.z = -0.18;
      } else {
        var gm = new T.MeshStandardMaterial({ color: 0xffc94d, roughness: 0.35, metalness: 0.6 });
        var ring = new T.Mesh(new T.CylinderGeometry(0.58, 0.62, 0.34, 24, 1, true), gm); ring.material.side = T.DoubleSide; ring.position.y = 0.12; ring.castShadow = true; g.add(ring);
        for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; var pt = new T.Mesh(new T.ConeGeometry(0.1, 0.32, 6), gm); pt.position.set(Math.cos(a) * 0.55, 0.42, Math.sin(a) * 0.55); g.add(pt); var gem = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), new T.MeshStandardMaterial({ color: pick([0xff3b5b, 0x3bb6ff, 0x4be08a]), roughness: 0.2 })); gem.position.set(Math.cos(a + 0.5) * 0.6, 0.12, Math.sin(a + 0.5) * 0.6); g.add(gem); }
      }
      face.add(g);
      this.hat = { g: g, home: g.position.clone(), rot: g.rotation.clone(), loose: false };
    },

    _buildHand: function () {
      var T = global.THREE, g = new T.Group();
      var skin = new T.MeshStandardMaterial({ color: 0xf3c9a0, roughness: 0.65 });
      var palm = new T.Mesh(new T.BoxGeometry(0.95, 1.05, 0.3), skin); palm.castShadow = true; g.add(palm);
      var soften = new T.Mesh(new T.CapsuleGeometry(0.45, 0.6, 6, 12), skin); soften.rotation.z = Math.PI / 2; soften.position.y = -0.45; soften.scale.z = 0.6; g.add(soften);
      for (var i = 0; i < 4; i++) {
        var len = [0.5, 0.62, 0.58, 0.44][i];
        var f = new T.Mesh(new T.CapsuleGeometry(0.115, len, 6, 12), skin); f.position.set(-0.36 + i * 0.24, 0.55 + len / 2, 0); f.castShadow = true; g.add(f);
      }
      var thumb = new T.Mesh(new T.CapsuleGeometry(0.13, 0.5, 6, 12), skin); thumb.position.set(-0.62, 0.05, 0.05); thumb.rotation.z = 0.75; thumb.castShadow = true; g.add(thumb);
      var wrist = new T.Mesh(new T.CapsuleGeometry(0.3, 1.4, 6, 12), skin); wrist.position.set(0, -1.35, 0.5); wrist.rotation.x = 0.55; wrist.castShadow = true; g.add(wrist);
      var cuff = new T.Mesh(new T.CylinderGeometry(0.42, 0.42, 0.3, 16), new T.MeshStandardMaterial({ color: 0x2f7bd9 })); cuff.position.set(0, -1.9, 0.85); cuff.rotation.x = 0.55; g.add(cuff);
      g.position.set(1.5, -1.4, 2.0);
      this.handBase = 0.74;
      g.scale.setScalar(this.handBase);
      this.scene.add(g);
      this.hand = g;
      this.handT = new T.Vector3(1.5, -1.4, 2.0);
      this.handRest = new T.Quaternion().setFromEuler(new T.Euler(0.15, -0.35, 0.1));
      g.quaternion.copy(this.handRest);
      this.swing = null;
    },

    _disposeGroup: function (g) {
      g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { if (m && m.map) m.map.dispose(); if (m) m.dispose(); }); } });
    },

    _resetPose: function () {
      this.yaw = 0; this.yawV = 0; this.pitch = 0; this.pitchV = 0; this.roll = 0; this.rollV = 0;
      this.sq = 1; this.sqV = 0;
      this.expr = null; this.exprT = 0; this.dizzy = 0; this.shakeOff = 0;
      this.blink = 0;
    },

    /* ── input ─────────────────────────────────────────────────── */

    _bind: function () {
      var self = this;
      function ndc(e) { var r = self.canvas.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }; }
      this._down = function (e) {
        if (!self.running || self.paused) return;
        e.preventDefault();
        try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        var p = ndc(e);
        self._aimHand(p);
        self.press = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, fired: false };
        self._smack(p, 1);
      };
      this._move = function (e) {
        if (!self.running || self.paused) return;
        var p = ndc(e);
        self._aimHand(p);
        // a fast swipe across the face is a harder backhand
        if (self.press && self.press.id === e.pointerId && !self.press.fired) {
          var dx = e.clientX - self.press.x, dt = performance.now() - self.press.t;
          if (Math.abs(dx) > self.W * 0.3 && dt < 220) { self.press.fired = true; self._smack(p, 1.55); }
        }
      };
      this._up = function () { self.press = null; };
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

    _aimHand: function (p) {
      var T = global.THREE;
      this.raycaster.setFromCamera(new T.Vector2(p.x, p.y), this.camera);
      var hit = new T.Vector3();
      if (this.raycaster.ray.intersectPlane(this.handPlane, hit)) this.handT.copy(hit);
    },

    // Where would this tap land? Ray-cast onto the head; a tap that just misses
    // still aims for the nearest bit of cheek, so a small child never whiffs.
    _smack: function (p, power) {
      var T = global.THREE;
      if (this.swing && this.swing.t < this.swing.dur * 0.6) return;
      this.raycaster.setFromCamera(new T.Vector2(p.x, p.y), this.camera);
      var targets = [this.head]; if (this.hat && !this.hat.loose) targets.push(this.hat.g);
      var hits = this.raycaster.intersectObjects(targets, true);
      var point, normal, landed = true;
      if (hits.length) {
        var h = hits[0]; point = h.point.clone();
        normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : point.clone().sub(this.face.getWorldPosition(new T.Vector3())).normalize();
      } else {
        // nearest point on the head to the ray, if it's close enough to count
        var c = this.face.getWorldPosition(new T.Vector3()), ray = this.raycaster.ray;
        var closest = ray.closestPointToPoint(c, new T.Vector3());
        var d = closest.distanceTo(c);
        if (d > 1.9) landed = false;
        normal = closest.clone().sub(c).normalize(); if (normal.length() < 0.01) normal.set(0, 0, 1);
        point = c.clone().add(new T.Vector3(normal.x * this.F.wide, normal.y * this.F.tall, normal.z * this.F.depth));
      }
      var side = point.x >= 0 ? 1 : -1;
      var start = this.hand.position.clone();
      var windup = start.clone().add(new T.Vector3(side * 1.1, 0.5, 0.9));
      this.swing = { t: 0, dur: 0.26, start: start, windup: windup, point: point, normal: normal, side: side, power: power * rand(0.9, 1.15), hit: false, landed: landed };
      try { global.RoarAudio.sfx('whoosh'); } catch (e) {}
    },

    _hit: function (sw) {
      var T = global.THREE, now = this.time;
      var quick = now - this.lastHit < 0.85;
      this.combo = quick ? this.combo + 1 : 1;
      this.lastHit = now;
      var power = sw.power, hard = power > 1.3;
      this.score += Math.min(this.combo, 5);
      if (this.score > this.best) { this.best = this.score; save(SAVED, String(this.best)); }

      var side = sw.side, hy = sw.point.y - this.face.getWorldPosition(new T.Vector3()).y;
      this.yawV   += side * 5.2 * power;
      this.rollV  += -side * 3.6 * power;
      this.pitchV += -hy * 4.5 * power + rand(-1, 1);
      this.sqV    -= 5.5 * power;
      this.shake   = 0.22 * power;

      this.expr = pick(EXPR); this.exprT = rand(0.7, 1.1);
      if (this.combo >= 4 || hard) { this.dizzy = 2.6; this.expr = 'dizzy'; this.exprT = 2.6; this._stars(); }

      this._mark(sw.point, sw.normal);
      this._pop(sw.point, hard ? 'POW!' : pick(WORDS), hard);
      this._sweat(sw.point, sw.normal, side, hard ? 9 : 5);
      if (hard || Math.random() < 0.5) this._tears();
      if (this.hat && !this.hat.loose && (hard || this.combo >= 3 || Math.random() < 0.3)) this._knockHat(side, power);

      try { global.RoarAudio.sfx(hard ? 'punch' : 'smack'); } catch (e) {}
      if (now - (this._lastVoice || -1) > 0.35) {
        this._lastVoice = now;
        var r = Math.random();
        if (hard || this.combo >= 4) { try { global.RoarAudio.sfx('cry'); } catch (e) {} }
        else if (r < 0.4) { try { global.RoarAudio.sfx('whimper'); } catch (e) {} }
        else if (r < 0.7) { try { global.Say.speak(pick(OWS)); } catch (e) {} }
      }
      this._render();
    },

    /* ── the loop ──────────────────────────────────────────────── */

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this._step(dt);
      this._draw(dt);
      if (this.running) this.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    _step: function (dt) {
      var T = global.THREE, i, o;
      this.time += dt;

      this.yaw = spring(this, 'yaw', 'yawV', dt, 40, 5.2);
      this.pitch = spring(this, 'pitch', 'pitchV', dt, 40, 5.2);
      this.roll = spring(this, 'roll', 'rollV', dt, 44, 5.2);
      this.sqV += (-(this.sq - 1) * 110 - this.sqV * 9) * dt; this.sq = clamp(this.sq + this.sqV * dt, 0.62, 1.3);
      this.shake *= Math.exp(-dt * 8); if (this.shake < 0.004) this.shake = 0;

      if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.expr = null; }
      if (this.dizzy > 0) { this.dizzy -= dt; if (this.dizzy <= 0) { this.shakeOff = 0.6; try { global.RoarAudio.sfx('puff'); } catch (e) {} } }
      if (this.shakeOff > 0) { this.shakeOff -= dt; this.yaw += Math.sin(this.time * 40) * 0.09 * (this.shakeOff / 0.6); }
      this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = rand(2, 5); }
      if (this.blink > 0) this.blink -= dt;

      // the swing
      if (this.swing) {
        var sw = this.swing; sw.t += dt; var k = clamp(sw.t / sw.dur, 0, 1);
        if (!sw.hit && k >= 0.5) { sw.hit = true; if (sw.landed) this._hit(sw); }
        if (k >= 1) this.swing = null;
      }

      // the loose hat falls, bounces, then pops back on
      var hat = this.hat;
      if (hat && hat.loose) {
        var hg = hat.g; hat.vy -= 16 * dt;
        hg.position.x += hat.vx * dt; hg.position.y += hat.vy * dt; hg.position.z += hat.vz * dt;
        hg.rotation.x += hat.sx * dt; hg.rotation.z += hat.sz * dt;
        if (hg.position.y < this.floorY + 0.2) { hg.position.y = this.floorY + 0.2; hat.vy = -hat.vy * 0.35; hat.vx *= 0.6; hat.vz *= 0.6; hat.sx *= 0.4; hat.sz *= 0.4; }
        hat.t -= dt;
        if (hat.t <= 0) { this.scene.remove(hg); this.face.add(hg); hg.position.copy(hat.home); hg.rotation.copy(hat.rot); hat.loose = false; this._pop(this.face.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 1.4, 0)), 'hat back on!', false); }
      }

      for (i = this.marks.length - 1; i >= 0; i--) {
        o = this.marks[i]; o.life -= dt * 0.22;
        o.g.children.forEach(function (c) { c.material.opacity = Math.max(0, Math.min(0.8, o.life * 0.8)); });
        if (o.life <= 0) { this.face.remove(o.g); this._disposeGroup(o.g); this.marks.splice(i, 1); }
      }
      for (i = this.bits.length - 1; i >= 0; i--) {
        o = this.bits[i]; o.life -= dt; o.vy -= 9 * dt;
        o.m.position.x += o.vx * dt; o.m.position.y += o.vy * dt; o.m.position.z += o.vz * dt;
        if (o.m.position.y < this.floorY + 0.05) { o.m.position.y = this.floorY + 0.05; o.vy = -o.vy * 0.25; o.vx *= 0.5; o.vz *= 0.5; }
        o.m.material.opacity = clamp(o.life / o.max, 0, 1);
        if (o.life <= 0) { this.scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); this.bits.splice(i, 1); }
      }
      for (i = this.stars.length - 1; i >= 0; i--) {
        o = this.stars[i]; o.a += dt * 4.5;
        var top = this.face.getWorldPosition(new T.Vector3()); top.y += this.F.tall * 1.05 + 0.3;
        o.s.position.set(top.x + Math.cos(o.a) * 1.1, top.y + Math.sin(o.a * 2) * 0.12, top.z + Math.sin(o.a) * 1.1);
        o.s.material.rotation += dt * 3;
        if (this.dizzy <= 0) { o.s.material.opacity -= dt * 3; if (o.s.material.opacity <= 0) { this.scene.remove(o.s); o.s.material.map.dispose(); o.s.material.dispose(); this.stars.splice(i, 1); } }
      }
      for (i = this.pops.length - 1; i >= 0; i--) {
        o = this.pops[i]; o.t += dt; o.s.position.y += dt * 1.4; o.s.position.x += o.vx * dt;
        var kk = o.t / 0.75; o.s.material.opacity = Math.max(0, 1 - kk * kk); var sc = o.base * (1 + Math.sin(Math.min(1, kk * 3) * Math.PI / 2) * 0.35);
        o.s.scale.set(sc * 2.2, sc, 1);
        if (o.t > 0.75) { this.scene.remove(o.s); o.s.material.map.dispose(); o.s.material.dispose(); this.pops.splice(i, 1); }
      }
    },

    _draw: function (dt) {
      if (!this.scene) return;
      var T = global.THREE, F = this.F, t = this.time, i, e;
      var H = this.pivot;
      // pose the head: springs plus a little idle life
      H.rotation.set(this.pitch + Math.sin(t * 0.9) * 0.02, this.yaw + Math.sin(t * 0.6) * 0.03, this.roll);
      var sx = 1 / Math.sqrt(this.sq);
      H.scale.set(sx, this.sq, sx);
      var breathe = 1 + Math.sin(t * 1.6) * 0.012; this.torso.scale.set(breathe, 1, breathe);

      // expression
      var ex = this.expr, up = -1.2, lo = 1.2, open = 0.08, smile = true, teeth = false, tongue = false, browK = F.browAngle;
      if (ex === 'ow') { up = -0.45; lo = 0.45; open = 1; teeth = true; browK = 0.5; smile = false; }
      else if (ex === 'wince') { up = -0.1; lo = 0.15; open = 0.35; browK = 0.6; smile = false; }
      else if (ex === 'shock') { up = -1.6; lo = 1.6; open = 1.1; browK = -0.55; smile = false; }
      else if (ex === 'tongue') { up = -0.35; lo = 0.8; open = 0.7; tongue = true; browK = F.browAngle; }
      else if (ex === 'dizzy') { up = -0.7; lo = 0.7; open = 0.5; browK = 0.3; smile = false; }
      if (this.blink > 0) { up = -0.05; lo = 0.1; }
      // pupils follow the hand a little, or spin when dizzy
      var hp = this.hand.position;
      for (i = 0; i < 2; i++) {
        e = this.eyes[i];
        e.up.rotation.x = lerp(e.up.rotation.x, up, 0.35); e.lo.rotation.x = lerp(e.lo.rotation.x, lo, 0.35);
        var px, py;
        if (ex === 'dizzy') { px = Math.cos(t * 9 + i) * e.r * 0.45; py = Math.sin(t * 9 + i) * e.r * 0.45; }
        else { var wp = e.g.getWorldPosition(new T.Vector3()); px = clamp((hp.x - wp.x) * 0.05, -e.r * 0.35, e.r * 0.35); py = clamp((hp.y - wp.y) * 0.05, -e.r * 0.3, e.r * 0.3); }
        e.iris.position.x = lerp(e.iris.position.x, px, 0.25); e.iris.position.y = lerp(e.iris.position.y, py, 0.25);
        e.pupil.position.x = e.iris.position.x; e.pupil.position.y = e.iris.position.y;
        var want = Math.PI * 0.075 + e.side * -browK;
        e.brow.rotation.z = lerp(e.brow.rotation.z, want, 0.3);
      }
      var mp = this.mouthParts;
      mp.inside.scale.y = lerp(mp.inside.scale.y, open, 0.35);
      mp.lips.rotation.z = lerp(mp.lips.rotation.z, smile ? Math.PI : 0, 0.2);
      mp.lips.position.y = smile ? 0.02 : -0.04;
      mp.teeth.visible = teeth || open > 0.6; mp.tongue.visible = tongue;
      mp.tongue.position.z = tongue ? 0.22 : 0.12;

      // the hand: follows the finger, or swings
      var hand = this.hand;
      if (this.swing) {
        var sw = this.swing, k = clamp(sw.t / sw.dur, 0, 1), eIn = Math.sin(k * Math.PI);
        var pos = new T.Vector3();
        if (k < 0.5) { var a = k / 0.5; pos.lerpVectors(sw.start, sw.point.clone().add(sw.normal.clone().multiplyScalar(0.34)), a * a); pos.lerp(sw.windup, Math.sin(a * Math.PI) * 0.6); }
        else { var b = (k - 0.5) / 0.5; pos.lerpVectors(sw.point.clone().add(sw.normal.clone().multiplyScalar(0.34)), this.handT, 1 - (1 - b) * (1 - b)); }
        hand.position.copy(pos);
        var q = new T.Quaternion(), m4 = new T.Matrix4(); m4.lookAt(pos.clone().sub(sw.normal), pos, new T.Vector3(0, 1, 0)); q.setFromRotationMatrix(m4);
        hand.quaternion.slerpQuaternions(this.handRest, q, eIn);
        var hs = this.handBase * (1 + eIn * 0.15); hand.scale.set(hs, hs, hs);
      } else {
        hand.position.lerp(this.handT, Math.min(1, 12 * dt));
        hand.position.y += Math.sin(t * 2.2) * 0.004;
        var rest = new T.Quaternion().setFromEuler(new T.Euler(0.15 + Math.sin(t * 1.3) * 0.05, hand.position.x > 0 ? -0.35 : 0.35, 0.1));
        hand.quaternion.slerp(rest, Math.min(1, 8 * dt));
        hand.scale.lerp(new T.Vector3(this.handBase, this.handBase, this.handBase), 0.2);
      }

      // camera shake
      var sh = this.shake;
      this.camera.position.set(this.camBase.x + rand(-sh, sh), this.camBase.y + rand(-sh, sh), this.camBase.z);
      this.camera.lookAt(0, -0.1, 0);
      this.renderer.render(this.scene, this.camera);
    },

    /* ── effects ───────────────────────────────────────────────── */

    // A red hand-print stuck to the face where the hand landed.
    _mark: function (point, normal) {
      var T = global.THREE, g = new T.Group();
      var m = new T.MeshStandardMaterial({ color: 0xff2e4d, transparent: true, opacity: 0.8, roughness: 1, depthWrite: false });
      var palm = new T.Mesh(new T.SphereGeometry(0.19, 12, 8), m); palm.scale.set(1, 1.1, 0.25); palm.position.y = -0.06; g.add(palm);
      for (var i = 0; i < 4; i++) { var f = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), m); f.scale.set(1, 1.9, 0.25); f.position.set(-0.13 + i * 0.087, 0.22, 0); g.add(f); }
      var th = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), m); th.scale.set(1, 1.5, 0.25); th.position.set(-0.24, 0.02, 0); th.rotation.z = 0.7; g.add(th);
      var local = this.face.worldToLocal(point.clone().add(normal.clone().multiplyScalar(0.035)));
      g.position.copy(local);
      var dirLocal = this.face.worldToLocal(point.clone().add(normal)).sub(this.face.worldToLocal(point.clone())).normalize();
      g.lookAt(g.position.clone().add(dirLocal));
      // lookAt in a child uses world space; fix by aiming in local space instead
      var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), dirLocal); g.quaternion.copy(q);
      g.rotateZ(rand(-0.5, 0.5));
      this.face.add(g);
      this.marks.push({ g: g, life: 1 });
      if (this.marks.length > 7) { var old = this.marks.shift(); this.face.remove(old.g); this._disposeGroup(old.g); }
    },

    _sweat: function (point, normal, side, n) {
      var T = global.THREE;
      for (var i = 0; i < n; i++) {
        var m = new T.Mesh(new T.SphereGeometry(rand(0.04, 0.09), 6, 5), new T.MeshBasicMaterial({ color: i % 3 ? 0xbfe9ff : 0xffe066, transparent: true }));
        m.position.copy(point);
        var v = rand(2, 5);
        this.scene.add(m);
        this.bits.push({ m: m, vx: (normal.x + side * 0.6) * v + rand(-1, 1), vy: rand(1.5, 4), vz: normal.z * v + rand(0, 2), life: rand(0.5, 0.9), max: 0.9 });
      }
    },

    _tears: function () {
      var T = global.THREE;
      for (var e = 0; e < 2; e++) {
        var wp = this.eyes[e].g.getWorldPosition(new T.Vector3());
        for (var i = 0; i < 3; i++) {
          var m = new T.Mesh(new T.SphereGeometry(0.06, 6, 5), new T.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true }));
          m.scale.y = 1.6; m.position.copy(wp); m.position.z += 0.25;
          this.scene.add(m);
          this.bits.push({ m: m, vx: this.eyes[e].side * rand(0.5, 2.5), vy: rand(0.5, 2.5), vz: rand(0.5, 1.5), life: rand(0.7, 1.1), max: 1.1 });
        }
      }
    },

    _stars: function () {
      var T = global.THREE;
      if (this.stars.length) return;
      for (var i = 0; i < 5; i++) {
        var s = new T.Sprite(new T.SpriteMaterial({ map: this._textTex('⭐', 128, '#ffd24c'), transparent: true, depthTest: false }));
        s.scale.set(0.55, 0.55, 1);
        this.scene.add(s);
        this.stars.push({ s: s, a: i / 5 * TAU });
      }
    },

    _knockHat: function (side, power) {
      var hat = this.hat, T = global.THREE;
      var wp = hat.g.getWorldPosition(new T.Vector3()), wq = hat.g.getWorldQuaternion(new T.Quaternion());
      this.face.remove(hat.g); this.scene.add(hat.g);
      hat.g.position.copy(wp); hat.g.quaternion.copy(wq);
      hat.loose = true; hat.vx = side * rand(2, 4) * power; hat.vy = rand(4, 6) * power; hat.vz = rand(0.5, 2); hat.sx = rand(-6, 6); hat.sz = rand(-6, 6); hat.t = 3;
      try { global.RoarAudio.sfx('bust'); } catch (e) {}
    },

    // A comic word at the point of impact.
    _pop: function (point, word, big) {
      var T = global.THREE;
      var s = new T.Sprite(new T.SpriteMaterial({ map: this._textTex(word, 512, big ? '#ffd24c' : '#ff3b5b', true), transparent: true, depthTest: false }));
      s.position.copy(point).add(new T.Vector3(0, 0.5, 0.6));
      var base = big ? 1.0 : 0.72;
      s.scale.set(base * 2.2, base, 1); s.material.rotation = rand(-0.2, 0.2);
      this.scene.add(s);
      this.pops.push({ s: s, t: 0, base: base, vx: rand(-0.4, 0.4) });
    },

    _textTex: function (text, size, color, outline) {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = size; cv.height = size / (outline ? 2 : 1);
      var c = cv.getContext('2d');
      c.font = '900 ' + Math.round(cv.height * 0.72) + 'px system-ui, -apple-system, Segoe UI, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      if (outline) { c.lineWidth = cv.height * 0.12; c.strokeStyle = '#fff'; c.strokeText(text, cv.width / 2, cv.height / 2); c.lineWidth = cv.height * 0.05; c.strokeStyle = '#2a0a1a'; c.strokeText(text, cv.width / 2, cv.height / 2); }
      c.fillStyle = color; c.fillText(text, cv.width / 2, cv.height / 2);
      return new T.CanvasTexture(cv);
    },

    _glowTex: function (inner, outer) {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = 512; cv.height = 384;
      var c = cv.getContext('2d'), g = c.createRadialGradient(256, 150, 20, 256, 190, 330);
      g.addColorStop(0, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(0, 0, 512, 384);
      var tex = new T.CanvasTexture(cv); if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; return tex;
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.note) {
        e.note.textContent = this.combo >= 2 ? '🔥 x' + this.combo + ' COMBO!' : '✋ smacks';
        e.note.classList.toggle('is-combo', this.combo >= 2);
      }
    }
  };

  global.SmackGame = SmackGame;
})(window);
