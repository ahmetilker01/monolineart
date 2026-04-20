
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { processImageToSingleLine, generateGCode, generateTHR } from './utils/pathAlgorithms';
import { analyzeImageForCNC } from './services/geminiService';
import { Point, GCodeSettings, AnalysisResult, WorkspaceType, ImagePlacement, PathStartPreference, PathEndPreference } from './types';
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
  ArrowsUpDownIcon
} from '@heroicons/react/24/outline';

const App: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [processedPath, setProcessedPath] = useState<Point[]>([]);
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
    scaleX: 200, 
    scaleY: 200, 
    workspaceType: 'rectangular',
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
    imagePlacement: { x: 50, y: 50, width: 100, height: 100 },
    pathStartPreference: 'original',
    pathEndPreference: 'original',
    flipX: false,
    flipY: false,
    thrFlipX: false,
    thrFlipY: false,
    thrSwapXY: false
  });

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
    if (isPlaying && processedPath.length > 0) {
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
  }, [isPlaying, processedPath.length, simSpeed]);

  const getExportPath = useCallback((): Point[] => {
    if (processedPath.length < 2) return processedPath;
    
    let path = [...processedPath];
    const { x: placeX, y: placeY, width: placeW, height: placeH } = settings.imagePlacement;
    const cx = settings.scaleX / 2;
    const cy = settings.scaleY / 2;

    const getWorkspaceMM = (p: Point) => {
        let nX = p.x / imgDimensions.w;
        let nY = p.y / imgDimensions.h;
        if (settings.flipX) nX = 1 - nX;
        if (settings.flipY) nY = 1 - nY;
        return { x: placeX + nX * placeW, y: placeY + nY * placeH };
    };

    const mmToPixel = (mmX: number, mmY: number): Point => {
        let nX = (mmX - placeX) / placeW;
        let nY = (mmY - placeY) / placeH;
        if (settings.flipX) nX = 1 - nX;
        if (settings.flipY) nY = 1 - nY;
        return { x: nX * imgDimensions.w, y: nY * imgDimensions.h };
    };

    const pStart = getWorkspaceMM(path[0]);
    const pEnd = getWorkspaceMM(path[path.length - 1]);
    const dStartCenter = Math.sqrt((pStart.x - cx)**2 + (pStart.y - cy)**2);
    const dEndCenter = Math.sqrt((pEnd.x - cx)**2 + (pEnd.y - cy)**2);

    if (settings.pathStartPreference === 'center') {
        if (dEndCenter < dStartCenter) path.reverse();
    } else if (settings.pathStartPreference === 'edge') {
        if (dEndCenter > dStartCenter) path.reverse();
    } else if (settings.pathEndPreference === 'center') {
        if (dStartCenter < dEndCenter) path.reverse();
    } else if (settings.pathEndPreference === 'edge') {
        if (dStartCenter > dEndCenter) path.reverse();
    }

    if (settings.pathStartPreference === 'center') {
        path.unshift({ ...mmToPixel(cx, cy), isJump: true });
    } else if (settings.pathStartPreference === 'edge') {
        const startPoint = getWorkspaceMM(path[0]);
        const angle = Math.atan2(startPoint.y - cy, startPoint.x - cx);
        const radius = Math.max(settings.scaleX, settings.scaleY);
        path.unshift({ ...mmToPixel(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius), isJump: true });
    }

    if (settings.pathEndPreference === 'center') {
        path.push(mmToPixel(cx, cy));
    } else if (settings.pathEndPreference === 'edge') {
        const finalP = getWorkspaceMM(path[path.length - 1]);
        const angle = Math.atan2(finalP.y - cy, finalP.x - cx);
        const radius = Math.max(settings.scaleX, settings.scaleY);
        path.push(mmToPixel(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius));
    }

    return path;
  }, [processedPath, settings, imgDimensions]);

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

    // Origin Mark (Center for circular, Bottom-Left for Rect)
    if (settings.workspaceType === 'circular') {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(sX/2, sY/2, 3 * pixelWidth, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath(); ctx.arc(0, sY, 3 * pixelWidth, 0, Math.PI*2); ctx.fill();
    }

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

    const finalPath = getExportPath();
    if (finalPath.length > 0 && imgDimensions.w > 0 && imgDimensions.h > 0) {
        ctx.beginPath();
        ctx.lineWidth = 1.2 * pixelWidth;
        ctx.strokeStyle = '#38bdf8';
        const maxIdx = Math.floor((Math.max(0, Math.min(100, simProgress))/100) * finalPath.length);
        for (let i = 0; i < maxIdx; i++) {
            const p = finalPath[i];
            
            let normX = p.x / imgDimensions.w;
            let normY = p.y / imgDimensions.h;

            // Mirror preview logic to match export settings
            if (settings.flipX) normX = 1 - normX;
            if (settings.flipY) normY = 1 - normY;

            const px = x + normX * w;
            const py = y + normY * h;
            
            if (i === 0 || p.isJump) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();

        if (maxIdx > 0 && maxIdx <= finalPath.length) {
            const last = finalPath[maxIdx-1];
            let lNormX = last.x / imgDimensions.w;
            let lNormY = last.y / imgDimensions.h;
            if (settings.flipX) lNormX = 1 - lNormX;
            if (settings.flipY) lNormY = 1 - lNormY;
            
            ctx.fillStyle = '#facc15';
            ctx.beginPath(); 
            ctx.arc(x + lNormX * w, y + lNormY * h, 3 * pixelWidth, 0, Math.PI*2); 
            ctx.fill();
        }
    }
    ctx.restore();
  }, [getExportPath, settings, imgDimensions, simProgress, zoom, pan]);

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
    const gcode = generateGCode(exportPath, imgDimensions.w, imgDimensions.h, settings, aiMeta);
    downloadFile(gcode, `${aiMeta.title.replace(/\s/g, '_')}.gcode`);
  };

  const handleDownloadTHR = () => {
    const exportPath = getExportPath();
    const thr = generateTHR(exportPath, imgDimensions.w, imgDimensions.h, settings);
    downloadFile(thr, `${aiMeta.title.replace(/\s/g, '_')}.thr`);
  };

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row bg-slate-950 overflow-hidden font-sans">
      <aside className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-r border-slate-800 flex flex-col flex-1 md:flex-none md:h-full overflow-y-auto shadow-2xl z-10 order-2 md:order-1">
        <div className="p-6 border-b border-slate-800 shrink-0">
          <h1 className="text-xl font-black text-sky-400 tracking-tight">MonoLine Art</h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Workspace & Routing</p>
        </div>

        <div className="p-5 flex-1 space-y-6">
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

          <div className="space-y-4">
             <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
                <PaintBrushIcon className="w-4 h-4 text-sky-500" />
                <h3 className="text-slate-200 text-sm font-semibold">Drawing Settings</h3>
             </div>
             <div className="space-y-4">
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    <button onClick={() => setSettings({...settings, processingMode: 'outline'})} className={`text-[10px] font-bold py-2 rounded-md transition-all ${settings.processingMode === 'outline' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>OUTLINE</button>
                    <button onClick={() => setSettings({...settings, processingMode: 'fill'})} className={`text-[10px] font-bold py-2 rounded-md transition-all ${settings.processingMode === 'fill' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>FILL</button>
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold"><span>Sensitivity</span><span>{settings.threshold}</span></div>
                    <input type="range" min="50" max="250" value={settings.threshold} onChange={e => setSettings({...settings, threshold: Number(e.target.value)})} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                </div>
                {settings.processingMode === 'fill' && (
                  <div className="space-y-3 mt-3 border-t border-slate-800 pt-3">
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
                      <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-500 uppercase font-bold"><span>Fill Density</span><span>{settings.fillSpacing}</span></div>
                          <input type="range" min="2" max="15" step="1" value={settings.fillSpacing} onChange={e => setSettings({...settings, fillSpacing: Number(e.target.value)})} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                      </div>
                  </div>
                )}
             </div>
          </div>
        </div>

        {imageSrc && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/50">
            <img src={imageSrc} alt="Original" className="w-full h-auto rounded-lg border border-slate-800 object-contain max-h-24 bg-slate-900 shadow-inner" />
          </div>
        )}

        <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-2">
          <button onClick={handleDownloadGCode} disabled={!imageSrc || isProcessing} className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 text-white text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-sky-900/20 active:scale-95">
            <ArrowDownTrayIcon className="w-4 h-4" /> EXPORT G-CODE
          </button>
          <button onClick={handleDownloadTHR} disabled={!imageSrc || isProcessing} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-[10px] font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-900/20 active:scale-95">
            <StarIcon className="w-4 h-4" /> EXPORT .THR
          </button>
        </div>
      </aside>

      <main 
        ref={containerRef} 
        className="h-[50vh] md:h-full md:flex-1 shrink-0 bg-black relative overflow-hidden touch-none order-1 md:order-2" 
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

        {imageSrc && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-slate-900/95 p-4 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-xl max-w-[90vw]">
                <div className="flex items-center gap-3 pr-6 border-r border-slate-800">
                    <button onClick={() => setIsPlaying(!isPlaying)} className={`w-12 h-12 flex items-center justify-center rounded-full text-white transition-all ${isPlaying ? 'bg-amber-500 shadow-amber-500/20' : 'bg-sky-600 shadow-sky-500/20 hover:scale-105'}`}>
                        {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                    </button>
                    <div className="hidden sm:block">
                        <span className="text-[10px] font-black text-slate-500 uppercase block leading-none mb-1">Status</span>
                        <span className="text-xs font-bold text-slate-200">{isPlaying ? 'Simulating' : 'Paused'}</span>
                    </div>
                </div>
                
                <div className="flex-1 min-w-[120px]">
                    <div className="flex justify-between text-[10px] text-slate-400 font-black tracking-widest uppercase mb-2">
                        <span>Simulation Progress</span>
                        <span className="text-sky-400">{Math.round(simProgress)}%</span>
                    </div>
                    <input type="range" min="0" max="100" step="0.1" value={simProgress} onChange={e => setSimProgress(Number(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                </div>

                <div className="flex-1 min-w-[80px] max-w-[120px] pl-6 border-l border-slate-800">
                    <div className="flex justify-between text-[10px] text-slate-400 font-black tracking-widest uppercase mb-2">
                        <span>Speed</span>
                        <span className="text-sky-400">{simSpeed.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="0.1" max="5" step="0.1" value={simSpeed} onChange={e => setSimSpeed(Number(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500" />
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
