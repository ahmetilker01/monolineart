
export interface Point {
  x: number;
  y: number;
  isJump?: boolean; // If true, this represents a non-drawing move (G0)
}

export type StartLocation = 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'custom';
export type ProcessingMode = 'outline' | 'fill' | 'counter' | 'wavy_spiral' | 'sandart';
export type FillStyle = 'linear' | 'scribble' | 'contour';
export type WorkspaceType = 'rectangular' | 'circular';
export type PathStartPreference = 'original' | 'center' | 'edge';
export type PathEndPreference = 'original' | 'center' | 'edge';

export type PatternType = 'spirograph' | 'lissajous' | 'spiral' | 'polygon' | 'star' | 'heart' | 'rose' | 'text' | 'phyllotaxis' | 'modulo' | 'hypotrochoid' | 'epitrochoid' | 'fractal_tree' | 'superformula' | 'chladni_plate' | 'petalar' | 'orbital' | 'ellipse' | 'semicircle' | 'rectangle' | 'diamond' | 'trapezoid' | 'cardioid' | 'limacon' | 'lemniscate' | 'astroid' | 'deltoid' | 'nephroid' | 'trefoil' | 'quatrefoil' | 'cinquefoil' | 'figure8' | 'infinity' | 'torus2d' | 'golden_spiral' | 'teardrop' | 'cross' | 'bursty_bezier';

export interface PatternSettings {
  id: string;
  name: string;
  visible: boolean;
  type: PatternType;
  loops: number;
  points: number;
  rotation: number;
  scale: number;
  // Spirograph / Trochoids
  outerRadius: number;
  innerRadius: number;
  penOffset: number;
  // Spiral/Lissajous/Phyllotaxis/Modulo
  growth: number;
  freqX: number;
  freqY: number;
  multiplier?: number; // For modulo patterns
  divergence?: number; // For phyllotaxis
  // Superformula
  m?: number;
  n1?: number;
  n2?: number;
  n3?: number;
  // Fractal
  fractalDepth?: number;
  fractalBranchFactor?: number;
  // Chladni
  chladniN?: number;
  chladniM?: number;
  // Effects
  wobbleAmplitude?: number;
  wobbleFrequency?: number;
  morphAmplitude?: number;
  morphFrequency?: number;
  noiseAmplitude?: number;
  modulationAmplitude?: number; // New: modulation of the radius
  modulationFrequency?: number; // New: frequency of radius modulation
  // Wiper Effect
  wiperPosition?: 'none' | 'before' | 'after';
  wiperDensity?: number;
  wiperRadius?: number;
  // Text
  textContent?: string;
  textSize?: number;
  textCircular?: boolean;
  textFlipWrap?: boolean;
  connectLetters?: boolean;
  // Mirroring
  mirrorCount?: number;
  // Transformations
  offsetX?: number;
  offsetY?: number;
}

export interface ImagePlacement {
  x: number; // Position in workspace mm
  y: number; // Position in workspace mm
  width: number; // Width in workspace mm
  height: number; // Height in workspace mm
}

export interface GCodeSettings {
  feedRate: number;
  scaleX: number; // Workspace Width in mm
  scaleY: number; // Workspace Height in mm (or Diameter)
  workspaceType: WorkspaceType;
  invert: boolean;
  threshold: number; // Edge detection sensitivity
  pointDensity: number; // Skip pixels to reduce point count
  detectionMode: 'edge' | 'darkness'; // Algorithm choice
  enableThinning: boolean; // Skeletonization
  smoothing: number; // Path smoothing iterations
  startLocation: StartLocation;
  customStartPoint: Point | null; // Normalized 0-1 coordinates for custom start
  processingMode: ProcessingMode; // Switch between Outline and Fill
  fillStyle: FillStyle; // New: Switch between Linear scan and Scribble/Chaotic
  fillSpacing: number; // Distance between lines or density of scribble
  fillAngle: number; // Angle of hatching in degrees
  imagePlacement: ImagePlacement;
  pathStartPreference: PathStartPreference; // Preference for start point
  pathEndPreference: PathEndPreference; // Preference for end point
  flipX: boolean; // Mirror X axis
  flipY: boolean; // Mirror Y axis
  thrFlipX: boolean;
  thrFlipY: boolean;
  thrSwapXY: boolean;
}

export interface AnalysisResult {
  title: string;
  description: string;
  suggestedFeedRate: number;
}
