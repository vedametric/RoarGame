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

  // Naturally deep male readers, best first. Depth comes from picking one of
  // these — NOT from pitch-shifting, which is what makes a synthesiser sound
  // like a robot.
  var WANTED = ['alex', 'daniel', 'aaron', 'arthur', 'oliver', 'gordon',
                'nathan', 'rishi', 'tom', 'google uk english male',
                'microsoft david', 'microsoft guy', 'microsoft mark', 'male'];
  var NOT_HIM = ['samantha', 'karen', 'moira', 'tessa', 'fiona', 'victoria',
                 'susan', 'allison', 'ava', 'serena', 'martha', 'catherine',
                 'kate', 'nicky', 'zoe', 'female', 'amelie', 'anna', 'ellen',
                 'shelley', 'sandy', 'grandma', 'flo', 'eddy', 'reed', 'rocko'];
  // Novelty voices — these are the genuinely creepy ones.
  var NOVELTY = ['zarvox', 'trinoids', 'whisper', 'bells', 'boing', 'bubbles',
                 'bad news', 'good news', 'cellos', 'organ', 'deranged',
                 'hysterical', 'bahh', 'albert', 'jester', 'junior', 'ralph',
                 'kathy', 'princess', 'wobble', 'superstar'];
  // Markers for the higher-quality, far more human-sounding downloads.
  var NICE = ['enhanced', 'premium', 'natural', 'neural', 'siri'];

  // A gentle nudge below the voice's own pitch reads as "deep". Anything
  // near 0.5 wrecks the formants and sounds like a monster.
  var RATE = 0.85, PITCH = 0.92;

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

      function has(name, list) {
        for (var i = 0; i < list.length; i++) if (name.indexOf(list[i]) >= 0) return true;
        return false;
      }

      function rank(v) {
        var name = (v.name || '').toLowerCase();
        if (has(name, NOVELTY)) return 900;          // the actually scary ones
        if (has(name, NOT_HIM)) return 500;

        var score = 100;
        for (var k = 0; k < WANTED.length; k++) {
          if (name.indexOf(WANTED[k]) >= 0) { score = k; break; }
        }
        // A downloaded "enhanced" voice sounds hugely more human than the
        // compact default, so prefer it strongly.
        if (has(name, NICE)) score -= 20;
        return score;
      }

      pool = pool.slice().sort(function (a, b) { return rank(a) - rank(b); });

      // A man's voice was asked for, so offer men — but never leave the
      // picker nearly empty on a device that ships very few voices.
      var men = pool.filter(function (v) { return rank(v) < 500; });
      pool = men.length >= 3 ? men : pool.filter(function (v) { return rank(v) < 900; });
      if (!pool.length) pool = en.length ? en : all;
      var keepIndex = this.voices.length ? this.vi : 0;
      this.voices = pool;
      this.vi = Math.min(keepIndex, pool.length - 1);
    },

    list: function () {
      return this.voices.map(function (v, i) {
        return { i: i, name: v.name, lang: v.lang };
      });
    },

    pickVoice: function (i) {
      if (i < 0 || i >= this.voices.length) return;
      this.vi = i;
      this._showVoice();
      this.sample();
    },

    // "one, two, three" in the chosen voice, without disturbing the count.
    sample: function () {
      if (global.Say.has('n-1')) {
        global.Say.line(['n-1', 'n-2', 'n-3'], 'one, two, three');
        return;
      }
      try {
        if (!global.speechSynthesis || global.RoarAudio.muted) return;
        speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance('one, two, three');
        if (this.voices[this.vi]) u.voice = this.voices[this.vi];
        u.rate = RATE; u.pitch = PITCH; u.volume = 1;
        speechSynthesis.speak(u);
      } catch (e) {}
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

      // Every number up to a hundred was recorded properly; past that they are
      // read out of the recorded parts, and only past a billion does the
      // browser's own voice get a turn.
      var keys = global.Say.numberKeys(self.n);
      if (keys && !global.RoarAudio.muted) {
        global.Say.line(keys, text, { onEnd: function () { self._afterWord(); } });
        spoke = true;
      } else {
        try {
          if (global.speechSynthesis && global.SpeechSynthesisUtterance && !global.RoarAudio.muted) {
            speechSynthesis.cancel();
            var u = new SpeechSynthesisUtterance(text);
            if (self.voices[self.vi]) u.voice = self.voices[self.vi];
            u.rate = RATE;
            u.pitch = PITCH;
            u.volume = 1;
            u.onend = function () { self._afterWord(); };
            u.onerror = function () { self._afterWord(); };
            speechSynthesis.speak(u);
            spoke = true;
          }
        } catch (e) { spoke = false; }
      }

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

    // Same shape as the other games, so the "stop counting?" question can hold
    // whatever is playing without knowing which game it is.
    setPaused: function (on) {
      if (!!on !== !!this.paused) this.toggle();
    },

    toggle: function () {
      this.paused = !this.paused;
      if (this.paused) {
        clearTimeout(this.timer);
        clearTimeout(this.watchdog);
        global.Say.stop();
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
