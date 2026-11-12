import { useEffect, useState } from 'react';
import { audio } from '../audio/AudioEngine';
import { useStore } from '../state/store';
import { SoundIcon } from './icons';

const status = (progress: number, ready: boolean) => {
  if (ready) return 'The clearing is ready';
  if (progress < 0.3) return 'Walking up through the pines';
  if (progress < 0.9) return 'Laying out timber, stone and water';
  return 'Letting the mist settle';
};

/** Title and loading screen. The live scene is already drifting behind it. */
export function TitleScreen() {
  const phase = useStore((s) => s.phase);
  const progress = useStore((s) => s.loadProgress);
  const [sound, setSound] = useState(true);
  const [gone, setGone] = useState(false);
  const ready = phase === 'ready';
  const open = phase === 'loading' || phase === 'ready';

  // unmount once the fade-out has finished, so it can never intercept input
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setGone(true), 1800);
    return () => clearTimeout(t);
  }, [open]);

  const enter = () => {
    if (!ready) return;
    // Audio may only begin from a user gesture: this click is that gesture.
    const started = audio.start();
    const withSound = sound && started;
    const s = useStore.getState();
    audio.setLevels(s.volumes, !withSound);
    s.enter(withSound);
  };

  if (gone) return null;
  const percent = Math.round(progress * 100);

  return (
    <section className="title" data-open={open} aria-hidden={!open} aria-label="Dalat Serenity">
      <div className="title-inner">
        <p className="eyebrow">Đà Lạt · Lâm Đồng · 1,500 m</p>
        <h1>
          <span>Dalat</span> <span>Serenity</span>
        </h1>
        <p className="tagline">Somewhere between the forest and the silence.</p>

        <div className="title-action">
          <div className="progress" data-done={ready} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Loading">
            <span style={{ transform: `scaleX(${progress})` }} />
          </div>
          <p className="status" aria-live="polite">
            {status(progress, ready)}
            {!ready && <em>{percent}%</em>}
          </p>
          <button className="primary enter" onClick={enter} disabled={!ready || !open} data-ready={ready}>
            Enter experience
          </button>
          <button className="sound-choice" onClick={() => setSound((v) => !v)} aria-pressed={sound} disabled={!open}>
            <SoundIcon on={sound} />
            <span>{sound ? 'Sound on' : 'Sound off'}</span>
          </button>
          <p className="fine">Best with headphones. Sound begins only after you enter.</p>
        </div>
      </div>
    </section>
  );
}
