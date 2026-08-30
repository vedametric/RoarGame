/*
 * game-clock.js — "WHAT'S THE TIME?"
 *                  learning to read a clock, for a five year old
 *
 * Both kinds of clock, taught together: the round one with hands and the one
 * with numbers on it. Every question shows one and asks for the other, so the
 * two stop being separate things in her head.
 *
 * It teaches before it tests. The hour hand is short and gold, the minute hand
 * is long and blue, they are labelled that way on the clock itself, and the
 * hint says out loud which hand to look at. Getting it wrong costs nothing —
 * after two tries a wrong answer is taken away rather than the question being
 * failed.
 */
(function (global) {
  'use strict';

  var HOUR_COL = '#ffd24c';      // short hand — the hour
  var MIN_COL  = '#7ec8ff';      // long hand  — the minutes
  var FACE     = '#fdfaf2';
  var INK      = '#2b1a10';

  var WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five',
               'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

  /* Four steps, each one a real stage of learning to tell the time. Four right
     answers moves her up, and every stage keeps the ones before it. */
  var LEVELS = [
    { name: "o'clock",          mins: [0] },
    { name: 'half past',        mins: [0, 30] },
    { name: 'quarter past & to', mins: [0, 15, 30, 45] },
    { name: 'every five minutes', mins: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] }
  ];
  var UP_AFTER = 4;              // right answers before the next stage

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function saved(key, fallback) {
    try { var v = localStorage.getItem('clock.' + key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem('clock.' + key, value); } catch (e) {}
  }

  // "half past seven", "quarter to four", "three o'clock" — how it is said out
  // loud, which is how a child learns it long before they read 7:30.
  function spoken(h, m) {
    var next = WORDS[(h + 1) % 12];
    var here = WORDS[h % 12];
    if (m === 0)  return here + " o'clock";
    if (m === 15) return 'quarter past ' + here;
    if (m === 30) return 'half past ' + here;
    if (m === 45) return 'quarter to ' + next;
    if (m < 30)   return m + ' minutes past ' + here;
    return (60 - m) + ' minutes to ' + next;
  }

  function digital(h, m) { return ((h % 12) || 12) + ':' + pad(m); }

  /* How you read a digital clock aloud: "three thirty", not "half past three".
     Both are right and a child meets both, so the game can say either — this is
     the one it says by default, because it is the one that matches the figures
     she is looking at. */
  function spokenDigital(h, m) {
    var W = global.CountGame && global.CountGame.words;
    var hour = W ? W((h % 12) || 12) : String((h % 12) || 12);
    if (m === 0) return hour + " o'clock";
    // "three oh five" — the o is how everyone says a single-digit minute.
    if (m < 10) return hour + ' oh ' + (W ? W(m) : m);
    return hour + ' ' + (W ? W(m) : m);
  }

  function same(a, b) { return a.h === b.h && a.m === b.m; }

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var ClockGame = {
    running: false,

    start: function (cfg) {
      this.el = cfg.els;
      this.running = true;

      this.stars = 0;
      this.streak = 0;
      this.right = 0;
      this.level = 0;
      this.mode = 'read';        // alternates with 'set'
      this.showMinutes = true;   // the 5,10,15… ring, on while she is learning

      this.digitalWords = saved('clockwords', 'digital') !== 'past';
      this.play = false;         // hands-on mode: move them yourself
      this.free = { h: 3, m: 0 };
      this._bindHands();

      this._next();
      return this;
    },

    stop: function () {
      this.running = false;
      this._unbindHands();
      clearTimeout(this._t);
      clearTimeout(this._sayT);
      cancelAnimationFrame(this._raf);
      global.Say.stop();
      try { global.Confetti.stop(); } catch (e) {}
    },

    /* ── a question ───────────────────────────────────────────── */

    // How far apart the two hands are, in degrees. At 7:40 the hour hand sits at
    // 230° and the minute hand at 240°: ten degrees apart, lying on top of one
    // another, and nobody can read that — least of all somebody learning. Times
    // like that are simply not asked.
    _handGap: function (h, m) {
      var hourA = ((h % 12) + m / 60) * 30;
      var minA = m * 6;
      var d = Math.abs(hourA - minA) % 360;
      return d > 180 ? 360 - d : d;
    },

    _pickTime: function () {
      var mins = LEVELS[this.level].mins;
      var t;
      for (var tries = 0; tries < 40; tries++) {
        t = { h: 1 + ((Math.random() * 12) | 0), m: mins[(Math.random() * mins.length) | 0] };
        if (this._handGap(t.h, t.m) >= 20) return t;
      }
      return t;
    },

    // Wrong answers a child might genuinely believe: the hour either side, the
    // hands read the wrong way round, and the same hour at a different minute.
    _distractors: function (t) {
      var out = [];
      var add = function (h, m) {
        var c = { h: ((h - 1 + 12) % 12) + 1, m: ((m % 60) + 60) % 60 };
        for (var i = 0; i < out.length; i++) if (same(out[i], c)) return;
        if (c.h === t.h && c.m === t.m) return;
        out.push(c);
      };
      add(t.h + 1, t.m);
      add(t.h - 1, t.m);
      if (t.m === 0) { add(t.h, 30); add(t.h, 15); }
      else { add(t.h, 0); add(t.h, t.m === 30 ? 15 : 30); }
      // reading the hands the wrong way round, the classic mistake
      if (t.m % 5 === 0) add(t.m / 5 === 0 ? 12 : t.m / 5, t.h * 5);
      return shuffled(out).slice(0, 3);
    },

    _next: function () {
      this.t = this._pickTime();
      this.mode = this.mode === 'read' ? 'set' : 'read';
      this.answered = false;
      this.wrong = 0;
      this.gone = [];              // options taken away after two wrong tries
      this.hintUsed = false;
      this.tellShown = false;

      this.options = shuffled([this.t].concat(this._distractors(this.t)));
      this.correct = -1;
      for (var i = 0; i < this.options.length; i++) {
        if (same(this.options[i], this.t)) this.correct = i;
      }

      this._render();
      global.Say.line('m-whattime', 'What time is it?');
    },

    /* ── answering ────────────────────────────────────────────── */

    choose: function (i) {
      if (!this.running || this.answered) return;
      if (this.gone.indexOf(i) >= 0) return;

      if (i === this.correct) {
        this.answered = true;
        this.right++;
        this.streak++;
        var got = this.wrong === 0 && !this.hintUsed ? 3 : this.wrong <= 1 ? 2 : 1;
        this.lastStars = got;
        this.stars += got;

        global.RoarAudio.sfx('spellwin');
        try {
          global.Confetti.start(['#ffd24c', '#7ec8ff', '#e6b3ff', '#9df08a', '#ffffff']);
        } catch (e) {}
        var self = this;
        this._t = setTimeout(function () { try { global.Confetti.stop(); } catch (e) {} }, 2200);

        global.Say.line(['m-yes', this._timeKey(this.t)],
                        "Yes! It's " + this.words(this.t.h, this.t.m));

        if (this.right % UP_AFTER === 0 && this.level < LEVELS.length - 1) {
          this.level++;
          this.levelledUp = true;
        } else {
          this.levelledUp = false;
        }
      } else {
        this.wrong++;
        this.streak = 0;
        this.badAt = i;
        this.badT = Date.now();
        global.RoarAudio.sfx('spellbad');
        // Two wrong tries and a wrong answer is taken off the board, so she is
        // always closing in rather than stuck.
        if (this.wrong >= 2) {
          for (var k = 0; k < this.options.length; k++) {
            if (k !== this.correct && this.gone.indexOf(k) < 0) { this.gone.push(k); break; }
          }
          if (!this.tellShown) this.tell();
        }
      }
      this._render();
    },

    next: function () {
      if (!this.running || !this.answered) return;
      try { global.Confetti.stop(); } catch (e) {}
      this._next();
    },

    /* ── teaching ─────────────────────────────────────────────── */

    // Says which hand is which and what each one is pointing at.
    tell: function () {
      this.tellShown = true;
      this.hintUsed = true;
      var t = this.t;
      var hourAt = ((t.h % 12) || 12);
      var msg = 'The short gold hand is the hour. It is pointing near ' + hourAt +
                '. The long blue hand is the minutes. ' +
                (t.m === 0 ? 'It is straight up, so it is ' + this.words(t.h, t.m) + '.'
                           : 'It is on ' + t.m + ', so it is ' + this.words(t.h, t.m) + '.');
      this.teach = msg;
      global.RoarAudio.sfx('spellhint');
      // Built from whole sentences, so every join lands where a person would
      // have drawn breath anyway.
      global.Say.line(['m-teachhour', 'th-' + hourAt, 'm-teachmin', 'tm-' + t.m,
                       'm-soitis', this._timeKey(t)], msg);
      this._render();
    },

    hear: function () {
      global.Say.line(['m-yes', this._timeKey(this.t)], "It's " + this.words(this.t.h, this.t.m));
    },

    toggleMinutes: function () {
      this.showMinutes = !this.showMinutes;
      this._render();
      global.RoarAudio.sfx('spellhint');
    },

    _say: function (text, rate) { global.Say.speak(text, { rate: rate || 0.95 }); },

    // Every time has a clip in each wording: t-7-30 is "half past seven",
    // d-7-30 is "seven thirty".
    _timeKey: function (t) {
      return (this.digitalWords ? 'd-' : 't-') + ((t.h % 12) || 12) + '-' + t.m;
    },

    // The words for a time, in whichever way she has it set.
    words: function (h, m) {
      return this.digitalWords ? spokenDigital(h, m) : spoken(h, m);
    },

    toggleWords: function () {
      this.digitalWords = !this.digitalWords;
      save('clockwords', this.digitalWords ? 'digital' : 'past');
      this._render();
      var t = this.play ? this.free : this.t;
      global.Say.line(this._timeKey(t), this.words(t.h, t.m));
      return this.digitalWords;
    },


    /* ── moving the hands yourself ────────────────────────────────
       No question and no score: a big clock with every number on it, and she
       drags the hands round. Whenever she stops, it tells her what she has
       made — which is how a clock is actually learnt. */

    setPlay: function (on) {
      this.play = !!on;
      global.RoarAudio.sfx('spellhint');
      if (this.play) {
        clearTimeout(this._t);
        try { global.Confetti.stop(); } catch (e) {}
        this.answered = false;
        this.showMinutes = true;      // the numbers help most while exploring
        this._render();
        this._sayFree(500);
      } else {
        this._next();
      }
    },

    _bindHands: function () {
      var self = this, cv = this.el && this.el.canvas;
      if (!cv || this._down) return;

      var angleAt = function (e) {
        var r = cv.getBoundingClientRect();
        return Math.atan2(e.clientY - (r.top + r.height / 2),
                          e.clientX - (r.left + r.width / 2));
      };

      // Which hand: whichever is nearer the angle she touched.
      var pick = function (ang) {
        var hourA = (((self.free.h % 12) + self.free.m / 60) * Math.PI / 6) - Math.PI / 2;
        var minA = (self.free.m * Math.PI / 30) - Math.PI / 2;
        var gap = function (a, b) {
          var d = Math.abs(a - b) % 6.2832;
          return d > Math.PI ? 6.2832 - d : d;
        };
        return gap(ang, minA) <= gap(ang, hourA) ? 'min' : 'hour';
      };

      var move = function (e) {
        if (!self.dragging) return;
        var turns = ((((angleAt(e) + Math.PI / 2) / 6.2832) % 1) + 1) % 1;
        if (self.dragging === 'min') {
          var m = Math.round(turns * 60) % 60;
          // Taking the minute hand past twelve moves the hour on, exactly as
          // it does on a real clock — that is half of what there is to learn.
          if (self.lastM !== null) {
            if (self.lastM > 45 && m < 15) self.free.h = (self.free.h % 12) + 1;
            else if (self.lastM < 15 && m > 45) self.free.h = ((self.free.h + 10) % 12) + 1;
          }
          self.lastM = m;
          self.free.m = m;
        } else {
          self.free.h = (Math.floor(turns * 12) % 12) || 12;
        }
        self._render();
        self._sayFree(700);
        e.preventDefault();
      };

      this._down = function (e) {
        if (!self.play) return;
        self.dragging = pick(angleAt(e));
        self.lastM = null;
        clearTimeout(self._sayT);
        global.Say.stop();
        move(e);
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      };
      this._move = move;
      this._up = function () { self.dragging = null; self.lastM = null; };

      cv.addEventListener('pointerdown', this._down, { passive: false });
      cv.addEventListener('pointermove', this._move, { passive: false });
      cv.addEventListener('pointerup', this._up);
      cv.addEventListener('pointercancel', this._up);
    },

    _unbindHands: function () {
      var cv = this.el && this.el.canvas;
      if (!cv || !this._down) return;
      cv.removeEventListener('pointerdown', this._down);
      cv.removeEventListener('pointermove', this._move);
      cv.removeEventListener('pointerup', this._up);
      cv.removeEventListener('pointercancel', this._up);
      this._down = this._move = this._up = null;
    },

    // Only once she has stopped moving, or it would gabble at every wobble.
    _sayFree: function (wait) {
      var self = this;
      clearTimeout(this._sayT);
      this._sayT = setTimeout(function () {
        if (!self.running || !self.play) return;
        var t = self.free;
        global.Say.line(['m-yes', self._timeKey(t)], "It's " + self.words(t.h, t.m));
      }, wait || 700);
    },

    // Hands-on mode: the clock, what it says, and nothing else in the way.
    _renderPlay: function () {
      var e = this.el, t = this.free;
      if (e.ask) e.ask.textContent = 'Move the hands!';
      if (e.clockWrap) e.clockWrap.hidden = false;
      if (e.digitalWrap) e.digitalWrap.classList.remove('is-on');
      if (e.digital) { e.digital.hidden = false; e.digital.textContent = digital(t.h, t.m); }
      if (e.inWords) { e.inWords.hidden = false; e.inWords.textContent = this.words(t.h, t.m); }
      if (e.options) e.options.hidden = true;
      if (e.teach) e.teach.hidden = true;
      if (e.win) e.win.hidden = true;
      if (e.level) e.level.hidden = true;      // the button above already says it
      if (e.streak) e.streak.hidden = true;
      if (e.tell) e.tell.hidden = true;
      if (e.ring) e.ring.hidden = true;
      if (e.words) {
        e.words.hidden = false;
        e.words.textContent = this.digitalWords ? '🗣️ three thirty' : '🗣️ half past';
      }

      this._fit();
      var c = e.canvas.getContext('2d');
      c.clearRect(0, 0, this.cw, this.ch);
      var r = Math.min(this.cw, this.ch) / 2 - (this.showMinutes ? 30 : 8);
      this.draw(c, this.cw / 2, this.ch / 2, r, t.h, t.m,
                { minuteRing: this.showMinutes, grab: true });
    },

    /* ── drawing a clock ──────────────────────────────────────── */

    // One routine for every clock on screen: the big one and the little ones on
    // the answer buttons, so they always agree with each other.
    draw: function (c, cx, cy, r, h, m, opts) {
      opts = opts || {};
      var i, a;

      c.save();
      // face
      var g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, FACE);
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, r, 0, 6.2832); c.fill();

      c.lineWidth = Math.max(2, r * 0.07);
      c.strokeStyle = '#4b2377';
      c.stroke();

      // minute ticks, with the five-minute ones longer
      for (i = 0; i < 60; i++) {
        a = i * Math.PI / 30 - Math.PI / 2;
        var big = i % 5 === 0;
        var r1 = r * (big ? 0.80 : 0.86), r2 = r * 0.92;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        c.lineWidth = big ? Math.max(1.5, r * 0.035) : Math.max(0.6, r * 0.012);
        c.strokeStyle = big ? '#6b4a8f' : 'rgba(107,74,143,.45)';
        c.stroke();
      }

      // the numbers 1–12
      if (opts.numbers !== false) {
        c.fillStyle = INK;
        c.font = '900 ' + Math.round(r * 0.20) + 'px ' + (opts.font || 'system-ui');
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        for (i = 1; i <= 12; i++) {
          a = i * Math.PI / 6 - Math.PI / 2;
          c.fillText(String(i), cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68);
        }
      }

      // the minute ring outside — the scaffold that makes "25 past" readable
      if (opts.minuteRing) {
        c.fillStyle = MIN_COL;
        c.font = '800 ' + Math.round(r * 0.11) + 'px ' + (opts.font || 'system-ui');
        for (i = 0; i < 12; i++) {
          a = i * Math.PI / 6 - Math.PI / 2;
          c.fillText(pad(i * 5), cx + Math.cos(a) * r * 1.14, cy + Math.sin(a) * r * 1.14);
        }
      }

      // hands. The hour hand creeps between the numbers exactly as it should,
      // because that is one of the things she has to learn to read.
      var hourA = ((h % 12) + m / 60) * Math.PI / 6 - Math.PI / 2;
      var minA = m * Math.PI / 30 - Math.PI / 2;

      var hand = function (ang, len, wide, col) {
        c.save();
        c.translate(cx, cy);
        c.rotate(ang);
        c.lineCap = 'round';
        c.strokeStyle = 'rgba(0,0,0,.18)';
        c.lineWidth = wide + Math.max(1, r * 0.03);
        c.beginPath(); c.moveTo(-r * 0.10, r * 0.03); c.lineTo(len, r * 0.03); c.stroke();
        c.strokeStyle = col;
        c.lineWidth = wide;
        c.beginPath(); c.moveTo(-r * 0.10, 0); c.lineTo(len, 0); c.stroke();
        c.restore();
      };

      hand(hourA, r * 0.48, Math.max(4, r * 0.10), HOUR_COL);
      hand(minA, r * 0.78, Math.max(3, r * 0.062), MIN_COL);

      // In hands-on mode each hand gets a knob on the end, so it is obvious
      // they are things you can take hold of.
      if (opts.grab) {
        var knob = function (ang, len, col) {
          var kx = cx + Math.cos(ang) * len, ky = cy + Math.sin(ang) * len;
          c.beginPath(); c.arc(kx, ky, r * 0.085, 0, 6.2832);
          c.fillStyle = col; c.fill();
          c.lineWidth = Math.max(1.5, r * 0.018);
          c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
        };
        knob(hourA, r * 0.48, HOUR_COL);
        knob(minA, r * 0.78, MIN_COL);
      }

      c.fillStyle = '#4b2377';
      c.beginPath(); c.arc(cx, cy, Math.max(3, r * 0.055), 0, 6.2832); c.fill();
      c.restore();
    },

    /* ── screen ───────────────────────────────────────────────── */

    // Turning the phone changes every dimension the clock was drawn from, so the
    // whole question is painted again rather than just resized.
    _refit: function () { if (this.running && this.t) this._render(); },

    _fit: function () {
      var cv = this.el && this.el.canvas;
      if (!cv) return;
      var d = Math.min(global.devicePixelRatio || 1, 2);
      var w = cv.clientWidth || 300, h = cv.clientHeight || 300;
      cv.width = Math.floor(w * d);
      cv.height = Math.floor(h * d);
      cv.getContext('2d').setTransform(d, 0, 0, d, 0, 0);
      this.cw = w; this.ch = h;
    },

    // Sizing happens in _render just before this, so redrawing never re-enters
    // the resize (which would clear the canvas it is about to paint).
    _drawBig: function () {
      var cv = this.el.canvas;
      if (!cv) return;
      var c = cv.getContext('2d');
      c.clearRect(0, 0, this.cw, this.ch);
      // The minute ring is drawn outside the face, so the face has to leave
      // room for it or the numbers get shaved off against the canvas edge.
      var r = Math.min(this.cw, this.ch) / 2 - (this.showMinutes ? 30 : 8);
      this.draw(c, this.cw / 2, this.ch / 2, r, this.t.h, this.t.m,
                { minuteRing: this.showMinutes });
    },

    _drawOption: function (cv, t) {
      var d = Math.min(global.devicePixelRatio || 1, 2);
      var w = cv.clientWidth || 70, h = cv.clientHeight || 70;
      cv.width = Math.floor(w * d);
      cv.height = Math.floor(h * d);
      var c = cv.getContext('2d');
      c.setTransform(d, 0, 0, d, 0, 0);
      c.clearRect(0, 0, w, h);
      this.draw(c, w / 2, h / 2, Math.min(w, h) / 2 - 3, t.h, t.m, { numbers: false });
    },

    _render: function () {
      var e = this.el, i;
      if (!e) return;
      if (this.play) return this._renderPlay();

      // back from hands-on mode: everything it hid comes back
      if (e.options) e.options.hidden = false;
      if (e.ring) e.ring.hidden = false;
      if (e.tell) e.tell.hidden = false;

      var reading = this.mode === 'read';

      // the question
      if (e.ask) e.ask.textContent = reading ? 'What time is it?' : 'Which clock says…';
      // Whichever half is showing takes the space the other one is not using,
      // so a digital question does not leave a hole where the clock would be.
      if (e.digitalWrap) e.digitalWrap.classList.toggle('is-on', !reading);
      if (e.digital) {
        e.digital.hidden = reading;
        if (!reading) e.digital.textContent = digital(this.t.h, this.t.m);
      }
      if (e.inWords) {
        e.inWords.hidden = reading;
        if (!reading) e.inWords.textContent = this.words(this.t.h, this.t.m);
      }
      if (e.clockWrap) e.clockWrap.hidden = !reading;
      if (reading) { this._fit(); this._drawBig(); }

      if (e.level) { e.level.hidden = false; e.level.textContent = LEVELS[this.level].name; }
      if (e.stars) e.stars.textContent = '⭐ ' + this.stars;
      if (e.streak) {
        e.streak.hidden = this.streak < 2;
        e.streak.textContent = '🔥 ' + this.streak + ' in a row';
      }
      if (e.teach) {
        e.teach.hidden = !this.tellShown;
        e.teach.textContent = this.teach || '';
      }
      // One short label either way, dimmed when off, so it never wraps to two
      // lines on a small phone.
      // Which way round the button reads is the wording she will get next.
      if (e.words) {
        e.words.textContent = this.digitalWords ? '🗣️ three thirty' : '🗣️ half past';
        e.words.setAttribute('aria-label', this.digitalWords
          ? 'Reading times as three thirty, tap for half past three'
          : 'Reading times as half past three, tap for three thirty');
      }
      if (e.ring) {
        e.ring.textContent = '🔢 minutes';
        e.ring.classList.toggle('is-off', !this.showMinutes);
        e.ring.setAttribute('aria-label',
          this.showMinutes ? 'Minute numbers are on' : 'Minute numbers are off');
      }

      // the four answers
      if (e.options) {
        e.options.classList.toggle('is-faces', !reading);
        var kids = e.options.children;
        for (i = 0; i < kids.length; i++) {
          var b = kids[i], t = this.options[i];
          var face = b.querySelector('canvas');
          var label = b.querySelector('.ck-label');
          var sub = b.querySelector('.ck-sub');

          if (reading) {
            if (face) face.hidden = true;
            if (label) label.textContent = digital(t.h, t.m);
            if (sub) { sub.hidden = false; sub.textContent = this.words(t.h, t.m); }
          } else {
            if (face) { face.hidden = false; this._drawOption(face, t); }
            if (label) label.textContent = '';
            if (sub) sub.hidden = true;
          }

          b.classList.toggle('is-gone', this.gone.indexOf(i) >= 0);
          b.classList.toggle('is-right', this.answered && i === this.correct);
          b.classList.toggle('is-wrong', this.badAt === i && Date.now() - this.badT < 500);
          b.disabled = this.answered || this.gone.indexOf(i) >= 0;
        }
      }

      if (e.win) {
        e.win.hidden = !this.answered;
        if (this.answered) {
          if (e.winStars) e.winStars.textContent = '⭐'.repeat(this.lastStars || 1);
          if (e.winTime) e.winTime.textContent = this.words(this.t.h, this.t.m);
          if (e.winDigital) e.winDigital.textContent = digital(this.t.h, this.t.m);
          if (e.winLevel) {
            e.winLevel.hidden = !this.levelledUp;
            e.winLevel.textContent = '🎉 New: ' + LEVELS[this.level].name;
          }
        }
      }
    }
  };

  ClockGame.LEVELS = LEVELS;      // exposed for testing
  ClockGame.spoken = spoken;
  ClockGame.spokenDigital = spokenDigital;
  ClockGame.digital = digital;
  global.ClockGame = ClockGame;
})(window);
