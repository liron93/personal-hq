"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// כדור חלקיקים תלת-מימדי מקורי (לא דמות של אף אחד) — "ליבת AI" של JARVIS.
// נבנה ידנית עם three.js גולמי, בלי react-three-fiber, כדי לשמור על התוסף הקל
// ביותר לבאנדל. נכבה בעדינות אם WebGL לא זמין, ומכבד prefers-reduced-motion.
// הגודל נגזר מה-CSS של המיכל (ResizeObserver) כדי לכבד את breakpoints הקיימים
// בלי לשכפל אותם כאן ב-JS.
export default function JarvisOrb({ className }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return; // אין WebGL זמין — נשארים בלי האורב, בלי לשבור את העמוד.
    }
    renderer.setPixelRatio(dpr);
    const initialSize = mount.clientWidth || 78;
    renderer.setSize(initialSize, initialSize);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3.1;

    const resizeObserver = new ResizeObserver(entries => {
      const width = Math.round(entries[0]?.contentRect?.width || initialSize);
      if (!width) return;
      renderer.setSize(width, width);
    });
    resizeObserver.observe(mount);

    // התפלגות פיבונאצ'י על פני כדור — פיזור חלקיקים אחיד, בלי "קטבים" צפופים.
    const count = 620;
    const positions = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = golden * i;
      const jitter = 0.97 + Math.random() * 0.06;
      positions[i * 3] = Math.cos(theta) * radiusAtY * jitter;
      positions[i * 3 + 1] = y * jitter;
      positions[i * 3 + 2] = Math.sin(theta) * radiusAtY * jitter;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x6fe4ff,
      size: 0.032,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // גרעין זוהר קטן במרכז, כמו ליבת אנרגיה.
    const coreGeometry = new THREE.SphereGeometry(0.32, 24, 24);
    const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xbdfbff, transparent: true, opacity: 0.85 });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(core);

    let frameId;
    let clock = new THREE.Clock();

    const renderStatic = () => {
      renderer.render(scene, camera);
    };

    const animate = () => {
      const t = clock.getElapsedTime();
      points.rotation.y = t * 0.25;
      points.rotation.x = Math.sin(t * 0.15) * 0.15;
      const breathe = 1 + Math.sin(t * 1.4) * 0.045;
      core.scale.setScalar(breathe);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    if (reduceMotion) {
      renderStatic();
    } else {
      animate();
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className={className} aria-hidden="true" />;
}
