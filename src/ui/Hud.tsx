import { useCallback, useEffect, useRef, useState } from 'react';
import { detectedQuality } from '../config/device';
import { QUALITY, type QualityLevel } from '../config/quality';
import { events } from '../state/events';
import { runtime } from '../state/runtime';
import { useStore, type CameraMode, type VolumeBus } from '../state/store';
import { RAIN_INTENSITIES, type RainIntensity, type WeatherMode } from '../weather/weather';
import { POIS } from '../world/pois';
import { BoltIcon, CloseIcon, FullscreenIcon, HelpIcon, OrbitIcon, QualityIcon, RainIcon, SoundIcon, SunIcon, TourIcon, WalkIcon } from './icons';

type Panel = 'sound' | 'quality' | 'help' | null;

const MODES: { id: CameraMode; label: string; key: string; icon: React.ReactNode }[] = [
  { id: 'walk', label: 'Walk', key: '1', icon: <WalkIcon /> },
  { id: 'cinematic', label: 'Tour', key: '2', icon: <TourIcon /> },
  { id: 'orbit', label: 'Orbit', key: '3', icon: <OrbitIcon /> },
];

const WEATHERS: { id: WeatherMode; label: string; icon: React.ReactNode }[] = [
  { id: 'morning', label: 'Morning', icon: <SunIcon /> },
  { id: 'rain', label: 'Rain', icon: <RainIcon /> },
];

const INTENSITY_LABEL: Record<RainIntensity, string> = { drizzle: 'Drizzle', moderate: 'Moderate', heavy: 'Heavy' };

const BUSES: { id: VolumeBus; label: string }[] = [
  { id: 'master', label: 'Overall' },
  { id: 'ambient', label: 'Wind & water' },
  { id: 'environment', label: 'Birds, chimes, koi' },
  { id: 'footsteps', label: 'Footsteps' },
  { id: 'rain', label: 'Rain' },
];

const IDLE_AFTER = 4000;
const WALK_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

/** Frame rate and scene statistics, toggled with P. */
function PerfReadout() {
  const [text, setText] = useState('');
  useEffect(() => {
    const read = () => {
      const s = useStore.getState();
      const tris = runtime.triangles > 1e6 ? `${(runtime.triangles / 1e6).toFixed(2)}M` : `${Math.round(runtime.triangles / 1e3)}k`;
      setText(`${Math.round(runtime.fps)} fps · ${QUALITY[s.quality].label}${s.autoQuality ? ' (auto)' : ''} · res ×${s.dprScale.toFixed(2)} · ${runtime.drawCalls} calls · ${tris} tris`);
    };
    read();
    const t = setInterval(read, 500);
    return () => clearInterval(t);
  }, []);
  return <output className="perf">{text}</output>;
}

/** Everything on screen while exploring. Fades away when left alone, so the view stays clean. */
export function Hud() {
  const phase = useStore((s) => s.phase);
  const mode = useStore((s) => s.cameraMode);
  const muted = useStore((s) => s.muted);
  const volumes = useStore((s) => s.volumes);
  const quality = useStore((s) => s.quality);
  const autoQuality = useStore((s) => s.autoQuality);
  const hint = useStore((s) => s.hint);
  const noteOpen = useStore((s) => s.noteOpen);
  const locked = useStore((s) => s.pointerLocked);
  const isTouch = useStore((s) => s.isTouch);
  const weather = useStore((s) => s.weather);
  const rainIntensity = useStore((s) => s.rainIntensity);
  const thunder = useStore((s) => s.thunder);
  const lightning = useStore((s) => s.lightning);

  const [panel, setPanel] = useState<Panel>(null);
  const [idle, setIdle] = useState(false);
  const [perf, setPerf] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const panelRef = useRef<Panel>(null);
  panelRef.current = panel;

  const exploring = phase === 'explore';
  const poi = hint ? POIS.find((p) => p.id === hint) : undefined;
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (panelRef.current === null) setIdle(true);
    }, IDLE_AFTER);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const toggleNote = useCallback(() => {
    const s = useStore.getState();
    if (s.noteOpen) s.setNoteOpen(false);
    else if (s.hint) s.setNoteOpen(true);
  }, []);

  useEffect(() => {
    if (!exploring) return;
    wake();
    const onPointer = () => {
      // while the mouse is steering the camera it is not asking for the interface
      if (!document.pointerLockElement) wake();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const s = useStore.getState();
      if (!WALK_KEYS.has(e.code) && e.code !== 'KeyE') wake();
      switch (e.code) {
        case 'Digit1':
          s.setCameraMode('walk');
          break;
        case 'Digit2':
          s.setCameraMode('cinematic');
          break;
        case 'Digit3':
          s.setCameraMode('orbit');
          break;
        case 'KeyM':
          s.toggleMuted();
          break;
        case 'KeyR':
          s.toggleWeather();
          break;
        case 'KeyF':
          toggleFullscreen();
          break;
        case 'KeyH':
          setPanel((p) => (p === 'help' ? null : 'help'));
          break;
        case 'KeyP':
          setPerf((v) => !v);
          break;
        case 'Escape':
          setPanel(null);
          s.setNoteOpen(false);
          break;
      }
    };
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    const offInteract = events.on('interact', toggleNote);
    window.addEventListener('pointermove', onPointer);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerlockchange', wake);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      clearTimeout(timer.current);
      offInteract();
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerlockchange', wake);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [exploring, wake, toggleFullscreen, toggleNote]);

  // the opening can be skipped with any key, click or tap (after a beat, so the Enter click does not count)
  useEffect(() => {
    if (phase !== 'intro') return;
    const skip = () => events.emit('skipIntro', undefined);
    const arm = setTimeout(() => {
      window.addEventListener('keydown', skip);
      window.addEventListener('pointerdown', skip);
    }, 900);
    return () => {
      clearTimeout(arm);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [phase]);

  if (phase === 'intro') {
    return (
      <div className="hud">
        <button className="pill skip" onClick={() => events.emit('skipIntro', undefined)}>
          Skip intro · any key
        </button>
      </div>
    );
  }
  if (!exploring) return null;

  const setQuality = (level: QualityLevel | 'auto') => {
    const s = useStore.getState();
    if (level === 'auto') s.setQuality(detectedQuality, true);
    else s.setQuality(level, false);
  };
  const open = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const showLookPrompt = mode === 'walk' && !isTouch && !locked && panel === null && !noteOpen;

  return (
    <div className="hud" data-idle={idle && panel === null}>
      <p className="wordmark chrome">Dalat Serenity</p>

      <nav className="modes chrome" aria-label="Camera mode">
        {MODES.map((m) => (
          <button key={m.id} aria-pressed={mode === m.id} title={`${m.label} (${m.key})`} onClick={() => useStore.getState().setCameraMode(m.id)}>
            {m.icon}
            <span>{m.label}</span>
          </button>
        ))}
      </nav>

      <div className="weather chrome" data-panel={panel !== null}>
        <nav className="segmented" aria-label="Weather">
          {WEATHERS.map((w) => (
            <button key={w.id} aria-pressed={weather === w.id} title={`${w.label} (R)`} onClick={() => useStore.getState().setWeather(w.id)}>
              {w.icon}
              <span>{w.label}</span>
            </button>
          ))}
        </nav>
        {weather === 'rain' && (
          <nav className="segmented fine-grain" aria-label="Rain intensity">
            {RAIN_INTENSITIES.map((level) => (
              <button key={level} aria-pressed={rainIntensity === level} onClick={() => useStore.getState().setRainIntensity(level)}>
                {INTENSITY_LABEL[level]}
              </button>
            ))}
          </nav>
        )}
      </div>

      <div className="tools chrome">
        <button className="tool" aria-label={muted ? 'Sound is off: open sound settings' : 'Sound settings'} aria-expanded={panel === 'sound'} onClick={() => open('sound')}>
          <SoundIcon on={!muted} />
        </button>
        <button className="tool" aria-label="Graphics quality" aria-expanded={panel === 'quality'} onClick={() => open('quality')}>
          <QualityIcon />
        </button>
        {canFullscreen && (
          <button className="tool" aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} onClick={toggleFullscreen}>
            <FullscreenIcon on={fullscreen} />
          </button>
        )}
        <button className="tool" aria-label="How to move around" aria-expanded={panel === 'help'} onClick={() => open('help')}>
          <HelpIcon />
        </button>
      </div>

      {panel === 'sound' && (
        <section className="panel" aria-label="Sound">
          <header>
            <h2>Sound</h2>
            <button className="tool small" aria-label="Close" onClick={() => setPanel(null)}>
              <CloseIcon />
            </button>
          </header>
          <button className="row-toggle" aria-pressed={!muted} onClick={() => useStore.getState().toggleMuted()}>
            <SoundIcon on={!muted} />
            <span>{muted ? 'Sound is off' : 'Sound is on'}</span>
          </button>
          {BUSES.map((b) => (
            <label key={b.id} className="slider">
              <span>{b.label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volumes[b.id]}
                disabled={muted}
                onChange={(e) => useStore.getState().setVolume(b.id, Number(e.target.value))}
              />
            </label>
          ))}
          <h3>Storm</h3>
          <button className="row-toggle" aria-pressed={thunder} onClick={() => useStore.getState().setThunder(!thunder)}>
            <SoundIcon on={thunder} />
            <span>{thunder ? 'Thunder is on' : 'Thunder is off'}</span>
          </button>
          <button className="row-toggle" aria-pressed={lightning} onClick={() => useStore.getState().setLightning(!lightning)}>
            <BoltIcon />
            <span>{lightning ? 'Lightning flashes are on' : 'Lightning flashes are off'}</span>
          </button>
          <p className="fine">Thunder and lightning only come with the rain, now and then.</p>
        </section>
      )}

      {panel === 'quality' && (
        <section className="panel" aria-label="Graphics quality">
          <header>
            <h2>Graphics</h2>
            <button className="tool small" aria-label="Close" onClick={() => setPanel(null)}>
              <CloseIcon />
            </button>
          </header>
          <div className="choices">
            <button aria-pressed={autoQuality} onClick={() => setQuality('auto')}>
              <strong>Auto</strong>
              <span>Adapts to this device{autoQuality ? ` · now ${QUALITY[quality].label}` : ''}</span>
            </button>
            {(['high', 'medium', 'low'] as const).map((level) => (
              <button key={level} aria-pressed={!autoQuality && quality === level} onClick={() => setQuality(level)}>
                <strong>{QUALITY[level].label}</strong>
                <span>{level === 'high' ? 'Full detail, soft shadows, depth of field' : level === 'medium' ? 'Balanced for laptops' : 'Lightest, for phones and older machines'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {panel === 'help' && (
        <section className="panel" aria-label="How to move around">
          <header>
            <h2>Finding your way</h2>
            <button className="tool small" aria-label="Close" onClick={() => setPanel(null)}>
              <CloseIcon />
            </button>
          </header>
          {isTouch ? (
            <dl className="keys">
              <dt>Left thumb pad</dt>
              <dd>Walk; push to the rim to jog</dd>
              <dt>Drag anywhere</dt>
              <dd>Look around</dd>
              <dt>Tap a note</dt>
              <dd>Read about the place you are standing</dd>
              <dt>Pinch (Orbit)</dt>
              <dd>Move closer or further</dd>
              <dt>Morning · Rain</dt>
              <dd>Change the weather; choose how hard it rains</dd>
            </dl>
          ) : (
            <dl className="keys">
              <dt>W A S D / arrows</dt>
              <dd>Walk (hold Shift to jog)</dd>
              <dt>Click, then mouse</dt>
              <dd>Look around; Esc releases the pointer</dd>
              <dt>Scroll</dt>
              <dd>Zoom the lens</dd>
              <dt>E</dt>
              <dd>Read the note where you stand</dd>
              <dt>1 · 2 · 3</dt>
              <dd>Walk · Tour · Orbit</dd>
              <dt>R</dt>
              <dd>Morning · Rain</dd>
              <dt>M · F · H · P</dt>
              <dd>Mute · Full screen · This help · Frame rate</dd>
            </dl>
          )}
          <p className="fine">Stand still at the edge of the pond and the koi will come to you.</p>
        </section>
      )}

      {poi && !noteOpen && panel === null && (
        <button className="pill hint" onClick={toggleNote}>
          <strong>{poi.title}</strong>
          <span>{poi.hint}</span>
          <kbd>{isTouch ? 'Tap' : 'E'}</kbd>
        </button>
      )}

      {poi && noteOpen && (
        <article className="note" aria-live="polite">
          <h2>{poi.title}</h2>
          <p>{poi.note}</p>
          <button className="pill" onClick={toggleNote}>
            {isTouch ? 'Close' : 'Close · E'}
          </button>
        </article>
      )}

      {showLookPrompt && <p className="prompt chrome">Click to look around · W A S D to walk</p>}
      {perf && <PerfReadout />}
    </div>
  );
}
