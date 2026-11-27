'use client';
import { useEffect, useRef } from 'react';

const TAU = Math.PI * 2;

// A glowing portal with orbiting rings and a star field that reacts to the pointer:
// the portal drifts toward it, stars bend away from it and link to it, and a tap/click sends out a shockwave.
export default function Background() {
  const canvasRef = useRef(null);
  const orbRef = useRef(null);
  const spotRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current, orb = orbRef.current, spot = spotRef.current;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);

    let w = 0, h = 0, cx = 0, cy = 0, orbR = 0, raf = 0, last = 0, t = 0;
    let pts = [];
    const ripples = [];
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, active: false };

    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const size = Math.min(w * 0.82, 640);
      orbR = size / 2;
      orb.style.width = orb.style.height = `${size}px`;
      cx = w / 2; cy = Math.max(orbR + 40, h * 0.4);
      if (w < 720) cy = Math.min(cy, h * 0.36);
      const n = Math.min(coarse ? 48 : 100, Math.floor((w * h) / 13000));
      pts = Array.from({ length: n }, () => {
        const bx = (Math.random() - 0.5) * 0.3, by = (Math.random() - 0.5) * 0.3;
        return { x: Math.random() * w, y: Math.random() * h, bx, by, vx: bx, vy: by, r: Math.random() * 1.3 + 0.5, tw: Math.random() * TAU };
      });
      if (!ptr.active) { ptr.x = ptr.tx = w / 2; ptr.y = ptr.ty = h / 2; }
    };

    const move = (e) => {
      ptr.tx = e.clientX; ptr.ty = e.clientY; ptr.active = true;
      if (!ptr.seen) { ptr.x = ptr.tx; ptr.y = ptr.ty; ptr.seen = true; }
    };
    const down = (e) => {
      move(e);
      ripples.push({ x: e.clientX, y: e.clientY, r: 8, a: 0.8 });
      for (const p of pts) {                       // shockwave kick
        const dx = p.x - e.clientX, dy = p.y - e.clientY, d = Math.hypot(dx, dy) || 1;
        if (d < 320) { const f = (1 - d / 320) * 5; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
      }
    };
    const leave = () => { if (!coarse) { ptr.active = false; ptr.tx = w / 2; ptr.ty = h / 2; } };
    const vis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) { last = 0; raf = requestAnimationFrame(frame); }
    };

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(40, now - (last || now)); last = now; t += dt / 1000;

      ptr.x += (ptr.tx - ptr.x) * 0.08; ptr.y += (ptr.ty - ptr.y) * 0.08;
      const ex = (ptr.x - w / 2) / (w / 2), ey = (ptr.y - h / 2) / (h / 2);
      const ox = cx + ex * 30, oy = cy + ey * 22;

      orb.style.transform = `translate3d(${ox}px,${oy}px,0) translate(-50%,-50%) scale(${1 + Math.sin(t * 1.1) * 0.03})`;
      spot.style.transform = `translate3d(${ptr.x}px,${ptr.y}px,0) translate(-50%,-50%)`;
      spot.style.opacity = ptr.active ? '1' : '0';

      ctx.clearRect(0, 0, w, h);

      // orbit rings with travelling highlights
      for (let k = 0; k < 4; k++) {
        const r = orbR * [1.06, 1.4, 1.85, 2.45][k];
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(167,139,250,${0.13 - k * 0.025})`;
        ctx.beginPath(); ctx.arc(ox, oy, r, 0, TAU); ctx.stroke();
        const a = t * (0.16 + k * 0.05) * (k % 2 ? -1 : 1) + k * 1.7;
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = `rgba(232,121,249,${0.42 - k * 0.07})`;
        ctx.beginPath(); ctx.arc(ox, oy, r, a, a + 0.8); ctx.stroke();
        const nx = ox + Math.cos(a + 0.8) * r, ny = oy + Math.sin(a + 0.8) * r;
        ctx.fillStyle = 'rgba(232,121,249,.18)'; ctx.beginPath(); ctx.arc(nx, ny, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(250,232,255,.95)'; ctx.beginPath(); ctx.arc(nx, ny, 2.2, 0, TAU); ctx.fill();
      }

      // stars
      for (const p of pts) {
        if (ptr.active) {
          const dx = p.x - ptr.x, dy = p.y - ptr.y, d = Math.hypot(dx, dy) || 1;
          if (d < 150) { const f = (1 - d / 150) * 0.09; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
        }
        p.vx += (p.bx - p.vx) * 0.02; p.vy += (p.by - p.vy) * 0.02;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const q = pts[j], d = Math.hypot(p.x - q.x, p.y - q.y);
          if (d < 115) {
            ctx.strokeStyle = `rgba(167,139,250,${0.17 * (1 - d / 115)})`;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
        if (ptr.active) {
          const d = Math.hypot(p.x - ptr.x, p.y - ptr.y);
          if (d < 170) {
            ctx.strokeStyle = `rgba(232,121,249,${0.5 * (1 - d / 170)})`;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ptr.x, ptr.y); ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(233,224,255,${0.45 + 0.4 * Math.sin(t * 2 + p.tw)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }

      // shockwaves
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += 380 * (dt / 1000); rp.a -= 1.1 * (dt / 1000);
        if (rp.a <= 0) { ripples.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(216,180,254,${rp.a})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.r, 0, TAU); ctx.stroke();
      }
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', vis);
    if (reduce) frame(16), cancelAnimationFrame(raf); else raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  return (
    <div className="bg" aria-hidden="true">
      <div className="spot" ref={spotRef} />
      <div className="orb" ref={orbRef} />
      <canvas ref={canvasRef} />
      <div className="vignette" />
    </div>
  );
}
