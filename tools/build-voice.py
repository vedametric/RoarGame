#!/usr/bin/env python3
"""
tools/build-voice.py — turn every line the games say into an audio file.

The browser's own speech synthesiser sounds mechanical on a phone that has only
the compact voices installed, which is most of them, and a five year old should
not have to listen to that. So every fixed phrase is spoken once here, by a
neural voice, and shipped as a small AAC file. Nothing is synthesised on the
phone any more except the genuinely unbounded cases.

    python3 tools/build-voice.py --voice en_GB-jenny_dioco-medium

Run it again with a different --voice to reshoot the whole set.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'voice')

def ffmpeg():
    for c in ('ffmpeg', shutil.which('ffmpeg')):
        if c and shutil.which(c):
            return shutil.which(c)
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def phrases():
    raw = subprocess.check_output(['node', os.path.join(HERE, 'phrases.js')], cwd=HERE)
    return json.loads(raw)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', default='en_GB-jenny_dioco-medium')
    ap.add_argument('--voice-dir', default=os.path.join(HERE, '.voices'))
    ap.add_argument('--bitrate', default='40k')
    # A touch slower than default: clearer for a child without dragging.
    ap.add_argument('--length-scale', type=float, default=1.06)
    ap.add_argument('--only', default=None, help='comma-separated keys, for a quick look')
    args = ap.parse_args()

    from piper import PiperVoice, SynthesisConfig

    model = os.path.join(args.voice_dir, args.voice + '.onnx')
    if not os.path.exists(model):
        os.makedirs(args.voice_dir, exist_ok=True)
        subprocess.check_call([sys.executable, '-m', 'piper.download_voices',
                               '--download-dir', args.voice_dir, args.voice])

    voice = PiperVoice.load(model)
    cfg = SynthesisConfig(length_scale=args.length_scale, normalize_audio=True)
    ff = ffmpeg()

    todo = phrases()
    if args.only:
        keep = set(args.only.split(','))
        todo = {k: v for k, v in todo.items() if k in keep}

    os.makedirs(OUT, exist_ok=True)
    manifest, total = {}, 0
    tmp = tempfile.mkdtemp()

    for i, (key, text) in enumerate(sorted(todo.items()), 1):
        raw = os.path.join(tmp, 'x.wav')
        with wave.open(raw, 'wb') as wf:
            voice.synthesize_wav(text, wf, syn_config=cfg)
        dest = os.path.join(OUT, key + '.m4a')
        subprocess.check_call([ff, '-loglevel', 'error', '-y', '-i', raw,
                               '-c:a', 'aac', '-b:a', args.bitrate,
                               '-ac', '1', '-ar', '24000', dest])
        size = os.path.getsize(dest)
        total += size
        manifest[key] = 1
        if i % 50 == 0 or i == len(todo):
            print(f'  {i}/{len(todo)}  {total/1e6:.1f} MB', flush=True)

    shutil.rmtree(tmp, ignore_errors=True)

    # The page checks the manifest before asking for a file, so a missing clip
    # falls back to the browser voice instead of a 404 and silence.
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump({'voice': args.voice, 'keys': sorted(manifest)}, f, separators=(',', ':'))

    print(f'{len(manifest)} clips, {total/1e6:.1f} MB, voice {args.voice}')

if __name__ == '__main__':
    main()
