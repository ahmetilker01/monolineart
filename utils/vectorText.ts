import { Point } from "../types";

// Handwriting cursive font definitions.
// Coordinates are mapped approximately between 0-1.
// They act as skeleton control points that will be smoothed by Catmull-Rom.
const handFont: Record<string, Point[]> = {
  'a': [{x:0.8,y:0.4}, {x:0.2,y:0.4}, {x:0.1,y:0.7}, {x:0.5,y:0.9}, {x:0.8,y:0.7}, {x:0.8,y:0.3}, {x:0.8,y:1}],
  'b': [{x:0.2,y:-0.2}, {x:0.1,y:0.5}, {x:0.2,y:1}, {x:0.6,y:0.9}, {x:0.8,y:0.7}, {x:0.6,y:0.5}, {x:0.2,y:0.6}],
  'c': [{x:0.8,y:0.4}, {x:0.4,y:0.3}, {x:0.1,y:0.6}, {x:0.4,y:0.9}, {x:0.8,y:0.8}],
  'd': [{x:0.8,y:0.4}, {x:0.4,y:0.3}, {x:0.1,y:0.6}, {x:0.4,y:0.9}, {x:0.8,y:0.7}, {x:0.8,y:-0.2}, {x:0.8,y:1}],
  'e': [{x:0.2,y:0.6}, {x:0.8,y:0.5}, {x:0.6,y:0.2}, {x:0.2,y:0.4}, {x:0.1,y:0.7}, {x:0.4,y:0.9}, {x:0.8,y:0.8}],
  'f': [{x:0.6,y:-0.2}, {x:0.4,y:-0.2}, {x:0.4,y:0.4}, {x:0.2,y:0.4}, {x:0.6,y:0.4}, {x:0.4,y:0.4}, {x:0.4,y:1}],
  'g': [{x:0.8,y:0.4}, {x:0.2,y:0.4}, {x:0.1,y:0.7}, {x:0.5,y:0.9}, {x:0.8,y:0.7}, {x:0.8,y:0.4}, {x:0.8,y:1.3}, {x:0.4,y:1.4}, {x:0.2,y:1.2}],
  'h': [{x:0.2,y:-0.2}, {x:0.2,y:1}, {x:0.2,y:0.6}, {x:0.6,y:0.4}, {x:0.8,y:0.6}, {x:0.8,y:1}],
  'i': [{x:0.5,y:0.4}, {x:0.5,y:1}],
  'j': [{x:0.5,y:0.4}, {x:0.5,y:1.3}, {x:0.2,y:1.4}],
  'k': [{x:0.2,y:-0.2}, {x:0.2,y:1}, {x:0.2,y:0.6}, {x:0.8,y:0.4}, {x:0.4,y:0.7}, {x:0.8,y:1}],
  'l': [{x:0.5,y:-0.2}, {x:0.5,y:0.8}, {x:0.7,y:1}],
  'm': [{x:0.1,y:0.4}, {x:0.1,y:1}, {x:0.1,y:0.5}, {x:0.4,y:0.4}, {x:0.5,y:1}, {x:0.5,y:0.5}, {x:0.8,y:0.4}, {x:0.9,y:1}],
  'n': [{x:0.2,y:0.4}, {x:0.2,y:1}, {x:0.2,y:0.5}, {x:0.6,y:0.4}, {x:0.8,y:1}],
  'o': [{x:0.5,y:0.3}, {x:0.1,y:0.5}, {x:0.3,y:0.9}, {x:0.7,y:0.9}, {x:0.9,y:0.5}, {x:0.5,y:0.3}, {x:0.8,y:0.4}],
  'p': [{x:0.2,y:0.4}, {x:0.2,y:1.4}, {x:0.2,y:0.5}, {x:0.6,y:0.4}, {x:0.8,y:0.7}, {x:0.6,y:0.9}, {x:0.2,y:0.8}],
  'q': [{x:0.8,y:0.4}, {x:0.2,y:0.4}, {x:0.1,y:0.7}, {x:0.5,y:0.9}, {x:0.8,y:0.7}, {x:0.8,y:0.4}, {x:0.8,y:1.4}],
  'r': [{x:0.2,y:0.4}, {x:0.2,y:1}, {x:0.2,y:0.5}, {x:0.5,y:0.3}, {x:0.8,y:0.4}],
  's': [{x:0.8,y:0.4}, {x:0.4,y:0.3}, {x:0.1,y:0.5}, {x:0.5,y:0.6}, {x:0.8,y:0.7}, {x:0.6,y:0.9}, {x:0.2,y:0.8}],
  't': [{x:0.5,y:-0.1}, {x:0.5,y:0.8}, {x:0.8,y:1}, {x:0.5,y:0.8}, {x:0.5,y:0.3}, {x:0.2,y:0.3}, {x:0.8,y:0.3}], 
  'u': [{x:0.2,y:0.4}, {x:0.2,y:0.8}, {x:0.5,y:0.9}, {x:0.8,y:0.7}, {x:0.8,y:0.4}, {x:0.8,y:1}],
  'v': [{x:0.2,y:0.4}, {x:0.5,y:1}, {x:0.8,y:0.4}],
  'w': [{x:0.1,y:0.4}, {x:0.3,y:1}, {x:0.5,y:0.6}, {x:0.7,y:1}, {x:0.9,y:0.4}],
  'x': [{x:0.2,y:0.4}, {x:0.8,y:1}, {x:0.5,y:0.7}, {x:0.8,y:0.4}, {x:0.2,y:1}],
  'y': [{x:0.2,y:0.4}, {x:0.2,y:0.8}, {x:0.5,y:0.9}, {x:0.8,y:0.7}, {x:0.8,y:0.4}, {x:0.8,y:1.3}, {x:0.4,y:1.4}, {x:0.2,y:1.2}],
  'z': [{x:0.2,y:0.4}, {x:0.8,y:0.4}, {x:0.4,y:0.9}, {x:0.8,y:0.9}, {x:0.5,y:1.3}, {x:0.2,y:1.2}],
  '0': [{x:0.5,y:0.1}, {x:0.2,y:0.3}, {x:0.2,y:0.7}, {x:0.5,y:0.9}, {x:0.8,y:0.7}, {x:0.8,y:0.3}, {x:0.5,y:0.1}],
  '1': [{x:0.3,y:0.3}, {x:0.5,y:0.1}, {x:0.5,y:0.9}],
  '2': [{x:0.2,y:0.3}, {x:0.5,y:0.1}, {x:0.8,y:0.3}, {x:0.5,y:0.6}, {x:0.2,y:0.9}, {x:0.8,y:0.9}],
  '3': [{x:0.2,y:0.2}, {x:0.5,y:0.1}, {x:0.8,y:0.2}, {x:0.6,y:0.5}, {x:0.8,y:0.7}, {x:0.6,y:0.9}, {x:0.2,y:0.8}],
  '4': [{x:0.8,y:0.7}, {x:0.2,y:0.7}, {x:0.6,y:0.1}, {x:0.6,y:0.9}],
  '5': [{x:0.8,y:0.1}, {x:0.2,y:0.1}, {x:0.2,y:0.5}, {x:0.6,y:0.4}, {x:0.8,y:0.6}, {x:0.6,y:0.9}, {x:0.2,y:0.8}],
  '6': [{x:0.7,y:0.1}, {x:0.3,y:0.3}, {x:0.2,y:0.7}, {x:0.4,y:0.9}, {x:0.7,y:0.7}, {x:0.6,y:0.5}, {x:0.3,y:0.6}],
  '7': [{x:0.2,y:0.1}, {x:0.8,y:0.1}, {x:0.4,y:0.9}],
  '8': [{x:0.5,y:0.5}, {x:0.2,y:0.3}, {x:0.5,y:0.1}, {x:0.8,y:0.3}, {x:0.5,y:0.5}, {x:0.2,y:0.7}, {x:0.5,y:0.9}, {x:0.8,y:0.7}, {x:0.5,y:0.5}],
  '9': [{x:0.3,y:0.8}, {x:0.6,y:0.9}, {x:0.8,y:0.7}, {x:0.7,y:0.1}, {x:0.3,y:0.1}, {x:0.2,y:0.4}, {x:0.5,y:0.5}, {x:0.7,y:0.4}]
};

// Applies Catmull-Rom spline interpolation to smooth out the points.
function catmullRom(points: Point[], numPoints: number = 6): Point[] {
    if (points.length < 3) return points;
    const p = [points[0], ...points, points[points.length - 1]];
    const result: Point[] = [];
    for (let i = 1; i < p.length - 2; i++) {
        const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
        for (let t = 0; t < 1; t += 1 / numPoints) {
            const t2 = t * t;
            const t3 = t2 * t;
            const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
            const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
            result.push({ x, y, isJump: (t === 0 && p1.isJump) });
        }
    }
    result.push(points[points.length - 1]);
    return result;
}

export const generateText = (text: string, isCircular: boolean, radius: number, size: number, cx: number, cy: number, connectLetters: boolean, invertWrap: boolean = false): Point[] => {
  const points: Point[] = [];
  const lowerText = text.toLowerCase();
  const letterSpacing = size * 0.3;
  const wordSpacing = size * 1.0;
  const letterWidth = size;
  
  // Pre-calculate full width for centering
  let totalWidth = 0;
  for (let i = 0; i < lowerText.length; i++) {
    if (lowerText[i] === ' ') totalWidth += wordSpacing;
    else totalWidth += letterWidth + letterSpacing;
  }
  totalWidth -= letterSpacing;

  let startX = isCircular ? 0 : -totalWidth / 2;
  let wordSkeletons: Point[] = [];

  const flushWord = () => {
      if (wordSkeletons.length > 0) {
          const smoothed = connectLetters ? catmullRom(wordSkeletons, 8) : wordSkeletons;
          points.push(...smoothed);
          wordSkeletons = [];
      }
  };
  
  for (let i = 0; i < lowerText.length; i++) {
    const char = lowerText[i];
    
    if (char === ' ') {
      flushWord();
      startX += wordSpacing;
      continue;
    }

    const stroke = handFont[char];
    if (!stroke) {
      flushWord();
      startX += letterWidth + letterSpacing;
      continue;
    }

    const letterPoints = stroke.map((p, idx) => ({ 
      x: startX + p.x * size, 
      y: p.y * size,
      // If we aren't connecting letters, and it's the first point of the letter, mark it as a jump.
      isJump: (!connectLetters && idx === 0 && wordSkeletons.length === 0) 
    }));

    if (connectLetters) {
        wordSkeletons.push(...letterPoints);
    } else {
        wordSkeletons.push(...catmullRom(letterPoints, 8));
        flushWord();
    }

    startX += letterWidth + letterSpacing;
  }
  flushWord();

  // Transform coordinates (Linear vs Circular)
  const transformedPoints: Point[] = points.map(p => {
    if (isCircular) {
      const angleOffset = -Math.PI / 2 - (totalWidth / (2 * radius));
      
      let theta = angleOffset + (p.x / radius); 
      let r = radius + (1 - p.y) * size;

      if (invertWrap) {
          // Wrap inside out and read bottom-to-top if we invert
          theta = -Math.PI / 2 + (totalWidth / (2 * radius)) - (p.x / radius);
          r = radius + p.y * size;
      }
      
      return {
        x: cx + r * Math.cos(theta),
        y: cy + r * Math.sin(theta),
        isJump: p.isJump
      };
    } else {
      return {
        x: cx + p.x,
        y: cy + p.y - size / 2, 
        isJump: p.isJump
      };
    }
  });

  return transformedPoints;
};
