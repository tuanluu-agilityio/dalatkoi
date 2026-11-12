import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { detectedQuality, deviceSignals, webglAvailable } from './config/device';
import { useStore } from './state/store';
import { FadeOverlay } from './ui/FadeOverlay';
import { Fallback } from './ui/Fallback';
import { Hud } from './ui/Hud';
import { Joystick } from './ui/Joystick';
import { TitleScreen } from './ui/TitleScreen';
import './ui/styles/ui.css';

const Experience = lazy(() => import('./scene/Experience'));

// Decide the starting quality once, before the scene is built.
useStore.setState({ quality: detectedQuality, autoQuality: true, isTouch: deviceSignals.touch });
useStore.getState().setLoadProgress(0.06);

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[scene] failed to start', error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function App() {
  const [problem, setProblem] = useState<'none' | 'unsupported' | 'crashed' | 'lost'>(webglAvailable ? 'none' : 'unsupported');

  useEffect(() => {
    const lost = () => setProblem('lost');
    window.addEventListener('dalat:contextlost', lost);
    return () => window.removeEventListener('dalat:contextlost', lost);
  }, []);

  if (problem !== 'none') return <Fallback reason={problem} />;

  return (
    <>
      <div className="stage">
        <SceneBoundary onError={() => setProblem('crashed')}>
          <Suspense fallback={null}>
            <Experience />
          </Suspense>
        </SceneBoundary>
      </div>
      <FadeOverlay />
      <Hud />
      <Joystick />
      <TitleScreen />
    </>
  );
}
