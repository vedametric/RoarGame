/*
 * game-animal.js — "ANIMAL WORLD"
 *
 * A real 3D meadow you roam as an animal — a goat, a fly or a monkey — eating,
 * pooping, headbutting and generally messing about. Built on Three.js (the
 * vendored copy in vendor/), so it has real lighting, a sun that casts shadows,
 * rolling ground, fog for distance, and a third-person camera that follows you
 * round like a GTA-style world. No image assets: every animal, tree, rock,
 * sheep and chicken is built from primitives in code.
 *
 * The world: gently rolling terrain from layered sines (everything sits on it,
 * you included), thousands of instanced grass blades, trees whose canopies hold
 * fruit you can shake loose, rocks you can knock rolling, a pond, a barn, a
 * fence round the edge, wandering sheep and chickens that scatter when you
 * charge them, butterflies over the flowers and clouds drifting overhead.
 *
 * Controls: a thumb-stick anywhere on the left of the screen walks you, relative
 * to the camera; drag on the right to look around; the buttons on the right do
 * the animal's tricks. Arrow keys / WASD work on a computer. A little quest
 * ("eat 5 flowers", "scare 3 sheep") gives a small child something to aim at,
 * with a fanfare when it's done — but there's no timer and nothing to lose.
 */
(function (global) {
  'use strict';

  var SAVED = 'animal.best';
  var TAU = Math.PI * 2;
  var R = 108;                          // the meadow's radius, ringed by a fence
  var POND = { x: -42, z: 30, r: 13 };
  var BARN = { x: 38, z: -38, r: 7.5 };

  var ANIMALS = {
    goat:   { name: 'GOAT',   eats: { grass: 1, flower: 1, apple: 1 }, fly: false, special: 'butt',
              speed: 13, turn: 4.2, camDist: 10, camH: 4.2, size: 1 },
    fly:    { name: 'FLY',    eats: { poop: 1, apple: 1 }, fly: true, special: 'alt',
              speed: 16, turn: 5.5, camDist: 7, camH: 2.4, size: 0.6 },
    monkey: { name: 'MONKEY', eats: { banana: 1, apple: 1 }, fly: false, special: 'jump',
              speed: 14, turn: 4.6, camDist: 9.5, camH: 4, size: 1 }
  };

  var QUESTS = {
    goat: [
      { key: 'flower', n: 5, text: '🌸 eat flowers' },
      { key: 'rock',   n: 3, text: '🪨 headbutt rocks' },
      { key: 'poop',   n: 2, text: '💩 do a poop' },
      { key: 'apple',  n: 2, text: '🍎 shake down apples' },
      { key: 'scare',  n: 3, text: '🐑 scare the animals' },
      { key: 'grass',  n: 6, text: '🌱 eat tasty grass' }
    ],
    monkey: [
      { key: 'banana', n: 3, text: '🍌 knock down bananas' },
      { key: 'jump',   n: 8, text: '⤴ jump about' },
      { key: 'poop',   n: 2, text: '💩 do a poop' },
      { key: 'scare',  n: 3, text: '🐔 scare the chickens' },
      { key: 'apple',  n: 2, text: '🍎 eat apples' }
    ],
    fly: [
      { key: 'poop',   n: 4, text: '💩 eat poops (yum)' },
      { key: 'pond',   n: 1, text: '🌊 fly over the pond' },
      { key: 'high',   n: 1, text: '☁️ fly up to the clouds' },
      { key: 'apple',  n: 2, text: '🍎 find apples' },
      { key: 'barn',   n: 1, text: '🏠 buzz round the barn' }
    ]
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function saved(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function angLerp(a, b, t) {
    var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return a + d * t;
  }
  function hash(a, b) {
    var h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  // The lie of the land: soft hills from a few sines, flattened to a shelf
  // around the pond and the barn so the water sits still and the barn stands
  // level. Everything in the world asks this where the ground is.
  function groundY(x, z) {
    var h = 1.7 * Math.sin(x * 0.045 + 0.4) * Math.cos(z * 0.05 - 0.2)
          + 0.9 * Math.sin(x * 0.11 + 1.3) * Math.sin(z * 0.09 + 0.7)
          + 0.35 * Math.sin(x * 0.3) * Math.cos(z * 0.27);
    var dp = Math.hypot(x - POND.x, z - POND.z);
    if (dp < POND.r + 8) h = lerp(-0.6, h, clamp((dp - POND.r) / 8, 0, 1));
    var db = Math.hypot(x - BARN.x, z - BARN.z);
    if (db < BARN.r + 6) h = lerp(0.4, h, clamp((db - BARN.r) / 6, 0, 1));
    return h;
  }

  var M = {};   // shared materials (made once THREE exists)
  function mats() {
    if (M.ready) return M;
    var T = global.THREE;
    function std(c, extra) { var o = { color: c, roughness: 0.85, metalness: 0 }; if (extra) for (var k in extra) o[k] = extra[k]; return new T.MeshStandardMaterial(o); }
    M.trunk = std(0x6b4a2b); M.leaf = std(0x3f9a3a); M.leaf2 = std(0x55b04a); M.leaf3 = std(0x2f8a4a);
    M.rock = std(0x8e8e93, { roughness: 0.95 }); M.rock2 = std(0x7a7f86, { roughness: 0.95 });
    M.poop = std(0x5a3a1e, { roughness: 0.7 });
    M.apple = std(0xe8322f, { roughness: 0.5 }); M.banana = std(0xffd23f, { roughness: 0.6 });
    M.stem = std(0x2e7d32); M.white = std(0xf4f4f4); M.black = std(0x222222);
    M.cream = std(0xf1e6cf); M.hoof = std(0x3a2a1c); M.horn = std(0xcfc4a6); M.pink = std(0xf5a3b3);
    M.brown = std(0x7a4a2a); M.tan = std(0xd9b58c); M.orange = std(0xff9800); M.red = std(0xd62828);
    M.eye = std(0x111111, { roughness: 0.3 });
    M.flyBody = new T.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.35, metalness: 0.5 });
    M.flyEye = new T.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.3, metalness: 0.2, emissive: 0x3a0a08 });
    M.wing = new T.MeshPhongMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.42, side: T.DoubleSide, shininess: 120 });
    M.water = new T.MeshPhongMaterial({ color: 0x3aa6e0, transparent: true, opacity: 0.8, shininess: 140, specular: 0xbfeaff });
    M.sand = std(0xd8c48c); M.lily = std(0x4caf50);
    M.barn = std(0xb0322c); M.roof = std(0x5c2e2a); M.door = std(0x3a1f1a); M.fence = std(0xb08a5a);
    M.grassEat = std(0x7ee04a, { emissive: 0x143a00 });
    M.cloud = new T.MeshLambertMaterial({ color: 0xffffff });
    M.wisp = new T.MeshBasicMaterial({ color: 0x9be36a, transparent: true, opacity: 0.35, depthWrite: false });
    M.ready = true;
    return M;
  }

  var AnimalSim = {
    running: false,
    ANIMALS: ANIMALS,
    groundY: groundY,

    start: function (cfg) {
      var self = this;
      this.stop();
      if (!global.THREE) { console.warn('AnimalSim: THREE missing'); return this; }
      this.cfg = cfg;
      this.el = cfg.els || {};
      this.canvas = cfg.canvas;
      this.kind = ANIMALS[cfg.animal] ? cfg.animal : 'goat';
      this.A = ANIMALS[this.kind];
      this.best = parseInt(saved(SAVED, '0'), 10) || 0;
      this.paused = false;
      this.running = true;
      this._renderer();
      this._build();
      this._fit();
      this._showButtons();
      this._onResize = function () { self._fit(); };
      addEventListener('resize', this._onResize);
      this._bind();
      this._render();
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
      this.stick = null; this.stickId = null; this.held = {}; this.keys = {};
      this._stickUI(false);
      this.last = performance.now();
    },

    /* ── renderer & sizing ──────────────────────────────────────── */

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
      var d = Math.min(global.devicePixelRatio || 1, 1.75);
      this.renderer.setPixelRatio(d);
      this.renderer.setSize(W, H, false);
      if (this.camera) { this.camera.aspect = W / H; this.camera.updateProjectionMatrix(); }
    },

    /* ── building the world ────────────────────────────────────── */

    _build: function () {
      var T = global.THREE, m = mats(), i;
      var scene = this.scene = new T.Scene();
      scene.background = new T.Color(0xbfe4ff);
      scene.fog = new T.Fog(0xcfe9ff, 70, 190);
      this.camera = new T.PerspectiveCamera(58, 1.5, 0.3, 600);

      // sky dome, gradient by height (no shader: vertex colours on the inside of a ball)
      var sky = new T.SphereGeometry(420, 24, 14);
      var col = [], pos = sky.attributes.position, top = new T.Color(0x3d8fe8), hor = new T.Color(0xcfe9ff), low = new T.Color(0xa8d8ff);
      for (i = 0; i < pos.count; i++) {
        var y = pos.getY(i) / 420, c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(low, -y);
        col.push(c.r, c.g, c.b);
      }
      sky.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      this.sky = new T.Mesh(sky, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false }));
      scene.add(this.sky);

      // lights: a warm sun with shadows that follow you, and sky/ground bounce
      var hemi = new T.HemisphereLight(0xdfefff, 0x6f9a48, 0.75);
      scene.add(hemi);
      var sun = this.sun = new T.DirectionalLight(0xfff2d6, 1.15);
      sun.castShadow = true;
      // a lighter shadow map on a phone: the screen is small, and the battery matters
      var sm = Math.min(global.innerWidth || 800, global.innerHeight || 800) < 600 ? 1024 : 2048;
      sun.shadow.mapSize.set(sm, sm);
      sun.shadow.camera.near = 5; sun.shadow.camera.far = 160;
      sun.shadow.camera.left = -46; sun.shadow.camera.right = 46;
      sun.shadow.camera.top = 46; sun.shadow.camera.bottom = -46;
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
      scene.add(sun); scene.add(sun.target);
      var sunSprite = new T.Sprite(new T.SpriteMaterial({ map: this._radialTex('#fff7d0', 'rgba(255,240,180,0)'), fog: false, transparent: true }));
      sunSprite.scale.set(70, 70, 1); sunSprite.position.set(180, 150, 120);
      scene.add(sunSprite);

      this._terrain();
      this._grass();
      this._water();
      this._barn();
      this._fence();

      this.obst = [];      // circles you can't walk through: trees, rocks, barn, pond
      this.trees = []; this.rocks = []; this.food = []; this.poops = []; this.critters = [];
      this.flies = []; this.clouds = []; this.bits = []; this.pops = []; this.wisps = [];

      for (i = 0; i < 30; i++) this._tree(this._spot(14, 96));
      for (i = 0; i < 14; i++) this._rock(this._spot(12, 98));
      for (i = 0; i < 12; i++) this._bush(this._spot(10, 96));
      for (i = 0; i < 38; i++) this._flower(this._spot(6, 100));
      for (i = 0; i < 26; i++) this._grassEat(this._spot(6, 100));
      for (i = 0; i < 5; i++) this._fruit('apple', this._spot(8, 90));
      for (i = 0; i < 4; i++) this._critter('sheep', this._spot(16, 80));
      for (i = 0; i < 4; i++) this._critter('chicken', this._spot(16, 80));
      for (i = 0; i < 10; i++) this._butterfly();
      for (i = 0; i < 9; i++) this._cloud();

      this._player();
      this._init();
    },

    // Throw the whole world away: every geometry, and every material that
    // isn't one of the shared ones we keep for next time.
    _teardown: function () {
      if (!this.scene) return;
      var keep = [];
      for (var k in M) if (M[k] && M[k].isMaterial) keep.push(M[k]);
      this.scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          var ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(function (mm) {
            if (!mm || keep.indexOf(mm) >= 0) return;
            if (mm.map) mm.map.dispose();
            mm.dispose();
          });
        }
      });
      while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
      this.scene = null; this.player = null; this._pending = null;
    },

    // A random spot in the meadow, clear of the pond and barn.
    _spot: function (rmin, rmax) {
      for (var k = 0; k < 40; k++) {
        var a = rand(0, TAU), r = rand(rmin, rmax), x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 4) continue;
        if (Math.hypot(x - BARN.x, z - BARN.z) < BARN.r + 3) continue;
        if (Math.hypot(x, z + 30) < 6) continue;              // where you start
        return { x: x, z: z };
      }
      return { x: 0, z: 40 };
    },

    _terrain: function () {
      var T = global.THREE, S = 250, N = 110;
      var g = new T.PlaneGeometry(S, S, N, N);
      g.rotateX(-Math.PI / 2);
      var p = g.attributes.position, col = [];
      var c1 = new T.Color(0x4a8a33), c2 = new T.Color(0x66a846), c3 = new T.Color(0x86b955), c4 = new T.Color(0x9a8a4a);
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), z = p.getZ(i), y = groundY(x, z);
        p.setY(i, y);
        var n = hash(Math.round(x * 3), Math.round(z * 3));
        var c = c1.clone().lerp(c2, clamp((y + 1.5) / 4, 0, 1)).lerp(c3, n * 0.35);
        if (n > 0.93) c.lerp(c4, 0.45);
        var dp = Math.hypot(x - POND.x, z - POND.z);
        if (dp < POND.r + 2.5) c.set(0xd8c48c);           // sandy rim
        col.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      g.computeVertexNormals();
      var ground = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, map: this._groundTex(), roughness: 1, metalness: 0 }));
      ground.receiveShadow = true;
      this.scene.add(ground);
      this.ground = ground;
    },

    // Thousands of grass blades as two crossed instanced planes — cheap, and the
    // ground reads as a meadow rather than a green sheet.
    _grass: function () {
      var T = global.THREE, N = 5200;
      var geo = new T.PlaneGeometry(0.16, 0.5, 1, 2);
      geo.translate(0, 0.25, 0);
      var pa = geo.attributes.position;                    // a slight lean at the tip
      for (var v = 0; v < pa.count; v++) if (pa.getY(v) > 0.45) pa.setX(v, pa.getX(v) + 0.06);
      var mat = new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide });
      var a = new T.InstancedMesh(geo, mat, N), b = new T.InstancedMesh(geo, mat, N);
      var mtx = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), pos = new T.Vector3(), up = new T.Vector3(0, 1, 0);
      var c = new T.Color(), base = new T.Color(0x4f9a35), alt = new T.Color(0x7bc04a), dry = new T.Color(0xb8b860);
      for (var i = 0; i < N; i++) {
        var sp = this._spot(2, 104);
        var y = groundY(sp.x, sp.z), yaw = rand(0, TAU), sc = rand(0.7, 1.4);
        pos.set(sp.x, y - 0.02, sp.z); s.set(sc, sc * rand(0.8, 1.4), sc);
        q.setFromAxisAngle(up, yaw); mtx.compose(pos, q, s); a.setMatrixAt(i, mtx);
        q.setFromAxisAngle(up, yaw + Math.PI / 2); mtx.compose(pos, q, s); b.setMatrixAt(i, mtx);
        c.copy(base).lerp(alt, Math.random()); if (Math.random() < 0.08) c.lerp(dry, 0.6);
        a.setColorAt(i, c); b.setColorAt(i, c);
      }
      a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true;
      this.scene.add(a); this.scene.add(b);
      this.grassA = a; this.grassB = b;
    },

    _water: function () {
      var T = global.THREE, m = mats();
      var sand = new T.Mesh(new T.CircleGeometry(POND.r + 2.2, 40), m.sand);
      sand.rotation.x = -Math.PI / 2; sand.position.set(POND.x, -0.55, POND.z); sand.receiveShadow = true;
      var water = new T.Mesh(new T.CircleGeometry(POND.r, 48), m.water);
      water.rotation.x = -Math.PI / 2; water.position.set(POND.x, -0.25, POND.z);
      this.scene.add(sand); this.scene.add(water);
      this.water = water;
      for (var i = 0; i < 5; i++) {
        var lily = new T.Mesh(new T.CircleGeometry(rand(0.7, 1.2), 12, 0.4, TAU - 0.8), m.lily);
        lily.rotation.x = -Math.PI / 2; var a = rand(0, TAU), r = rand(3, POND.r - 2);
        lily.position.set(POND.x + Math.cos(a) * r, -0.22, POND.z + Math.sin(a) * r);
        this.scene.add(lily);
      }
    },

    _barn: function () {
      var T = global.THREE, m = mats(), g = new T.Group();
      var y = groundY(BARN.x, BARN.z);
      var body = new T.Mesh(new T.BoxGeometry(11, 7, 9), m.barn); body.position.y = 3.5; body.castShadow = true; body.receiveShadow = true;
      var roofL = new T.Mesh(new T.BoxGeometry(6.6, 0.5, 10), m.roof), roofR = roofL.clone();
      roofL.position.set(-2.9, 8.2, 0); roofL.rotation.z = 0.62; roofR.position.set(2.9, 8.2, 0); roofR.rotation.z = -0.62;
      roofL.castShadow = roofR.castShadow = true;
      var gable = new T.Mesh(new T.CylinderGeometry(0, 6.2, 3, 3, 1), m.barn); gable.rotation.y = Math.PI / 6; gable.scale.set(1, 1, 0.01); gable.position.set(0, 8.4, 4.5);
      var door = new T.Mesh(new T.BoxGeometry(3.2, 4.2, 0.2), m.door); door.position.set(0, 2.1, 4.55);
      var trim = new T.Mesh(new T.BoxGeometry(3.6, 0.3, 0.3), m.white); trim.position.set(0, 4.4, 4.6);
      g.add(body, roofL, roofR, door, trim);
      g.position.set(BARN.x, y, BARN.z); g.rotation.y = 0.5;
      this.scene.add(g);
      this.barn = g;
    },

    _fence: function () {
      var T = global.THREE, m = mats(), N = 96;
      var posts = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.2, 2.2, 6), m.fence, N);
      var rails = new T.InstancedMesh(new T.BoxGeometry(0.14, 0.24, 1), m.fence, N * 2);
      var mtx = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1), p = new T.Vector3(), up = new T.Vector3(0, 1, 0);
      var step = TAU / N, seg = 2 * R * Math.sin(step / 2);
      for (var i = 0; i < N; i++) {
        var a = i * step, x = Math.cos(a) * R, z = Math.sin(a) * R, y = groundY(x, z);
        p.set(x, y + 1.0, z); q.setFromAxisAngle(up, -a); mtx.compose(p, q, s); posts.setMatrixAt(i, mtx);
        var a2 = a + step / 2, mx = Math.cos(a2) * R, mz = Math.sin(a2) * R, my = groundY(mx, mz);
        q.setFromAxisAngle(up, -a2 + Math.PI / 2);
        for (var k = 0; k < 2; k++) { p.set(mx, my + 0.75 + k * 0.7, mz); s.set(1, 1, seg); mtx.compose(p, q, s); rails.setMatrixAt(i * 2 + k, mtx); s.set(1, 1, 1); }
      }
      posts.castShadow = rails.castShadow = true;
      this.scene.add(posts); this.scene.add(rails);
    },

    _tree: function (sp) {
      var T = global.THREE, m = mats(), g = new T.Group(), y = groundY(sp.x, sp.z);
      var h = rand(4.2, 6.5), pine = Math.random() < 0.3;
      var trunk = new T.Mesh(new T.CylinderGeometry(0.28, 0.45, h, 8), m.trunk);
      trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
      var canopy = new T.Group(); canopy.position.y = h;
      if (pine) {
        for (var k = 0; k < 3; k++) {
          var cone = new T.Mesh(new T.ConeGeometry(2.6 - k * 0.6, 3.2, 9), k % 2 ? m.leaf3 : m.leaf);
          cone.position.y = k * 1.7 - 0.4; cone.castShadow = true; canopy.add(cone);
        }
      } else {
        var balls = [[0, 0.8, 0, 2.6], [1.5, 1.6, 0.6, 1.9], [-1.4, 1.5, -0.4, 1.8], [0.3, 2.6, -0.9, 1.7], [-0.4, 1.4, 1.5, 1.6]];
        balls.forEach(function (b, i) {
          var s = new T.Mesh(new T.SphereGeometry(b[3], 12, 9), i % 3 === 0 ? m.leaf : i % 3 === 1 ? m.leaf2 : m.leaf3);
          s.position.set(b[0], b[1], b[2]); s.castShadow = true; canopy.add(s);
        });
      }
      g.add(canopy);
      // fruit hanging in the canopy: shown while the tree still has some
      var hung = [];
      for (var f = 0; f < 3; f++) {
        var ap = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), m.apple);
        var aa = rand(0, TAU), ar = rand(1.2, 2.2);
        ap.position.set(Math.cos(aa) * ar, rand(0.2, 1.8), Math.sin(aa) * ar); canopy.add(ap); hung.push(ap);
      }
      g.position.set(sp.x, y, sp.z); g.rotation.y = rand(0, TAU);
      this.scene.add(g);
      var t = { g: g, canopy: canopy, x: sp.x, z: sp.z, h: h, fruit: 3, hung: hung, shake: 0, regrow: 0, pine: pine };
      this.trees.push(t);
      this.obst.push({ x: sp.x, z: sp.z, r: 0.9, kind: 'tree', ref: t });
    },

    _rock: function (sp) {
      var T = global.THREE, m = mats(), s = rand(0.7, 1.9), y = groundY(sp.x, sp.z);
      var mesh = new T.Mesh(new T.DodecahedronGeometry(1, 0), Math.random() < 0.5 ? m.rock : m.rock2);
      mesh.scale.set(s * rand(0.9, 1.3), s * rand(0.6, 0.9), s * rand(0.9, 1.2));
      mesh.rotation.set(rand(0, 1), rand(0, TAU), rand(0, 1));
      mesh.position.set(sp.x, y + s * 0.45, sp.z); mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
      var r = { mesh: mesh, x: sp.x, z: sp.z, s: s, vx: 0, vz: 0, spin: 0 };
      this.rocks.push(r);
      this.obst.push({ x: sp.x, z: sp.z, r: s * 0.9, kind: 'rock', ref: r });
    },

    _bush: function (sp) {
      var T = global.THREE, m = mats(), g = new T.Group(), y = groundY(sp.x, sp.z);
      for (var k = 0; k < 4; k++) {
        var b = new T.Mesh(new T.SphereGeometry(rand(0.7, 1.2), 10, 8), k % 2 ? m.leaf3 : m.leaf);
        b.position.set(rand(-0.8, 0.8), rand(0.3, 0.9), rand(-0.8, 0.8)); b.castShadow = true; g.add(b);
      }
      g.position.set(sp.x, y, sp.z); this.scene.add(g);
      this.obst.push({ x: sp.x, z: sp.z, r: 1.3, kind: 'bush' });
    },

    _flower: function (sp) {
      var T = global.THREE, m = mats(), g = new T.Group(), y = groundY(sp.x, sp.z);
      var stem = new T.Mesh(new T.CylinderGeometry(0.05, 0.07, 0.9, 5), m.stem); stem.position.y = 0.45;
      var head = new T.Mesh(new T.SphereGeometry(0.28, 8, 6), new T.MeshStandardMaterial({ color: pick([0xff5da2, 0xffd84d, 0xff7b3d, 0xc084fc, 0x60d3ff, 0xffffff]), roughness: 0.6 }));
      head.material._own = true; head.position.y = 0.95; head.scale.y = 0.55;
      var mid = new T.Mesh(new T.SphereGeometry(0.11, 6, 5), m.banana); mid.position.y = 1.05;
      g.add(stem, head, mid); g.position.set(sp.x, y, sp.z); this.scene.add(g);
      this.food.push({ g: g, kind: 'flower', x: sp.x, z: sp.z, y: y + 0.8, r: 1.4, wob: rand(0, TAU) });
    },

    _grassEat: function (sp) {
      var T = global.THREE, m = mats(), g = new T.Group(), y = groundY(sp.x, sp.z);
      for (var k = 0; k < 5; k++) {
        var blade = new T.Mesh(new T.ConeGeometry(0.12, rand(0.7, 1.1), 4), m.grassEat);
        blade.position.set(rand(-0.3, 0.3), 0.4, rand(-0.3, 0.3)); blade.rotation.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3)); g.add(blade);
      }
      g.position.set(sp.x, y, sp.z); this.scene.add(g);
      this.food.push({ g: g, kind: 'grass', x: sp.x, z: sp.z, y: y + 0.4, r: 1.4, wob: rand(0, TAU) });
    },

    // Fruit on the ground (or falling to it from a tree).
    _fruit: function (kind, sp, fromY) {
      var T = global.THREE, m = mats(), g = new T.Group(), y = groundY(sp.x, sp.z);
      if (kind === 'apple') {
        var a = new T.Mesh(new T.SphereGeometry(0.34, 12, 10), m.apple); a.scale.y = 0.92; a.castShadow = true;
        var st = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.25, 4), m.trunk); st.position.y = 0.4;
        var lf = new T.Mesh(new T.SphereGeometry(0.12, 6, 4), m.leaf2); lf.scale.set(1.6, 0.4, 0.8); lf.position.set(0.12, 0.42, 0);
        g.add(a, st, lf);
      } else {
        var b = new T.Mesh(new T.TorusGeometry(0.42, 0.12, 8, 14, 1.9), m.banana);
        b.rotation.set(0, 0, 0.6); b.castShadow = true; g.add(b);
      }
      var top = fromY == null ? y + 0.36 : fromY;
      g.position.set(sp.x, top, sp.z);
      this.scene.add(g);
      this.food.push({ g: g, kind: kind, x: sp.x, z: sp.z, y: y + 0.36, r: 1.5, wob: rand(0, TAU), vy: fromY == null ? 0 : -1, falling: fromY != null, bounced: false });
    },

    _poopMesh: function () {
      var T = global.THREE, m = mats(), g = new T.Group();
      [[0.42, 0], [0.32, 0.28], [0.2, 0.5]].forEach(function (s) {
        var b = new T.Mesh(new T.SphereGeometry(s[0], 10, 8), m.poop); b.scale.y = 0.65; b.position.y = s[1]; b.castShadow = true; g.add(b);
      });
      return g;
    },

    _cloud: function () {
      var T = global.THREE, m = mats(), g = new T.Group();
      for (var k = 0; k < 5; k++) {
        var s = new T.Mesh(new T.SphereGeometry(rand(3, 6), 10, 8), m.cloud);
        s.position.set(k * rand(3, 5) - 8, rand(-1, 1.5), rand(-2, 2)); s.scale.y = 0.6; g.add(s);
      }
      g.position.set(rand(-160, 160), rand(38, 60), rand(-160, 160));
      this.scene.add(g);
      this.clouds.push({ g: g, v: rand(0.8, 1.6) });
    },

    _butterfly: function () {
      var T = global.THREE, g = new T.Group();
      var mat = new T.MeshStandardMaterial({ color: pick([0xffb703, 0x8ecae6, 0xff6b9d, 0xffffff, 0xc77dff]), side: T.DoubleSide, roughness: 0.6 });
      mat._own = true;
      var wl = new T.Mesh(new T.PlaneGeometry(0.5, 0.4), mat), wr = wl.clone();
      wl.position.x = -0.25; wr.position.x = 0.25; g.add(wl, wr);
      var body = new T.Mesh(new T.CylinderGeometry(0.03, 0.03, 0.4, 4), mats().black); body.rotation.x = Math.PI / 2; g.add(body);
      this.scene.add(g);
      var sp = this._spot(6, 90);
      this.flies.push({ g: g, wl: wl, wr: wr, x: sp.x, z: sp.z, tx: sp.x, tz: sp.z, y: rand(1, 2.5), t: rand(0, 10), ph: rand(0, TAU) });
    },

    _critter: function (kind, sp) {
      var T = global.THREE, m = mats(), g = new T.Group(), legs = [], y = groundY(sp.x, sp.z);
      var body, head;
      if (kind === 'sheep') {
        body = new T.Group();
        [[0, 0, 0, 0.9], [0.5, 0.2, 0.3, 0.55], [-0.5, 0.2, -0.3, 0.55], [0.1, 0.35, -0.5, 0.5], [-0.2, 0.3, 0.5, 0.5]].forEach(function (b) {
          var s = new T.Mesh(new T.SphereGeometry(b[3], 10, 8), m.white); s.position.set(b[0], b[1], b[2]); s.castShadow = true; body.add(s);
        });
        body.position.y = 1.15; g.add(body);
        head = new T.Mesh(new T.BoxGeometry(0.5, 0.5, 0.65), m.black); head.position.set(0, 1.35, 1.0); head.castShadow = true; g.add(head);
        var e1 = new T.Mesh(new T.SphereGeometry(0.07, 6, 5), m.white), e2 = e1.clone(); e1.position.set(-0.16, 1.45, 1.3); e2.position.set(0.16, 1.45, 1.3); g.add(e1, e2);
        [[-0.35, 0.45], [0.35, 0.45], [-0.35, -0.45], [0.35, -0.45]].forEach(function (l) {
          var lg = new T.Group(); lg.position.set(l[0], 0.75, l[1]);
          var leg = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.75, 6), m.black); leg.position.y = -0.37; lg.add(leg); g.add(lg); legs.push(lg);
        });
      } else {
        body = new T.Mesh(new T.SphereGeometry(0.45, 10, 8), Math.random() < 0.5 ? m.white : m.tan); body.scale.set(1, 0.9, 1.25); body.position.y = 0.75; body.castShadow = true; g.add(body);
        head = new T.Mesh(new T.SphereGeometry(0.24, 8, 6), body.material); head.position.set(0, 1.25, 0.45); g.add(head);
        var beak = new T.Mesh(new T.ConeGeometry(0.08, 0.25, 5), m.orange); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.22, 0.75); g.add(beak);
        var comb = new T.Mesh(new T.SphereGeometry(0.1, 6, 5), m.red); comb.position.set(0, 1.5, 0.45); g.add(comb);
        var tail = new T.Mesh(new T.ConeGeometry(0.16, 0.5, 5), m.black); tail.rotation.x = -1.1; tail.position.set(0, 1.0, -0.55); g.add(tail);
        [[-0.15], [0.15]].forEach(function (l) {
          var lg = new T.Group(); lg.position.set(l[0], 0.45, 0);
          var leg = new T.Mesh(new T.CylinderGeometry(0.04, 0.04, 0.45, 5), m.orange); leg.position.y = -0.22; lg.add(leg); g.add(lg); legs.push(lg);
        });
      }
      g.position.set(sp.x, y, sp.z);
      this.scene.add(g);
      var c = { kind: kind, g: g, body: body, legs: legs, x: sp.x, z: sp.z, y: 0, vy: 0, yaw: rand(0, TAU), tx: sp.x, tz: sp.z, wait: rand(1, 4),
                speed: kind === 'sheep' ? 2.6 : 3.2, flee: 0, walk: 0, spin: 0, pooped: rand(20, 60) };
      this.critters.push(c);
    },

    /* ── the player animal ─────────────────────────────────────── */

    _player: function () {
      var T = global.THREE, m = mats(), g = new T.Group(), P = { g: g, legs: [], arms: [], wings: [], tailBits: [] };
      var k = this.kind, s;
      if (k === 'goat') {
        var body = new T.Mesh(new T.CapsuleGeometry(0.72, 1.3, 6, 12), m.cream); body.rotation.x = Math.PI / 2; body.position.y = 1.2; body.castShadow = true; g.add(body); P.body = body;
        var neck = new T.Mesh(new T.CylinderGeometry(0.3, 0.38, 0.9, 8), m.cream); neck.position.set(0, 1.75, 1.05); neck.rotation.x = -0.6; g.add(neck);
        var head = new T.Group(); head.position.set(0, 2.15, 1.35); P.head = head; g.add(head);
        var skull = new T.Mesh(new T.BoxGeometry(0.62, 0.62, 0.8), m.cream); skull.castShadow = true; head.add(skull);
        var snout = new T.Mesh(new T.BoxGeometry(0.42, 0.4, 0.5), m.cream); snout.position.set(0, -0.14, 0.6); head.add(snout);
        var nose = new T.Mesh(new T.SphereGeometry(0.1, 6, 5), m.pink); nose.position.set(0, -0.08, 0.86); head.add(nose);
        var e1 = new T.Mesh(new T.SphereGeometry(0.08, 6, 5), m.eye), e2 = e1.clone(); e1.position.set(-0.26, 0.12, 0.38); e2.position.set(0.26, 0.12, 0.38); head.add(e1, e2);
        [[-0.2, 1], [0.2, -1]].forEach(function (h) {
          var horn = new T.Mesh(new T.ConeGeometry(0.1, 0.7, 6), m.horn); horn.position.set(h[0], 0.5, -0.15); horn.rotation.x = -0.7; horn.rotation.z = h[1] * 0.25; head.add(horn);
          var ear = new T.Mesh(new T.BoxGeometry(0.12, 0.3, 0.45), m.cream); ear.position.set(h[0] * 2.1, 0.15, -0.05); ear.rotation.z = h[1] * 0.9; head.add(ear);
        });
        var beard = new T.Mesh(new T.ConeGeometry(0.12, 0.4, 5), m.cream); beard.rotation.x = Math.PI; beard.position.set(0, -0.5, 0.55); head.add(beard);
        [[-0.4, 0.75], [0.4, 0.75], [-0.4, -0.7], [0.4, -0.7]].forEach(function (l) {
          var lg = new T.Group(); lg.position.set(l[0], 1.0, l[1]);
          var leg = new T.Mesh(new T.CylinderGeometry(0.14, 0.12, 0.95, 7), m.cream); leg.position.y = -0.48; leg.castShadow = true; lg.add(leg);
          var hoof = new T.Mesh(new T.CylinderGeometry(0.13, 0.14, 0.16, 7), m.hoof); hoof.position.y = -0.98; lg.add(hoof);
          g.add(lg); P.legs.push(lg);
        });
        var tail = new T.Mesh(new T.ConeGeometry(0.12, 0.45, 5), m.cream); tail.position.set(0, 1.65, -1.35); tail.rotation.x = -0.9; g.add(tail); P.tail = tail;
        P.h = 0;
      } else if (k === 'monkey') {
        var mb = new T.Mesh(new T.SphereGeometry(0.62, 12, 10), m.brown); mb.scale.set(1, 1.15, 0.9); mb.position.y = 1.35; mb.castShadow = true; g.add(mb); P.body = mb;
        var belly = new T.Mesh(new T.SphereGeometry(0.42, 10, 8), m.tan); belly.scale.set(1, 1.1, 0.5); belly.position.set(0, 1.25, 0.42); g.add(belly);
        var mh = new T.Group(); mh.position.set(0, 2.35, 0.15); P.head = mh; g.add(mh);
        var skullM = new T.Mesh(new T.SphereGeometry(0.5, 12, 10), m.brown); skullM.castShadow = true; mh.add(skullM);
        var face = new T.Mesh(new T.SphereGeometry(0.4, 10, 8), m.tan); face.scale.set(1, 0.9, 0.6); face.position.set(0, -0.05, 0.3); mh.add(face);
        var me1 = new T.Mesh(new T.SphereGeometry(0.07, 6, 5), m.eye), me2 = me1.clone(); me1.position.set(-0.15, 0.08, 0.6); me2.position.set(0.15, 0.08, 0.6); mh.add(me1, me2);
        var mouth = new T.Mesh(new T.TorusGeometry(0.12, 0.03, 5, 10, Math.PI), m.black); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.15, 0.62); mh.add(mouth);
        [[-1], [1]].forEach(function (h) { var ear = new T.Mesh(new T.SphereGeometry(0.17, 8, 6), m.tan); ear.position.set(h[0] * 0.5, 0.05, 0); mh.add(ear); });
        [[-0.7, 1], [0.7, -1]].forEach(function (a) {
          var ag = new T.Group(); ag.position.set(a[0], 1.75, 0);
          var arm = new T.Mesh(new T.CylinderGeometry(0.12, 0.1, 1.0, 6), m.brown); arm.position.y = -0.5; arm.castShadow = true; ag.add(arm);
          var hand = new T.Mesh(new T.SphereGeometry(0.15, 6, 5), m.tan); hand.position.y = -1.0; ag.add(hand);
          g.add(ag); P.arms.push(ag);
        });
        [[-0.3], [0.3]].forEach(function (l) {
          var lg = new T.Group(); lg.position.set(l[0], 0.85, 0);
          var leg = new T.Mesh(new T.CylinderGeometry(0.14, 0.12, 0.85, 6), m.brown); leg.position.y = -0.42; leg.castShadow = true; lg.add(leg);
          var foot = new T.Mesh(new T.SphereGeometry(0.16, 6, 5), m.tan); foot.position.set(0, -0.85, 0.08); lg.add(foot);
          g.add(lg); P.legs.push(lg);
        });
        for (var t = 0; t < 8; t++) {
          var tb = new T.Mesh(new T.SphereGeometry(0.11 - t * 0.006, 6, 5), m.brown); g.add(tb); P.tailBits.push(tb);
        }
        P.h = 0;
      } else {
        var fb = new T.Mesh(new T.SphereGeometry(0.34, 12, 10), m.flyBody); fb.castShadow = true; g.add(fb); P.body = fb;
        var ab = new T.Mesh(new T.SphereGeometry(0.42, 12, 10), m.flyBody); ab.scale.set(1, 0.9, 1.3); ab.position.z = -0.6; ab.castShadow = true; g.add(ab);
        var fh = new T.Group(); fh.position.set(0, 0.05, 0.45); P.head = fh; g.add(fh);
        var fs = new T.Mesh(new T.SphereGeometry(0.26, 10, 8), m.flyBody); fh.add(fs);
        var fe1 = new T.Mesh(new T.SphereGeometry(0.19, 10, 8), m.flyEye), fe2 = fe1.clone(); fe1.position.set(-0.17, 0.06, 0.12); fe2.position.set(0.17, 0.06, 0.12); fh.add(fe1, fe2);
        [[-1], [1]].forEach(function (w) {
          var wg = new T.Group(); wg.position.set(w[0] * 0.15, 0.32, -0.05);
          var wing = new T.Mesh(new T.PlaneGeometry(1.0, 0.45), M.wing); wing.position.x = w[0] * 0.55; wing.rotation.x = -Math.PI / 2; wg.add(wing);
          g.add(wg); P.wings.push({ g: wg, dir: w[0] });
        });
        for (var L = 0; L < 6; L++) {
          var leg2 = new T.Mesh(new T.CylinderGeometry(0.02, 0.02, 0.5, 4), m.black);
          leg2.position.set((L % 2 ? 1 : -1) * 0.25, -0.35, 0.25 - Math.floor(L / 2) * 0.3); leg2.rotation.z = (L % 2 ? -1 : 1) * 0.5; g.add(leg2);
        }
        P.h = 3;
      }
      s = this.A.size;
      g.scale.set(s, s, s);
      this.scene.add(g);
      this.player = P;
    },

    _init: function () {
      this.pos = { x: 0, y: 0, z: -30 };
      this.y = 0; this.vy = 0;
      this.yaw = 0;                          // facing, 0 looks north (+z)
      this.camYaw = 0; this.camPitch = 0.28;
      this.camPos = null;
      this.belly = 20; this.score = 0; this.newBest = false;
      this.walk = 0; this.chomp = 0; this.pooped = 0; this.butt = 0; this.buttHit = false; this.land = 0;
      this.stick = null; this.stickId = null; this.stickBase = null; this.held = {}; this.keys = {};
      this.look = null; this.lookId = null;
      this.time = 0; this.shake = 0;
      this.fullNag = 0;
      this.qi = 0; this.qn = 0; this.qdone = 0;
      this.pond = false; this.high = false;
      this.hover = this.A.fly ? 3 : 0;
      this._quest(0);
      this._placePlayer();
    },

    /* ── input ─────────────────────────────────────────────────── */

    _bind: function () {
      var self = this;
      // Left of the screen: a thumb-stick where you put your thumb. Right of it
      // (off the buttons): drag to look around.
      this._down = function (e) {
        if (self.paused) return;
        var r = self.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (self.stickId == null && x < self.W * 0.55) {
          self.stickId = e.pointerId; self.stickBase = { x: x, y: y }; self.stick = { x: 0, y: 0 };
          self._stickUI(true, x, y, 0, 0);
        } else if (self.lookId == null) {
          self.lookId = e.pointerId; self.look = { x: x, y: y };
        }
        try { self.canvas.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
      };
      this._move = function (e) {
        var r = self.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (self.stickId === e.pointerId && self.stickBase) {
          var dx = x - self.stickBase.x, dy = y - self.stickBase.y, mx = Math.min(self.W, self.H) * 0.13;
          var len = Math.hypot(dx, dy), k = len > mx ? mx / len : 1;
          self.stick = { x: dx * k / mx, y: dy * k / mx };
          self._stickUI(true, self.stickBase.x, self.stickBase.y, dx * k, dy * k);
          e.preventDefault();
        } else if (self.lookId === e.pointerId && self.look) {
          self.camYaw -= (x - self.look.x) * 0.0075;
          self.camPitch = clamp(self.camPitch + (y - self.look.y) * 0.004, 0.02, 0.8);
          self.look = { x: x, y: y };
          e.preventDefault();
        }
      };
      this._up = function (e) {
        if (self.stickId === e.pointerId) { self.stickId = null; self.stick = null; self.stickBase = null; self._stickUI(false); }
        if (self.lookId === e.pointerId) { self.lookId = null; self.look = null; }
      };
      this.canvas.addEventListener('pointerdown', this._down, { passive: false });
      this.canvas.addEventListener('pointermove', this._move, { passive: false });
      this.canvas.addEventListener('pointerup', this._up, { passive: false });
      this.canvas.addEventListener('pointercancel', this._up, { passive: false });

      // keyboard for a computer
      var KEYS = { ArrowUp: 'f', KeyW: 'f', ArrowDown: 'b', KeyS: 'b', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'act', KeyE: 'poop', KeyQ: 'down' };
      this._key = function (e) {
        var k = KEYS[e.code]; if (!k) return;
        var on = e.type === 'keydown';
        if (k === 'act' && on && !e.repeat) { if (self.A.special === 'butt') self.headbutt(); else if (self.A.special === 'jump') self.jump(); else self.held.up = true; }
        if (k === 'act' && !on) self.held.up = false;
        if (k === 'poop' && on && !e.repeat) self.poop();
        if (k === 'down') self.held.down = on;
        self.keys[k] = on;
        e.preventDefault();
      };
      addEventListener('keydown', this._key); addEventListener('keyup', this._key);

      // The action buttons: a tap for poop/butt/jump, a hold for the fly's up/down.
      var b = this.el.buttons || {};
      this._btnHandlers = [];
      function tap(el, fn) { if (!el) return; var h = function (e) { e.preventDefault(); fn(); }; el.addEventListener('pointerdown', h, { passive: false }); self._btnHandlers.push([el, 'pointerdown', h]); }
      function hold(el, key) {
        if (!el) return;
        var dn = function (e) { e.preventDefault(); self.held[key] = true; };
        var upf = function () { self.held[key] = false; };
        el.addEventListener('pointerdown', dn, { passive: false });
        el.addEventListener('pointerup', upf); el.addEventListener('pointercancel', upf); el.addEventListener('pointerleave', upf);
        self._btnHandlers.push([el, 'pointerdown', dn], [el, 'pointerup', upf], [el, 'pointercancel', upf], [el, 'pointerleave', upf]);
      }
      tap(b.poop, function () { self.poop(); });
      tap(b.butt, function () { self.headbutt(); });
      tap(b.jump, function () { self.jump(); });
      hold(b.up, 'up'); hold(b.down, 'down');
    },

    _unbind: function () {
      if (this._down) {
        this.canvas.removeEventListener('pointerdown', this._down);
        this.canvas.removeEventListener('pointermove', this._move);
        this.canvas.removeEventListener('pointerup', this._up);
        this.canvas.removeEventListener('pointercancel', this._up);
        this._down = this._move = this._up = null;
      }
      if (this._key) { removeEventListener('keydown', this._key); removeEventListener('keyup', this._key); this._key = null; }
      (this._btnHandlers || []).forEach(function (h) { h[0].removeEventListener(h[1], h[2]); });
      this._btnHandlers = null;
      this._stickUI(false);
    },

    _stickUI: function (on, bx, by, dx, dy) {
      var s = this.el && this.el.stick;
      if (!s || !s.base) return;
      s.base.hidden = !on;
      if (on) {
        s.base.style.left = bx + 'px'; s.base.style.top = by + 'px';
        if (s.knob) s.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }
    },

    _showButtons: function () {
      var b = this.el.buttons || {}, sp = this.A.special;
      if (b.poop) b.poop.hidden = false;
      if (b.butt) b.butt.hidden = sp !== 'butt';
      if (b.jump) b.jump.hidden = sp !== 'jump';
      if (b.up) b.up.hidden = sp !== 'alt';
      if (b.down) b.down.hidden = sp !== 'alt';
    },

    /* ── actions ───────────────────────────────────────────────── */

    poop: function () {
      if (!this.running || this.paused || this.pooped > 0) return;
      if (this.belly < 30) {
        this._pop('not yet… eat more! 🍽️', '#ffd24c');
        try { global.RoarAudio.sfx('spellbad'); } catch (e) {}
        return;
      }
      this.belly -= 30; this.pooped = 0.55;
      var m = this._poopMesh();
      var bx = this.pos.x - Math.sin(this.yaw) * 1.6 * this.A.size, bz = this.pos.z - Math.cos(this.yaw) * 1.6 * this.A.size;
      var gy = groundY(bx, bz);
      m.position.set(bx, this.A.fly ? this.y : gy, bz);
      m.rotation.y = rand(0, TAU);
      this.scene.add(m);
      this.poops.push({ g: m, x: bx, z: bz, y: gy, r: 1.3, vy: this.A.fly ? 0 : null, kind: 'poop', fresh: 3 });
      if (this.poops.length > 40) { var old = this.poops.shift(); this.scene.remove(old.g); }
      this._wisps(bx, gy + 0.6, bz);
      this._score(2); this._quest('poop');
      this._pop('💩!', '#c98b4a');
      try { global.RoarAudio.sfx('puff'); global.RoarAudio.sfx('thud'); } catch (e) {}
      try { global.Say.speak(pick(['Poop!', 'Plop!', 'Oops!', 'Phew!'])); } catch (e) {}
      this._render();
    },

    headbutt: function () {
      if (!this.running || this.paused || this.A.special !== 'butt' || this.butt > 0) return;
      this.butt = 0.42; this.buttHit = false;
      try { global.RoarAudio.sfx('whoosh'); } catch (e) {}
    },

    jump: function () {
      if (!this.running || this.paused || this.A.special !== 'jump' || this.y > 0.05) return;
      this.vy = 10.5; this.jumped = true;
      this._quest('jump');
      try { global.RoarAudio.sfx('spawn'); } catch (e) {}
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
      var A = this.A, i, o;
      this.time += dt;

      // stick or keys → a direction relative to the camera
      var sx = this.stick ? this.stick.x : 0, sy = this.stick ? this.stick.y : 0;
      if (this.keys.f) sy -= 1; if (this.keys.b) sy += 1; if (this.keys.l) sx -= 1; if (this.keys.r) sx += 1;
      var mag = Math.min(1, Math.hypot(sx, sy));
      var cf = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) }, cr = { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) };
      var mx = cf.x * -sy + cr.x * sx, mz = cf.z * -sy + cr.z * sx;
      if (mag > 0.08) {
        var want = Math.atan2(mx, mz);
        this.yaw = angLerp(this.yaw, want, Math.min(1, A.turn * dt));
      }
      var speed = (mag > 0.08 ? mag : 0) * A.speed;
      if (this.butt > 0) { speed = A.speed * 2.6; this.butt -= dt; }
      this.walk += dt * (speed * 0.9 + (A.fly ? 6 : 0));

      var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      var nx = this.pos.x + fx * speed * dt, nz = this.pos.z + fz * speed * dt;

      // hold inside the fence
      var d0 = Math.hypot(nx, nz);
      if (d0 > R - 2) { nx *= (R - 2) / d0; nz *= (R - 2) / d0; if (this.butt > 0 && !this.buttHit) { this.buttHit = true; this.shake = 0.3; try { global.RoarAudio.sfx('thud'); } catch (e) {} } }

      // the ground things you can't walk through (the fly skims over them)
      var low = !A.fly || this.y < 5;
      for (i = 0; i < this.obst.length && low; i++) {
        o = this.obst[i];
        var dx = nx - o.x, dz = nz - o.z, dd = Math.hypot(dx, dz), need = o.r + 0.9 * A.size;
        if (dd < need && dd > 0.001) {
          if (this.butt > 0 && !this.buttHit) this._butted(o);
          nx = o.x + dx / dd * need; nz = o.z + dz / dd * need;
        }
      }
      var db = Math.hypot(nx - BARN.x, nz - BARN.z);
      if (db < BARN.r + 0.6 && (!A.fly || this.y < 9)) { nx = BARN.x + (nx - BARN.x) / db * (BARN.r + 0.6); nz = BARN.z + (nz - BARN.z) / db * (BARN.r + 0.6); if (this.butt > 0 && !this.buttHit) { this.buttHit = true; this.shake = 0.35; try { global.RoarAudio.sfx('thud'); } catch (e) {} } }
      if (A.fly && db < BARN.r + 6) this._quest('barn');
      var dp = Math.hypot(nx - POND.x, nz - POND.z);
      if (!A.fly && dp < POND.r + 0.5) { nx = POND.x + (nx - POND.x) / dp * (POND.r + 0.5); nz = POND.z + (nz - POND.z) / dp * (POND.r + 0.5); }
      if (A.fly && dp < POND.r) this._quest('pond');
      this.pos.x = nx; this.pos.z = nz;

      // height: the fly flies, the monkey jumps, everyone else stands on the ground
      var gy = groundY(this.pos.x, this.pos.z);
      if (A.fly) {
        if (this.held.up) this.hover += 9 * dt; if (this.held.down) this.hover -= 9 * dt;
        this.hover = clamp(this.hover, 0.9, 34);
        this.y = lerp(this.y, this.hover, Math.min(1, 6 * dt));
        if (this.y > 26) this._quest('high');
      } else {
        this.vy -= 26 * dt; this.y += this.vy * dt;
        if (this.y <= 0) { if (this.vy < -6) { this.land = 0.25; this._dust(this.pos.x, gy, this.pos.z, 6); try { global.RoarAudio.sfx('step'); } catch (e) {} } this.y = 0; this.vy = 0; this.jumped = false; }
        // a monkey jumping under a tree knocks fruit down
        if (this.jumped && this.vy > 0 && this.y > 2.0) {
          for (i = 0; i < this.trees.length; i++) { var tr = this.trees[i]; if (Math.hypot(tr.x - this.pos.x, tr.z - this.pos.z) < 3.4 && tr.fruit > 0 && tr.shake <= 0) { this._shakeTree(tr, 'banana'); break; } }
        }
      }
      this.pos.y = gy + this.y;

      if (this.chomp > 0) this.chomp -= dt;
      if (this.pooped > 0) this.pooped -= dt;
      if (this.land > 0) this.land -= dt;
      this.shake = Math.max(0, this.shake - dt * 1.4);
      if (this.belly >= 100 && this.fullNag <= 0) { this.fullNag = 14; this._pop('so full… 💩 POOP!', '#c98b4a'); try { global.Say.speak('So full! Time to poop!'); } catch (e) {} }
      if (this.fullNag > 0) this.fullNag -= dt;

      this._eat();
      this._things(dt);
      this._critterStep(dt);
      this._camera(dt);
    },

    // Charging into something.
    _butted: function (o) {
      this.buttHit = true;
      var fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if (o.kind === 'tree') {
        this._shakeTree(o.ref, 'apple');
        this.shake = 0.35;
      } else if (o.kind === 'rock') {
        var r = o.ref; r.vx = fx * 16 / r.s; r.vz = fz * 16 / r.s; r.spin = rand(3, 7);
        this._score(3); this._quest('rock'); this._pop('WHAM! 🪨', '#ffd24c');
        try { global.RoarAudio.sfx('bust'); } catch (e) {}
      } else {
        this.shake = 0.25; try { global.RoarAudio.sfx('thud'); } catch (e) {}
      }
    },

    _shakeTree: function (t, kind) {
      t.shake = 1;
      try { global.RoarAudio.sfx('thud'); } catch (e) {}
      if (t.fruit > 0) {
        t.fruit--; var h = t.hung[t.fruit]; if (h) h.visible = false;
        var a = rand(0, TAU), sp = { x: t.x + Math.cos(a) * 2.2, z: t.z + Math.sin(a) * 2.2 };
        this._fruit(kind, sp, groundY(t.x, t.z) + t.h + 0.6);
        this._pop(kind === 'apple' ? '🍎 an apple!' : '🍌 a banana!', '#fff');
        this._quest(kind);
        this._score(2);
        t.regrow = 18;
      }
    },

    _eat: function () {
      var A = this.A, i, f, reach = 1.7 * A.size + (A.fly ? 0.6 : 0.4);
      for (i = this.food.length - 1; i >= 0; i--) {
        f = this.food[i];
        if (f.falling) continue;
        if (!A.eats[f.kind]) continue;
        if (Math.hypot(f.x - this.pos.x, f.z - this.pos.z) < reach + f.r * 0.4 && (!A.fly || Math.abs(this.pos.y - f.y) < 2.4)) {
          this._munch(f, i, this.food);
          if (f.kind !== 'grass' && f.kind !== 'flower') { /* fruit doesn't respawn on its own */ }
          else this._respawnLater(f.kind);
        }
      }
      if (A.eats.poop) {
        for (i = this.poops.length - 1; i >= 0; i--) {
          f = this.poops[i];
          if (Math.hypot(f.x - this.pos.x, f.z - this.pos.z) < reach + 0.6 && Math.abs(this.pos.y - f.y) < 2.6) this._munch(f, i, this.poops);
        }
      }
    },

    _munch: function (f, i, list) {
      list.splice(i, 1);
      this.scene.remove(f.g);
      var gain = { grass: 10, flower: 14, apple: 18, banana: 18, poop: 20 }[f.kind] || 10;
      this.belly = Math.min(100, this.belly + gain);
      this.chomp = 0.45;
      this._score(f.kind === 'poop' ? 3 : 1); this._quest(f.kind);
      this._puff(f.x, f.y + 0.4, f.z, f.kind === 'poop' ? 0x8a5a2b : f.kind === 'apple' ? 0xff6b6b : f.kind === 'banana' ? 0xffe066 : 0x9be36a, 8);
      this._pop(pick(['yum!', 'nom!', 'mmm!', 'tasty!', '+1']), '#9df08a');
      try { global.RoarAudio.sfx('nom'); } catch (e) {}
      this._render();
    },

    _respawnLater: function (kind) {
      var self = this;
      this._pending = this._pending || [];
      this._pending.push({ kind: kind, t: rand(8, 16) });
      void self;
    },

    // Everything in the world that moves or fades.
    _things: function (dt) {
      var i, o, T = global.THREE;
      // falling fruit
      for (i = 0; i < this.food.length; i++) {
        o = this.food[i];
        if (o.falling) {
          o.vy -= 22 * dt; o.g.position.y += o.vy * dt;
          if (o.g.position.y <= o.y) {
            if (!o.bounced && o.vy < -3) { o.bounced = true; o.vy = -o.vy * 0.3; o.g.position.y = o.y; this._dust(o.x, o.y - 0.3, o.z, 3); }
            else { o.g.position.y = o.y; o.falling = false; }
          }
          o.g.rotation.y += dt * 4;
        } else if (o.kind === 'apple' || o.kind === 'banana') {
          o.g.rotation.y += dt * 0.8;                                  // an idle spin says "pick me"
        } else {
          o.g.rotation.z = Math.sin(this.time * 1.8 + o.wob) * 0.08;   // grass and flowers sway
        }
      }
      // fresh poop steams; the fly's poop falls to the ground
      for (i = 0; i < this.poops.length; i++) {
        o = this.poops[i];
        if (o.vy != null && o.g.position.y > o.y) { o.vy -= 22 * dt; o.g.position.y = Math.max(o.y, o.g.position.y + o.vy * dt); }
        if (o.fresh > 0) { o.fresh -= dt; if (Math.random() < 0.08) this._wisps(o.x, o.y + 0.5, o.z, 1); }
      }
      // rocks that got knocked
      for (i = 0; i < this.rocks.length; i++) {
        o = this.rocks[i];
        if (Math.abs(o.vx) + Math.abs(o.vz) > 0.05) {
          o.x += o.vx * dt; o.z += o.vz * dt;
          var d = Math.hypot(o.x, o.z); if (d > R - 2) { o.x *= (R - 2) / d; o.z *= (R - 2) / d; o.vx *= -0.4; o.vz *= -0.4; }
          o.vx *= Math.pow(0.12, dt); o.vz *= Math.pow(0.12, dt);
          o.mesh.rotation.x += o.spin * dt * (o.vz > 0 ? 1 : -1); o.mesh.rotation.z -= o.spin * dt * (o.vx > 0 ? 1 : -1);
          o.mesh.position.set(o.x, groundY(o.x, o.z) + o.s * 0.45, o.z);
          // keep the collider with the rock
          for (var k = 0; k < this.obst.length; k++) if (this.obst[k].ref === o) { this.obst[k].x = o.x; this.obst[k].z = o.z; }
        }
      }
      // trees shaking, and regrowing fruit
      for (i = 0; i < this.trees.length; i++) {
        o = this.trees[i];
        if (o.shake > 0) { o.shake -= dt * 1.6; o.canopy.rotation.z = Math.sin(this.time * 34) * 0.09 * o.shake; o.canopy.rotation.x = Math.cos(this.time * 27) * 0.06 * o.shake; }
        else { o.canopy.rotation.z = Math.sin(this.time * 0.7 + i) * 0.015; o.canopy.rotation.x = 0; }
        if (o.fruit < 3) { o.regrow -= dt; if (o.regrow <= 0) { var h = o.hung[o.fruit]; if (h) h.visible = true; o.fruit++; o.regrow = 18; } }
      }
      // respawning grass and flowers
      if (this._pending) for (i = this._pending.length - 1; i >= 0; i--) {
        this._pending[i].t -= dt;
        if (this._pending[i].t <= 0) { var pk = this._pending[i].kind; this._pending.splice(i, 1); if (pk === 'flower') this._flower(this._spot(6, 100)); else this._grassEat(this._spot(6, 100)); }
      }
      // clouds drift
      for (i = 0; i < this.clouds.length; i++) { o = this.clouds[i]; o.g.position.x += o.v * dt; if (o.g.position.x > 190) o.g.position.x = -190; }
      // butterflies wander between flowers
      for (i = 0; i < this.flies.length; i++) {
        o = this.flies[i]; o.t -= dt;
        if (o.t <= 0) { var f = pick(this.food.filter(function (q) { return q.kind === 'flower'; })) || this._spot(6, 80); o.tx = f.x + rand(-2, 2); o.tz = f.z + rand(-2, 2); o.t = rand(3, 7); }
        var ddx = o.tx - o.x, ddz = o.tz - o.z, dl = Math.hypot(ddx, ddz) || 1;
        o.x += ddx / dl * Math.min(dl, 2.2 * dt); o.z += ddz / dl * Math.min(dl, 2.2 * dt);
        var fl = Math.sin(this.time * 22 + o.ph);
        o.wl.rotation.y = fl * 0.9; o.wr.rotation.y = -fl * 0.9;
        o.g.position.set(o.x, groundY(o.x, o.z) + o.y + Math.sin(this.time * 2 + o.ph) * 0.3, o.z);
        o.g.rotation.y = Math.atan2(ddx, ddz);
      }
      // stink wisps and dust bits
      for (i = this.wisps.length - 1; i >= 0; i--) {
        o = this.wisps[i]; o.life -= dt; o.m.position.y += dt * 0.9; o.m.position.x += Math.sin(this.time * 3 + i) * dt * 0.3;
        o.m.material.opacity = Math.max(0, o.life / 1.6) * 0.35; o.m.scale.setScalar(1 + (1.6 - o.life) * 0.6);
        if (o.life <= 0) { this.scene.remove(o.m); this.wisps.splice(i, 1); }
      }
      for (i = this.bits.length - 1; i >= 0; i--) {
        o = this.bits[i]; o.life -= dt; o.vy -= 14 * dt;
        o.m.position.x += o.vx * dt; o.m.position.y += o.vy * dt; o.m.position.z += o.vz * dt;
        var gyb = groundY(o.m.position.x, o.m.position.z); if (o.m.position.y < gyb + 0.05) { o.m.position.y = gyb + 0.05; o.vy = -o.vy * 0.3; o.vx *= 0.6; o.vz *= 0.6; }
        o.m.scale.setScalar(Math.max(0.01, o.life / o.max) * o.s);
        if (o.life <= 0) { this.scene.remove(o.m); this.bits.splice(i, 1); }
      }
      for (i = this.pops.length - 1; i >= 0; i--) {
        o = this.pops[i]; o.t += dt; o.s.position.y += dt * 1.6; o.s.material.opacity = Math.max(0, 1 - o.t / 1.3);
        if (o.t > 1.3) { this.scene.remove(o.s); o.s.material.map.dispose(); o.s.material.dispose(); this.pops.splice(i, 1); }
      }
      void T;
    },

    _critterStep: function (dt) {
      var i, c;
      for (i = 0; i < this.critters.length; i++) {
        c = this.critters[i];
        var toP = Math.hypot(this.pos.x - c.x, this.pos.z - c.z);
        // frightened by a charging goat, a jumping monkey, or anyone too close
        var scary = (this.butt > 0 || this.jumped) ? 9 : 4.5;
        if (toP < scary && c.flee <= 0) {
          c.flee = 1.6;
          c.tx = c.x + (c.x - this.pos.x) / (toP || 1) * 14; c.tz = c.z + (c.z - this.pos.z) / (toP || 1) * 14;
          if (this.butt > 0 || this.jumped) { c.vy = 7; c.spin = 1; this._score(2); this._quest('scare'); this._pop(c.kind === 'sheep' ? 'BAAA! 🐑' : 'BAWK! 🐔', '#fff'); }
          try { global.RoarAudio.sfx(c.kind === 'sheep' ? 'birdaww' : 'tick'); } catch (e) {}
        }
        if (c.flee > 0) c.flee -= dt;
        c.wait -= dt;
        var ddx = c.tx - c.x, ddz = c.tz - c.z, dl = Math.hypot(ddx, ddz);
        if (dl < 0.8 || c.wait <= 0) {
          if (c.wait <= 0 && dl < 0.8) { var sp = this._spot(10, 92); c.tx = sp.x; c.tz = sp.z; c.wait = rand(4, 9); }
          else if (dl < 0.8) c.wait = Math.min(c.wait, rand(1, 3));
        }
        var sp2 = c.speed * (c.flee > 0 ? 2.6 : 1) * (dl < 0.8 ? 0 : 1);
        if (sp2 > 0) {
          var want = Math.atan2(ddx, ddz); c.yaw = angLerp(c.yaw, want, Math.min(1, 4 * dt));
          var nx = c.x + Math.sin(c.yaw) * sp2 * dt, nz = c.z + Math.cos(c.yaw) * sp2 * dt;
          var d0 = Math.hypot(nx, nz); if (d0 > R - 3) { nx *= (R - 3) / d0; nz *= (R - 3) / d0; c.wait = 0; }
          var dp = Math.hypot(nx - POND.x, nz - POND.z); if (dp < POND.r + 1) { nx = POND.x + (nx - POND.x) / dp * (POND.r + 1); nz = POND.z + (nz - POND.z) / dp * (POND.r + 1); c.wait = 0; }
          var db = Math.hypot(nx - BARN.x, nz - BARN.z); if (db < BARN.r + 1) { nx = BARN.x + (nx - BARN.x) / db * (BARN.r + 1); nz = BARN.z + (nz - BARN.z) / db * (BARN.r + 1); c.wait = 0; }
          for (var k = 0; k < this.obst.length; k++) { var o = this.obst[k], ox = nx - o.x, oz = nz - o.z, od = Math.hypot(ox, oz); if (od < o.r + 0.8 && od > 0.001) { nx = o.x + ox / od * (o.r + 0.8); nz = o.z + oz / od * (o.r + 0.8); } }
          c.x = nx; c.z = nz; c.walk += dt * sp2 * 1.4;
        }
        c.vy -= 24 * dt; c.y = Math.max(0, c.y + c.vy * dt); if (c.y === 0) { c.vy = 0; if (c.spin > 0) c.spin = 0; }
        c.g.position.set(c.x, groundY(c.x, c.z) + c.y, c.z);
        c.g.rotation.y = c.yaw; c.g.rotation.z = c.spin ? Math.sin(this.time * 20) * 0.3 : 0;
        for (var L = 0; L < c.legs.length; L++) c.legs[L].rotation.x = Math.sin(c.walk + (L % 2 ? Math.PI : 0)) * (sp2 > 0 ? 0.6 : 0);
        if (c.body && c.kind === 'sheep') c.body.position.y = 1.15 + Math.abs(Math.sin(c.walk)) * (sp2 > 0 ? 0.08 : 0);
        // critters poop too — the fly's dinner
        c.pooped -= dt;
        if (c.pooped <= 0) {
          c.pooped = rand(30, 70);
          var m = this._poopMesh(); var gy = groundY(c.x, c.z);
          m.position.set(c.x, gy, c.z); m.scale.setScalar(0.7); this.scene.add(m);
          this.poops.push({ g: m, x: c.x, z: c.z, y: gy, r: 1.2, vy: null, kind: 'poop', fresh: 2 });
          if (this.poops.length > 40) { var old = this.poops.shift(); this.scene.remove(old.g); }
        }
      }
    },

    // The camera hangs behind you at a height, swings round to your back as you
    // walk, and lets you drag it round to look. All smoothed, so it glides.
    _camera: function (dt) {
      var A = this.A, T = global.THREE;
      var moving = this.stick || this.keys.f || this.keys.b || this.keys.l || this.keys.r;
      if (moving && !this.look) this.camYaw = angLerp(this.camYaw, this.yaw, Math.min(1, 2.2 * dt));
      var dist = A.camDist, h = A.camH + this.camPitch * 9;
      var tx = this.pos.x - Math.sin(this.camYaw) * dist * Math.cos(this.camPitch), tz = this.pos.z - Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
      var ty = this.pos.y + h;
      var gyc = groundY(tx, tz) + 1.2; if (ty < gyc) ty = gyc;              // never under the hill
      if (!this.camPos) this.camPos = new T.Vector3(tx, ty, tz);
      var k = Math.min(1, 6 * dt);
      this.camPos.x = lerp(this.camPos.x, tx, k); this.camPos.y = lerp(this.camPos.y, ty, k); this.camPos.z = lerp(this.camPos.z, tz, k);
      var sh = this.shake > 0 ? this.shake * 0.35 : 0;
      this.camera.position.set(this.camPos.x + rand(-sh, sh), this.camPos.y + rand(-sh, sh), this.camPos.z + rand(-sh, sh));
      this.camera.lookAt(this.pos.x, this.pos.y + 1.6 * A.size, this.pos.z);
      // the sun (and its shadow box) tracks you so shadows stay crisp nearby
      this.sun.position.set(this.pos.x + 38, 62, this.pos.z + 24);
      this.sun.target.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.sky.position.set(this.camera.position.x, 0, this.camera.position.z);
    },

    /* ── animating the animal ──────────────────────────────────── */

    _placePlayer: function () {
      var P = this.player; if (!P) return;
      P.g.position.set(this.pos.x, this.pos.y, this.pos.z);
      P.g.rotation.y = this.yaw;
    },

    _draw: function (dt) {
      if (!this.scene) return;
      var P = this.player, A = this.A, t = this.time, i;
      var moving = (this.stick && Math.hypot(this.stick.x, this.stick.y) > 0.08) || this.keys.f || this.keys.b || this.keys.l || this.keys.r || this.butt > 0;
      var w = this.walk, amp = moving ? 0.6 : 0;
      P.g.position.set(this.pos.x, this.pos.y, this.pos.z);
      P.g.rotation.y = this.yaw;
      var squat = this.pooped > 0 ? Math.sin(Math.min(1, this.pooped / 0.55) * Math.PI) * 0.35 : 0;
      var lean = this.butt > 0 ? 0.35 : 0;
      P.g.rotation.x = lean;
      if (this.kind === 'goat') {
        for (i = 0; i < 4; i++) P.legs[i].rotation.x = Math.sin(w * 2.2 + (i === 0 || i === 3 ? 0 : Math.PI)) * amp;
        P.body.position.y = 1.2 - squat + (moving ? Math.abs(Math.sin(w * 2.2)) * 0.08 : Math.sin(t * 2) * 0.02);
        P.head.rotation.x = (this.chomp > 0 ? 0.7 : 0) + (this.butt > 0 ? 0.9 : Math.sin(t * 1.3) * 0.05) + (moving ? Math.sin(w * 2.2) * 0.06 : 0);
        P.tail.rotation.z = Math.sin(t * 9) * 0.5;
      } else if (this.kind === 'monkey') {
        var air = this.y > 0.05;
        for (i = 0; i < 2; i++) { P.legs[i].rotation.x = air ? -0.8 : Math.sin(w * 2.4 + i * Math.PI) * amp; P.arms[i].rotation.x = air ? -2.4 : Math.sin(w * 2.4 + i * Math.PI + Math.PI) * amp; }
        P.body.position.y = 1.35 - squat + (moving ? Math.abs(Math.sin(w * 2.4)) * 0.1 : Math.sin(t * 2) * 0.03);
        P.g.rotation.x = lean + (moving ? 0.18 : 0) + (air ? -0.15 : 0);
        P.head.rotation.x = this.chomp > 0 ? 0.5 : Math.sin(t * 1.1) * 0.05;
        P.head.rotation.y = this.chomp > 0 ? 0 : Math.sin(t * 0.7) * 0.25;
        for (i = 0; i < P.tailBits.length; i++) {
          var k = i / P.tailBits.length, b = P.tailBits[i];
          b.position.set(Math.sin(t * 3 + k * 4) * 0.25 * k, 1.2 + k * 1.3 + Math.sin(k * 3) * 0.2, -0.55 - k * 0.9 + Math.cos(k * 2.6) * 0.3);
        }
      } else {
        for (i = 0; i < 2; i++) P.wings[i].g.rotation.z = P.wings[i].dir * (0.35 + Math.sin(t * 60) * 0.7);
        P.g.rotation.x = (this.held.up ? -0.3 : this.held.down ? 0.3 : 0) + (moving ? 0.25 : 0) + Math.sin(t * 2.5) * 0.05;
        P.g.rotation.z = this.stick ? -this.stick.x * 0.4 : 0;
        P.body.position.y = Math.sin(t * 6) * 0.06;
      }
      // water shimmer and grass wind: the cheapest things that make it feel alive
      if (this.water) this.water.material.opacity = 0.74 + Math.sin(t * 1.7) * 0.05;
      if (this.grassA) { var gw = Math.sin(t * 1.2) * 0.02; this.grassA.rotation.z = gw; this.grassB.rotation.z = -gw; }

      this.renderer.render(this.scene, this.camera);
      void dt;
    },

    /* ── little effects ────────────────────────────────────────── */

    _puff: function (x, y, z, color, n) {
      var T = global.THREE;
      for (var i = 0; i < n; i++) {
        var m = new T.Mesh(new T.SphereGeometry(0.13, 5, 4), new T.MeshBasicMaterial({ color: color }));
        m.material._own = true;
        m.position.set(x, y, z);
        var a = rand(0, TAU), v = rand(1.5, 4.5);
        this.scene.add(m);
        this.bits.push({ m: m, vx: Math.cos(a) * v, vy: rand(2, 6), vz: Math.sin(a) * v, life: rand(0.5, 0.9), max: 0.9, s: rand(0.8, 1.6) });
      }
    },
    _dust: function (x, y, z, n) { this._puff(x, y + 0.2, z, 0xd9c9a0, n); },
    _wisps: function (x, y, z, n) {
      var T = global.THREE;
      n = n || 3;
      for (var i = 0; i < n; i++) {
        var m = new T.Mesh(new T.SphereGeometry(0.22, 6, 5), M.wisp.clone()); m.material._own = true;
        m.position.set(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3)); m.scale.y = 1.6;
        this.scene.add(m); this.wisps.push({ m: m, life: 1.6 });
      }
    },

    // Floating words over the animal ("yum!", "💩!", "+1"), as sprites drawn on a canvas.
    _pop: function (text, color) {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
      var c = cv.getContext('2d');
      c.font = '900 64px system-ui, -apple-system, Segoe UI, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 12; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(text, 256, 64);
      c.fillStyle = color || '#fff'; c.fillText(text, 256, 64);
      var tex = new T.CanvasTexture(cv);
      var s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
      s.scale.set(6 * this.A.size + 2, 1.5 * this.A.size + 0.5, 1);
      s.position.set(this.pos.x, this.pos.y + 3.2 * this.A.size, this.pos.z);
      this.scene.add(s);
      this.pops.push({ s: s, t: 0 });
      if (this.pops.length > 5) { var old = this.pops.shift(); this.scene.remove(old.s); }
    },

    // A speckled green tile, repeated over the meadow, so the ground has grain
    // up close instead of reading as one flat colour.
    _groundTex: function () {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var c = cv.getContext('2d');
      c.fillStyle = '#7fb85a'; c.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 9000; i++) {
        var g = 150 + Math.random() * 90, r = 90 + Math.random() * 60;
        c.fillStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (50 + Math.random() * 40 | 0) + ',' + (0.35 + Math.random() * 0.5) + ')';
        var x = Math.random() * 256, y = Math.random() * 256;
        c.fillRect(x, y, 1 + Math.random() * 2, 2 + Math.random() * 5);
      }
      var tex = new T.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(64, 64);
      if ('colorSpace' in tex) tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = 4;
      return tex;
    },

    _radialTex: function (inner, outer) {
      var T = global.THREE, cv = document.createElement('canvas'); cv.width = cv.height = 128;
      var c = cv.getContext('2d'), g = c.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, inner); g.addColorStop(1, outer); c.fillStyle = g; c.fillRect(0, 0, 128, 128);
      return new T.CanvasTexture(cv);
    },

    /* ── score, quests, HUD ────────────────────────────────────── */

    _score: function (n) {
      this.score += n;
      if (this.score > this.best) { this.best = this.score; this.newBest = true; save(SAVED, String(this.best)); }
      this._render();
    },

    // A little goal to aim at; a fanfare and a new one when it's done.
    _quest: function (key) {
      var list = QUESTS[this.kind];
      if (key === 0) { this.qi = 0; this.qn = 0; this._render(); return; }
      var q = list[this.qi % list.length];
      if (q.key !== key) return;
      this.qn++;
      if (this.qn >= q.n) {
        this.qdone++;
        this._score(10);
        this._pop('⭐ QUEST DONE! +10', '#ffd24c');
        try { global.RoarAudio.sfx('win'); global.Confetti.start(['#ffd24c', '#9df08a', '#7ec6ff', '#ff7ab0']); } catch (e) {}
        try { global.Say.speak('Well done!'); } catch (e) {}
        this.qi++; this.qn = 0;
      }
      this._render();
    },

    _render: function () {
      var e = this.el;
      if (e.score) e.score.textContent = this.score;
      if (e.best) e.best.textContent = '★ ' + this.best;
      if (e.belly) e.belly.style.width = clamp(this.belly, 0, 100) + '%';
      if (e.bellyWrap) e.bellyWrap.classList.toggle('is-full', this.belly >= 100);
      if (e.quest) {
        var list = QUESTS[this.kind], q = list[this.qi % list.length];
        e.quest.textContent = q.text + ' · ' + this.qn + '/' + q.n;
      }
      var b = this.el.buttons || {};
      if (b.poop) b.poop.classList.toggle('is-ready', this.belly >= 30);
    }
  };

  global.AnimalSim = AnimalSim;
})(window);
