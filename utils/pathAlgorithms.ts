
import { Point, GCodeSettings } from "../types";

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

export const processImageToSingleLine = (
  imageData: ImageData,
  settings: GCodeSettings,
  dims: { w: number, h: number }
): Point[] => {
  let points: Point[] = [];
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
  meta: { title: string; description: string }
): string => {
  if (path.length === 0 || imgWidth <= 0 || imgHeight <= 0) return "";

  const { x: placeX, y: placeY, width: placeW, height: placeH } = settings.imagePlacement;
  
  let gcode = `; Generated by MonoLine Art\n`;
  gcode += `; Title: ${meta.title}\n`;
  gcode += `; Description: ${meta.description}\n`;
  gcode += `; Workspace: ${settings.workspaceType} (${settings.scaleX}x${settings.scaleY}mm)\n`;
  gcode += `G21 ; mm\nG90 ; Absolute\n\n`;

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    let normX = p.x / imgWidth;
    let normY = p.y / imgHeight;
    
    // Apply Flips
    if (settings.flipX) normX = 1 - normX;
    if (settings.flipY) normY = 1 - normY;

    const realX = (placeX + normX * placeW).toFixed(3);
    // Standard CNC is bottom-left (0,0). Images are top-left. So we invert Y by default (1 - normY).
    const realY = (placeY + (1 - normY) * placeH).toFixed(3);

    if (i === 0 || p.isJump) {
        gcode += `M5 ; Pen Up\n`;
        gcode += `G0 X${realX} Y${realY} F${settings.feedRate}\n`;
        gcode += `M3 S255 ; Pen Down\n`;
    } else {
        gcode += `G1 X${realX} Y${realY}\n`;
    }
  }

  gcode += `M5 ; Pen Up\nG0 X0 Y0 ; Return to origin\n`;
  return gcode;
};

export const generateTHR = (
  path: Point[],
  imgWidth: number,
  imgHeight: number,
  settings: GCodeSettings
): string => {
  if (path.length === 0 || imgWidth <= 0 || imgHeight <= 0) return "";

  const { x: placeX, y: placeY, width: placeW, height: placeH } = settings.imagePlacement;
  
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
    if (settings.flipX) normX = 1 - normX;
    if (settings.flipY) normY = 1 - normY;
    
    const realX = placeX + normX * placeW;
    const realY = placeY + (1 - normY) * placeH;

    const dx = realX - cx;
    const dy = realY - cy;

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
