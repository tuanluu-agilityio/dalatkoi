import { Suspense, lazy } from 'react';

const Experience = lazy(() => import('./scene/Experience'));

export default function App() {
  return (
    <div className="stage">
      <Suspense fallback={null}>
        <Experience />
      </Suspense>
    </div>
  );
}
