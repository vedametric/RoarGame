#!/usr/bin/env python3
"""
tools/build-voice.py — turn every line the games say into audio, in each voice.

The browser's own speech synthesiser sounds mechanical on a phone that has only
the compact voices installed, which is most of them, and a five year old should
not have to listen to that. So every fixed phrase is spoken once here, by a
neural voice, and shipped as a small AAC file.

Three voices ship, so she can pick one she likes. The pitches below were
measured off the generated audio rather than guessed from the names:

    Jenny  208 Hz   English, friendly
    Ned    121 Hz   English man
    Alan   100 Hz   deep

    python3 tools/build-voice.py                 # all three
    python3 tools/build-voice.py --pack alan     # just one
    python3 tools/build-voice.py --only w-cat    # one clip, for a quick look
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'voice')

PACKS = [
    {'id': 'jenny', 'model': 'en_GB-jenny_dioco-medium',
     'name': 'Jenny', 'note': 'English, friendly', 'hz': 208},
    {'id': 'ned',   'model': 'en_GB-northern_english_male-medium',
     'name': 'Ned',   'note': 'English man',       'hz': 121},
    {'id': 'alan',  'model': 'en_GB-alan-medium',
     'name': 'Alan',  'note': 'a deep voice',      'hz': 100},
]


def ffmpeg():
    found = shutil.which('ffmpeg')
    if found:
        return found
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def phrases():
    raw = subprocess.check_output(['node', os.path.join(HERE, 'phrases.js')], cwd=HERE)
    return json.loads(raw)


def build(pack, todo, args, ff):
    from piper import PiperVoice, SynthesisConfig

    model = os.path.join(args.voice_dir, pack['model'] + '.onnx')
    if not os.path.exists(model):
        os.makedirs(args.voice_dir, exist_ok=True)
        subprocess.check_call([sys.executable, '-m', 'piper.download_voices',
                               '--download-dir', args.voice_dir, pack['model']])

    # A truncated download loads as a protobuf error rather than bad audio, so
    # let it fail loudly here instead of part-way through a thousand clips.
    voice = PiperVoice.load(model)
    cfg = SynthesisConfig(length_scale=args.length_scale, normalize_audio=True)

    dest_dir = os.path.join(OUT, pack['id'])
    os.makedirs(dest_dir, exist_ok=True)
    tmp = tempfile.mkdtemp()
    total = 0

    for i, (key, text) in enumerate(sorted(todo.items()), 1):
        raw = os.path.join(tmp, 'x.wav')
        with wave.open(raw, 'wb') as wf:
            voice.synthesize_wav(text, wf, syn_config=cfg)
        # MP3, not AAC. Every browser decodes MP3 through the Web Audio API;
        # open-source Chromium cannot decode AAC at all, and the clips are
        # played through an AudioContext because iOS will not let a media
        # element play outside the tap that made it. Same size either way.
        dest = os.path.join(dest_dir, key + '.mp3')
        subprocess.check_call([ff, '-loglevel', 'error', '-y', '-i', raw,
                               '-c:a', 'libmp3lame', '-b:a', args.bitrate,
                               '-ac', '1', '-ar', '24000', dest])
        total += os.path.getsize(dest)
        if i % 200 == 0 or i == len(todo):
            print('    %s %d/%d  %.1f MB' % (pack['id'], i, len(todo), total / 1e6), flush=True)

    shutil.rmtree(tmp, ignore_errors=True)
    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack', default=None, help='build only this pack')
    ap.add_argument('--voice-dir', default=os.path.join(HERE, '.voices'))
    ap.add_argument('--bitrate', default='48k')
    # A touch slower than default: clearer for a child without dragging.
    ap.add_argument('--length-scale', type=float, default=1.06)
    ap.add_argument('--only', default=None, help='comma-separated keys')
    args = ap.parse_args()

    todo = phrases()
    if args.only:
        keep = set(args.only.split(','))
        todo = {k: v for k, v in todo.items() if k in keep}

    packs = [p for p in PACKS if not args.pack or p['id'] == args.pack]
    ff = ffmpeg()
    os.makedirs(OUT, exist_ok=True)

    grand = 0
    for pack in packs:
        print('  %s (%s)' % (pack['name'], pack['model']), flush=True)
        grand += build(pack, todo, args, ff)

    # Every pack says exactly the same lines, so the key list is written once
    # rather than per pack. The page checks it before asking for a file, so a
    # line we never recorded falls back to the browser voice instead of a 404.
    if not args.only:
        keys = sorted(todo)
        for pack in PACKS:
            here = os.path.join(OUT, pack['id'])
            if not os.path.isdir(here):
                continue
            have = {f[:-4] for f in os.listdir(here) if f.endswith('.mp3')}
            missing = set(keys) - have
            if missing:
                raise SystemExit('%s is missing %d clips, e.g. %s'
                                 % (pack['id'], len(missing), sorted(missing)[:3]))
        with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
            json.dump({'packs': [{k: p[k] for k in ('id', 'name', 'note', 'hz')}
                                 for p in PACKS],
                       'keys': keys}, f, separators=(',', ':'))

    print('%d clips x %d voices, %.1f MB' % (len(todo), len(packs), grand / 1e6))


if __name__ == '__main__':
    main()
