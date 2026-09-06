/*
 * analytics.js — what she actually plays
 *
 * Loading happens in index.html: the Matomo Tag Manager container, which in
 * turn loads the tracker. This file is everything the app has to say to it.
 *
 * What goes out is what a game is called, how long it was on screen, and the
 * numbers the game itself keeps — score, best, lives, level. What never goes
 * out is anything about the people playing: no names, no photos, no recorded
 * voices, no microphone data. The line on the front screen says photos and
 * voices never leave this phone, and it stays true.
 *
 * Two channels, because the container decides what happens to each:
 *   _mtm — Tag Manager's data layer, so triggers can be built on any of it
 *          without touching this file again.
 *   _paq — the tracker's own queue, which is what actually records the visit.
 *          Pushing to it before the tracker exists is safe: it is an ordinary
 *          array until Matomo takes it over, and the backlog is then replayed.
 *
 * Nothing in here may ever throw into a game. Every entry point is wrapped,
 * and a blocked or missing container simply means the pushes go nowhere.
 */
(function (global) {
  'use strict';

  var DEVICE = 'stats.device';       // which phone, not which child
  var HEARTBEAT = 15;                // seconds; makes "time on screen" real

  /* Every game object, under the id the rest of the app already calls it by.
     Instrumenting from out here rather than inside seventeen game files keeps
     the games ignorant of analytics, which is how it should stay. */
  var GAMES = {
    grab: 'GrabGame', roar: 'RoarGame', balloon: 'BalloonGame',
    count: 'CountGame', calc: 'CalcGame', spell: 'SpellGame',
    clock: 'ClockGame', snake: 'SnakeGame', duel: 'DuelGame',
    run: 'RunGame', pairs: 'PairsGame', catch: 'CatchGame',
    bounce: 'BounceGame', tree: 'TreeGame', copy: 'CopyGame',
    odd: 'OddGame', cups: 'CupsGame'
  };

  /* The numbers worth keeping, named as the games themselves name them. Not
     every game has every one — whatever is a real number at the end of a go
     gets sent, and the rest are simply absent. */
  var NUMBERS = ['score', 'best', 'turns', 'found', 'won', 'round', 'level',
                 'lives', 'eaten', 'picked', 'wilts', 'dist', 'mine', 'theirs',
                 'right', 'wrong', 'stars', 'streak', 'hints', 'band', 'done',
                 'stage', 'n', 'time'];

  function saved(k, d) {
    try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; }
  }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function now() { return (global.performance || Date).now(); }
  function num(v) { return typeof v === 'number' && isFinite(v); }

  // A name for this phone, so a week of visits reads as one child rather than
  // as thirty strangers. Random, kept locally, and tied to nobody.
  function deviceId() {
    var id = saved(DEVICE, '');
    if (!id) {
      id = 'd' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      save(DEVICE, id);
    }
    return id;
  }

  var Track = {
    started: 0,
    screenId: null,
    screenAt: 0,

    /* ── the two queues ───────────────────────────────────────── */

    paq: function (args) {
      try { (global._paq = global._paq || []).push(args); } catch (e) {}
    },
    mtm: function (obj) {
      try { (global._mtm = global._mtm || []).push(obj); } catch (e) {}
    },

    /* An event is a category, a thing that happened, what it happened to, and
       optionally a number. Matomo will only count the number if it is one, so
       anything else is dropped rather than sent as a string. */
    event: function (category, action, name, value) {
      var e = ['trackEvent', String(category), String(action)];
      if (name != null) e.push(String(name));
      if (num(value)) e.push(Math.round(value * 100) / 100);
      this.paq(e);
      this.mtm({ event: 'roar.' + category + '.' + action,
                 'roar.name': name == null ? '' : String(name),
                 'roar.value': num(value) ? value : null });
    },

    /* ── starting up ──────────────────────────────────────────── */

    init: function () {
      if (this.started) return;
      this.started = now();
      try {
        this.paq(['setUserId', deviceId()]);
        this.paq(['enableHeartBeatTimer', HEARTBEAT]);
        this.paq(['enableLinkTracking']);
        // The shape of the thing she is playing on, which is the only reason
        // a layout bug is ever reproducible after the fact.
        this.event('Device', 'screen', screen.width + '×' + screen.height +
                   ' @' + (global.devicePixelRatio || 1));
        this.event('Device', 'installed',
                   (global.navigator.standalone ||
                    (global.matchMedia && matchMedia('(display-mode: standalone)').matches))
                     ? 'home screen' : 'browser');
        this.event('Session', 'open', new Date().getHours() + ':00');
      } catch (e) {}
      this.watch();
      this.wrap();

      /* The app opens on a screen that is already marked active in the HTML,
         so show() never runs for it and the very first thing she sees was the
         one screen that went unrecorded. Claimed on a timeout rather than
         here, so that if the app does navigate on startup its own call wins. */
      var self = this;
      setTimeout(function () {
        if (self.screenId) return;
        var el = document.querySelector('.screen.is-active');
        self.screen(el ? el.id : 'screen-splash');
      }, 0);
    },

    /* Backgrounding the app is the difference between half an hour of play and
       half an hour of the phone being face down on the sofa. */
    watch: function () {
      var self = this;
      try {
        document.addEventListener('visibilitychange', function () {
          self.event('Session', document.hidden ? 'away' : 'back',
                     self.screenId || 'app');
        });
        addEventListener('pagehide', function () {
          self.leaveScreen();
          self.event('Session', 'close', 'app', (now() - self.started) / 1000);
        });
      } catch (e) {}
    },

    /* ── where she is ─────────────────────────────────────────── */

    // Each screen is recorded as its own page, so Matomo's own reports —
    // most visited, time on page, where they went next — work without any of
    // it having to be rebuilt out of events.
    screen: function (id, title) {
      try {
        this.leaveScreen();
        this.screenId = id;
        this.screenAt = now();
        var path = '/' + String(id).replace(/^screen-/, '');
        this.paq(['setCustomUrl', location.origin + path]);
        this.paq(['setDocumentTitle', title || path]);
        this.paq(['trackPageView']);
        this.mtm({ event: 'roar.screen', 'roar.screen': path, 'roar.title': title || '' });
      } catch (e) {}
    },

    leaveScreen: function () {
      if (!this.screenId) return;
      var secs = (now() - this.screenAt) / 1000;
      // A screen crossed on the way somewhere else is not a visit to it.
      if (secs > 1) this.event('Screen', 'time', this.screenId, secs);
      this.screenId = null;
    },

    /* ── what she is playing ──────────────────────────────────── */

    /* Games are instrumented by wrapping start and stop, so a game added
       later is one line in the list above and nothing else. Every game here
       has the same three: start(cfg), stop(), and a _finish() for the ones
       that can end on their own. */
    wrap: function () {
      var self = this;
      Object.keys(GAMES).forEach(function (id) {
        var g = global[GAMES[id]];
        if (!g || g._tracked) return;
        g._tracked = true;

        var start = g.start, stop = g.stop, finish = g._finish;

        g.start = function () {
          var r;
          try { r = start.apply(this, arguments); }
          finally {
            try {
              this._trackAt = now();
              this._trackBest = num(this.best) ? this.best : null;
              self.event('Game', 'start', id);
            } catch (e) {}
          }
          return r;
        };

        g.stop = function () {
          // stop() is called on games that were never running — every screen
          // change tears all of them down — so only a game that was actually
          // being played counts as one that was played.
          var was = this.running && this._trackAt;
          var self2 = this;
          try { return stop.apply(this, arguments); }
          finally {
            try {
              if (was) {
                self.event('Game', 'finish', id, (now() - self2._trackAt) / 1000);
                self.stats(id, self2);
                self2._trackAt = 0;
              }
            } catch (e) {}
          }
        };

        if (typeof finish === 'function') {
          g._finish = function () {
            var r;
            try { r = finish.apply(this, arguments); }
            finally {
              try {
                self.event('Game', 'game over', id);
                self.stats(id, this);
                if (this.newBest) self.event('Best', 'new best', id,
                                             num(this.best) ? this.best : null);
              } catch (e) {}
            }
            return r;
          };
        }
      });
    },

    // Every number the game kept, sent under its own name so nothing has to
    // be guessed at from the outside.
    stats: function (id, g) {
      for (var i = 0; i < NUMBERS.length; i++) {
        var k = NUMBERS[i], v = g[k];
        // level is an object in RUN! and a number in Bounce; take either.
        // RUN! keeps its difficulty as an object and Bounce keeps its as a
        // number; take whichever it is.
        if (v && typeof v === 'object' && v.id != null) {
          this.event('Choice', k, id + ': ' + v.id);
          continue;
        }
        if (num(v)) this.event('Stat', k, id, v);
      }
    }
  };

  global.Track = Track;

  // The games have to exist before they can be wrapped, so this waits for the
  // document rather than running where it sits.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Track.init(); });
  } else {
    Track.init();
  }
})(window);
