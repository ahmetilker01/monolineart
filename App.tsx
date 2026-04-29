
import React, { useState, useRef, useEffect, useCallback } from 'react';
import opentype from 'opentype.js';
import { processImageToSingleLine, generateGCode, generateTHR, generatePattern } from './utils/pathAlgorithms';
import { reflectInBox, reflectInCircle, reflectValue } from './utils/reflection';
import { analyzeImageForCNC } from './services/geminiService';
import { Point, GCodeSettings, AnalysisResult, WorkspaceType, ImagePlacement, PathStartPreference, PathEndPreference, PatternSettings, PatternType } from './types';
import { 
  CloudArrowUpIcon, 
  ArrowDownTrayIcon, 
  ArrowPathIcon,
  WrenchScrewdriverIcon,
  PaintBrushIcon,
  PlusIcon,
  MinusIcon,
  MagnifyingGlassPlusIcon,
  PlayIcon,
  PauseIcon,
  StarIcon,
  MapPinIcon,
  FlagIcon,
  Squares2X2Icon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  PhotoIcon,
  BeakerIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

interface SliderControlProps {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  color?: string;
  unit?: string;
}

const SliderControl: React.FC<SliderControlProps> = ({ label, value, min, max, step = 1, onChange, color = "amber", unit = "" }) => {
  const safeValue = value ?? min;
  
  const cleanDecimals = (num: number) => {
    const decimals = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
    return Number(num.toFixed(decimals));
  };

  const handleDecrement = () => {
    onChange(cleanDecimals(Math.max(min, safeValue - step)));
  };
  
  const handleIncrement = () => {
    onChange(cleanDecimals(Math.min(max, safeValue + step)));
  };
  
  const decimals = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
  const displayValue = safeValue.toFixed(decimals);

  return (
    <div className="space-y-1">
       <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase font-bold">
          <span>{label}</span>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={handleDecrement} className="w-5 h-5 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-600 hover:text-white transition-colors border border-slate-700 leading-none pb-[2px] cursor-pointer touch-manipulation">-</button>
            <span className="min-w-[40px] text-center text-slate-300 font-mono text-[10px]">{displayValue}{unit}</span>
            <button onClick={handleIncrement} className="w-5 h-5 flex items-center justify-center bg-slate-800 rounded hover:bg-slate-600 hover:text-white transition-colors border border-slate-700 leading-none pb-[2px] cursor-pointer touch-manipulation">+</button>
          </div>
       </div>
       <input 
         type="range" 
         min={min} 
         max={max} 
         step={step} 
         value={safeValue} 
         onChange={e => onChange(Number(e.target.value))} 
         className={`w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-${color}-500`} 
       />
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'image' | 'pattern'>('image');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [customFont, setCustomFont] = useState<any>(null);
  const [customFontName, setCustomFontName] = useState<string>('');
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [processedPath, setProcessedPath] = useState<Point[]>([]);
  const [patternPath, setPatternPath] = useState<Point[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imgDimensions, setImgDimensions] = useState({ w: 0, h: 0 });
  
  // Interaction State
  const [dragging, setDragging] = useState<{ type: 'move' | 'resize' | 'pan', corner?: string } | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startPlacement, setStartPlacement] = useState<ImagePlacement | null>(null);

  // Viewport State (Zoom & Pan)
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  
  // Mobile Multi-touch State
  const lastTouchDist = useRef<number | null>(null);

  // Simulation State
  const [simProgress, setSimProgress] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);
  const [simSpeed, setSimSpeed] = useState(0.5);
  const animationRef = useRef<number | null>(null);

  const [settings, setSettings] = useState<GCodeSettings>({
    feedRate: 1500,
    scaleX: 601, 
    scaleY: 601, 
    workspaceType: 'circular',
    invert: false,
    threshold: 120, 
    pointDensity: 1.5, 
    detectionMode: 'edge', 
    enableThinning: true, 
    smoothing: 3,
    startLocation: 'center',
    customStartPoint: null,
    processingMode: 'outline',
    fillStyle: 'contour',
    fillSpacing: 4,
    fillAngle: 0,
    imagePlacement: { x: 150, y: 150, width: 300, height: 300 },
    pathStartPreference: 'original',
    pathEndPreference: 'original',
    flipX: false,
    flipY: false,
    thrFlipX: false,
    thrFlipY: false,
    thrSwapXY: false
  });

  const [patternLayers, setPatternLayers] = useState<PatternSettings[]>([{
    id: 'layer-1',
    name: 'Wiper Base',
    visible: true,
    type: 'spiral', // Often used as wipe or base
    loops: 10,
    points: 100,
    rotation: 0,
    scale: 1,
    outerRadius: 100,
    innerRadius: 40,
    penOffset: 60,
    growth: 5,
    freqX: 3,
    freqY: 2,
    wobbleAmplitude: 0,
    wobbleFrequency: 10,
    mirrorCount: 1,
    offsetX: 0,
    offsetY: 0,
    wiperPosition: 'none',
    wiperDensity: 5,
    wiperRadius: 280,
    textContent: 'MONOLINE',
    textSize: 20,
    textCircular: false,
    connectLetters: true
  }]);
  
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');
  const activeLayer = patternLayers.find(l => l.id === activeLayerId) || patternLayers[0];

  const updateActiveLayer = (updates: Partial<PatternSettings>) => {
    setPatternLayers(layers => layers.map(l => l.id === activeLayerId ? { ...l, ...updates } : l));
  };

  const addLayer = () => {
    const newId = `layer-${Date.now()}`;
    setPatternLayers(layers => [...layers, { ...activeLayer, id: newId, name: `Layer ${layers.length + 1}`, connectLetters: true }]);
    setActiveLayerId(newId);
  };
  
  const deleteLayer = (id: string) => {
    setPatternLayers(layers => {
      const filtered = layers.filter(l => l.id !== id);
      if (filtered.length === 0) return layers; // Don't delete last
      if (activeLayerId === id) setActiveLayerId(filtered[0].id);
      return filtered;
    });
  };

  const [aiMeta, setAiMeta] = useState<AnalysisResult>({
    title: "MonoLine_Art",
    description: "Single line drawing",
    suggestedFeedRate: 1500
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fit image to workspace on upload
  useEffect(() => {
    if (imgDimensions.w > 0) {
      const ratio = imgDimensions.w / imgDimensions.h;
      let w = (settings.scaleX || 200) * 0.8;
      let h = w / ratio;
      if (h > (settings.scaleY || 200) * 0.8) {
        h = (settings.scaleY || 200) * 0.8;
        w = h * ratio;
      }
      setSettings(s => ({
        ...s,
        imagePlacement: {
          x: (s.scaleX - w) / 2,
          y: (s.scaleY - h) / 2,
          width: w,
          height: h
        }
      }));
    }
  }, [imgDimensions, settings.scaleX, settings.scaleY]);

  // Auto-generate pattern
  useEffect(() => {
    if (activeTab === 'pattern') {
      const combinedPath: Point[] = [];
      patternLayers.forEach(layer => {
        if (!layer.visible) return;
        let layerPath = generatePattern(layer, { w: settings.scaleX, h: settings.scaleY }, customFont);
        
        // APPLY BOUNDARY REFLECTION
        if (settings.workspaceType === 'circular') {
          const cx = settings.scaleX / 2;
          const cy = settings.scaleY / 2;
          const radius = Math.min(settings.scaleX, settings.scaleY) / 2;
          layerPath = layerPath.map(p => reflectInCircle(p, cx, cy, radius));
        } else {
          layerPath = layerPath.map(p => reflectInBox(p, settings.scaleX, settings.scaleY));
        }

        if (layerPath.length > 0) {
            // If we already have points, draw a jump to the start of this layer
            if (combinedPath.length > 0) {
                combinedPath.push({ ...combinedPath[combinedPath.length - 1], isJump: true });
                combinedPath.push({ ...layerPath[0], isJump: true });
            }
            combinedPath.push(...layerPath);
        }
      });
      setPatternPath(combinedPath);
      // Reset simulation when pattern changes
      setSimProgress(100);
    }
  }, [patternLayers, settings.scaleX, settings.scaleY, settings.workspaceType, activeTab]);

  const currentPath = activeTab === 'image' ? processedPath : patternPath;

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const font = opentype.parse(arrayBuffer);
      setCustomFont(font);
      setCustomFontName(file.name);
      // Trigger redraw of pattern by updating a dummy settings
      setPatternLayers([...patternLayers]);
    } catch (err) {
      console.error("Font parsing error:", err);
      alert("Invalid font file. Please upload a .ttf or .otf file.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const src = event.target?.result as string;
      setImageSrc(src);
      try {
        const result = await analyzeImageForCNC(src);
        setAiMeta(result);
      } catch (error) {
        setAiMeta({ title: "Drawing", description: "Manual upload", suggestedFeedRate: 1500 });
      }
    };
    reader.readAsDataURL(file);
  };

  const processImage = useCallback(() => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setTimeout(() => {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => {
        const maxRes = settings.processingMode === 'fill' ? 800 : 1000;
        let w = img.width, h = img.height;
        if (w <= 0 || h <= 0) { setIsProcessing(false); return; }
        if (w > maxRes || h > maxRes) {
            const ratio = w / h;
            if (w > h) { w = maxRes; h = maxRes / ratio; }
            else { h = maxRes; w = maxRes * ratio; }
        }
        w = Math.floor(w); h = Math.floor(h);
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w; offCanvas.height = h;
        const ctx = offCanvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        setImgDimensions({ w, h });
        setProcessedPath(processImageToSingleLine(imageData, settings, { w, h }));
        setIsProcessing(false);
      };
      img.onerror = () => setIsProcessing(false);
    }, 100);
  }, [imageSrc, settings.threshold, settings.pointDensity, settings.detectionMode, settings.enableThinning, settings.smoothing, settings.processingMode, settings.fillStyle, settings.fillSpacing, settings.fillAngle, settings.invert]);

  useEffect(() => { if (imageSrc) processImage(); }, [processImage]);

  useEffect(() => {
    if (isPlaying && currentPath.length > 0) {
      const step = () => {
        setSimProgress(prev => {
          if (prev >= 100) { setIsPlaying(false); return 100; }
          return prev + simSpeed;
        });
        animationRef.current = requestAnimationFrame(step);
      };
      animationRef.current = requestAnimationFrame(step);
    } else if (animationRef.current) cancelAnimationFrame(animationRef.current);
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying, currentPath.length, simSpeed]);

  const getExportPath = useCallback((): Point[] => {
    if (activeTab === 'pattern') return patternPath;
    if (processedPath.length < 2) return processedPath;
    
    let path = [...processedPath];
    const { x: placeX, y: placeY, width: placeW, height: placeH } = settings.imagePlacement;
    const cx = settings.scaleX / 2;
    const cy = settings.scaleY / 2;

    const getWorkspaceMM = (p: Point) => {
        let nX = p.x / (imgDimensions.w || 1);
        let nY = p.y / (imgDimensions.h || 1);
        if (settings.flipX) nX = 1 - nX;
        if (settings.flipY) nY = 1 - nY;
        return { x: placeX + nX * placeW, y: placeY + nY * placeH };
    };

    const mmToPixel = (mmX: number, mmY: number): Point => {
        let nX = (mmX - placeX) / (placeW || 1);
        let nY = (mmY - placeY) / (placeH || 1);
        if (settings.flipX) nX = 1 - nX;
        if (settings.flipY) nY = 1 - nY;
        return { x: nX * (imgDimensions.w || 1), y: nY * (imgDimensions.h || 1) };
    };

    const mmPath = path.map(p => getWorkspaceMM(p));
    const pStart = mmPath[0];
    const pEnd = mmPath[mmPath.length - 1];
    const dStartCenter = Math.sqrt((pStart.x - cx)**2 + (pStart.y - cy)**2);
    const dEndCenter = Math.sqrt((pEnd.x - cx)**2 + (pEnd.y - cy)**2);

    let reversed = false;
    if (settings.pathStartPreference === 'center') {
        if (dEndCenter < dStartCenter) reversed = true;
    } else if (settings.pathStartPreference === 'edge') {
        if (dEndCenter > dStartCenter) reversed = true;
    } else if (settings.pathEndPreference === 'center') {
        if (dStartCenter < dEndCenter) reversed = true;
    } else if (settings.pathEndPreference === 'edge') {
        if (dStartCenter > dEndCenter) reversed = true;
    }
    
    if (reversed) { path.reverse(); mmPath.reverse(); }

    if (settings.pathStartPreference === 'center') {
        path.unshift({ ...mmToPixel(cx, cy), isJump: true });
    } else if (settings.pathStartPreference === 'edge') {
        const startPoint = mmPath[0];
        const angle = Math.atan2(startPoint.y - cy, startPoint.x - cx);
        const radius = Math.max(settings.scaleX, settings.scaleY);
        path.unshift({ ...mmToPixel(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius), isJump: true });
    }

    if (settings.pathEndPreference === 'center') {
        path.push(mmToPixel(cx, cy));
    } else if (settings.pathEndPreference === 'edge') {
        const finalP = mmPath[mmPath.length - 1];
        const angle = Math.atan2(finalP.y - cy, finalP.x - cx);
        const radius = Math.max(settings.scaleX, settings.scaleY);
        path.push(mmToPixel(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
    }

    return path;
  }, [processedPath, patternPath, activeTab, settings, imgDimensions]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const margin = 40;
    const sX = Math.max(1, settings.scaleX);
    const sY = Math.max(1, settings.scaleY);
    
    const availW = Math.max(0, rect.width - margin * 2);
    const availH = Math.max(0, rect.height - margin * 2);
    const baseScale = Math.min(availW / sX, availH / sY);
    
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, rect.width, rect.height);
    
    ctx.save();
    ctx.translate(rect.width / 2, rect.height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(pan.x, pan.y);
    ctx.translate(-(sX * baseScale) / 2, -(sY * baseScale) / 2);
    ctx.scale(baseScale, baseScale);

    const worldScale = baseScale * zoom;
    const pixelWidth = 1 / Math.max(0.0001, worldScale);

    // Workspace Boundary
    ctx.lineWidth = pixelWidth;
    ctx.strokeStyle = '#334155';
    if (settings.workspaceType === 'circular') {
        ctx.beginPath();
        ctx.arc(sX/2, sY/2, sX/2, 0, Math.PI*2);
        ctx.stroke();
    } else {
        ctx.strokeRect(0, 0, sX, sY);
    }

    // Grid (every 20mm)
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    for (let i = 0; i <= sX; i += 20) { ctx.moveTo(i, 0); ctx.lineTo(i, sY); }
    for (let i = 0; i <= sY; i += 20) { ctx.moveTo(0, i); ctx.lineTo(sX, i); }
    ctx.stroke();

    // Origin Mark
    ctx.fillStyle = '#f43f5e';
    if (settings.workspaceType === 'circular') {
        ctx.beginPath(); ctx.arc(sX/2, sY/2, 3 * pixelWidth, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.beginPath(); ctx.arc(0, sY, 3 * pixelWidth, 0, Math.PI*2); ctx.fill();
    }

    if (activeTab === 'image') {
      const { x, y, width: w, height: h } = settings.imagePlacement;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = pixelWidth;
      const dashLen = 5 * pixelWidth;
      if (isFinite(dashLen) && dashLen > 0) ctx.setLineDash([dashLen, dashLen]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      const handleSize = 8 * pixelWidth;
      ctx.fillStyle = '#38bdf8';
      [['tl', x, y], ['tr', x+w, y], ['bl', x, y+h], ['br', x+w, y+h]].forEach(([_id, hx, hy]) => {
          ctx.fillRect(Number(hx)-handleSize/2, Number(hy)-handleSize/2, handleSize, handleSize);
      });
    }

    const finalPath = getExportPath();
    if (finalPath.length > 0) {
        ctx.beginPath();
        ctx.lineWidth = 1.2 * pixelWidth;
        ctx.strokeStyle = '#38bdf8';
        const maxIdx = Math.floor((Math.max(0, Math.min(100, simProgress))/100) * finalPath.length);
        
        for (let i = 0; i < maxIdx; i++) {
            const p = finalPath[i];
            let wx, wy;
            if (activeTab === 'image') {
                let nX = p.x / (imgDimensions.w || 1);
                let nY = p.y / (imgDimensions.h || 1);
                if (settings.flipX) nX = 1 - nX;
                if (settings.flipY) nY = 1 - nY;
                const { x: placeX, y: placeY, width: placeW, height: placeH } = settings.imagePlacement;
                wx = placeX + nX * placeW;
                wy = placeY + nY * placeH;

                // REFLECTION PREVIEW
                if (settings.workspaceType === 'circular') {
                    const cx = settings.scaleX / 2;
                    const cy = settings.scaleY / 2;
                    const r_limit = Math.min(settings.scaleX, settings.scaleY) / 2;
                    const dx = wx - cx;
                    const dy = wy - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > r_limit && r_limit > 0) {
                        const reflectedDist = reflectValue(dist, 0, r_limit);
                        const angle = Math.atan2(dy, dx);
                        wx = cx + Math.cos(angle) * reflectedDist;
                        wy = cy + Math.sin(angle) * reflectedDist;
                    }
                } else {
                    wx = reflectValue(wx, 0, settings.scaleX);
                    wy = reflectValue(wy, 0, settings.scaleY);
                }
            } else {
                wx = p.x;
                wy = p.y;
            }

            if (i === 0 || p.isJump) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
        }
        ctx.stroke();

        if (maxIdx > 0) {
            const last = finalPath[maxIdx-1];
            let wx, wy;
            if (activeTab === 'image') {
                let nX = last.x / (imgDimensions.w || 1);
                let nY = last.y / (imgDimensions.h || 1);
                if (settings.flipX) nX = 1 - nX;
                if (settings.flipY) nY = 1 - nY;
                const { x: placeX, y: placeY, width: placeW, height: placeH } = settings.imagePlacement;
                wx = placeX + nX * placeW;
                wy = placeY + nY * placeH;

                // REFLECTION PREVIEW
                if (settings.workspaceType === 'circular') {
                    const cx = settings.scaleX / 2;
                    const cy = settings.scaleY / 2;
                    const r_limit = Math.min(settings.scaleX, settings.scaleY) / 2;
                    const dx = wx - cx;
                    const dy = wy - cy;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > r_limit && r_limit > 0) {
                        const reflectedDist = reflectValue(dist, 0, r_limit);
                        const angle = Math.atan2(dy, dx);
                        wx = cx + Math.cos(angle) * reflectedDist;
                        wy = cy + Math.sin(angle) * reflectedDist;
                    }
                } else {
                    wx = reflectValue(wx, 0, settings.scaleX);
                    wy = reflectValue(wy, 0, settings.scaleY);
                }
            } else {
                wx = last.x;
                wy = last.y;
            }
            ctx.fillStyle = '#facc15';
            ctx.beginPath(); ctx.arc(wx, wy, 4 * pixelWidth, 0, Math.PI*2); ctx.fill();
        }
    }

    ctx.restore();
  }, [getExportPath, settings, imgDimensions, simProgress, zoom, pan, activeTab]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  const getWorkspaceCoords = (clientX: number, clientY: number): { mx: number, my: number, baseScale: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { mx: 0, my: 0, baseScale: 1 };
    const rect = canvas.getBoundingClientRect();
    const sX = Math.max(1, settings.scaleX);
    const sY = Math.max(1, settings.scaleY);
    const margin = 40;
    const baseScale = Math.min((rect.width - margin * 2) / sX, (rect.height - margin * 2) / sY);

    const cx = rect.width / 2;
    const cy = rect.height / 2;
    
    let lx = clientX - rect.left - cx;
    let ly = clientY - rect.top - cy;
    
    lx /= zoom;
    ly /= zoom;
    lx -= pan.x;
    ly -= pan.y;
    lx += (sX * baseScale) / 2;
    ly += (sY * baseScale) / 2;
    
    return { mx: lx / baseScale, my: ly / baseScale, baseScale };
  };

  const startInteraction = (clientX: number, clientY: number, isRightClick: boolean = false, isTouch: boolean = false) => {
    if (!imageSrc) return;
    const { mx, my, baseScale } = getWorkspaceCoords(clientX, clientY);

    if (isRightClick) {
      setDragging({ type: 'pan' });
      setDragStart({ x: clientX, y: clientY });
      setStartPan({ ...pan });
      return;
    }

    const { x, y, width: w, height: h } = settings.imagePlacement;
    // Larger handle area for touch
    const handleDist = (isTouch ? 24 : 12) / (baseScale * zoom);

    if (Math.abs(mx - x) < handleDist && Math.abs(my - y) < handleDist) setDragging({ type: 'resize', corner: 'tl' });
    else if (Math.abs(mx - (x+w)) < handleDist && Math.abs(my - y) < handleDist) setDragging({ type: 'resize', corner: 'tr' });
    else if (Math.abs(mx - x) < handleDist && Math.abs(my - (y+h)) < handleDist) setDragging({ type: 'resize', corner: 'bl' });
    else if (Math.abs(mx - (x+w)) < handleDist && Math.abs(my - (y+h)) < handleDist) setDragging({ type: 'resize', corner: 'br' });
    else if (mx >= x && mx <= x+w && my >= y && my <= y+h) setDragging({ type: 'move' });
    else setDragging({ type: 'pan' });

    setDragStart({ x: clientX, y: clientY });
    setStartPlacement({ ...settings.imagePlacement });
    setStartPan({ ...pan });
  };

  const moveInteraction = (clientX: number, clientY: number) => {
    if (!dragging) return;
    
    if (dragging.type === 'pan') {
      const dx = (clientX - dragStart.x) / zoom;
      const dy = (clientY - dragStart.y) / zoom;
      setPan({ x: startPan.x + dx, y: startPan.y + dy });
      return;
    }

    if (!startPlacement) return;
    const { baseScale } = getWorkspaceCoords(clientX, clientY);
    const dx = (clientX - dragStart.x) / (baseScale * zoom);
    const dy = (clientY - dragStart.y) / (baseScale * zoom);

    let newP = { ...startPlacement };
    if (dragging.type === 'move') {
        newP.x += dx; newP.y += dy;
    } else {
        if (dragging.corner === 'br') { newP.width += dx; newP.height += dy; }
        else if (dragging.corner === 'tl') { newP.x += dx; newP.y += dy; newP.width -= dx; newP.height -= dy; }
        else if (dragging.corner === 'tr') { newP.y += dy; newP.width += dx; newP.height -= dy; }
        else if (dragging.corner === 'bl') { newP.x += dx; newP.width -= dx; newP.height += dy; }
    }
    newP.width = Math.max(5, newP.width);
    newP.height = Math.max(5, newP.height);
    setSettings(s => ({ ...s, imagePlacement: newP }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startInteraction(e.clientX, e.clientY, e.button === 1 || e.button === 2);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    moveInteraction(e.clientX, e.clientY);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY;
    const zoomFactor = 1.1;
    setZoom(prev => {
        const next = delta > 0 ? prev * zoomFactor : prev / zoomFactor;
        return Math.min(Math.max(0.05, next), 20);
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        lastTouchDist.current = d;
    } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        startInteraction(touch.clientX, touch.clientY, false, true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
        e.preventDefault();
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const delta = d / lastTouchDist.current;
        setZoom(prev => Math.min(Math.max(0.05, prev * delta), 20));
        lastTouchDist.current = d;
    } else if (e.touches.length === 1 && dragging) {
        e.preventDefault();
        const touch = e.touches[0];
        moveInteraction(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = () => {
    lastTouchDist.current = null;
    setDragging(null);
  };

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.min(Math.max(0.05, factor > 1 ? prev * factor : prev * factor), 20));
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  };

  const handleDownloadGCode = () => {
    const exportPath = getExportPath();
    const gcode = generateGCode(exportPath, activeTab === 'image' ? imgDimensions.w : settings.scaleX, activeTab === 'image' ? imgDimensions.h : settings.scaleY, settings, aiMeta, activeTab === 'pattern');
    downloadFile(gcode, `${aiMeta.title.replace(/\s/g, '_')}.gcode`);
  };

  const handleDownloadTHR = () => {
    const exportPath = getExportPath();
    const thr = generateTHR(exportPath, activeTab === 'image' ? imgDimensions.w : settings.scaleX, activeTab === 'image' ? imgDimensions.h : settings.scaleY, settings, activeTab === 'pattern');
    downloadFile(thr, `${aiMeta.title.replace(/\s/g, '_')}.thr`);
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-slate-950 overflow-hidden font-sans">
      <aside className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-r border-slate-800 flex flex-col flex-1 md:flex-none md:h-full overflow-y-auto shadow-2xl z-20 order-2 md:order-1">
        <div className="p-4 border-b border-slate-800 shrink-0 bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
             <div className="flex items-baseline gap-1.5">
               <h1 className="text-xl font-black text-sky-400 tracking-tight">MonoLine Art</h1>
               <span className="text-sm font-bold text-indigo-200/80 tracking-wide">by Igotech</span>
             </div>
             <SparklesIcon className="w-5 h-5 text-amber-500 animate-pulse" />
          </div>
          
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
             <button 
               onClick={() => setActiveTab('image')}
               className={`flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold transition-all ${activeTab === 'image' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
             >
               <PhotoIcon className="w-3 h-3" /> IMAGE LAB
             </button>
             <button 
               onClick={() => setActiveTab('pattern')}
               className={`flex items-center justify-center gap-2 py-2 rounded-md text-[10px] font-bold transition-all ${activeTab === 'pattern' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
             >
               <BeakerIcon className="w-3 h-3" /> PATTERN LAB
             </button>
          </div>
        </div>

        <div className="p-5 flex-1 space-y-6">
          {activeTab === 'image' ? (
            <>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Upload Image</label>
                <div 
                  onClick={() => fileInputRef.current?.click()} 
                  className="border-2 border-dashed border-slate-700 rounded-xl p-4 text-center cursor-pointer hover:bg-slate-800 hover:border-sky-500/50 transition-all group"
                >
                  <CloudArrowUpIcon className="w-8 h-8 text-slate-600 group-hover:text-sky-500 mx-auto mb-1 transition-colors" />
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleImageUpload} />
                  <span className="text-xs text-slate-400 group-hover:text-slate-200">Select Image File</span>
                </div>
              </div>

              <div className="space-y-4">
                 <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                    <PaintBrushIcon className="w-4 h-4 text-sky-500" />
                    <h3 className="text-slate-200 text-sm font-semibold">Drawing Settings</h3>
                 </div>
                 <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                        <button onClick={() => setSettings({...settings, processingMode: 'outline'})} className={`text-[10px] font-bold py-2 rounded-md transition-all ${settings.processingMode === 'outline' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>OUTLINE</button>
                        <button onClick={() => setSettings({...settings, processingMode: 'counter'})} className={`text-[10px] font-bold py-2 rounded-md transition-all ${settings.processingMode === 'counter' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>COUNTER</button>
                        <button onClick={() => setSettings({...settings, processingMode: 'fill'})} className={`text-[10px] font-bold py-2 rounded-md transition-all ${settings.processingMode === 'fill' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>FILL</button>
                    </div>
                    <div className="space-y-1">
                        <SliderControl label="Sensitivity" min={50} max={250} step={1} value={settings.threshold} onChange={v => setSettings({...settings, threshold: v})} color="sky" />
                    </div>
                    {(settings.processingMode === 'fill' || settings.processingMode === 'counter') && (
                      <div className="space-y-3 mt-3 border-t border-slate-800 pt-3">
                          {settings.processingMode === 'fill' && (
                            <div>
                               <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Fill Style</label>
                               <select 
                                 value={settings.fillStyle}
                                 onChange={(e) => setSettings({...settings, fillStyle: e.target.value as any})}
                                 className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-[10px] text-slate-300 focus:outline-none focus:border-sky-500"
                               >
                                 <option value="contour">Artistic Contour (Spiral)</option>
                                 <option value="linear">Elliptical Hatch</option>
                                 <option value="scribble">Scribble</option>
                               </select>
                            </div>
                          )}
                          <SliderControl label={settings.processingMode === 'counter' ? 'Offset Spacing' : 'Fill Density'} min={2} max={15} step={1} value={settings.fillSpacing} onChange={v => setSettings({...settings, fillSpacing: v})} color="sky" />
                      </div>
                    )}
                 </div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
               <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                     <BeakerIcon className="w-4 h-4 text-amber-500" />
                     <h3 className="text-slate-200 text-sm font-semibold">Generative Patterns</h3>
                  </div>

                  {/* Layers System */}
                  <div className="space-y-2">
                     <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase block">Layers</label>
                        <button onClick={addLayer} className="text-[9px] text-sky-400 bg-sky-950 px-2 py-0.5 rounded border border-sky-800 uppercase font-bold">+ New Layer</button>
                     </div>
                     <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                        {patternLayers.map((layer, index) => (
                           <div 
                              key={layer.id} 
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border ${layer.id === activeLayerId ? 'bg-amber-950/40 border-amber-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                              onClick={() => setActiveLayerId(layer.id)}
                           >
                              <div className="flex items-center gap-2 flex-1">
                                 <input 
                                    type="checkbox" 
                                    checked={layer.visible} 
                                    onChange={(e) => { e.stopPropagation(); setPatternLayers(ls => ls.map(l => l.id === layer.id ? {...l, visible: e.target.checked} : l)) }}
                                    className="accent-amber-500 w-3 h-3"
                                 />
                                 <span className={`text-[10px] font-bold uppercase truncate ${layer.id === activeLayerId ? 'text-amber-400' : 'text-slate-400'}`}>
                                    {index + 1}. {layer.type} {layer.type === 'text' ? `"${layer.textContent?.substring(0, 5)}"` : ''}
                                 </span>
                              </div>
                              <button 
                                 onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                                 className="text-red-500/50 hover:text-red-400 text-xs px-2"
                              >✕</button>
                           </div>
                        ))}
                     </div>
                  </div>
                  
                  <div className="space-y-4 pt-3 border-t border-slate-800">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Pattern Type</label>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 font-bold text-[9px]">
                           {(['spirograph', 'hypotrochoid', 'epitrochoid', 'lissajous', 'spiral', 'polygon', 'star', 'heart', 'rose', 'phyllotaxis', 'modulo', 'superformula', 'fractal_tree', 'chladni_plate', 'text'] as PatternType[]).map(t => (
                              <button 
                                key={t}
                                onClick={() => updateActiveLayer({ type: t })}
                                className={`py-2 px-1 rounded uppercase tracking-tighter ${activeLayer.type === t ? 'bg-amber-600 text-white' : 'bg-slate-950 text-slate-500 border border-slate-800'}`}
                              >
                                {t === 'spirograph' ? 'spiro' : (t === 'hypotrochoid' ? 'hypo' : (t === 'epitrochoid' ? 'epi' : (t === 'phyllotaxis' ? 'phylla' : (t === 'superformula' ? 'super' : (t === 'fractal_tree' ? 'fractal' : (t === 'chladni_plate' ? 'chladni' : t))))))}
                              </button>
                           ))}
                        </div>
                    </div>

                    {activeLayer.type === 'text' ? (
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <div className="space-y-2 pb-2 border-b border-slate-800">
                             <label className="text-[9px] text-slate-500 font-bold uppercase flex items-center justify-between">
                                Custom Font (.ttf / .otf)
                                {customFont && (
                                   <button onClick={() => { setCustomFont(null); setCustomFontName(''); setPatternLayers([...patternLayers]); }} className="text-red-400 hover:text-red-300">Clear</button>
                                )}
                             </label>
                             <div 
                                onClick={() => fontInputRef.current?.click()} 
                                className={`border ${customFont ? 'border-amber-500/50 bg-amber-950/20' : 'border-dashed border-slate-700 hover:border-amber-500/50 hover:bg-slate-900'} rounded p-2 text-center cursor-pointer transition-all`}
                             >
                                <input ref={fontInputRef} type="file" accept=".ttf,.otf" className="hidden" onChange={handleFontUpload} />
                                <span className={`text-[10px] ${customFont ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                                  {customFont ? customFontName : 'Click to Upload Font'}
                                </span>
                             </div>
                             <p className="text-[8px] text-slate-500 leading-tight">Uploaded font will be converted to a single-line center path or continuous outline path.</p>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[9px] text-slate-500 font-bold uppercase block">Text</label>
                             <input 
                               type="text" 
                               value={activeLayer.textContent || ''} 
                               onChange={(e) => updateActiveLayer({ textContent: e.target.value })}
                               className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                               placeholder="Write something..."
                             />

                          </div>
                          <div className="flex items-center gap-2 mt-2">
                             <input 
                               type="checkbox" 
                               id="text-circular"
                               checked={activeLayer.textCircular || false} 
                               onChange={(e) => updateActiveLayer({ textCircular: e.target.checked })}
                               className="accent-amber-500 w-3 h-3"
                             />
                             <label htmlFor="text-circular" className="text-[9px] text-slate-300 font-bold uppercase">Circular Wrap</label>
                          </div>
                          <div className="space-y-1 mt-2">
                              <div className="flex items-center gap-2 mb-2 mt-2">
                                <input 
                                  type="checkbox" 
                                  id={`text-connect-${activeLayer.id}`}
                                  checked={activeLayer.connectLetters !== false} 
                                  onChange={(e) => updateActiveLayer({ connectLetters: e.target.checked })}
                                  className="accent-amber-500 w-3 h-3"
                                />
                                <label htmlFor={`text-connect-${activeLayer.id}`} className="text-[9px] text-slate-300 font-bold uppercase">Connect Bottoms</label>
                              </div>
                             <SliderControl label="Size" min={5} max={100} step={1} value={activeLayer.textSize} onChange={v => updateActiveLayer({ textSize: v })} />
                          </div>
                          {activeLayer.textCircular && (
                             <div className="mt-2">
                                <SliderControl label="Wrap Radius" min={10} max={400} step={5} value={activeLayer.outerRadius} onChange={v => updateActiveLayer({ outerRadius: v })} />
                             </div>
                          )}
                          <div className="mt-2">
                             <SliderControl label="Rotation" min={0} max={360} step={1} value={activeLayer.rotation} onChange={v => updateActiveLayer({ rotation: v })} unit="°" />
                          </div>
                       </div>
                    ) : (
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl label="Loops / Cycles" min={1} max={50} step={0.5} value={activeLayer.loops} onChange={v => updateActiveLayer({ loops: v })} />
                          <SliderControl label="Scale" min={0.1} max={2} step={0.05} value={activeLayer.scale} onChange={v => updateActiveLayer({ scale: v })} />
                          <SliderControl label="Rotation" min={0} max={360} step={1} value={activeLayer.rotation} onChange={v => updateActiveLayer({ rotation: v })} unit="°" />
                       </div>
                    )}

                    {activeLayer.type === 'spirograph' && (
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl label="Outer Radius" min={10} max={300} step={1} value={activeLayer.outerRadius} onChange={v => updateActiveLayer({ outerRadius: v })} />
                          <SliderControl label="Inner Radius" min={1} max={300} step={1} value={activeLayer.innerRadius} onChange={v => updateActiveLayer({ innerRadius: v })} />
                          <SliderControl label="Pen Offset" min={1} max={300} step={1} value={activeLayer.penOffset} onChange={v => updateActiveLayer({ penOffset: v })} />
                       </div>
                    )}

                    {(activeLayer.type === 'lissajous') && (
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl label="Freq X" min={1} max={20} step={0.1} value={activeLayer.freqX} onChange={v => updateActiveLayer({ freqX: v })} />
                          <SliderControl label="Freq Y" min={1} max={20} step={0.1} value={activeLayer.freqY} onChange={v => updateActiveLayer({ freqY: v })} />
                       </div>
                    )}

                    {(activeLayer.type === 'spiral' || activeLayer.type === 'polygon' || activeLayer.type === 'star' || activeLayer.type === 'rose' || activeLayer.type === 'phyllotaxis') && (
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl 
                             label={activeLayer.type === 'spiral' || activeLayer.type === 'phyllotaxis' ? 'Growth Rate' : (activeLayer.type === 'star' ? 'Points' : (activeLayer.type === 'rose' ? 'Petals (k-value)' : 'Sides'))}
                             min={activeLayer.type === 'spiral' || activeLayer.type === 'phyllotaxis' ? 0.1 : (activeLayer.type === 'rose' ? 1 : 3)} 
                             max={activeLayer.type === 'spiral' || activeLayer.type === 'phyllotaxis' ? 50 : (activeLayer.type === 'star' ? 30 : 20)} 
                             step={activeLayer.type === 'spiral' || activeLayer.type === 'phyllotaxis' ? 0.1 : 1}
                             value={activeLayer.growth}
                             onChange={v => updateActiveLayer({ growth: v })}
                          />
                          {activeLayer.type === 'phyllotaxis' && (
                              <SliderControl label="Divergence Angle" min={0} max={360} step={0.1} value={activeLayer.divergence || 137.5} onChange={v => updateActiveLayer({ divergence: v })} unit="°" />
                          )}
                       </div>
                    )}

                    {activeLayer.type === 'modulo' && (
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl label="Modulo Multiplier" min={1} max={250} step={0.1} value={activeLayer.multiplier || 2} onChange={v => updateActiveLayer({ multiplier: v })} />
                          <SliderControl label="Sample Points (n)" min={3} max={500} step={1} value={activeLayer.points} onChange={v => updateActiveLayer({ points: v })} />
                       </div>
                    )}

                    {activeLayer.type === 'superformula' && (
                        <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                           <SliderControl label="m (Symmetry)" min={1} max={20} step={0.1} value={activeLayer.m || 6} onChange={v => updateActiveLayer({ m: v })} />
                           <SliderControl label="n1 (Shape)" min={0.1} max={10} step={0.1} value={activeLayer.n1 || 1} onChange={v => updateActiveLayer({ n1: v })} />
                           <div className="grid grid-cols-2 gap-2">
                              <SliderControl label="n2" min={0.1} max={10} step={0.1} value={activeLayer.n2 || 1} onChange={v => updateActiveLayer({ n2: v })} />
                              <SliderControl label="n3" min={0.1} max={10} step={0.1} value={activeLayer.n3 || 1} onChange={v => updateActiveLayer({ n3: v })} />
                           </div>
                        </div>
                    )}

                    {activeLayer.type === 'fractal_tree' && (
                        <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                           <SliderControl label="Depth" min={2} max={12} step={1} value={activeLayer.fractalDepth || 6} onChange={v => updateActiveLayer({ fractalDepth: v })} />
                           <SliderControl label="Branch Angle" min={10} max={90} step={1} value={activeLayer.fractalBranchFactor || 25} onChange={v => updateActiveLayer({ fractalBranchFactor: v })} unit="°" />
                        </div>
                    )}

                    {activeLayer.type === 'chladni_plate' && (
                        <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                           <div className="grid grid-cols-2 gap-2">
                             <SliderControl label="N" min={1} max={20} step={1} value={activeLayer.chladniN || 2} onChange={v => updateActiveLayer({ chladniN: v })} />
                             <SliderControl label="M" min={1} max={20} step={1} value={activeLayer.chladniM || 4} onChange={v => updateActiveLayer({ chladniM: v })} />
                           </div>
                        </div>
                    )}

                    <div className="space-y-3 pt-4 border-t border-slate-800">
                       <div className="flex items-center gap-2">
                          <SparklesIcon className="w-3 h-3 text-amber-500" />
                          <h3 className="text-slate-300 text-[10px] font-bold uppercase tracking-wider">Effects & Distortions</h3>
                       </div>
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl label="Wobble Amplitude" min={0} max={20} step={0.5} value={activeLayer.wobbleAmplitude} onChange={v => updateActiveLayer({ wobbleAmplitude: v })} />
                          <SliderControl label="Wobble Frequency" min={1} max={100} step={1} value={activeLayer.wobbleFrequency} onChange={v => updateActiveLayer({ wobbleFrequency: v })} />
                          <SliderControl label="Morph Amp (Shape)" min={0} max={50} step={0.5} value={activeLayer.morphAmplitude || 0} onChange={v => updateActiveLayer({ morphAmplitude: v })} color="pink" />
                          <SliderControl label="Morph Freq" min={1} max={100} step={1} value={activeLayer.morphFrequency || 1} onChange={v => updateActiveLayer({ morphFrequency: v })} color="pink" />
                          <SliderControl label="Modulation Amp (%)" min={0} max={100} step={1} value={activeLayer.modulationAmplitude || 0} onChange={v => updateActiveLayer({ modulationAmplitude: v })} />
                          <SliderControl label="Modulation Freq" min={1} max={64} step={1} value={activeLayer.modulationFrequency || 1} onChange={v => updateActiveLayer({ modulationFrequency: v })} />
                          <div className="pt-2">
                             <SliderControl label="Noise Amplitude" min={0} max={10} step={0.1} value={activeLayer.noiseAmplitude || 0} onChange={v => updateActiveLayer({ noiseAmplitude: v })} />
                          </div>
                       </div>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-slate-800">
                       <div className="flex items-center gap-2">
                          <StarIcon className="w-3 h-3 text-amber-500" />
                          <h3 className="text-slate-300 text-[10px] font-bold uppercase tracking-wider">Mirroring (Aynalama)</h3>
                       </div>
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl label="Radial Clones" min={1} max={12} step={1} value={activeLayer.mirrorCount} onChange={v => updateActiveLayer({ mirrorCount: v })} />
                          <p className="text-[9px] text-slate-500 italic">Repeats the pattern radially for "Snowflake" style effects.</p>
                       </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-slate-800">
                       <div className="flex items-center gap-2">
                          <MapPinIcon className="w-3 h-3 text-amber-500" />
                          <h3 className="text-slate-300 text-[10px] font-bold uppercase tracking-wider">Positioning (Konumlandırma)</h3>
                       </div>
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <SliderControl label="Offset X" min={-300} max={300} step={1} value={activeLayer.offsetX} onChange={v => updateActiveLayer({ offsetX: v })} unit=" mm" />
                          <SliderControl label="Offset Y" min={-300} max={300} step={1} value={activeLayer.offsetY} onChange={v => updateActiveLayer({ offsetY: v })} unit=" mm" />
                       </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-slate-800">
                       <div className="flex items-center gap-2">
                          <ArrowPathIcon className="w-3 h-3 text-amber-500" />
                          <h3 className="text-slate-300 text-[10px] font-bold uppercase tracking-wider">Wiper (Silecek / Arka Plan)</h3>
                       </div>
                       <div className="space-y-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                          <div>
                            <label className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Add Wiper Effect</label>
                            <div className="grid grid-cols-3 gap-1 font-bold text-[9px]">
                               {['none', 'before', 'after'].map(w => (
                                  <button 
                                    key={w}
                                    onClick={() => updateActiveLayer({ wiperPosition: w as any })}
                                    className={`py-1 rounded uppercase tracking-tighter ${activeLayer.wiperPosition === w ? 'bg-amber-600 text-white' : 'bg-slate-900 text-slate-500 border border-slate-700'}`}
                                  >
                                    {w}
                                  </button>
                               ))}
                            </div>
                          </div>
                          {activeLayer.wiperPosition !== 'none' && (
                            <>
                              <div className="mt-2">
                                 <SliderControl label="Wiper Radius" min={50} max={600} step={10} value={activeLayer.wiperRadius} onChange={v => updateActiveLayer({ wiperRadius: v })} unit=" mm" />
                              </div>
                              <SliderControl label="Line Density" min={1} max={20} step={1} value={activeLayer.wiperDensity} onChange={v => updateActiveLayer({ wiperDensity: v })} unit=" mm" />
                              <p className="text-[9px] text-slate-500 italic">Pre-wipe clears sandbox before drawing. Post-wipe erases after.</p>
                            </>
                          )}
                       </div>
                    </div>
                 </div>

               </div>
            </div>
          )}

          <div className="space-y-4">
             <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <WrenchScrewdriverIcon className="w-4 h-4 text-sky-500" />
                <h3 className="text-slate-200 text-sm font-semibold">Machine Settings</h3>
             </div>
             
             <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                   <button 
                    onClick={() => setSettings({...settings, flipX: !settings.flipX})}
                    className={`flex items-center justify-center gap-2 py-2 rounded border transition-all text-[10px] font-bold ${settings.flipX ? 'bg-sky-600 border-sky-400 text-white' : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                   >
                     <ArrowsRightLeftIcon className="w-3 h-3" /> FLIP X
                   </button>
                   <button 
                    onClick={() => setSettings({...settings, flipY: !settings.flipY})}
                    className={`flex items-center justify-center gap-2 py-2 rounded border transition-all text-[10px] font-bold ${settings.flipY ? 'bg-sky-600 border-sky-400 text-white' : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'}`}
                   >
                     <ArrowsUpDownIcon className="w-3 h-3" /> FLIP Y
                   </button>
                </div>

                <div>
                   <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1">
                     <Squares2X2Icon className="w-3 h-3 text-sky-500" /> Workspace Shape
                   </label>
                   <select 
                     value={settings.workspaceType}
                     onChange={(e) => {
                       const type = e.target.value as WorkspaceType;
                       setSettings(s => ({...s, workspaceType: type, scaleY: type === 'circular' ? s.scaleX : s.scaleY}));
                     }}
                     className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-xs text-slate-300 focus:outline-none focus:border-sky-500"
                   >
                     <option value="rectangular">Rectangular</option>
                     <option value="circular">Circular</option>
                   </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">
                          {settings.workspaceType === 'circular' ? 'Diameter (mm)' : 'Width (X mm)'}
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          value={settings.scaleX} 
                          onChange={e => {
                            const val = Math.max(1, Number(e.target.value));
                            setSettings(s => ({...s, scaleX: val, scaleY: s.workspaceType === 'circular' ? val : s.scaleY}));
                          }} 
                          className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:border-sky-500 outline-none" 
                        />
                    </div>
                    {settings.workspaceType === 'rectangular' && (
                      <div>
                          <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Height (Y mm)</label>
                          <input 
                            type="number" 
                            min="1" 
                            value={settings.scaleY} 
                            onChange={e => setSettings({...settings, scaleY: Math.max(1, Number(e.target.value))})} 
                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-300 focus:border-sky-500 outline-none" 
                          />
                      </div>
                    )}
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                    <div>
                       <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1">
                         <MapPinIcon className="w-3 h-3 text-sky-500" /> Start Point
                       </label>
                       <select 
                         value={settings.pathStartPreference}
                         onChange={(e) => setSettings({...settings, pathStartPreference: e.target.value as PathStartPreference})}
                         className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-[10px] text-slate-300 focus:outline-none focus:border-sky-500"
                       >
                         <option value="original">Algorithm Original</option>
                         <option value="center">Inside (Center)</option>
                         <option value="edge">Outside (Edge)</option>
                       </select>
                    </div>

                    <div>
                       <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1">
                         <FlagIcon className="w-3 h-3 text-sky-500" /> End Point
                       </label>
                       <select 
                         value={settings.pathEndPreference}
                         onChange={(e) => setSettings({...settings, pathEndPreference: e.target.value as PathEndPreference})}
                         className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-2 text-[10px] text-slate-300 focus:outline-none focus:border-sky-500"
                       >
                         <option value="original">Algorithm Original</option>
                         <option value="center">Inside (Center)</option>
                         <option value="edge">Outside (Edge)</option>
                       </select>
                    </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                    <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex items-center gap-1">
                      <WrenchScrewdriverIcon className="w-3 h-3 text-sky-500" /> Export Calibration
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      <button 
                        onClick={() => setSettings({...settings, thrFlipX: !settings.thrFlipX})}
                        className={`py-1.5 rounded border text-[9px] font-bold transition-all ${settings.thrFlipX ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                        title="Invert X in export"
                      >
                        INV X
                      </button>
                      <button 
                        onClick={() => setSettings({...settings, thrFlipY: !settings.thrFlipY})}
                        className={`py-1.5 rounded border text-[9px] font-bold transition-all ${settings.thrFlipY ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                        title="Invert Y in export"
                      >
                        INV Y
                      </button>
                      <button 
                        onClick={() => setSettings({...settings, thrSwapXY: !settings.thrSwapXY})}
                        className={`py-1.5 rounded border text-[9px] font-bold transition-all ${settings.thrSwapXY ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                        title="Swap X and Y in export"
                      >
                        SWAP
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-500 italic">Use these if the table output is mirrored or rotated.</p>
                </div>
             </div>
          </div>
        </div>

        {activeTab === 'image' && imageSrc && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/50">
            <img src={imageSrc} alt="Original" className="w-full h-auto rounded-lg border border-slate-800 object-contain max-h-24 bg-slate-900 shadow-inner" />
          </div>
        )}

        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-2">
          <button onClick={handleDownloadGCode} disabled={(activeTab === 'image' && !imageSrc) || isProcessing} className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 text-white text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-sky-900/20 active:scale-95">
            <ArrowDownTrayIcon className="w-4 h-4" /> EXPORT G-CODE
          </button>
          <button onClick={handleDownloadTHR} disabled={(activeTab === 'image' && !imageSrc) || isProcessing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-900/20 active:scale-95">
            <StarIcon className="w-4 h-4" /> EXPORT .THR
          </button>
        </div>
      </aside>

      <main 
        ref={containerRef} 
        className="h-[40vh] md:h-full md:flex-1 shrink-0 bg-black relative overflow-hidden touch-none order-1 md:order-2" 
        onMouseMove={handleMouseMove} 
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        {isProcessing && (
            <div className="absolute inset-0 bg-slate-900/90 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
                <ArrowPathIcon className="w-12 h-12 text-sky-500 animate-spin mb-4" />
                <span className="text-sky-400 font-black text-xs tracking-[0.2em] uppercase">Processing...</span>
            </div>
        )}

        <canvas ref={canvasRef} onMouseDown={handleMouseDown} className={`w-full h-full block cursor-crosshair`} />
        
        <div className="absolute top-6 right-6 flex flex-col gap-2">
            <button onClick={() => handleZoom(1.2)} className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 hover:bg-sky-600 flex items-center justify-center shadow-xl backdrop-blur-md">
                <PlusIcon className="w-5 h-5" />
            </button>
            <button onClick={() => handleZoom(0.8)} className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 hover:bg-sky-600 flex items-center justify-center shadow-xl backdrop-blur-md">
                <MinusIcon className="w-5 h-5" />
            </button>
            <button onClick={() => { setZoom(1); setPan({x:0, y:0}); }} className="w-10 h-10 bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 hover:bg-sky-600 flex items-center justify-center shadow-xl backdrop-blur-md" title="Reset View">
                <MagnifyingGlassPlusIcon className="w-5 h-5" />
            </button>
        </div>

        {(imageSrc || activeTab === 'pattern') && (
            <div className="absolute top-1/2 left-2 md:left-4 -translate-y-1/2 flex flex-col items-center gap-2 md:gap-3 bg-slate-900/90 p-1.5 md:p-2 rounded-xl md:rounded-2xl border border-slate-700/50 shadow-2xl backdrop-blur-md z-20">
                <button 
                    onClick={() => {
                        if (!isPlaying && simProgress >= 100) {
                            setSimProgress(0);
                        }
                        setIsPlaying(!isPlaying);
                    }} 
                    className={`w-8 h-8 md:w-10 md:h-10 flex items-center justify-center rounded-full text-white transition-all shadow-lg ${isPlaying ? 'bg-amber-500 shadow-amber-500/20' : 'bg-sky-600 shadow-sky-500/20 hover:scale-110'}`} 
                    title={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? <PauseIcon className="w-4 h-4 md:w-5 md:h-5" /> : <PlayIcon className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0 ml-0.5" />}
                </button>
                
                <div className="h-px w-4 md:w-6 bg-slate-800 my-0.5 md:my-1"></div>
                
                {/* Progress bar (vertical) */}
                <div className="flex flex-col items-center gap-1 md:gap-2 group">
                    <span className="text-[8px] md:text-[9px] text-sky-400 font-black tracking-tighter" title="Progress">{Math.round(simProgress)}%</span>
                    <input 
                        type="range" 
                        min="0" max="100" step="0.1" 
                        value={simProgress} 
                        onChange={e => setSimProgress(Number(e.target.value))} 
                        className="w-1 md:w-1.5 h-20 md:h-28 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-sky-400"
                        style={{ WebkitAppearance: 'slider-vertical', writingMode: 'vertical-rl', direction: 'rtl' } as any}
                    />
                </div>

                <div className="h-px w-4 md:w-6 bg-slate-800 my-0.5 md:my-1"></div>

                {/* Speed bar (vertical) */}
                <div className="flex flex-col items-center gap-1 md:gap-2 group">
                    <span className="text-[8px] md:text-[9px] text-amber-500 font-black tracking-tighter" title="Speed">{simSpeed.toFixed(1)}x</span>
                    <input 
                        type="range" 
                        min="0.1" max="5" step="0.1" 
                        value={simSpeed} 
                        onChange={e => setSimSpeed(Number(e.target.value))} 
                        className="w-1 md:w-1.5 h-12 md:h-16 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400"
                        style={{ WebkitAppearance: 'slider-vertical', writingMode: 'vertical-rl', direction: 'rtl' } as any}
                    />
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
