
import { Point, GCodeSettings, PatternSettings } from "../types";
import { generateText } from "./vectorText";
import { reflectValue } from "./reflection";

export const generatePattern = (settings: PatternSettings, workspace: { w: number, h: number }, customFont?: any): Point[] => {
  let points: Point[] = [];
  const { type, loops, points: resolution, rotation, scale, outerRadius, innerRadius, penOffset, growth, freqX, freqY, wobbleAmplitude, wobbleFrequency, mirrorCount, offsetX, offsetY, noiseAmplitude, textContent, textSize, textCircular, textFlipWrap, multiplier, divergence, modulationAmplitude, modulationFrequency, m, n1, n2, n3, fractalDepth, fractalBranchFactor, chladniN, chladniM, morphAmplitude, morphFrequency } = settings;
  const cx = workspace.w / 2;
  const cy = workspace.h / 2;
  const rotRad = (rotation * Math.PI) / 180;

  if (type === 'text') {
      const txt = textContent || "MONOLINE";
      const r = outerRadius; // reuse outerRadius for Circular wrapping radius
      const s = textSize || 20;
      const doConnect = settings.connectLetters !== false; // Default true
      points = generateText(txt, !!textCircular, r, s, cx, cy, doConnect, !!textFlipWrap, customFont);
      
      // Apply pure rotation to the entire text block if needed
      if (rotation !== 0) {
          points = points.map(p => {
             const dx = p.x - cx;
             const dy = p.y - cy;
             return {
                 ...p,
                 x: cx + dx * Math.cos(rotRad) - dy * Math.sin(rotRad),
                 y: cy + dx * Math.sin(rotRad) + dy * Math.cos(rotRad)
             };
          });
      }
  } else if (type === 'spirograph' || type === 'hypotrochoid') {
    const R = outerRadius;
    const r = innerRadius || 1;
    const d = penOffset;
    const totalSteps = Math.floor(resolution * loops);
    
    for (let i = 0; i <= totalSteps; i++) {
        const theta = (i / resolution) * 2 * Math.PI;
        const x = (R - r) * Math.cos(theta) + d * Math.cos(((R - r) / r) * theta);
        const y = (R - r) * Math.sin(theta) - d * Math.sin(((R - r) / r) * theta);
        
        const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
        const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
        points.push({ x: sx, y: sy });
    }
  } else if (type === 'epitrochoid') {
    const R = outerRadius;
    const r = innerRadius || 1;
    const d = penOffset;
    const totalSteps = Math.floor(resolution * loops);
    
    for (let i = 0; i <= totalSteps; i++) {
        const theta = (i / resolution) * 2 * Math.PI;
        const x = (R + r) * Math.cos(theta) - d * Math.cos(((R + r) / r) * theta);
        const y = (R + r) * Math.sin(theta) - d * Math.sin(((R + r) / r) * theta);
        
        const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
        const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
        points.push({ x: sx, y: sy });
    }
  } else if (type === 'lissajous') {
      const totalSteps = Math.floor(resolution * loops);
      for (let i = 0; i <= totalSteps; i++) {
          const t = (i / resolution) * 2 * Math.PI;
          const x = Math.sin(freqX * t);
          const y = Math.sin(freqY * t);
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * (workspace.w / 2 * scale) + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * (workspace.h / 2 * scale) + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'spiral') {
      const totalSteps = Math.floor(resolution * loops);
      for (let i = 0; i <= totalSteps; i++) {
          const theta = (i / resolution) * 2 * Math.PI;
          const rRadius = growth * theta;
          const x = rRadius * Math.cos(theta);
          const y = rRadius * Math.sin(theta);
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'polygon') {
      const sides = Math.max(3, Math.floor(growth)); // Reuse growth for sides
      const totalSteps = sides;
      for (let i = 0; i <= totalSteps; i++) {
          const theta = (i / sides) * 2 * Math.PI;
          const x = Math.cos(theta);
          const y = Math.sin(theta);
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * (workspace.w / 2 * scale) + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * (workspace.h / 2 * scale) + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'star') {
      const starPoints = Math.max(3, Math.floor(growth));
      for (let i = 0; i < starPoints * 2; i++) {
          const theta = (i / (starPoints * 2)) * 2 * Math.PI;
          const r = i % 2 === 0 ? outerRadius : innerRadius;
          const x = r * Math.cos(theta);
          const y = r * Math.sin(theta);
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
      if (points.length > 0) points.push({ ...points[0] });
  } else if (type === 'heart') {
      const totalSteps = Math.floor(resolution * loops);
      for (let i = 0; i <= totalSteps; i++) {
          const t = (i / resolution) * 2 * Math.PI;
          const x = 16 * Math.pow(Math.sin(t), 3) / 16;
          // Invert y math
          const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16;
          
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * (workspace.w / 2 * scale) + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * (workspace.h / 2 * scale) + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'rose') {
      const k = Math.max(1, Math.floor(growth));
      const totalSteps = Math.floor(resolution * loops);
      for (let i = 0; i <= totalSteps; i++) {
          const t = (i / resolution) * 2 * Math.PI;
          const rRadius = Math.cos(k * t);
          const x = rRadius * Math.cos(t);
          const y = rRadius * Math.sin(t);
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * (workspace.w / 2 * scale) + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * (workspace.h / 2 * scale) + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'phyllotaxis') {
      const totalSteps = Math.floor(resolution * loops);
      const c = growth || 4;
      const angle = (divergence || 137.5) * (Math.PI / 180);
      for (let i = 0; i <= totalSteps; i++) {
          const r = c * Math.sqrt(i);
          const theta = i * angle;
          const x = r * Math.cos(theta);
          const y = r * Math.sin(theta);
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'modulo') {
      const n = Math.floor(resolution);
      const m = multiplier || 2;
      const r = outerRadius || 100;
      for (let i = 0; i < n; i++) {
          const t1 = (i / n) * 2 * Math.PI;
          const t2 = ((i * m) % n / n) * 2 * Math.PI;
          
          const x1 = r * Math.cos(t1);
          const y1 = r * Math.sin(t1);
          const x2 = r * Math.cos(t2);
          const y2 = r * Math.sin(t2);
          
          const sx1 = (x1 * Math.cos(rotRad) - y1 * Math.sin(rotRad)) * scale + cx;
          const sy1 = (x1 * Math.sin(rotRad) + y1 * Math.cos(rotRad)) * scale + cy;
          const sx2 = (x2 * Math.cos(rotRad) - y2 * Math.sin(rotRad)) * scale + cx;
          const sy2 = (x2 * Math.sin(rotRad) + y2 * Math.cos(rotRad)) * scale + cy;
          
          points.push({ x: sx1, y: sy1, isJump: true });
          points.push({ x: sx2, y: sy2, isJump: false });
      }
  } else if (type === 'bursty_bezier') {
      const pointsPerBurst = Math.max(3, Math.floor(growth || 9)); // Use growth parameter to control bursts
      let cpRho = 0;
      const maxCpRho = (loops || 1.4);
      const offsetTheta = 0.2;
      let currentTheta = 0;
      const deltaTheta = 2 * Math.PI / pointsPerBurst;
      
      const evalBezier = (t: number, p0: Point, p1: Point, p2: Point, p3: Point) => {
          const u = 1 - t;
          return {
              x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
              y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y
          };
      };
      
      let curr = { x: outerRadius * Math.cos(0), y: outerRadius * Math.sin(0) };
      
      while (cpRho < maxCpRho) {
          for (let i = 0; i < pointsPerBurst; i++) {
              const endTheta = currentTheta + deltaTheta;
              const end = { x: outerRadius * Math.cos(endTheta), y: outerRadius * Math.sin(endTheta) };
              const cp1 = { x: cpRho * outerRadius * Math.cos(currentTheta + Math.PI - offsetTheta), y: cpRho * outerRadius * Math.sin(currentTheta + Math.PI - offsetTheta) };
              const cp2 = { x: cpRho * outerRadius * Math.cos(endTheta + Math.PI + offsetTheta), y: cpRho * outerRadius * Math.sin(endTheta + Math.PI + offsetTheta) };
              
              for (let j = (i===0 && cpRho===0 ? 0 : 1); j <= 20; j++) {
                  const pt = evalBezier(j/20, curr, cp1, cp2, end);
                  // Apply rotation, scale and translation
                  const sx = (pt.x * Math.cos(rotRad) - pt.y * Math.sin(rotRad)) * scale + cx;
                  const sy = (pt.x * Math.sin(rotRad) + pt.y * Math.cos(rotRad)) * scale + cy;
                  points.push({ x: sx, y: sy });
              }
              curr = end;
              currentTheta += deltaTheta;
          }
          cpRho += 0.02;
      }
  } else if (type === 'superformula') {
      const totalSteps = Math.floor(resolution * loops);
      const m_val = m || 6;
      const n1_val = n1 || 1;
      const n2_val = n2 || 1;
      const n3_val = n3 || 1;
      const a = outerRadius || 100;
      const b = innerRadius || 100;
      
      for (let i = 0; i <= totalSteps; i++) {
          const phi = (i / totalSteps) * 2 * Math.PI * loops;
          
          let t1 = Math.cos((m_val * phi) / 4) / a;
          t1 = Math.abs(t1);
          t1 = Math.pow(t1, n2_val);
          
          let t2 = Math.sin((m_val * phi) / 4) / b;
          t2 = Math.abs(t2);
          t2 = Math.pow(t2, n3_val);
          
          let r = Math.pow(t1 + t2, 1 / n1_val);
          r = Math.abs(r) === 0 ? 0 : 1 / r;
          
          // Use outerRadius to amplify the normalized formula output
          r = r * 100; 

          const x = r * Math.cos(phi);
          const y = r * Math.sin(phi);
          
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'fractal_tree') {
      const drawTree = (x: number, y: number, length: number, angle: number, depth: number) => {
          if (depth === 0) return;
          const destX = x + length * Math.cos(angle);
          const destY = y + length * Math.sin(angle);
          
          const sx1 = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy1 = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          const sx2 = (destX * Math.cos(rotRad) - destY * Math.sin(rotRad)) * scale + cx;
          const sy2 = (destX * Math.sin(rotRad) + destY * Math.cos(rotRad)) * scale + cy;
          
          // Draw this branch
          points.push({ x: sx1, y: sy1, isJump: true });
          points.push({ x: sx2, y: sy2, isJump: false });
          
          const branchAngle = (fractalBranchFactor || 25) * (Math.PI / 180);
          drawTree(destX, destY, length * 0.7, angle - branchAngle, depth - 1);
          drawTree(destX, destY, length * 0.7, angle + branchAngle, depth - 1);
      };
      
      const maxDepth = fractalDepth || 6;
      drawTree(0, 0, outerRadius || 50, -Math.PI / 2, maxDepth);
  } else if (type === 'chladni_plate') {
      const totalSteps = Math.floor(resolution * loops) * 2;
      const nm = chladniM || 4;
      const nn = chladniN || 2;
      for (let i = 0; i <= totalSteps; i++) {
          const t = (i / totalSteps) * Math.PI * 2 * loops;
          // Approximating nodal lines path
          const x = outerRadius * ( Math.cos(nn*t) + Math.cos(nm*t) );
          const y = innerRadius * ( Math.sin(nn*t) - Math.sin(nm*t) );
          
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'orbital') {
      const apogee = outerRadius || 100;
      const perigee = innerRadius || 10;
      const totalSteps = Math.floor(resolution * loops) * 2;
      const precession = (growth || 2.5) * (Math.PI / 180);
      
      for (let i = 0; i <= totalSteps; i++) {
          const t = (i / totalSteps) * 2 * Math.PI * loops;
          const precessedAngle = precession * (i / totalSteps) * loops * 10; 
          
          // An ellipse-like shape whose angle precesses
          const r = (apogee - perigee) * Math.abs(Math.sin(t)) + perigee;
          
          const x = r * Math.cos(t + precessedAngle);
          const y = r * Math.sin(t + precessedAngle);
          
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (type === 'petalar') {
      const numPetals = Math.max(1, Math.floor(growth || 12));
      const totalSteps = Math.floor(resolution * loops * 2);
      
      for (let i = 0; i <= totalSteps; i++) {
          const t = (i / totalSteps) * 2 * Math.PI * loops;
          const decay = 1 - (i / totalSteps) * (1 - (innerRadius / outerRadius));
          const rBase = outerRadius * decay;
          
          const petalEffect = Math.abs(Math.sin((t * numPetals) / 2));
          const sharpness = (penOffset || 50) / 25; 
          const r = rBase * (0.2 + 0.8 * Math.pow(petalEffect, sharpness));
          
          const x = r * Math.cos(t);
          const y = r * Math.sin(t);
          
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
  } else if (['ellipse', 'semicircle', 'rectangle', 'diamond', 'trapezoid', 'cardioid', 'limacon', 'lemniscate', 'astroid', 'deltoid', 'nephroid', 'trefoil', 'quatrefoil', 'cinquefoil', 'figure8', 'infinity', 'torus2d', 'golden_spiral', 'teardrop', 'cross'].includes(type)) {
      const totalSteps = Math.floor(resolution * loops) * 2;
      const baseR = outerRadius;
      for (let i = 0; i <= totalSteps; i++) {
          const t = (i / totalSteps) * 2 * Math.PI * loops;
          let nx = Math.cos(t), ny = Math.sin(t);
          
          if (type === 'ellipse') { nx = Math.cos(t); ny = 0.6 * Math.sin(t); }
          else if (type === 'semicircle') { nx = Math.cos(t); ny = Math.max(0, Math.sin(t)); }
          else if (type === 'cardioid') { const r = 1 + Math.cos(t); nx = r * Math.cos(t)/2; ny = r * Math.sin(t)/2; }
          else if (type === 'limacon') { const r = 0.5 + Math.cos(t); nx = r * Math.cos(t)/1.5; ny = r * Math.sin(t)/1.5; }
          else if (type === 'lemniscate') { const r2 = Math.cos(2*t); const r = r2 > 0 ? Math.sqrt(r2) : 0; nx = r * Math.cos(t); ny = r * Math.sin(t); }
          else if (type === 'astroid') { nx = Math.pow(Math.cos(t), 3); ny = Math.pow(Math.sin(t), 3); }
          else if (type === 'deltoid') { nx = (2*Math.cos(t)+Math.cos(2*t))/3; ny = (2*Math.sin(t)-Math.sin(2*t))/3; }
          else if (type === 'nephroid') { nx = (3*Math.cos(t)-Math.cos(3*t))/4; ny = (3*Math.sin(t)-Math.sin(3*t))/4; }
          else if (type === 'trefoil') { nx = (Math.sin(t)+2*Math.sin(2*t))/3; ny = (Math.cos(t)-2*Math.cos(2*t))/3; }
          else if (type === 'quatrefoil') { const r = Math.abs(Math.cos(2*t)); nx = r * Math.cos(t); ny = r * Math.sin(t); }
          else if (type === 'cinquefoil') { nx = (Math.sin(t)+2*Math.sin(3*t))/3; ny = (Math.cos(t)-2*Math.cos(3*t))/3; }
          else if (type === 'figure8') { nx = Math.sin(t); ny = Math.sin(2*t)/2; }
          else if (type === 'infinity') { nx = Math.sin(2*t)/2; ny = Math.sin(t); }
          else if (type === 'torus2d') { const r = 0.7 + 0.3 * Math.cos(5*t); nx = r * Math.cos(t); ny = r * Math.sin(t); }
          else if (type === 'golden_spiral') { const r = Math.pow(1.618, t / (Math.PI*2)) / Math.pow(1.618, Math.max(1, loops)); nx = r * Math.cos(t); ny = r * Math.sin(t); }
          else if (type === 'teardrop') { nx = Math.cos(t); ny = Math.sin(t) * Math.pow(Math.sin(t/2), 2); }
          else if (type === 'cross') { const r = Math.pow(Math.cos(2*t), 2); nx = r * Math.cos(t); ny = r * Math.sin(t); }
          else {
              const n = (type === 'diamond' ? 1 : (type === 'rectangle' ? 10 : 2));
              const c = Math.cos(t), s = Math.sin(t);
              const dc = Math.pow(Math.abs(c), n);
              const ds = Math.pow(Math.abs(s), n);
              // Wait, rectangle eq: |x|^n + |y|^n = 1 => r = 1 / ( |c|^n + |s|^n )^(1/n)
              const real_r = 1 / Math.pow(dc + ds, 1/n);
              nx = real_r * c; ny = real_r * s;
          }
          
          const x = nx * baseR;
          const y = ny * baseR;
          const sx = (x * Math.cos(rotRad) - y * Math.sin(rotRad)) * scale + cx;
          const sy = (x * Math.sin(rotRad) + y * Math.cos(rotRad)) * scale + cy;
          points.push({ x: sx, y: sy });
      }
  }

  // Apply Offset (Applied before Effects/Mirroring)
  if ((offsetX && offsetX !== 0) || (offsetY && offsetY !== 0)) {
    const dx = offsetX || 0;
    const dy = offsetY || 0;
    points = points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
  }

  // Apply Wobble Effect if requested
  if (wobbleAmplitude && wobbleAmplitude > 0 && wobbleFrequency && wobbleFrequency > 0) {
    points = points.map((p, i) => {
      const angle = (i / points.length) * 2 * Math.PI * wobbleFrequency;
      const waveX = Math.cos(angle) * wobbleAmplitude;
      const waveY = Math.sin(angle) * wobbleAmplitude;
      return { ...p, x: p.x + waveX, y: p.y + waveY };
    });
  }

  // Apply Waveform Morphing Effect
  if (morphAmplitude && morphAmplitude > 0 && morphFrequency && morphFrequency > 0) {
      points = points.map((p, i) => {
          const morphFactor = Math.sin((i / resolution) * Math.PI * morphFrequency) * morphAmplitude;
          return {
              ...p,
              x: p.x + morphFactor,
              y: p.y + morphFactor
          };
      });
  }

  // Apply Noise Effect if requested
  if (noiseAmplitude && noiseAmplitude > 0) {
    points = points.map(p => {
       const dx = (Math.random() - 0.5) * 2 * noiseAmplitude;
       const dy = (Math.random() - 0.5) * 2 * noiseAmplitude;
       return { ...p, x: p.x + dx, y: p.y + dy };
    });
  }

  // Apply Radius Modulation Effect
  if (modulationAmplitude && modulationAmplitude > 0 && modulationFrequency && modulationFrequency > 0) {
      points = points.map((p) => {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const theta = Math.atan2(dy, dx);
          const mod = 1 + (Math.sin(theta * modulationFrequency) * (modulationAmplitude / 100));
          return {
              ...p,
              x: cx + dx * mod,
              y: cy + dy * mod
          };
      });
  }

  // Apply Radial Mirroring
  if (mirrorCount && mirrorCount > 1) {
    const original = [...points];
    points = [];
    for (let i = 0; i < mirrorCount; i++) {
        const angle = (i * 2 * Math.PI) / mirrorCount;
        const slice = original.map(p => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            return {
                ...p,
                x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
                y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
            };
        });
        if (i % 2 === 1) slice.reverse();
        points.push(...slice);
    }
  }

  // Apply Wiper Effect
  const { wiperPosition, wiperDensity, wiperRadius } = settings;
  if (wiperPosition && wiperPosition !== 'none' && wiperDensity && wiperRadius) {
      const wiperPoints: Point[] = [];
      const loops = wiperRadius / wiperDensity;
      const res = 100;
      const totalSteps = Math.floor(loops * res);
      
      for (let i = 0; i <= totalSteps; i++) {
          const theta = (i / res) * 2 * Math.PI;
          const r = (i / totalSteps) * wiperRadius;
          const x = cx + r * Math.cos(theta);
          const y = cy + r * Math.sin(theta);
          wiperPoints.push({ x, y });
      }

      if (wiperPosition === 'before') {
          wiperPoints.reverse(); // Outside -> In
          points = [...wiperPoints, ...points];
      } else if (wiperPosition === 'after') {
          points = [...points, ...wiperPoints]; // Inside -> Out
      }
  }

  return points;
};

// Helper to calculate distance squared
const distSq = (p1: Point, p2: Point) => {
  return (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
};

// Sobel Edge Detection Kernel application
const getPixelIntensity = (data: Uint8ClampedArray, width: number, height: number, x: number, y: number) => {
  if (x < 0 || x >= width || y < 0 || y >= height) return 0;
  const idx = (y * width + x) * 4;
  return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
};

const detectEdges = (imageData: ImageData, threshold: number, density: number): Point[] => {
  const { width, height, data } = imageData;
  const points: Point[] = [];
  const stride = Math.max(1, Math.floor(density));
  
  for (let y = 1; y < height - 1; y += stride) {
    for (let x = 1; x < width - 1; x += stride) {
      const p00 = getPixelIntensity(data, width, height, x - 1, y - 1);
      const p01 = getPixelIntensity(data, width, height, x, y - 1);
      const p02 = getPixelIntensity(data, width, height, x + 1, y - 1);
      const p10 = getPixelIntensity(data, width, height, x - 1, y);
      const p12 = getPixelIntensity(data, width, height, x + 1, y);
      const p20 = getPixelIntensity(data, width, height, x - 1, y + 1);
      const p21 = getPixelIntensity(data, width, height, x, y + 1);
      const p22 = getPixelIntensity(data, width, height, x + 1, y + 1);

      const gx = (-1 * p00) + (1 * p02) + (-2 * p10) + (2 * p12) + (-1 * p20) + (1 * p22);
      const gy = (-1 * p00) + (-2 * p01) + (-1 * p02) + (1 * p20) + (2 * p21) + (1 * p22);
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude > (255 - threshold)) {
        points.push({ x, y });
      }
    }
  }
  return points;
};

const detectDarkness = (imageData: ImageData, threshold: number, density: number): Point[] => {
  const { width, height, data } = imageData;
  const points: Point[] = [];
  const stride = Math.max(1, Math.floor(density));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = (y * width + x) * 4;
      if (idx < 0 || idx + 2 >= data.length) continue;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      if (brightness < threshold) {
        points.push({ x, y });
      }
    }
  }
  return points;
};

const addBezierCurve = (p1: Point, p2: Point, path: Point[], curveScale = 0.5) => {
  const dist = Math.sqrt(distSq(p1, p2));
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const offset = dist * curveScale; 
  const angle = Math.random() * Math.PI * 2;
  const cx = mx + Math.cos(angle) * offset;
  const cy = my + Math.sin(angle) * offset;
  const segments = Math.max(2, Math.floor(dist / 3)); 
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const invT = 1 - t;
    const x = (invT * invT * p1.x) + (2 * invT * t * cx) + (t * t * p2.x);
    const y = (invT * invT * p1.y) + (2 * invT * t * cy) + (t * t * p2.y);
    path.push({ x, y });
  }
};

const generateTexturedBridge = (p1: Point, p2: Point, stride: number, points: Point[]) => {
  const dist = Math.sqrt(distSq(p1, p2));
  const stepSize = Math.max(2, stride * 0.8);
  const steps = Math.ceil(dist / stepSize);
  let prevP = p1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const bx = p1.x + dx * t;
    const by = p1.y + dy * t;
    const wave = Math.sin(t * Math.PI * 2 * (3 + Math.random() * 2)) * (stride * 0.6);
    const jitter = (Math.random() - 0.5) * stride * 1.5;
    const offset = wave + jitter;
    const nextP = { x: bx + perpX * offset, y: by + perpY * offset };
    addBezierCurve(prevP, nextP, points, 0.4);
    prevP = nextP;
  }
  addBezierCurve(prevP, p2, points, 0.4);
};

const generateScribbleFill = (imageData: ImageData, settings: GCodeSettings): Point[] => {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return [];
  const points: Point[] = [];
  const stride = Math.max(2, Math.floor(settings.fillSpacing)); 
  const targets: Point[] = [];
  const gridSize = 20; 
  const grid = new Map<string, number[]>(); 

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const px = Math.floor(Math.max(0, Math.min(width - 1, x + (Math.random() - 0.5) * stride)));
      const py = Math.floor(Math.max(0, Math.min(height - 1, y + (Math.random() - 0.5) * stride)));
      const idx = (py * width + px) * 4;
      if (idx < 0 || idx + 2 >= data.length) continue;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const isDark = settings.invert ? (brightness > settings.threshold) : (brightness < settings.threshold);
      if (isDark) targets.push({ x: px, y: py });
    }
  }

  if (targets.length === 0) return [];
  targets.forEach((p, idx) => {
    const key = `${Math.floor(p.x/gridSize)},${Math.floor(p.y/gridSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(idx);
  });

  const visited = new Uint8Array(targets.length);
  let currentIndex = Math.floor(targets.length / 2);
  visited[currentIndex] = 1;
  points.push(targets[currentIndex]);
  let visitedCount = 1;

  while (visitedCount < targets.length) {
    const currentP = targets[currentIndex];
    let bestDistSq = Infinity, bestIndex = -1;
    const gx = Math.floor(currentP.x / gridSize), gy = Math.floor(currentP.y / gridSize);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const indices = grid.get(`${gx + dx},${gy + dy}`);
        if (indices) {
          for (const idx of indices) {
            if (visited[idx]) continue;
            const d = distSq(currentP, targets[idx]);
            if (d < bestDistSq && d < (stride * 3) ** 2) {
              bestDistSq = d;
              bestIndex = idx;
            }
          }
        }
      }
    }

    if (bestIndex !== -1) {
      visited[bestIndex] = 1; visitedCount++;
      addBezierCurve(currentP, targets[bestIndex], points, 0.6);
      currentIndex = bestIndex;
    } else {
      let nearestDistSq = Infinity, nearestIdx = -1;
      for (let i = 0; i < targets.length; i++) {
          if (visited[i]) continue;
          const d = distSq(currentP, targets[i]);
          if (d < nearestDistSq) { nearestDistSq = d; nearestIdx = i; }
      }
      if (nearestIdx !== -1) {
          const target = targets[nearestIdx];
          if (Math.sqrt(nearestDistSq) > stride * 2.5) generateTexturedBridge(currentP, target, stride, points);
          else addBezierCurve(currentP, target, points, 0.5);
          visited[nearestIdx] = 1; visitedCount++; currentIndex = nearestIdx;
      } else break;
    }
  }
  return points;
}

const generateLinearFill = (imageData: ImageData, settings: GCodeSettings): Point[] => {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return [];
  const points: Point[] = [];
  const spacing = Math.max(2, Math.floor(settings.fillSpacing));
  const baseAngleRad = (settings.fillAngle * Math.PI) / 180;
  const diag = Math.sqrt(width * width + height * height);
  const center = { x: width / 2, y: height / 2 };

  const addEllipticalHatch = (p1: Point, p2: Point, path: Point[], lineIdx: number) => {
      const distance = Math.sqrt(distSq(p1, p2));
      if (distance < 2) {
          path.push(p1);
          path.push(p2);
          return;
      }
      
      const loopSpacing = spacing * 0.5; 
      const loops = distance / loopSpacing;
      const steps = Math.ceil(distance * 1.5); 
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      
      const phaseOffset = (lineIdx % 2 === 0) ? Math.PI : 0;
      
      for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const loopPhase = t * loops * Math.PI * 2 + phaseOffset;
          
          const bx = p1.x + dx * t;
          const by = p1.y + dy * t;
          
          let brightness = 255;
          const px = Math.floor(bx);
          const py = Math.floor(by);
          if (px >= 0 && px < width && py >= 0 && py < height) {
              const idx = (py * width + px) * 4;
              brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          }
          
          let intensity = settings.invert ? (brightness / 255) : (1 - brightness / 255);
          intensity = Math.max(0.1, Math.min(1, intensity));
          
          // Dynamic radii based on intensity: darker areas get wider ellipses
          const radiusX = spacing * 0.3 * intensity; 
          const radiusY = spacing * 0.9 * intensity; 
          
          const cx = Math.cos(loopPhase) * radiusX;
          const cy = Math.sin(loopPhase) * radiusY;
          
          const ox = cx * Math.cos(angle) - cy * Math.sin(angle);
          const oy = cx * Math.sin(angle) + cy * Math.cos(angle);
          
          path.push({ x: bx + ox, y: by + oy });
      }
  };

  let scanDir = 1; 
  let lineIndex = 0;
  for (let i = -diag; i < diag; i += spacing) {
      lineIndex++;
      // Vary the angle slightly to create a wavy, organic flow instead of rigid straight lines
      const currentAngle = baseAngleRad + Math.sin(i * 0.03) * 0.15;
      const cosA = Math.cos(currentAngle), sinA = Math.sin(currentAngle);
      const rOriginX = center.x - i * sinA, rOriginY = center.y + i * cosA;
      const segments: {start: Point, end: Point}[] = [];
      let inSegment = false, segStart: Point | null = null;
      
      for (let t = -diag; t < diag; t += 1) {
          const px = Math.floor(rOriginX + t * cosA), py = Math.floor(rOriginY + t * sinA);
          let isDark = false;
          if (px >= 0 && px < width && py >= 0 && py < height) {
              const idx = (py * width + px) * 4;
              const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
              isDark = settings.invert ? (brightness > settings.threshold) : (brightness < settings.threshold);
          }
          if (isDark) {
              if (!inSegment) { inSegment = true; segStart = { x: px, y: py }; }
          } else if (inSegment && segStart) {
              inSegment = false; segments.push({ start: segStart, end: { x: px, y: py } });
              segStart = null;
          }
      }
      if (segments.length === 0) continue;
      if (scanDir === -1) {
          segments.reverse(); 
          for (const seg of segments) addEllipticalHatch(seg.end, seg.start, points, lineIndex);
      } else {
          for (const seg of segments) addEllipticalHatch(seg.start, seg.end, points, lineIndex);
      }
      scanDir *= -1;
  }
  return points;
};

const thinPoints = (points: Point[], width: number, height: number): Point[] => {
  if (points.length === 0 || width <= 0 || height <= 0) return [];
  const grid = new Uint8Array(width * height);
  for (const p of points) {
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x >= 0 && x < width && y >= 0 && y < height) {
          grid[y * width + x] = 1;
      }
  }
  let changing = true;
  const getPixel = (x: number, y: number) => (x < 0 || x >= width || y < 0 || y >= height) ? 0 : grid[y * width + x];

  while (changing) {
    changing = false;
    const toDelete = [];
    for (let step = 1; step <= 2; step++) {
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                if (grid[idx] === 0) continue;
                const P2 = getPixel(x, y-1), P3 = getPixel(x+1, y-1), P4 = getPixel(x+1, y), P5 = getPixel(x+1, y+1), P6 = getPixel(x, y+1), P7 = getPixel(x-1, y+1), P8 = getPixel(x-1, y), P9 = getPixel(x-1, y-1);
                const A = (P2 === 0 && P3 === 1 ? 1 : 0) + (P3 === 0 && P4 === 1 ? 1 : 0) + (P4 === 0 && P5 === 1 ? 1 : 0) + (P5 === 0 && P6 === 1 ? 1 : 0) + (P6 === 0 && P7 === 1 ? 1 : 0) + (P7 === 0 && P8 === 1 ? 1 : 0) + (P8 === 0 && P9 === 1 ? 1 : 0) + (P9 === 0 && P2 === 1 ? 1 : 0);
                const B = P2 + P3 + P4 + P5 + P6 + P7 + P8 + P9;
                const m1 = step === 1 ? (P2 * P4 * P6) : (P2 * P4 * P8);
                const m2 = step === 1 ? (P4 * P6 * P8) : (P2 * P6 * P8);
                if (A === 1 && (B >= 2 && B <= 6) && m1 === 0 && m2 === 0) toDelete.push(idx);
            }
        }
        if (toDelete.length > 0) { changing = true; for (const idx of toDelete) grid[idx] = 0; toDelete.length = 0; }
    }
  }
  const newPoints: Point[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i]) newPoints.push({ x: i % width, y: Math.floor(i / width) });
  return newPoints;
};

const smoothPath = (points: Point[], iterations: number): Point[] => {
    if (points.length < 3 || iterations <= 0) return points;
    let current = [...points];
    for (let iter = 0; iter < iterations; iter++) {
        const next = [current[0]];
        for (let i = 1; i < current.length - 1; i++) {
            if (current[i].isJump || current[i+1].isJump) { next.push(current[i]); continue; }
            next.push({ x: 0.25 * current[i-1].x + 0.5 * current[i].x + 0.25 * current[i+1].x, y: 0.25 * current[i-1].y + 0.5 * current[i].y + 0.25 * current[i+1].y });
        }
        next.push(current[current.length - 1]);
        current = next;
    }
    return current;
}

const generateMSTPath = (points: Point[]): Point[] => {
  const N = points.length;
  if (N <= 1) return points;
  const parent = new Int32Array(N).fill(-1), minDist = new Float32Array(N).fill(Infinity), inMST = new Uint8Array(N).fill(0);
  minDist[0] = 0;
  const adj: number[][] = Array.from({ length: N }, () => []);
  for (let i = 0; i < N; i++) {
    let u = -1, minVal = Infinity;
    for (let v = 0; v < N; v++) if (!inMST[v] && minDist[v] < minVal) { minVal = minDist[v]; u = v; }
    if (u === -1) break; 
    inMST[u] = 1;
    if (parent[u] !== -1) { 
        const pIdx = parent[u];
        if (pIdx >= 0 && pIdx < N) {
            adj[pIdx].push(u); adj[u].push(pIdx); 
        }
    }
    for (let v = 0; v < N; v++) if (!inMST[v]) { const d = distSq(points[u], points[v]); if (d < minDist[v]) { minDist[v] = d; parent[v] = u; } }
  }
  const path: Point[] = [], visited = new Uint8Array(N).fill(0), stack: {u: number, neighborIndex: number}[] = [{u: 0, neighborIndex: 0}];
  visited[0] = 1; path.push(points[0]);
  while (stack.length > 0) {
    const tip = stack[stack.length - 1];
    const neighbors = adj[tip.u];
    if (tip.neighborIndex === 0) neighbors.sort((a, b) => distSq(points[tip.u], points[a]) - distSq(points[tip.u], points[b]));
    if (tip.neighborIndex < neighbors.length) {
      const v = neighbors[tip.neighborIndex++];
      if (!visited[v]) { visited[v] = 1; path.push(points[v]); stack.push({u: v, neighborIndex: 0}); }
    } else { stack.pop(); if (stack.length > 0) path.push(points[stack[stack.length - 1].u]); }
  }
  return path;
};

const generateContourFill = (imageData: ImageData, settings: GCodeSettings): Point[] => {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return [];

  const spacing = Math.max(2, Math.floor(settings.fillSpacing));
  const grid = new Float32Array(width * height);
  const INF = 999999;

  // 1. Binarize
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
         grid[y * width + x] = 0;
         continue;
      }
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
      const isDark = settings.invert ? (brightness > settings.threshold) : (brightness < settings.threshold);
      grid[y * width + x] = isDark ? INF : 0;
    }
  }

  // 2. Distance Transform (Chamfer 3-4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] === 0) continue;
      let minVal = grid[y * width + x];
      if (x > 0) minVal = Math.min(minVal, grid[y * width + (x - 1)] + 3);
      if (y > 0) minVal = Math.min(minVal, grid[(y - 1) * width + x] + 3);
      if (x > 0 && y > 0) minVal = Math.min(minVal, grid[(y - 1) * width + (x - 1)] + 4);
      if (x < width - 1 && y > 0) minVal = Math.min(minVal, grid[(y - 1) * width + (x + 1)] + 4);
      grid[y * width + x] = minVal;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      let minVal = grid[y * width + x];
      if (x < width - 1) minVal = Math.min(minVal, grid[y * width + (x + 1)] + 3);
      if (y < height - 1) minVal = Math.min(minVal, grid[(y + 1) * width + x] + 3);
      if (x < width - 1 && y < height - 1) minVal = Math.min(minVal, grid[(y + 1) * width + (x + 1)] + 4);
      if (x > 0 && y < height - 1) minVal = Math.min(minVal, grid[(y + 1) * width + (x - 1)] + 4);
      grid[y * width + x] = minVal;
    }
  }

  // 3. Extract Spiral Contours
  const points: Point[] = [];
  const step = spacing * 3;
  const tolerance = step * 0.35; 
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dist = grid[y * width + x];
      if (dist >= step - tolerance && dist < INF) {
        const angle = Math.atan2(y - cy, x - cx);
        const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);
        dist += normalizedAngle * step;
        
        const mod = dist % step;
        if (mod <= tolerance || mod >= step - tolerance) {
          points.push({ x, y });
        }
      }
    }
  }

  if (points.length === 0) return [];

  // 4. Thin and Connect
  const thinned = thinPoints(points, width, height);
  return generateMSTPath(thinned.length > 0 ? thinned : points);
};

const generateCounterPath = (imageData: ImageData, settings: GCodeSettings): Point[] => {
  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0) return [];

  const spacing = Math.max(2, Math.floor(settings.fillSpacing));
  const grid = new Float32Array(width * height);
  const INF = 999999;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
         grid[y * width + x] = 0;
         continue;
      }
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx+1] + data[idx+2]) / 3;
      const isDark = settings.invert ? (brightness > settings.threshold) : (brightness < settings.threshold);
      grid[y * width + x] = isDark ? INF : 0;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] === 0) continue;
      let minVal = grid[y * width + x];
      if (x > 0) minVal = Math.min(minVal, grid[y * width + (x - 1)] + 3);
      if (y > 0) minVal = Math.min(minVal, grid[(y - 1) * width + x] + 3);
      if (x > 0 && y > 0) minVal = Math.min(minVal, grid[(y - 1) * width + (x - 1)] + 4);
      if (x < width - 1 && y > 0) minVal = Math.min(minVal, grid[(y - 1) * width + (x + 1)] + 4);
      grid[y * width + x] = minVal;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      let minVal = grid[y * width + x];
      if (x < width - 1) minVal = Math.min(minVal, grid[y * width + (x + 1)] + 3);
      if (y < height - 1) minVal = Math.min(minVal, grid[(y + 1) * width + x] + 3);
      if (x < width - 1 && y < height - 1) minVal = Math.min(minVal, grid[(y + 1) * width + (x + 1)] + 4);
      if (x > 0 && y < height - 1) minVal = Math.min(minVal, grid[(y + 1) * width + (x - 1)] + 4);
      grid[y * width + x] = minVal;
    }
  }

  const points: Point[] = [];
  const step = spacing * 3;
  const tolerance = step * 0.2; 

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dist = grid[y * width + x];
      if (dist < INF && dist > 0) {
        if (dist % step <= tolerance || dist % step >= step - tolerance) {
          points.push({ x, y });
        }
      }
    }
  }

  if (points.length === 0) return [];
  const thinned = thinPoints(points, width, height);
  const path = generateMSTPath(thinned.length > 0 ? thinned : points);
  return settings.smoothing > 0 ? smoothPath(path, 1) : path;
};

function generateWavySpiral(imageData: ImageData, settings: GCodeSettings): Point[] {
    const width = imageData.width;
    const height = imageData.height;
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.min(width, height) / 2;
    const spacing = settings.fillSpacing || 4; 
    const loops = Math.max(1, maxR / spacing);
    const thr = settings.threshold || 128;
    const invert = settings.invert || false;
    const wobbleAmp = spacing * 0.45; 
    
    let points: Point[] = [];
    const totalSteps = Math.floor(loops * 100 * (spacing < 5 ? 2 : 1)); 
    
    for(let i=0; i<=totalSteps; i++) {
        const t = (i/totalSteps) * 2 * Math.PI * loops;
        const baseR = (t / (2 * Math.PI)) * spacing; 
        
        const px = Math.floor(cx + Math.cos(t) * baseR);
        const py = Math.floor(cy + Math.sin(t) * baseR);
        
        let intensity = 0;
        if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            const rVal = imageData.data[idx];
            const gVal = imageData.data[idx+1];
            const bVal = imageData.data[idx+2];
            let luma = 0.299*rVal + 0.587*gVal + 0.114*bVal;
            if (invert) luma = 255 - luma;
            intensity = 1 - (luma / 255); 
            if (luma >= thr) intensity = 0;
        }
        
        const rMod = baseR + Math.sin(t * 200) * wobbleAmp * Math.pow(intensity, 2);
        
        const x = cx + Math.cos(t) * rMod;
        const y = cy + Math.sin(t) * rMod;
        
        points.push({x, y});
    }
    return points;
}

function generateSandArt(imageData: ImageData, settings: GCodeSettings): Point[] {
    const { width, height } = imageData;
    const points = detectEdges(imageData, settings.threshold, 1.0);
    const thinned = thinPoints(points, width, height);

    const grid = new Uint8Array(width * height);
    for (const p of thinned) {
        if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) {
            grid[Math.floor(p.y) * width + Math.floor(p.x)] = 1;
        }
    }

    const paths: Point[][] = [];
    const DIRS = [ [1,0], [1,1], [0,1], [-1,1], [-1,0], [-1,-1], [0,-1], [1,-1] ];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (grid[y * width + x] === 1) {
                const path: Point[] = [];
                let cx = x, cy = y;
                while (true) {
                    path.push({ x: cx, y: cy });
                    grid[cy * width + cx] = 0; 

                    let next = null;
                    for (let i = 0; i < 8; i++) {
                        const nx = cx + DIRS[i][0];
                        const ny = cy + DIRS[i][1];
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            if (grid[ny * width + nx] === 1) {
                                next = { x: nx, y: ny };
                                break;
                            }
                        }
                    }
                    if (next) {
                        cx = next.x; cy = next.y;
                    } else break;
                }
                if (path.length > 5) paths.push(path);
            }
        }
    }

    if (paths.length === 0) return [];
    
    paths.sort((a, b) => b.length - a.length);
    
    const trunk: Point[] = [...paths[0]];
    const unvisited = paths.slice(1);
    
    while (unvisited.length > 0) {
        let bestDist = Infinity;
        let bestTrunkIdx = -1;
        let bestPathIdx = -1;
        let bestPathPointIdx = -1;
        
        for (let i = 0; i < unvisited.length; i++) {
            const p = unvisited[i];
            const pStep = Math.max(1, Math.floor(p.length / 5)); 
            for (let j = 0; j < p.length; j += pStep) {
                const tStep = Math.max(1, Math.floor(trunk.length / 20)); 
                for (let k = 0; k < trunk.length; k += tStep) {
                    const dx = p[j].x - trunk[k].x;
                    const dy = p[j].y - trunk[k].y;
                    const d = dx*dx + dy*dy;
                    if (d < bestDist) {
                        bestDist = d;
                        bestTrunkIdx = k;
                        bestPathIdx = i;
                        bestPathPointIdx = j;
                    }
                }
            }
        }
        
        if (bestPathIdx === -1) break;
        
        const p = unvisited[bestPathIdx];
        bestDist = Infinity;
        const searchRange = Math.max(20, Math.floor(trunk.length / 10));
        let localTrunkStart = Math.max(0, bestTrunkIdx - searchRange);
        let localTrunkEnd = Math.min(trunk.length - 1, bestTrunkIdx + searchRange);
        
        for (let j = 0; j < p.length; j++) {
            for (let k = localTrunkStart; k <= localTrunkEnd; k++) {
                const dx = p[j].x - trunk[k].x;
                const dy = p[j].y - trunk[k].y;
                const d = dx*dx + dy*dy;
                if (d < bestDist) {
                    bestDist = d;
                    bestTrunkIdx = k;
                    bestPathPointIdx = j;
                }
            }
        }
        
        const splicedPath: Point[] = [];
        for(let j = bestPathPointIdx; j < p.length; j++) splicedPath.push({ ...p[j] });
        for(let j = p.length - 1; j >= 0; j--) splicedPath.push({ ...p[j] });
        for(let j = 0; j <= bestPathPointIdx; j++) splicedPath.push({ ...p[j] });
        
        splicedPath.push({ ...trunk[bestTrunkIdx] });
        trunk.splice(bestTrunkIdx, 0, ...splicedPath);
        unvisited.splice(bestPathIdx, 1);
    }
    
    return trunk;
}

export const processImageToSingleLine = (
  imageData: ImageData,
  settings: GCodeSettings,
  dims: { w: number, h: number }
): Point[] => {
  let points: Point[] = [];
  if (settings.processingMode === 'counter') {
      points = generateCounterPath(imageData, settings);
      return settings.smoothing > 0 ? smoothPath(points, 1) : points;
  }
  if (settings.processingMode === 'sandart') {
      points = generateSandArt(imageData, settings);
      return settings.smoothing > 0 ? smoothPath(points, 1) : points;
  }
  if (settings.processingMode === 'wavy_spiral') {
      points = generateWavySpiral(imageData, settings);
      return settings.smoothing > 0 ? smoothPath(points, 1) : points;
  }
  if (settings.processingMode === 'fill') {
    if (settings.fillStyle === 'contour') {
        points = generateContourFill(imageData, settings);
    } else if (settings.fillStyle === 'scribble') {
        points = generateScribbleFill(imageData, settings);
    } else {
        points = generateLinearFill(imageData, settings);
    }
    return settings.smoothing > 0 ? smoothPath(points, 1) : points;
  }
  points = settings.detectionMode === 'edge' ? detectEdges(imageData, settings.threshold, settings.pointDensity) : detectDarkness(imageData, settings.threshold, settings.pointDensity);
  if (settings.enableThinning) points = thinPoints(points, dims.w, dims.h);
  if (points.length === 0) return [];
  const finalPath = generateMSTPath(points);
  return settings.smoothing > 0 ? smoothPath(finalPath, settings.smoothing) : finalPath;
};

export const generateGCode = (
  path: Point[],
  imgWidth: number,
  imgHeight: number,
  settings: GCodeSettings,
  meta: { title: string; description: string },
  isPatternLab: boolean = false
): string => {
  if (path.length === 0 || imgWidth <= 0 || imgHeight <= 0) return "";

  const { x: placeX, y: placeY, width: placeW, height: placeH } = isPatternLab 
    ? { x: 0, y: 0, width: settings.scaleX, height: settings.scaleY }
    : settings.imagePlacement;
  
  let gcode = `; Generated by MonoLine Art\n`;
  gcode += `; Title: ${meta.title}\n`;
  gcode += `; Description: ${meta.description}\n`;
  gcode += `; Workspace: ${settings.workspaceType} (${settings.scaleX}x${settings.scaleY}mm)\n`;
  gcode += `G21 ; mm\nG90 ; Absolute\n\n`;

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    let normX = p.x / imgWidth;
    let normY = p.y / imgHeight;
    
    // Apply Flips (only for image mode, pattern lab is already calculated for workspace)
    if (!isPatternLab && settings.flipX) normX = 1 - normX;
    if (!isPatternLab && settings.flipY) normY = 1 - normY;

    let realX = placeX + normX * placeW;
    let realY = placeY + normY * placeH;

    // APPLY BOUNDARY REFLECTION
    if (settings.workspaceType === 'circular') {
        const cx = settings.scaleX / 2;
        const cy = settings.scaleY / 2;
        const r_limit = Math.min(settings.scaleX, settings.scaleY) / 2;
        const dx_ref = realX - cx;
        const dy_ref = realY - cy;
        const dist = Math.sqrt(dx_ref * dx_ref + dy_ref * dy_ref);
        if (dist > r_limit && r_limit > 0) {
            const reflectedDist = reflectValue(dist, 0, r_limit);
            const angle = Math.atan2(dy_ref, dx_ref);
            realX = cx + Math.cos(angle) * reflectedDist;
            realY = cy + Math.sin(angle) * reflectedDist;
        }
    } else {
        realX = reflectValue(realX, 0, settings.scaleX);
        realY = reflectValue(realY, 0, settings.scaleY);
    }

    // Apply Calibration
    if (settings.thrFlipX) realX = settings.scaleX - realX;
    if (settings.thrFlipY) realY = settings.scaleY - realY;
    if (settings.thrSwapXY) {
        const temp = realX;
        realX = realY;
        realY = temp;
    }

    const gX = realX.toFixed(3);
    // Standard CNC is Y-up. Our realY is distance from top. So we use (scaleY - realY).
    const gY = (settings.scaleY - realY).toFixed(3);

    if (i === 0 || p.isJump) {
        gcode += `M5 ; Pen Up\n`;
        gcode += `G0 X${gX} Y${gY} F${settings.feedRate}\n`;
        gcode += `M3 S255 ; Pen Down\n`;
    } else {
        gcode += `G1 X${gX} Y${gY}\n`;
    }
  }

  gcode += `M5 ; Pen Up\nG0 X0 Y0 ; Return to origin\n`;
  return gcode;
};

export const generateTHR = (
  path: Point[],
  imgWidth: number,
  imgHeight: number,
  settings: GCodeSettings,
  isPatternLab: boolean = false
): string => {
  if (path.length === 0 || imgWidth <= 0 || imgHeight <= 0) return "";

  const { x: placeX, y: placeY, width: placeW, height: placeH } = isPatternLab
    ? { x: 0, y: 0, width: settings.scaleX, height: settings.scaleY }
    : settings.imagePlacement;
  
  const cx = settings.scaleX / 2;
  const cy = settings.scaleY / 2;
  
  const maxRadius = settings.workspaceType === 'circular' 
    ? settings.scaleX / 2 
    : Math.sqrt((settings.scaleX / 2) ** 2 + (settings.scaleY / 2) ** 2);

  let thrOutput = "";
  let lastTheta = 0;
  let accumulatedTheta = 0;

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    
    let normX = p.x / imgWidth;
    let normY = p.y / imgHeight;

    // Apply Flips
    if (!isPatternLab && settings.flipX) normX = 1 - normX;
    if (!isPatternLab && settings.flipY) normY = 1 - normY;
    
    let realX = placeX + normX * placeW;
    let realY = placeY + normY * placeH;

    // APPLY BOUNDARY REFLECTION
    if (settings.workspaceType === 'circular') {
        const cx = settings.scaleX / 2;
        const cy = settings.scaleY / 2;
        const r_limit = Math.min(settings.scaleX, settings.scaleY) / 2;
        const dx_ref = realX - cx;
        const dy_ref = realY - cy;
        const dist = Math.sqrt(dx_ref * dx_ref + dy_ref * dy_ref);
        if (dist > r_limit && r_limit > 0) {
            const reflectedDist = reflectValue(dist, 0, r_limit);
            const angle = Math.atan2(dy_ref, dx_ref);
            realX = cx + Math.cos(angle) * reflectedDist;
            realY = cy + Math.sin(angle) * reflectedDist;
        }
    } else {
        realX = reflectValue(realX, 0, settings.scaleX);
        realY = reflectValue(realY, 0, settings.scaleY);
    }

    // Apply Calibration
    if (settings.thrFlipX) realX = settings.scaleX - realX;
    if (settings.thrFlipY) realY = settings.scaleY - realY;
    if (settings.thrSwapXY) {
        const temp = realX;
        realX = realY;
        realY = temp;
    }

    const dx = realX - cx;
    // Standard THR is Y-up. Our realY is distance from top. So we use (cy - realY).
    const dy = cy - realY;

    const rho = Math.sqrt(dx * dx + dy * dy) / maxRadius;
    const theta = Math.atan2(dy, dx); 

    if (i === 0) {
      accumulatedTheta = theta;
    } else {
      let dTheta = theta - lastTheta;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      accumulatedTheta += dTheta;
    }

    lastTheta = theta;
    thrOutput += `${accumulatedTheta.toFixed(5)} ${Math.min(1, rho).toFixed(5)}\n`;
  }

  return thrOutput;
};
