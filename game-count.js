/*
 * game-count.js — "COUNTING"
 *
 * Counts out loud from zero upwards, forever, with a long pause between each
 * number. Deep male voice, slow and steady. The numeral is on screen with the
 * word under it, and dots to count along with for the first twenty.
 *
 * Speech timing is driven by the utterance's own `onend` rather than a fixed
 * timer, so the pause is always a real pause *after* the word — with a
 * watchdog, because iOS does not always deliver `onend`.
 */
(function (global) {
  'use strict';

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
              'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
              'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
              'eighty', 'ninety'];
  var SCALES = [
    [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']
  ];

  // Voices worth trying for a deep male reader, best first.
  var WANTED = ['alex', 'daniel', 'aaron', 'fred', 'arthur', 'oliver', 'gordon',
                'rishi', 'google uk english male', 'microsoft david',
                'microsoft guy', 'microsoft mark', 'en-gb-standard-b', 'male'];
  var NOT_HIM = ['samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria',
                 'susan', 'allison', 'ava', 'serena', 'martha', 'catherine',
                 'kate', 'nicky', 'zoe', 'female', 'amelie', 'anna', 'ellen'];

  var GAP = 3.5;             // seconds of silence between numbers
  var COLORS = ['#ffd24c', '#7ee8a0', '#7ec8ff', '#e6b3ff', '#ff9f7a', '#ffe89a'];

  function words(n) {
    if (n < 0) return String(n);
    if (n < 20) return ONES[n];
    if (n < 100) {
      return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    }
    if (n < 1000) {
      return ONES[Math.floor(n / 100)] + ' hundred' +
             (n % 100 ? ' and ' + words(n % 100) : '');
    }
    for (var i = 0; i < SCALES.length; i++) {
      var v = SCALES[i][0];
      if (n >= v) {
        var head = words(Math.floor(n / v)) + ' ' + SCALES[i][1];
        var rest = n % v;
        if (!rest) return head;
        return head + (rest < 100 ? ' and ' : ' ') + words(rest);
      }
    }
    return String(n);          // past a trillion, just read the digits
  }

  var CountGame = {
    running: false,

    start: function (cfg) {
      var self = this;
      self.cfg = cfg;
      self.el = cfg.els;
      self.n = 0;
      self.paused = false;
      self.waitFrom = 0;
      self.waitFor = 0;
      self.running = true;

      self.voices = [];
      self.vi = 0;
      self._loadVoices();

      // Voices often arrive a moment after the page does.
      self._onVoices = function () { self._loadVoices(); self._showVoice(); };
      try { speechSynthesis.addEventListener('voiceschanged', self._onVoices); } catch (e) {}

      self._showVoice();
      self._render();
      self._say();

      self.last = performance.now();
      self.raf = requestAnimationFrame(function (t) { self._tick(t); });
    },

    stop: function () {
      this.running = false;
      cancelAnimationFrame(this.raf);
      clearTimeout(this.timer);
      clearTimeout(this.watchdog);
      try { speechSynthesis.cancel(); } catch (e) {}
      try { speechSynthesis.removeEventListener('voiceschanged', this._onVoices); } catch (e) {}
    },

    /* ── voice ────────────────────────────────────────────────── */

    _loadVoices: function () {
      var all = [];
      try { all = speechSynthesis.getVoices() || []; } catch (e) {}
      if (!all.length) return;

      var en = all.filter(function (v) { return /^en([-_]|$)/i.test(v.lang || ''); });
      var pool = en.length ? en : all;

      function rank(v) {
        var name = (v.name || '').toLowerCase();
        for (var i = 0; i < NOT_HIM.length; i++) {
          if (name.indexOf(NOT_HIM[i]) >= 0) return 500;
        }
        for (var k = 0; k < WANTED.length; k++) {
          if (name.indexOf(WANTED[k]) >= 0) return k;
        }
        return 100;
      }

      pool = pool.slice().sort(function (a, b) { return rank(a) - rank(b); });
      var keepIndex = this.voices.length ? this.vi : 0;
      this.voices = pool;
      this.vi = Math.min(keepIndex, pool.length - 1);
    },

    nextVoice: function () {
      if (this.voices.length < 2) return;
      this.vi = (this.vi + 1) % this.voices.length;
      this._showVoice();
      try { speechSynthesis.cancel(); } catch (e) {}
      this._say();                    // hear the change straight away
    },

    _showVoice: function () {
      var v = this.voices[this.vi];
      if (this.el.voice) this.el.voice.textContent = v ? v.name : 'device voice';
    },

    /* ── counting ─────────────────────────────────────────────── */

    _say: function () {
      var self = this;
      clearTimeout(self.watchdog);
      self._render();

      if (self.paused || !self.running) return;

      var text = words(self.n);
      var spoke = false;

      try {
        if (global.speechSynthesis && global.SpeechSynthesisUtterance && !global.RoarAudio.muted) {
          speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(text);
          if (self.voices[self.vi]) u.voice = self.voices[self.vi];
          u.rate = 0.72;              // slow and deliberate
          u.pitch = 0.45;             // as deep as the API allows
          u.volume = 1;
          u.onend = function () { self._afterWord(); };
          u.onerror = function () { self._afterWord(); };
          speechSynthesis.speak(u);
          spoke = true;
        }
      } catch (e) { spoke = false; }

      // iOS sometimes never fires onend, so never rely on it alone.
      var guess = 900 + text.length * 110;
      self.watchdog = setTimeout(function () { self._afterWord(); }, spoke ? guess + 2500 : 700);

      if (!spoke && self.el.warn) self.el.warn.hidden = false;
    },

    _afterWord: function () {
      var self = this;
      clearTimeout(self.watchdog);
      clearTimeout(self.timer);
      if (!self.running || self.paused) return;

      self.waitFrom = performance.now();
      self.waitFor = GAP * 1000;
      self.timer = setTimeout(function () {
        if (!self.running || self.paused) return;
        self.n += 1;
        self._say();
      }, self.waitFor);
    },

    toggle: function () {
      this.paused = !this.paused;
      if (this.paused) {
        clearTimeout(this.timer);
        clearTimeout(this.watchdog);
        try { speechSynthesis.cancel(); } catch (e) {}
        this.waitFor = 0;
      } else {
        this._say();
      }
      this._render();
      return this.paused;
    },

    restart: function () {
      clearTimeout(this.timer);
      clearTimeout(this.watchdog);
      this.n = 0;
      this.paused = false;
      this._say();
      this._render();
    },

    /* ── screen ───────────────────────────────────────────────── */

    _tick: function (now) {
      var self = this;
      // The ring fills during the pause, so you can see the next one coming.
      var p = 0;
      if (self.waitFor > 0 && !self.paused) {
        p = Math.min(1, (now - self.waitFrom) / self.waitFor);
      }
      if (self.el.ring) self.el.ring.style.setProperty('--p', p.toFixed(3));
      if (self.running) self.raf = requestAnimationFrame(function (t) { self._tick(t); });
    },

    _render: function () {
      var e = this.el;
      var col = COLORS[this.n % COLORS.length];

      if (e.number) {
        e.number.textContent = String(this.n);
        e.number.style.color = col;
        e.number.classList.remove('pop');
        void e.number.offsetWidth;
        e.number.classList.add('pop');
      }
      if (e.word) e.word.textContent = words(this.n);
      if (e.ring) e.ring.style.setProperty('--c', col);
      if (e.toggle) e.toggle.textContent = this.paused ? '▶' : '⏸';

      // Dots to count along with, while the numbers are still small.
      if (e.dots) {
        if (this.n > 0 && this.n <= 20) {
          var html = '';
          for (var i = 0; i < this.n; i++) {
            html += '<i style="background:' + col + ';animation-delay:' + (i * 0.05) + 's"></i>';
          }
          e.dots.innerHTML = html;
          e.dots.hidden = false;
        } else {
          e.dots.innerHTML = '';
          e.dots.hidden = true;
        }
      }
    }
  };

  CountGame.words = words;        // exposed for testing
  global.CountGame = CountGame;
})(window);
