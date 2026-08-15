/*
 * game-roar.js — "ROAR METER"
 *
 * Hold the phone up between the two players. In tap mode each player holds
 * their own half of the screen and their recorded sound plays on repeat; in
 * voice mode every frame of sound is split between the two voice fingerprints.
 * Either way each bar climbs by its share, and the bars rescale as the leader
 * grows so there is always somewhere higher to go.
 */
(function (global) {
  'use strict';

  var HYPE = ['ROAAAR!', 'LOUDER!', 'GO GO GO!', 'BIGGER!', 'SHAKE THE ROOF!', 'MIGHTY!'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var RoarGame = {
    running: false,

    start: function (cfg) {
      var self = this;
      self.cfg = cfg;
      self.duration = cfg.duration || 20;
      self.tapMode = cfg.inputMode === 'tap';
      self.n = cfg.players ? cfg.players.length : 2;
      self.scores = [0, 0];
      self.shown = [0, 0];
      self.live = [0, 0];
      self.kick = [0, 0];
      self.elapsed = 0;
      self.hypeIn = 0;
      self.running = true;

      self.el = {
        bar: [document.getElementById('bar-1'), document.getElementById('bar-2')],
        lane: [document.getElementById('lane-1'), document.getElementById('lane-2')],
        score: [document.getElementById('score-1'), document.getElementById('score-2')],
        timer: document.getElementById('timer'),
        timerFill: document.getElementById('timer-fill'),
        hype: document.getElementById('hype')
      };

      self.el.bar[0].style.height = '0%';
      self.el.bar[1].style.height = '0%';
      self.el.score[0].textContent = '0';
      self.el.score[1].textContent = '0';

      if (self.tapMode) self._bindTouch();

      self.last = performance.now();
      self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.el.lane[0].classList.remove('is-roaring');
      this.el.lane[1].classList.remove('is-roaring');
      this._unbindTouch();
      global.RoarAudio.stopAllVoices();
    },

    // Phone is held upright between the players here, so the split is
    // left/right rather than the top/bottom used by GRAB IT.
    _bindTouch: function () {
      var self = this;
      var el = this.cfg.touchTarget;
      if (!el) return;
      this.touchEl = el;
      this.pointers = {};

      var sideOf = function (x) {
        if (self.n === 1) return 0;
        var r = el.getBoundingClientRect();
        return (x - r.left) < r.width / 2 ? 0 : 1;
      };

      // Taps only — holding a finger down does nothing.
      this._down = function (e) {
        self._tap(sideOf(e.clientX));
        e.preventDefault();
      };
      el.addEventListener('pointerdown', this._down, { passive: false });
    },

    _unbindTouch: function () {
      if (this.touchEl) this.touchEl.removeEventListener('pointerdown', this._down);
      this.touchEl = null;
    },

    _tap: function (i) {
      if (i >= this.n) return;
      global.RoarAudio.playVoiceOnce(i, 0.9);
      this.scores[i] += 18;
      this.kick[i] = 1;
    },

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;
      var i;

      self.elapsed += dt;

      var share = [0, 0], best = -1, active = false;

      if (self.tapMode) {
        for (i = 0; i < self.n; i++) {
          self.kick[i] = Math.max(0, self.kick[i] - dt * 3);
          if (self.kick[i] > 0.05) { active = true; if (best < 0 || self.kick[i] > self.kick[best]) best = i; }
        }
      } else {
        var f = global.RoarAudio.analyze();
        var a = global.RoarAudio.attribute(f);
        if (a.accepted) {
          var gate = global.RoarAudio.gate();
          var strength = Math.pow(clamp((f.level - gate) / (1 - gate), 0, 1), 1.35);
          best = a.best;
          active = true;
          for (i = 0; i < 2; i++) share[i] = a.w[i] * strength;
        }
      }

      for (i = 0; i < 2; i++) {
        if (!self.tapMode) self.scores[i] += share[i] * 100 * dt;
        var lvl = self.tapMode ? self.kick[i] : Math.min(1, share[i]);
        self.live[i] = Math.max(self.live[i] - dt * 1.8, lvl);
        self.el.lane[i].classList.toggle('is-roaring', active && best === i);
      }

      var top = Math.max(60, self.scores[0], self.scores[1]) * 1.12;
      for (i = 0; i < 2; i++) {
        var want = (self.scores[i] / top) * 92 + self.live[i] * 6;
        self.shown[i] += (want - self.shown[i]) * Math.min(1, dt * 12);
        self.el.bar[i].style.height = clamp(self.shown[i], 0, 100).toFixed(2) + '%';
        self.el.score[i].textContent = Math.round(self.scores[i]);
      }

      var left = Math.max(0, self.duration - self.elapsed);
      self.el.timer.textContent = Math.ceil(left);
      self.el.timerFill.style.width = (left / self.duration * 100).toFixed(1) + '%';
      self.el.timer.classList.toggle('is-low', left <= 5);

      self.hypeIn -= dt;
      if (self.hypeIn <= 0) {
        self.hypeIn = 2.4;
        self.el.hype.textContent = HYPE[(Math.random() * HYPE.length) | 0];
        self.el.hype.classList.remove('pop');
        void self.el.hype.offsetWidth;
        self.el.hype.classList.add('pop');
      }

      if (self.elapsed >= self.duration) {
        self.stop();
        if (self.cfg.onEnd) self.cfg.onEnd([Math.round(self.scores[0]), Math.round(self.scores[1])]);
        return;
      }
      self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    }
  };

  global.RoarGame = RoarGame;
})(window);
