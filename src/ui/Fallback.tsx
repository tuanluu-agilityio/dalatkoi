const COPY = {
  unsupported: {
    title: 'This place needs a 3D-capable browser',
    body: 'Dalat Serenity is drawn live with WebGL 2, which this browser or device does not provide. Try a current version of Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is switched on.',
  },
  crashed: {
    title: 'The forest could not be drawn',
    body: 'Something went wrong while building the scene. Reloading usually fixes it; if it keeps happening, the graphics driver on this device may be out of date.',
  },
  lost: {
    title: 'The view was interrupted',
    body: 'The browser reclaimed the graphics memory this page was using, which can happen when a device is under pressure. Reload to step back in.',
  },
} as const;

/** Shown instead of the 3D scene when it cannot run. Pure CSS, so it works anywhere. */
export function Fallback({ reason }: { reason: keyof typeof COPY }) {
  const copy = COPY[reason];
  return (
    <main className="fallback" role="alert">
      <div className="fallback-hills" aria-hidden="true" />
      <div className="fallback-card">
        <p className="eyebrow">Dalat Serenity</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </main>
  );
}
