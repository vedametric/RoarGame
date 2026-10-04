/*
 * game-smack.js — "NO SMACK GAME"
 *
 * A game that teaches the opposite of its name: smacking is not ok.
 *
 * A person stands in a spotlight and a hand follows your finger. Touch them
 * gently — a plain tap — and they light up, hearts float off them, the person
 * behind cheers "That is kind!", and that is the only thing in the game that
 * scores. Swipe your hand across them instead and it lands as a smack: no
 * points at all, "NO SMACKING!" pops up, their face falls, they cry, and the
 * person standing behind shouts "No smacking!" out loud. Your run of kind
 * touches goes back to nothing and you start being gentle again.
 *
 * Nothing is ever damaged. There are no marks, no bruises and no blood — a
 * smack leaves someone upset, and that is the whole point being made.
 *
 * Built on Three.js (vendor/), so they are really lit and shadowed, with real
 * eyelids that squint, a mouth that opens and brows that knit. A fresh person
 * is rolled every time the game loads, and on 🎲 NEW FACE: skin, hair colour
 * and style, eye size and spacing and colour, brows, nose, ears, freckles,
 * glasses, a moustache or beard, a hat. Everything is built from primitives in
 * code; there are no image assets.
 *
 * Somebody is always watching: one onlooker stands on the floor right behind.
 * On a smack they turn side-on, throw one hand out in front and sweep the
 * other back behind, lean into a slanted pose with one leg up, and shout "No
 * smacking!" — all stock still on the spot. On a kind touch they skip the lean
 * and just throw their hands up and cheer. It's the same person for as long as
 * the face lasts; a new face brings a different onlooker.
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
  // what the onlooker says out loud, on a smack and on a kind touch
  var NOS = ['No smacking!', 'No! Not right!', 'We do not smack!', 'Smacking is not ok!', 'Be gentle!'];
  var CHEERS = ['That is kind!', 'Well done!', 'Lovely!', 'That is the way!', 'So gentle!'];
  var PANTS = [0x2b3a67, 0x333333, 0x5a3e2b, 0x1e5b4a, 0x6b2f5a];
  var BY_STYLES = ['short', 'long', 'bun', 'bald', 'puff', 'cap'];
  // The onlooker's routine, as Sienna choreographed (and acted out for a
  // photo): they turn side-on to the head, throw one hand out in front and
  // sweep the other back behind, then lean right forward — slanted, one leg on
  // the floor and the other up behind — and hold it there, stock still, while
  // shouting "Nooooo!"; then hands up, still on the spot. They stay rooted to
  // one place throughout: no hopping, no running about. Times in seconds.
  var BY_STEP = 0.3;         // each arm beat
  var BY_SAY = BY_STEP * 2;  // into the lean, and the "Nooooo!"
  var BY_HOLD = 1.5;         // how long the lean is held, stock still
  var BY_HANDSAT = BY_SAY + BY_HOLD;
  var BY_HANDS = 1.2;        // hands up, on the spot
  var BY_SETTLE = 0.4;       // calming back down
  var BY_Z = -2.2;           // how far behind the head they stand
  var VICT_SHIFT = 0.6;      // the one being smacked leans away from the onlooker,
                             // so the pair of them share the width of the screen
  var BY_OFF = 0.68;         // how far to one side, as a fraction of half the screen
  var BY_TALL = 3.95;        // the onlooker's height before scaling
  var FACE_K = 0.55;         // the head, as a share of the body it sits on
  var BY_H = 5.4;            // how tall they stand; they are further back, so on
                             // screen this reads as an ordinary person behind
  var BY_FACE = 1.0;         // turned most of the way side-on, but angled enough
                             // toward us that the lean carries their head forward
                             // rather than straight behind the big head
  var CAM_Z = 9.5;           // far enough back to get both of them in shot
  var CAM_LOOK = -0.5;       // what the camera is pointed at
  var SORRY = ['NO SMACKING!', 'NOT RIGHT!', 'THAT HURTS!', 'NO!'];
  var KINDPOP = ['THANK YOU!', 'SO KIND!', 'LOVELY!', 'GENTLE!'];
  var EXPR = ['sad', 'ow', 'wince'];

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
      this._byPlace();
    },

    /* ── the studio ────────────────────────────────────────────── */

    _scene: function () {
      var T = global.THREE;
      var scene = this.scene = new T.Scene();
      scene.background = new T.Color(0x1d0f3a);
      this.camera = new T.PerspectiveCamera(38, 1, 0.1, 60);
      this.camera.position.set(0, 0.6, CAM_Z);
      this.camera.lookAt(0, CAM_LOOK, 0);
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
      this.handPlane = new T.Plane(new T.Vector3(0, 0, 1), -1.0);
      this._buildHand();
    },

    _teardown: function () {
      if (!this.scene) return;
      this.scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { var ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(function (m) { if (m && m.map) m.map.dispose(); if (m) m.dispose(); }); }
      });
      while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
      this.scene = null; this.pivot = null; this.victim = null; this.hand = null; this.by = null;
    },

    _newGame: function () {
      this.score = 0; this.kindRun = 0; this.sad = 0;
      this.bits = []; this.pops = [];
      this.time = 0; this.shake = 0;
      this.newFace();
      this._render();
    },

    again: function () {
      if (!this.running) return;
      this.newFace();
      try { global.RoarAudio.sfx('sparkle'); } catch (e) {}
      try { global.Say.speak('Be gentle!'); } catch (e) {}
      this._render();
    },

    /* ── building a face ───────────────────────────────────────── */

    newFace: function () {
      var T = global.THREE, self = this;
      if (this.victim) { this._disposeGroup(this.victim); this.scene.remove(this.victim); }
      this.kindRun = 0; this.sad = 0;

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
      // Built to the same bones and the same height as the onlooker, so the two
      // of them are the same size: feet at 0, 3.95 tall before scaling, with the
      // head a set share of that rather than a giant ball with a body under it.
      var H = this.pivot = new T.Group(); H.position.set(0, 2.6, 0);   // turns at the neck
      var face = this.face = new T.Group(); face.position.set(0, 0.78, 0);
      face.scale.setScalar(FACE_K); H.add(face);
      var head = this.head = new T.Mesh(new T.SphereGeometry(1, 56, 40), skin);
      head.scale.set(F.wide, F.tall, F.depth); head.castShadow = true; head.receiveShadow = true; face.add(head);
      var chin = new T.Mesh(new T.SphereGeometry(0.55, 24, 16), skin); chin.position.set(0, -F.tall * 0.62, 0.22); chin.scale.set(1.15, 0.8, 0.9); face.add(chin);
      var neck = new T.Mesh(new T.CylinderGeometry(0.16, 0.19, 0.42, 12), skin); neck.position.set(0, 0.16, 0); neck.castShadow = true; H.add(neck);

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
      // the body under it, bone for bone the same as the onlooker's
      var torso = this.torso = new T.Group();
      var shirt = new T.MeshStandardMaterial({ color: F.shirt, roughness: 0.8 });
      var trews = new T.MeshStandardMaterial({ color: pick(PANTS), roughness: 0.85 });
      var shoes = new T.MeshStandardMaterial({ color: 0x2a2a32, roughness: 0.55 });
      [-1, 1].forEach(function (sd) {
        var hip = new T.Group(); hip.position.set(sd * 0.26, 1.3, 0);
        var leg = new T.Mesh(new T.CapsuleGeometry(0.2, 1.0, 4, 10), trews); leg.position.y = -0.58; leg.castShadow = true; hip.add(leg);
        var ft = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), shoes); ft.scale.set(1, 0.6, 1.4); ft.position.set(0, -1.18, 0.08); ft.castShadow = true; hip.add(ft);
        torso.add(hip);
      });
      var chest = new T.Mesh(new T.CapsuleGeometry(0.55, 0.9, 6, 16), shirt);
      chest.position.y = 2.05; chest.scale.set(F.wide, 1, 0.72);
      chest.castShadow = true; chest.receiveShadow = true; torso.add(chest);
      this.bodyArms = [];
      [-1, 1].forEach(function (sd) {
        var sh = new T.Group(); sh.position.set(sd * 0.64 * F.wide, 2.6, 0);
        var arm = new T.Mesh(new T.CapsuleGeometry(0.13, 0.8, 4, 10), shirt); arm.position.y = -0.52; arm.castShadow = true; sh.add(arm);
        var hnd = new T.Mesh(new T.SphereGeometry(0.17, 12, 8), skin); hnd.position.y = -1.1; hnd.castShadow = true; sh.add(hnd);
        sh.userData.side = sd; torso.add(sh); self.bodyArms.push(sh);
      });

      // both halves ride in one group, stood on the floor at the shared height
      var victim = this.victim = new T.Group();
      victim.add(torso); victim.add(H);
      victim.position.set(0, this.floorY, 0);
      victim.scale.setScalar(BY_H / BY_TALL);
      this.faceK = FACE_K * BY_H / BY_TALL;     // how big a face unit is in the world
      this.scene.add(victim);

      H.updateMatrixWorld(true);
      this._resetPose();
      this.blinkT = rand(1.5, 4);
      this._bystander();
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
        case 'mohawk': for (i = 0; i < 7; i++) { var z = 0.75 - i * 0.28; var dd = [0, 1, z]; s = new T.Mesh(new T.BoxGeometry(0.3, 0.75 - Math.abs(z) * 0.3, 0.3), hairM); s.position.copy(on(dd[0], dd[1], dd[2], 0.16)); aim(s, 0, 1, z * 0.6); s.rotateX(Math.PI / 2); s.castShadow = true; face.add(s); } break;
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
      this.hat = { g: g };
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
      g.position.set(1.15, -1.5, 1.0);
      this.handBase = 0.42;
      g.scale.setScalar(this.handBase);
      this.scene.add(g);
      this.hand = g;
      this.handT = new T.Vector3(1.15, -1.5, 1.0);
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
      this.expr = null; this.exprT = 0;
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
        self._reach(p, true);                 // a plain touch is a gentle one
      };
      this._move = function (e) {
        if (!self.running || self.paused) return;
        var p = ndc(e);
        self._aimHand(p);
        // dragging your hand hard across them is a smack — and the game has
        // something to say about that
        if (self.press && self.press.id === e.pointerId && !self.press.fired) {
          var dx = e.clientX - self.press.x, dt = performance.now() - self.press.t;
          if (Math.abs(dx) > self.W * 0.3 && dt < 320) { self.press.fired = true; self._reach(p, false); }
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

    // Where would this touch land? Ray-cast onto the head; a tap that just
    // misses still aims for the nearest bit of cheek, so a small child never
    // whiffs. `kind` is the whole difference between the two things you can do.
    _reach: function (p, kind) {
      var T = global.THREE;
      // A gentle touch always gets through, and a swipe cuts in on one, so the
      // moment it turns into a smack the game can say so. Only a second smack
      // has to wait for the first to finish.
      if (!kind && this.swing && !this.swing.kind && this.swing.t < this.swing.dur * 0.6) return;
      this.raycaster.setFromCamera(new T.Vector2(p.x, p.y), this.camera);
      var targets = [this.head]; if (this.hat) targets.push(this.hat.g);
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
        if (d > 1.9 * this.faceK) landed = false;
        normal = closest.clone().sub(c).normalize(); if (normal.length() < 0.01) normal.set(0, 0, 1);
        point = c.clone().add(new T.Vector3(normal.x * this.F.wide, normal.y * this.F.tall, normal.z * this.F.depth));
      }
      var side = point.x >= 0 ? 1 : -1;
      var start = this.hand.position.clone();
      // a kind hand reaches straight in, slowly, with no wind-up at all
      var windup = kind ? start.clone() : start.clone().add(new T.Vector3(side * 1.1, 0.5, 0.9));
      this.swing = { t: 0, dur: kind ? 0.34 : 0.24, start: start, windup: windup, point: point, normal: normal,
                     side: side, power: kind ? 1 : rand(0.95, 1.3), kind: !!kind, hit: false, landed: landed };
      if (!kind) { try { global.RoarAudio.sfx('whoosh'); } catch (e) {} }
    },

    // A smack. There is nothing to win here. No points, nothing marked on them,
    // no bruises and no blood — just somebody who has been hurt and is upset,
    // and everybody saying the same thing: no smacking, that is not right.
    _hit: function (sw) {
      var T = global.THREE, now = this.time;
      var side = sw.side, hy = (sw.point.y - this.face.getWorldPosition(new T.Vector3()).y) / this.faceK;

      this.kindRun = 0;              // being kind has to start again
      this.sad = 2.6;
      this.yawV   += side * 4.0 * sw.power;
      this.rollV  += -side * 2.6 * sw.power;
      this.pitchV += -hy * 3.2 * sw.power;
      this.sqV    -= 4.0 * sw.power;
      this.shake   = 0.15 * sw.power;

      this.expr = pick(EXPR); this.exprT = 2.2;
      this._pop(sw.point, pick(SORRY), false);
      this._tears();
      try { global.RoarAudio.sfx('thud'); } catch (e) {}
      // they cry — throttled so a flurry of taps doesn't stack a dozen wails
      if (now - (this._lastVoice || -1) > 0.35) {
        this._lastVoice = now;
        try { global.RoarAudio.sfx(Math.random() < 0.6 ? 'cry' : 'whimper'); } catch (e) {}
      }
      this._byReact(false);          // and the person behind says it out loud
      this._render();
    },

    // A gentle hand. This is the whole game: being kind is the only thing that
    // scores, and keeping it up scores more.
    _kind: function (sw) {
      var now = this.time;
      this.kindRun += 1;
      this.score += Math.min(this.kindRun, 5);
      if (this.score > this.best) { this.best = this.score; save(SAVED, String(this.best)); }
      this.sad = 0;
      this.pitchV += 0.7; this.sqV -= 0.8;      // a little nod, nothing knocked

      this.expr = 'happy'; this.exprT = 1.4;
      this._pop(sw.point, pick(KINDPOP), true);
      this._hearts(sw.point);
      try { global.RoarAudio.sfx('sparkle'); } catch (e) {}
      if (now - (this._lastVoice || -1) > 0.9) { this._lastVoice = now; this._byReact(true); }
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
      if (this.sad > 0) { this.sad -= dt; if (this.sad <= 0) this._render(); }
      this.blinkT -= dt; if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = rand(2, 5); }
      if (this.blink > 0) this.blink -= dt;

      // the swing
      if (this.swing) {
        var sw = this.swing; sw.t += dt; var k = clamp(sw.t / sw.dur, 0, 1);
        if (!sw.hit && k >= 0.5) { sw.hit = true; if (sw.landed) { if (sw.kind) this._kind(sw); else this._hit(sw); } }
        if (k >= 1) this.swing = null;
      }
      this._byStep(dt);

      // tears fall; hearts float up and never touch the floor
      for (i = this.bits.length - 1; i >= 0; i--) {
        o = this.bits[i]; o.life -= dt;
        if (o.float) { o.vy += 1.4 * dt; o.m.material.rotation += dt * 1.2; }
        else {
          o.vy -= 9 * dt;
          if (o.m.position.y + o.vy * dt < this.floorY + 0.05) { o.m.position.y = this.floorY + 0.05; o.vy = -o.vy * 0.25; o.vx *= 0.5; o.vz *= 0.5; }
        }
        o.m.position.x += o.vx * dt; o.m.position.y += o.vy * dt; o.m.position.z += o.vz * dt;
        o.m.material.opacity = clamp(o.life / o.max, 0, 1);
        // sprites share one geometry between them, so only a mesh's is ours to drop
        if (o.life <= 0) { this.scene.remove(o.m); if (!o.m.isSprite && o.m.geometry) o.m.geometry.dispose(); if (o.m.material.map) o.m.material.map.dispose(); o.m.material.dispose(); this.bits.splice(i, 1); }
      }
      for (i = this.pops.length - 1; i >= 0; i--) {
        o = this.pops[i]; o.t += dt; o.s.position.y += dt * 0.9; o.s.position.x += o.vx * dt;
        var kk = o.t / 0.75; o.s.material.opacity = Math.max(0, 1 - kk * kk); var sc = o.base * (1 + Math.sin(Math.min(1, kk * 3) * Math.PI / 2) * 0.35);
        o.s.scale.set(sc * 4, sc, 1);
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
      // the arms swing a touch with the knocks, so the body doesn't look stuck on
      for (var ai = 0; ai < this.bodyArms.length; ai++) {
        var ba = this.bodyArms[ai], bs = ba.userData.side;
        ba.rotation.z = bs * 0.1 + this.roll * 0.5;
        ba.rotation.x = Math.sin(t * 1.4 + ai) * 0.04 - this.pitch * 0.35;
      }

      // expression
      var ex = this.expr, up = -1.2, lo = 1.2, open = 0.08, smile = true, teeth = false, tongue = false, browK = F.browAngle;
      if (ex === 'ow') { up = -0.45; lo = 0.45; open = 1; teeth = true; browK = 0.5; smile = false; }
      else if (ex === 'wince') { up = -0.1; lo = 0.15; open = 0.35; browK = 0.6; smile = false; }
      else if (ex === 'sad') { up = -0.3; lo = 0.32; open = 0.3; browK = 0.78; smile = false; }
      else if (ex === 'happy') { up = -1.3; lo = 1.3; open = 0.4; teeth = true; browK = -0.18; }
      if (this.blink > 0) { up = -0.05; lo = 0.1; }
      // pupils follow the hand a little; they look down when they're upset
      var hp = this.hand.position;
      for (i = 0; i < 2; i++) {
        e = this.eyes[i];
        e.up.rotation.x = lerp(e.up.rotation.x, up, 0.35); e.lo.rotation.x = lerp(e.lo.rotation.x, lo, 0.35);
        var wp = e.g.getWorldPosition(new T.Vector3());
        var px = clamp((hp.x - wp.x) * 0.05, -e.r * 0.35, e.r * 0.35);
        var py = clamp((hp.y - wp.y) * 0.05, -e.r * 0.3, e.r * 0.3);
        if (ex === 'sad') py = -e.r * 0.3;
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
        if (k < 0.5) { var a = k / 0.5; pos.lerpVectors(sw.start, sw.point.clone().add(sw.normal.clone().multiplyScalar(0.34)), sw.kind ? a : a * a); if (!sw.kind) pos.lerp(sw.windup, Math.sin(a * Math.PI) * 0.6); }
        else { var b = (k - 0.5) / 0.5; pos.lerpVectors(sw.point.clone().add(sw.normal.clone().multiplyScalar(0.34)), this.handT, 1 - (1 - b) * (1 - b)); }
        hand.position.copy(pos);
        var q = new T.Quaternion(), m4 = new T.Matrix4(); m4.lookAt(pos.clone().sub(sw.normal), pos, new T.Vector3(0, 1, 0)); q.setFromRotationMatrix(m4);
        hand.quaternion.slerpQuaternions(this.handRest, q, eIn);
        var hs = this.handBase * (1 + eIn * (sw.kind ? 0.04 : 0.15)); hand.scale.set(hs, hs, hs);
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
      this.camera.lookAt(0, CAM_LOOK, 0);
      this.renderer.render(this.scene, this.camera);
    },

    /* ── the person at the back ────────────────────────────────────
       One onlooker at a time, standing on the floor a few steps behind the
       head, off to one side of its belly. A smack sets off their routine (Sienna's choreography): left
       arm out, right arm out, left leg up, right leg up, then "No!" or "Oh
       no!" in their own voice, then running back and forth with their hands
       up, before calming down to wait for the next one. They stay for as long as the face does: a new face
       (a new game, or 🎲 NEW FACE) sends them off and somebody different
       pops up in their place. */

    _bystander: function () {
      var T = global.THREE, old = this.by;
      if (!this.scene) return;
      if (old) { this._disposeGroup(old.g); this.scene.remove(old.g); if (old.bubble) { old.bubble.material.map.dispose(); old.bubble.material.dispose(); this.scene.remove(old.bubble); } }

      // roll somebody who doesn't look like the last one
      var P, tries = 0;
      do {
        P = { skin: pick(SKIN), hair: pick(HAIRC), style: pick(BY_STYLES), shirt: pick(SHIRT), pants: pick(PANTS),
              glasses: Math.random() < 0.25, tall: rand(0.9, 1.08), wide: rand(0.9, 1.12), hatC: pick(SHIRT) };
      } while (old && (P.skin === old.P.skin || P.style === old.P.style || P.shirt === old.P.shirt) && ++tries < 20);

      var std = function (c, r) { return new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.7 : r }); };
      var skin = std(P.skin, 0.6), shirt = std(P.shirt, 0.8), pants = std(P.pants, 0.85), hair = std(P.hair, 0.75), dark = std(0x151515, 0.4);
      var g = new T.Group();

      var legs = [];
      [-1, 1].forEach(function (sd) {
        var hip = new T.Group(); hip.position.set(sd * 0.26, 1.3, 0);
        var leg = new T.Mesh(new T.CapsuleGeometry(0.2, 1.0, 4, 10), pants); leg.position.y = -0.58; hip.add(leg);
        var shoe = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), dark); shoe.scale.set(1, 0.6, 1.4); shoe.position.set(0, -1.18, 0.08); hip.add(shoe);
        hip.userData.side = sd; g.add(hip); legs.push(hip);
      });
      var up = new T.Group(); up.position.y = 1.3; g.add(up);          // pivots at the hips
      var body = new T.Mesh(new T.CapsuleGeometry(0.55, 0.9, 6, 16), shirt); body.position.y = 0.75; body.scale.set(P.wide, 1, 0.72); up.add(body);
      var neck = new T.Mesh(new T.CylinderGeometry(0.16, 0.19, 0.35, 10), skin); neck.position.y = 1.55; up.add(neck);

      // arms hang from the shoulders; the routine swings them back, then up
      var arms = [];
      [-1, 1].forEach(function (sd) {
        var sh = new T.Group(); sh.position.set(sd * 0.64 * P.wide, 1.3, 0);
        var arm = new T.Mesh(new T.CapsuleGeometry(0.13, 0.8, 4, 10), shirt); arm.position.y = -0.52; sh.add(arm);
        var hand = new T.Mesh(new T.SphereGeometry(0.17, 12, 8), skin); hand.position.y = -1.1; sh.add(hand);
        sh.userData.side = sd; up.add(sh); arms.push(sh);
      });

      var head = new T.Group(); head.position.y = 2.08; up.add(head);
      var skull = new T.Mesh(new T.SphereGeometry(0.55, 28, 20), skin); skull.scale.set(1, P.tall, 0.95); head.add(skull);
      [-1, 1].forEach(function (sd) { var ear = new T.Mesh(new T.SphereGeometry(0.13, 10, 8), skin); ear.scale.set(0.5, 1, 0.8); ear.position.set(sd * 0.54, 0, 0); head.add(ear); });
      var eyes = [];
      [-1, 1].forEach(function (sd) {
        var eg = new T.Group(); eg.position.set(sd * 0.19, 0.08, 0.46); head.add(eg);
        var white = new T.Mesh(new T.SphereGeometry(0.11, 12, 8), std(0xffffff, 0.3)); eg.add(white);
        var pupil = new T.Mesh(new T.SphereGeometry(0.06, 10, 6), dark); pupil.position.z = 0.08; eg.add(pupil);
        var brow = new T.Mesh(new T.BoxGeometry(0.2, 0.045, 0.05), hair); brow.position.set(0, 0.17, 0.06); eg.add(brow);
        eg.userData = { side: sd, pupil: pupil, brow: brow }; eyes.push(eg);
      });
      var nose = new T.Mesh(new T.SphereGeometry(0.08, 10, 8), skin); nose.position.set(0, -0.06, 0.55); head.add(nose);
      var mouth = new T.Mesh(new T.SphereGeometry(0.11, 14, 10), std(0x5a1220, 0.6)); mouth.position.set(0, -0.26, 0.47); mouth.scale.set(1.3, 0.22, 0.5); head.add(mouth);

      var cap = function (theta) { var m = new T.Mesh(new T.SphereGeometry(0.58, 24, 12, 0, TAU, 0, theta), hair); m.scale.set(1, P.tall, 0.97); return m; };
      if (P.style === 'short') { var c1 = cap(Math.PI * 0.42); c1.rotation.x = -0.2; head.add(c1); }
      else if (P.style === 'long') { head.add(cap(Math.PI * 0.45)); var back = new T.Mesh(new T.SphereGeometry(0.55, 16, 12), hair); back.scale.set(1, 1.3, 0.55); back.position.set(0, -0.3, -0.3); head.add(back); }
      else if (P.style === 'bun') { head.add(cap(Math.PI * 0.4)); var bun = new T.Mesh(new T.SphereGeometry(0.2, 12, 10), hair); bun.position.set(0, 0.58 * P.tall, -0.2); head.add(bun); }
      else if (P.style === 'puff') { for (var i = 0; i < 8; i++) { var a = i / 8 * TAU, pf = new T.Mesh(new T.SphereGeometry(rand(0.2, 0.28), 10, 8), hair); pf.position.set(Math.cos(a) * 0.4, 0.42 * P.tall + rand(0, 0.12), Math.sin(a) * 0.35 - 0.05); head.add(pf); } }
      else if (P.style === 'cap') { var hc = std(P.hatC, 0.7); var dome = new T.Mesh(new T.SphereGeometry(0.6, 24, 12, 0, TAU, 0, Math.PI * 0.42), hc); dome.scale.y = P.tall; head.add(dome); var visor = new T.Mesh(new T.BoxGeometry(0.62, 0.05, 0.42), hc); visor.position.set(0, 0.28 * P.tall, 0.62); visor.rotation.x = 0.18; head.add(visor); }
      if (P.glasses) { var gm = std(0x222222, 0.35); [-1, 1].forEach(function (sd) { var ring = new T.Mesh(new T.TorusGeometry(0.13, 0.02, 6, 18), gm); ring.position.set(sd * 0.19, 0.08, 0.55); head.add(ring); }); }

      var side = old ? -old.side : (Math.random() < 0.5 ? -1 : 1);   // pop up on the other side from last time
      var bubble = new T.Sprite(new T.SpriteMaterial({ map: this._bubbleTex('NO!'), transparent: true, depthTest: false }));
      bubble.visible = false; bubble.renderOrder = 10;
      this.scene.add(bubble);

      this.scene.add(g);
      g.rotation.order = 'YXZ';                     // lean in their own frame, then turn
      this.by = { g: g, up: up, head: head, arms: arms, legs: legs, eyes: eyes, mouth: mouth, body: body, bubble: bubble, P: P, side: side,
                  pitch: rand(0.55, 1.9), rate: rand(0.9, 1.25), state: 'rise', pop: 0, scale: 1, kind: false,
                  rt: 0, upLen: BY_HANDS, said: false, saidAt: -9, bubbleAt: 0, t: 0 };
      this._byPlace();
    },

    // Stand them just outside the head's silhouette, whatever the screen shape.
    // Stand them on the floor, their feet on the same ground, a few steps
    // behind the head and far enough to one side to clear its big belly. Their
    // legs end up hidden behind it, the way they would if you really were
    // standing behind someone this close to the camera.
    _byPlace: function () {
      var b = this.by, cam = this.camera; if (!b || !cam) return;
      var perY = (this.camBase.z - BY_Z) * Math.tan(cam.fov * Math.PI / 360);
      b.perX = perY * cam.aspect;
      b.scale = BY_H / BY_TALL;
      // measured across the screen, so they sit clear of the head on a wide
      // screen and tuck in without being clipped on a narrow one
      b.x = b.side * clamp(BY_OFF * b.perX, 2.3, 5.5);
      b.y = this.floorY;
      // stand the smacked one a little to the other side, so neither crowds
      if (this.victim) this.victim.position.x = -b.side * VICT_SHIFT;
      b.g.position.set(b.x, b.y, BY_Z);
      b.g.rotation.y = -b.side * 0.28;               // turned toward the head
    },

    // The world point at screen position (nx, ny) — -1..1 each way — on the
    // plane z = zPlane, as seen from where the camera rests.
    _ndcAt: function (nx, ny, zPlane) {
      var T = global.THREE, cam = this.camera;
      var keep = cam.position.clone();
      cam.position.copy(this.camBase); cam.lookAt(0, CAM_LOOK, 0); cam.updateMatrixWorld(true);
      var ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(nx, ny), cam);
      var hit = new T.Vector3();
      ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), -zPlane), hit);
      cam.position.copy(keep); cam.lookAt(0, CAM_LOOK, 0); cam.updateMatrixWorld(true);
      return hit;
    },

    // A smack starts the whole routine: the arm beats, the slanted lean, the
    // "No smacking!". A kind touch skips straight to hands-up — the slanted
    // pose belongs to the "No", not to a well done. Smacks during the beats
    // just let it play out, and they shout again once they've drawn breath
    // rather than gabbling.
    _byReact: function (kind) {
      var b = this.by; if (!b) return;
      b.kind = !!kind;
      if (b.state !== 'react' || kind) {
        b.state = 'react'; b.upLen = BY_HANDS; b.said = false;
        b.rt = kind ? BY_HANDSAT + 0.2 : 0;     // past the lean, straight to the cheer
        if (kind) this._bySay();
        return;
      }
      if (b.rt < BY_HANDSAT) return;
      b.upLen = Math.max(b.upLen, b.rt - BY_HANDSAT + 1.2);
      if (b.t - b.saidAt > 0.9) this._bySay();
    },

    _bySay: function () {
      var b = this.by, word = pick(b.kind ? CHEERS : NOS);
      b.said = true; b.saidAt = b.t; b.bubbleAt = b.rt;
      if (b.bubble.material.map) b.bubble.material.map.dispose();
      b.bubble.material.map = this._bubbleTex(word.toUpperCase()); b.bubble.material.needsUpdate = true;
      try { global.Say.speak(word, { pitch: b.pitch, rate: b.rate * (word.length > 5 ? 0.82 : 1) }); } catch (e) {}
    },

    _byStep: function (dt) {
      var b = this.by, T = global.THREE; if (!b) return;
      b.t += dt;
      if (b.state === 'rise') { b.pop = Math.min(1, b.pop + dt * 3.5); if (b.pop >= 1) b.state = 'idle'; }
      var pp = b.pop, back = 1 + 2.2 * Math.pow(pp - 1, 3) + 1.2 * Math.pow(pp - 1, 2);   // pop in with a little overshoot
      b.g.scale.setScalar(b.scale * Math.max(0.001, back));
      var rt = 0, act = 0;
      if (b.state === 'react') {
        b.rt += dt; rt = b.rt;
        if (!b.said && rt >= BY_SAY) this._bySay();
        var end = BY_HANDSAT + b.upLen;
        if (rt >= end + BY_SETTLE) b.state = 'idle';
        else act = clamp(Math.min(rt / 0.08, (end + BY_SETTLE - rt) / BY_SETTLE), 0, 1);
      }
      var ease = function (v) { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
      var reacting = b.state === 'react';
      var endUp = BY_HANDSAT + b.upLen;

      // turn side-on to the head, the way Sienna stands in the photo
      var turn = reacting ? ease(rt / 0.22) : 0;
      // the beats: one hand out in front, then the other back behind
      var armOut = [reacting ? ease(rt / 0.15) : 0, reacting ? ease((rt - BY_STEP) / 0.15) : 0];
      // the lean: slanted forward, one leg planted, the other up behind — held still
      var pose = reacting ? ease((rt - BY_SAY) / 0.18) * (1 - ease((rt - BY_HANDSAT) / 0.2)) : 0;
      // then hands up, still on the spot
      var handsW = reacting ? clamp(Math.min((rt - BY_HANDSAT) / 0.15, (endUp - rt) / 0.3), 0, 1) : 0;
      var settle = reacting && rt > endUp ? 1 - clamp((rt - endUp) / BY_SETTLE, 0, 1) : 1;

      for (var i = 0; i < 2; i++) {
        var a = b.arms[i], sd = a.userData.side;
        var out = armOut[i] * settle;
        // One hand out in FRONT, the other swept BACK — swinging an arm forward
        // from the shoulder is negative, backward positive. Eased a little once
        // the slant has carried them round.
        var reach = i === 0 ? -1.15 : 1.3;
        var held  = i === 0 ? -0.9  : 1.0;
        a.rotation.x = lerp(lerp(0.05, lerp(reach, held, pose), out), -0.2, handsW);
        a.rotation.z = lerp(lerp(sd * 0.12, sd * 0.3, out), sd * 2.7 + Math.sin(b.t * 14 + i) * 0.18, handsW);
        // the left leg stays on the floor, the right goes up behind — and stays put
        b.legs[i].rotation.x = (i === 0 ? -0.3 : 0.95) * pose;
        b.legs[i].rotation.z = 0;
      }
      b.up.rotation.x = 0.55 * pose + 0.12 * handsW;   // the slant from the hips

      // They keep to their one spot the whole way through — no hopping and no
      // running about — so only the pose itself moves.
      var face = -b.side * BY_FACE;                    // side-on, looking at the head
      b.g.position.x = b.x;
      b.g.rotation.y = lerp(-b.side * 0.28, face, turn * settle);
      b.g.rotation.x = 0.12 * pose;                    // the whole body tips a little too
      b.g.position.y = b.y + (b.state === 'idle' ? Math.abs(Math.sin(b.t * 2.2)) * 0.04 * b.scale : 0);

      // the face: wide eyes all the way through, mouth open from the "No!" on
      var shout = reacting && rt >= BY_SAY ? clamp(Math.min((rt - BY_SAY) / 0.08, (endUp + BY_SETTLE - rt) / BY_SETTLE), 0, 1) : 0;
      var shake = reacting && rt >= BY_SAY ? clamp(1 - (rt - b.bubbleAt) / 0.6, 0, 1) : 0;
      b.head.rotation.y = Math.sin(b.t * 26) * 0.35 * shake + Math.sin(b.t * 0.8) * 0.06;
      b.head.rotation.x = -0.1 * act - 0.45 * pose;     // chin up, looking ahead, while leaning
      b.mouth.scale.y = lerp(0.22, 1.25, Math.max(shout, act * 0.35)); b.mouth.scale.x = lerp(1.3, 0.95, shout);
      for (var k = 0; k < 2; k++) {
        var e = b.eyes[k], u = e.userData, sc = 1 + act * 0.35;
        e.scale.set(sc, sc, sc);
        u.brow.position.y = 0.17 + act * 0.07; u.brow.rotation.z = u.side * act * 0.35;
        u.pupil.position.x = -b.side * 0.03;                            // eyes on the head being smacked
      }

      // the speech bubble pops above them from the "No!" until they calm down
      var bb = b.bubble;
      bb.visible = shout > 0.02;
      if (bb.visible) {
        var hp = b.head.getWorldPosition(new T.Vector3());
        var pop = 1 + Math.sin(Math.min(1, (rt - b.bubbleAt) / 0.2) * Math.PI) * 0.25;
        // above them but pulled toward the middle, so it never runs off a narrow screen
        var hn = hp.clone().project(this.camera);
        // out past their own shoulder and up, so it never covers the face
        // the player is trying to tap
        var at = this._ndcAt(clamp(hn.x + b.side * 0.3, -0.66, 0.66), clamp(hn.y + 0.26, -0.8, 0.8), BY_Z + 0.6);
        var bw = b.perX * 0.5;                      // half the screen width wide
        bb.position.copy(at);
        bb.scale.set(bw * pop, bw * 0.54 * pop, 1);
        bb.material.opacity = Math.min(1, shout * 1.5);
      }
    },

    // A white speech bubble with a tail and the word in big red letters.
    _bubbleTex: function (text) {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = 512; cv.height = 280;
      var c = cv.getContext('2d');
      var x = 16, y = 12, w = 480, h = 200, r = 60;
      c.fillStyle = '#fff'; c.strokeStyle = '#2a0a1a'; c.lineWidth = 12;
      c.beginPath();
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + w * 0.42, y + h); c.lineTo(x + w * 0.3, y + h + 60); c.lineTo(x + w * 0.3, y + h);
      c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
      c.fill(); c.stroke();
      // As big as fits: "NO!" fills the bubble; a whole sentence like "SMACKING
      // IS NOT OK!" shrinks, and then breaks over two lines rather than running
      // out past the sides of the bubble it is meant to be inside.
      var maxW = w - 56, font = function (n) { c.font = '900 ' + n + 'px system-ui, -apple-system, Segoe UI, sans-serif'; };
      var fs = 124, lines = [text];
      font(fs);
      while (fs > 56 && c.measureText(text).width > maxW) { fs -= 4; font(fs); }
      if (c.measureText(text).width > maxW) {
        // break at the gap that leaves the two halves most even
        var ws = text.split(' '), at = 1, diff = 1e9;
        for (var i = 1; i < ws.length; i++) {
          var d = Math.abs(ws.slice(0, i).join(' ').length - ws.slice(i).join(' ').length);
          if (d < diff) { diff = d; at = i; }
        }
        lines = ws.length > 1 ? [ws.slice(0, at).join(' '), ws.slice(at).join(' ')] : [text];
        fs = 96; font(fs);
        while (fs > 28 && Math.max(c.measureText(lines[0]).width, c.measureText(lines[lines.length - 1]).width) > maxW) { fs -= 4; font(fs); }
      }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#e8203c';
      var cy = y + h / 2 + 6, lh = fs * 1.06;
      if (lines.length < 2) c.fillText(lines[0], x + w / 2, cy);
      else { c.fillText(lines[0], x + w / 2, cy - lh / 2); c.fillText(lines[1], x + w / 2, cy + lh / 2); }
      var tex = new T.CanvasTexture(cv); if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; return tex;
    },

    /* ── effects ───────────────────────────────────────────────── */

    _tears: function () {
      var T = global.THREE;
      for (var e = 0; e < 2; e++) {
        var wp = this.eyes[e].g.getWorldPosition(new T.Vector3());
        for (var i = 0; i < 3; i++) {
          var m = new T.Mesh(new T.SphereGeometry(0.06 * this.faceK * 1.6, 6, 5), new T.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true }));
          m.scale.y = 1.6; m.position.copy(wp); m.position.z += 0.25 * this.faceK;
          this.scene.add(m);
          this.bits.push({ m: m, vx: this.eyes[e].side * rand(0.5, 2.5), vy: rand(0.5, 2.5), vz: rand(0.5, 1.5), life: rand(0.7, 1.1), max: 1.1 });
        }
      }
    },

    // Hearts, for a kind hand. They drift up and away; nothing falls.
    _hearts: function (point) {
      var T = global.THREE;
      for (var i = 0; i < 7; i++) {
        var s = new T.Sprite(new T.SpriteMaterial({ map: this._heartTex(), transparent: true, depthTest: false }));
        var sc = rand(0.3, 0.55) * clamp(this.faceK * 1.5, 0.7, 1.4);
        s.scale.set(sc, sc, 1);
        s.position.copy(point).add(new T.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.3), rand(0.2, 0.5)));
        this.scene.add(s);
        this.bits.push({ m: s, vx: rand(-0.7, 0.7), vy: rand(0.6, 1.6), vz: rand(0, 0.5), life: rand(0.9, 1.5), max: 1.5, float: true });
      }
    },

    // A comic word, above the head so it never covers the face you're touching.
    // `kind` picks pink and small for a thank you, red and big for the telling-off.
    _pop: function (point, word, kind) {
      var T = global.THREE;
      var s = new T.Sprite(new T.SpriteMaterial({ map: this._textTex(word, kind ? '#ff4f9c' : '#e8203c'), transparent: true, depthTest: false }));
      // sized and placed off the screen itself, so the whole strip is always in
      // shot — "NO SMACKING!" is a long word to fit on a phone held upright.
      // Half the visible width is measured rather than worked out, so a tilted
      // camera or an odd canvas shape can't push the ends off the edges.
      var zp = this.face.getWorldPosition(new T.Vector3()).z + 1.0;
      var mid = this._ndcAt(0, 0, zp);
      var half = Math.abs(this._ndcAt(1, 0, zp).x - mid.x);
      // the pop swells by about a third as it lands, so size it to its widest
      // and keep a sliver of margin at the edges
      var w = Math.min(half * 1.45, 4.2), base = w / 4 / 1.36;
      var lim = Math.max(0, 0.95 - (w / 2) / half);
      var nx = (point.x - mid.x) / (half || 1);
      s.position.copy(this._ndcAt(clamp(nx, -lim, lim), 0.6, zp));
      s.scale.set(base * 4, base, 1); s.material.rotation = rand(-0.1, 0.1);
      this.scene.add(s);
      this.pops.push({ s: s, t: 0, base: base, vx: rand(-0.12, 0.12) });
    },

    // Drawn rather than typed, so a heart is a heart on every device — an emoji
    // would be a tofu box wherever the font is missing.
    _heartTex: function () {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = cv.height = 96;
      var c = cv.getContext('2d');
      c.beginPath();
      c.moveTo(48, 84);
      c.bezierCurveTo(6, 54, 10, 20, 30, 16);
      c.bezierCurveTo(42, 14, 48, 24, 48, 30);
      c.bezierCurveTo(48, 24, 54, 14, 66, 16);
      c.bezierCurveTo(86, 20, 90, 54, 48, 84);
      c.closePath();
      c.fillStyle = '#ff6fae'; c.fill();
      c.lineWidth = 5; c.strokeStyle = '#ffd9ea'; c.stroke();
      var tex = new T.CanvasTexture(cv); if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; return tex;
    },

    // The word, shrunk until it fits: "NO!" fills the strip, "NO SMACKING!"
    // steps down to sit inside it rather than running off the ends.
    _textTex: function (text, color) {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256;
      var c = cv.getContext('2d');
      var fs = 190;
      do { c.font = '900 ' + fs + 'px system-ui, -apple-system, Segoe UI, sans-serif'; fs -= 6; }
      while (fs > 40 && c.measureText(text).width > cv.width - 70);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = 26; c.strokeStyle = '#fff'; c.strokeText(text, 512, 134);
      c.lineWidth = 10; c.strokeStyle = '#2a0a1a'; c.strokeText(text, 512, 134);
      c.fillStyle = color; c.fillText(text, 512, 134);
      var tex = new T.CanvasTexture(cv); if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace; return tex;
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
        var sad = this.sad > 0;
        e.note.textContent = sad ? '🚫 no smacking!' : this.kindRun >= 2 ? '💗 x' + this.kindRun + ' kind!' : '💗 be gentle';
        e.note.classList.toggle('is-kind', !sad && this.kindRun >= 2);
        e.note.classList.toggle('is-no', sad);
      }
    }
  };

  global.SmackGame = SmackGame;
})(window);
