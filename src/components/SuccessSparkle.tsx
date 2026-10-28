import { useEffect, useRef } from 'react';

/** A brief decorative Three.js flourish. The DOM check and message remain primary. */
export default function SuccessSparkle() {
  const host = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches || document.hidden) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void import('three').then(THREE => {
      if (cancelled || !host.current || document.hidden || reducedMotion.matches) return;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true });
      if (!context) return;
      let renderer: import('three').WebGLRenderer;
      try { renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true }); }
      catch { context.getExtension('WEBGL_lose_context')?.loseContext(); return; }
      let frame = 0;
      let disposed = false;
      const resources: { dispose: () => void }[] = [];
      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(frame);
        resources.forEach(resource => resource.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
      };
      dispose = cleanup;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(136, 96);
      renderer.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-68, 68, 48, -48, 0.1, 100);
      camera.position.z = 10;
      const shape = new THREE.Shape();
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const radius = i % 2 ? 1.1 : 3.5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      shape.closePath();
      const geometry = new THREE.ShapeGeometry(shape);
      resources.push(geometry);
      const colors = [0xccaa54, 0x8daed0, 0x91b6a4, 0xb7a5d5];
      const stars = Array.from({ length: 9 }, (_, index) => {
        const material = new THREE.MeshBasicMaterial({ color: colors[index % colors.length], transparent: true });
        resources.push(material);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        return { mesh, material, angle: index * Math.PI * 2 / 9, distance: 24 + (index % 3) * 9 };
      });
      host.current.append(canvas);
      const started = performance.now();
      const draw = (now: number) => {
        const t = Math.min(1, (now - started) / 560);
        if (cancelled || document.hidden || reducedMotion.matches || t >= 1) { cleanup(); dispose = undefined; return; }
        const ease = 1 - (1 - t) ** 3;
        stars.forEach(({ mesh, material, angle, distance }, index) => {
          mesh.position.set(Math.cos(angle) * distance * ease, Math.sin(angle) * distance * ease, 0);
          mesh.rotation.z = angle + t * (index % 2 ? 0.35 : -0.35);
          mesh.scale.setScalar(Math.sin(Math.PI * t) * (index % 2 ? 0.8 : 1));
          material.opacity = (1 - t) * 0.85;
        });
        renderer.render(scene, camera);
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    }).catch(() => { dispose?.(); dispose = undefined; });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <span ref={host} className="success-sparkle" aria-hidden="true" />;
}
