/*
 * game-roar.js — "ROAR METER"
 *
 * Hold the phone up between the two players. Everyone roars at once; every
 * frame of sound is split between the two voice fingerprints and each bar
 * climbs by its share. The bars rescale as the leader grows, so there is
 * always somewhere higher to go.
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
      self.scores = [0, 0];
      self.shown = [0, 0];
      self.live = [0, 0];
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

      self.last = performance.now();
      self.raf = requestAnimationFrame(function (t) { self._loop(t); });
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.el.lane[0].classList.remove('is-roaring');
      this.el.lane[1].classList.remove('is-roaring');
    },

    _loop: function (now) {
      var self = this;
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;
      var i;

      self.elapsed += dt;

      var f = global.RoarAudio.analyze();
      var best = -1;
      if (f.loud) {
        var gate = global.RoarAudio.gate();
        var strength = Math.pow(clamp((f.level - gate) / (1 - gate), 0, 1), 1.35);
        var a = global.RoarAudio.attribute(f);
        best = a.best;
        for (i = 0; i < 2; i++) {
          self.scores[i] += a.w[i] * strength * 100 * dt;
          self.live[i] = Math.max(self.live[i], a.w[i] * strength);
        }
      }

      for (i = 0; i < 2; i++) {
        self.live[i] = Math.max(0, self.live[i] - dt * 1.8);
        self.el.lane[i].classList.toggle('is-roaring', best === i && f.loud);
      }

      // Rescale so the leader always sits near the top of the track.
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
