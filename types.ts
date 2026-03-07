
export interface Point {
  x: number;
  y: number;
  isJump?: boolean; // If true, this represents a non-drawing move (G0)
}

export type StartLocation = 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'custom';
export type ProcessingMode = 'outline' | 'fill';
export type FillStyle = 'linear' | 'scribble' | 'contour';
export type WorkspaceType = 'rectangular' | 'circular';
export type PathStartPreference = 'original' | 'center' | 'edge';
export type PathEndPreference = 'original' | 'center' | 'edge';

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
