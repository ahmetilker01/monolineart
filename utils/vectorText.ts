import { Point } from "../types";

// Soft, friendly, continuous cursive/script font for better blending and connection
const RAW_FONT: Record<string, string> = {
  // Every letter strictly starts at x=0, y=10 (bottom-left) and ends at x=8, y=10 (bottom-right)
  'A': "0,10 4,0 2,6 6,6 8,10",
  'B': "0,10 0,0 6,0 8,2 6,4 0,5 6,6 8,8 6,10 0,10 8,10",
  'C': "0,8 4,2 6,0 2,0 0,2 0,8 2,10 6,10 8,10",
  'D': "0,10 0,0 6,0 8,5 6,10 0,10 8,10",
  'E': "0,8 4,2 0,4 2,6 4,6 2,6 0,8 2,10 6,10 8,10",
  'F': "0,10 0,0 8,0 0,0 0,5 6,5 0,5 0,10 8,10",
  'G': "0,8 4,2 0,2 0,8 4,10 8,8 8,4 4,4 8,4 8,10",
  'H': "0,10 0,0 0,5 8,5 8,0 8,10",
  'I': "0,10 4,0 4,10 8,10",
  'J': "0,10 6,0 4,0 4,8 2,10 0,8 4,10 8,10",
  'K': "0,10 0,0 0,5 8,0 2,6 8,10",
  'L': "0,10 4,0 0,8 2,10 8,10",
  'M': "0,10 0,0 4,5 8,0 8,10",
  'N': "0,10 0,0 8,10 8,0 8,10",
  'O': "0,10 4,0 0,2 0,8 4,10 8,8 8,2 4,0 8,0 8,10",
  'P': "0,10 0,0 6,0 8,2 6,5 0,5 0,10 8,10",
  'Q': "0,10 4,0 0,2 0,8 4,10 8,8 8,2 4,0 8,8 10,10 8,10",
  'R': "0,10 0,0 6,0 8,2 6,5 0,5 4,5 8,10",
  'S': "0,10 8,2 4,0 0,2 2,4 6,6 8,8 4,10 0,8 4,10 8,10",
  'T': "0,10 4,0 0,0 8,0 4,0 4,10 8,10",
  'U': "0,10 0,0 0,8 2,10 6,10 8,8 8,0 8,10",
  'V': "0,10 0,0 4,10 8,0 8,10",
  'W': "0,10 0,0 2,10 4,5 6,10 8,0 8,10",
  'X': "0,10 4,5 8,0 4,5 0,0 4,5 8,10",
  'Y': "0,10 0,0 0,5 4,10 8,5 8,0 4,10 8,10",
  'Z': "0,10 0,0 8,0 0,10 8,10",
  '0': "0,10 4,0 0,2 0,8 4,10 8,8 8,2 4,0 8,10",
  '1': "0,10 4,0 4,10 8,10",
  '2': "0,10 0,3 2,0 6,0 8,2 8,4 0,10 8,10",
  '3': "0,10 0,2 2,0 6,0 8,2 8,4 5,5 8,6 8,8 6,10 2,10 0,8 8,10",
  '4': "0,10 8,6 0,6 6,0 6,10 8,10",
  '5': "0,10 8,0 0,0 0,4 6,4 8,6 8,8 6,10 2,10 0,8 8,10",
  '6': "0,10 8,0 2,0 0,2 0,8 2,10 6,10 8,8 8,5 6,4 0,6 8,10",
  '7': "0,10 0,0 8,0 3,10 8,10",
  '8': "0,10 4,5 2,4 0,2 4,0 8,2 6,4 4,5 6,6 8,8 4,10 0,8 4,5 8,10",
  '9': "0,10 8,10 8,2 6,0 2,0 0,2 2,4 8,5 8,10",
  ' ': "",
  '-': "0,5 8,5",
  '.': "3,9 3,10 4,10 4,9 3,9",
  ',': "4,9 4,10 3,11",
  '!': "4,0 4,7 4,9 4,10",
  '?': "0,3 2,0 6,0 8,2 8,5 4,6 4,8 4,10",
};

const TURKISH_MAP: Record<string, string> = {
  'Ç': 'C', 'ç': 'C',
  'Ğ': 'G', 'ğ': 'G',
  'İ': 'I', 'ı': 'I',
  'Ö': 'O', 'ö': 'O',
  'Ş': 'S', 'ş': 'S',
  'Ü': 'U', 'ü': 'U'
};

const handFont: Record<string, Point[]> = {};

for (const [char, str] of Object.entries(RAW_FONT)) {
  if (!str) {
      handFont[char] = [];
      continue;
  }
  const pairs = str.split(' ');
  const pts = pairs.map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x: x / 10, y: y / 10 };
  });
  handFont[char] = pts;
}

// Higher quality Catmull-Rom spline interpolation to make the text completely smooth.
function catmullRom(points: Point[], numPoints: number = 8): Point[] {
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

export const generateText = (text: string, isCircular: boolean, radius: number, size: number, cx: number, cy: number, connectLetters: boolean, invertWrap: boolean = false, customFont?: any): Point[] => {
  const points: Point[] = [];

  if (customFont) {
      const font = customFont;
      let totalWidth = font.getAdvanceWidth(text, size);
      let startX = isCircular ? 0 : -totalWidth / 2;
      
      const chars = text.split('');
      let currentXOffset = startX;
      
      for (let c = 0; c < chars.length; c++) {
          const char = chars[c];
          if (char === ' ') {
              currentXOffset += font.getAdvanceWidth(' ', size);
              continue;
          }
          
          const charPath = font.getPath(char, currentXOffset, 0, size);
          
          let currentX = 0;
          let currentY = 0;
          let lastMx = 0;
          let lastMy = 0;
          
          let isFirstCommandInChar = true;

          for (let i = 0; i < charPath.commands.length; i++) {
              const cmd = charPath.commands[i];
              if (cmd.type === 'M') {
                 currentX = cmd.x; 
                 currentY = cmd.y;
                 lastMx = currentX; lastMy = currentY;
                 
                 let isJump = true;
                 if (connectLetters && isFirstCommandInChar && c > 0 && chars[c-1] !== ' ') {
                     isJump = false;
                 }
                 // MUST ALWAYS jump on the very first character of the string to avoid connecting from origin
                 if (c === 0 && isFirstCommandInChar) { 
                     isJump = true; 
                 }
                 
                 points.push({ x: currentX, y: currentY, isJump }); 
                 isFirstCommandInChar = false;
              } else if (cmd.type === 'L') {
                 currentX = cmd.x; currentY = cmd.y;
                 points.push({ x: currentX, y: currentY, isJump: false });
              } else if (cmd.type === 'Q') {
                 for(let t=0.1; t<=1; t+=0.1) {
                     const x = (1-t)*(1-t)*currentX + 2*(1-t)*t*cmd.x1 + t*t*cmd.x;
                     const y = (1-t)*(1-t)*currentY + 2*(1-t)*t*cmd.y1 + t*t*cmd.y;
                     points.push({ x, y, isJump: false });
                 }
                 currentX = cmd.x; currentY = cmd.y;
              } else if (cmd.type === 'C') {
                 for(let t=0.1; t<=1; t+=0.1) {
                     const u = 1-t;
                     const x = u*u*u*currentX + 3*u*u*t*cmd.x1 + 3*u*t*t*cmd.x2 + t*t*t*cmd.x;
                     const y = u*u*u*currentY + 3*u*u*t*cmd.y1 + 3*u*t*t*cmd.y2 + t*t*t*cmd.y;
                     points.push({ x, y, isJump: false });
                 }
                 currentX = cmd.x; currentY = cmd.y;
              } else if (cmd.type === 'Z') {
                 currentX = lastMx;
                 currentY = lastMy;
                 points.push({ x: currentX, y: currentY, isJump: false });
              }
          }
          
          const advance = font.getAdvanceWidth(char, size);
          const nextXOffset = currentXOffset + advance;
          
          // EXACT user request: connect letters precisely at the bottom baseline (red lines)
          if (connectLetters && c < chars.length - 1 && chars[c+1] !== ' ') {
              const nextChar = chars[c+1];
              const nextCharPath = font.getPath(nextChar, nextXOffset, 0, size);
              
              if (charPath.commands.length > 0 && nextCharPath.commands.length > 0) {
                  const charBounds = charPath.getBoundingBox();
                  const nextBounds = nextCharPath.getBoundingBox();
                  
                  // Find the very last valid draw coordinate of the CURRENT character
                  const bottomY = Math.max(charBounds.y2, nextBounds.y2); 
                  
                  // Move from end of letter explicitly to bottom-right baseline corner
                  points.push({ x: charBounds.x2, y: bottomY, isJump: false }); 
                  // Draw the red bridge exactly across the gap at the baseline
                  points.push({ x: nextBounds.x1, y: bottomY, isJump: false }); 
              }
          }
          
          currentXOffset = nextXOffset;
      }
      
      // Transform coordinates (Linear vs Circular) specifically for customFont
      const transformedCustomPoints: Point[] = points.map(p => {
        if (isCircular) {
          if (invertWrap) {
              const angleOffset = Math.PI / 2 + (totalWidth / (2 * radius));
              const theta = angleOffset - (p.x / radius);
              const r = radius + p.y;
              return {
                x: cx + r * Math.cos(theta),
                y: cy + r * Math.sin(theta),
                isJump: p.isJump
              };
          } else {
              const angleOffset = -Math.PI / 2 - (totalWidth / (2 * radius));
              const theta = angleOffset + (p.x / radius); 
              // Since opentype y grows down, we might need a different sizing hack as p.y can be slightly negative for ascenders.
              const r = radius - p.y; 
              
              return {
                x: cx + r * Math.cos(theta),
                y: cy + r * Math.sin(theta),
                isJump: p.isJump
              };
          }
        } else {
          return {
            x: cx + p.x,
            y: cy + p.y, // Keep Y logic simple
            isJump: p.isJump
          };
        }
      });
      return transformedCustomPoints;
  }
  
  const letterSpacing = size * 0.2; // Slightly wider to show off the baseline connector nicely
  const wordSpacing = size * 0.8;
  const letterWidth = size * 0.8;
  
  // Pre-calculate full width for centering
  let totalWidth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') totalWidth += wordSpacing;
    else totalWidth += letterWidth + letterSpacing;
  }
  totalWidth -= letterSpacing;

  let startX = isCircular ? 0 : -totalWidth / 2;
  let wasSpace = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (char === ' ') {
      startX += wordSpacing;
      wasSpace = true;
      continue;
    }

    const mappedChar = TURKISH_MAP[char] || char;
    const stroke = handFont[mappedChar.toUpperCase()];
    if (!stroke || stroke.length === 0) {
      startX += letterWidth + letterSpacing;
      wasSpace = true;
      continue;
    }

    const letterPoints = stroke.map((p) => ({ 
      x: startX + p.x * letterWidth, 
      y: p.y * size,
      isJump: false // default
    }));

    if (points.length === 0 || wasSpace) {
        // Very first point of everything, or after space, MUST jump
        letterPoints[0].isJump = true;
        points.push(...catmullRom(letterPoints, 8));
        wasSpace = false;
    } else {
        if (!connectLetters) {
            letterPoints[0].isJump = true;
            points.push(...catmullRom(letterPoints, 8));
        } else {
            // "Alttan birleştir": Soft continuous curve from the bottom
            const lastP = points[points.length - 1]; // last point of PREVIOUS char
            const firstP = letterPoints[0]; // first point of NEW char

            // Instead of jumping, we synthesize a bezier curve that bridges them at the bottom
            const midX1 = lastP.x + (firstP.x - lastP.x) * 0.3;
            const midX2 = lastP.x + (firstP.x - lastP.x) * 0.7;
            const dropY = size * 1.1; // Dip slightly below the baseline for a natural scoop

            const connectPoints = [
                lastP,
                { x: midX1, y: dropY, isJump: false },
                { x: midX2, y: dropY, isJump: false },
                firstP
            ];

            // Use catmull-rom on ONLY the connection
            const connectionSpline = catmullRom(connectPoints, 8);
            
            // Remove the first point of the connection (it's already in 'points')
            connectionSpline.shift();
            
            // Push the connecting spline
            points.push(...connectionSpline);

            // Now push the rest of the actual letter, completely smoothed
            const smoothLetter = catmullRom(letterPoints, 8);
            smoothLetter[0].isJump = false; // Force it to continue from the spline
            points.push(...smoothLetter);
        }
    }

    startX += letterWidth + letterSpacing;
  }

  // Transform coordinates (Linear vs Circular)
  const transformedPoints: Point[] = points.map(p => {
    if (isCircular) {
      if (invertWrap) {
          // Wrapped inside, readable from bottom. 
          const angleOffset = Math.PI / 2 + (totalWidth / (2 * radius));
          const theta = angleOffset - (p.x / radius);
          // top of letter (p.y = 0) is pointing towards center -> smaller radius
          const r = radius + p.y;
          return {
            x: cx + r * Math.cos(theta),
            y: cy + r * Math.sin(theta),
            isJump: p.isJump
          };
      } else {
          // Wrapped outside, readable from top.
          const angleOffset = -Math.PI / 2 - (totalWidth / (2 * radius));
          const theta = angleOffset + (p.x / radius); 
          // top of letter (p.y=0) is outward -> larger radius
          const r = radius + size - p.y;
          
          return {
            x: cx + r * Math.cos(theta),
            y: cy + r * Math.sin(theta),
            isJump: p.isJump
          };
      }
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
