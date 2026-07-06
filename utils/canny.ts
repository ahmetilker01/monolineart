import { Point } from '../types';

function applyGaussianBlur(data: Uint8ClampedArray, width: number, height: number): Float32Array {
    const kernel = [
        1, 2, 1,
        2, 4, 2,
        1, 2, 1
    ];
    const weightSum = 16;
    
    const blurred = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let sum = 0;
            let k = 0;
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const idx = ((y + ky) * width + (x + kx)) * 4;
                    const val = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                    sum += val * kernel[k++];
                }
            }
            blurred[y * width + x] = sum / weightSum;
        }
    }
    return blurred;
}

export function detectCannyEdges(imageData: ImageData, threshold: number, density: number): Point[] {
    const { width, height, data } = imageData;
    const blurred = applyGaussianBlur(data, width, height);

    const magnitudes = new Float32Array(width * height);
    const angles = new Uint8Array(width * height);

    for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
            const p00 = blurred[(y - 1) * width + (x - 1)];
            const p01 = blurred[(y - 1) * width + x];
            const p02 = blurred[(y - 1) * width + (x + 1)];
            const p10 = blurred[y * width + (x - 1)];
            const p12 = blurred[y * width + (x + 1)];
            const p20 = blurred[(y + 1) * width + (x - 1)];
            const p21 = blurred[(y + 1) * width + x];
            const p22 = blurred[(y + 1) * width + (x + 1)];

            const gx = (-1 * p00) + (1 * p02) + (-2 * p10) + (2 * p12) + (-1 * p20) + (1 * p22);
            const gy = (-1 * p00) + (-2 * p01) + (-1 * p02) + (1 * p20) + (2 * p21) + (1 * p22);

            const mag = Math.sqrt(gx * gx + gy * gy);
            const idx = y * width + x;
            magnitudes[idx] = mag;

            let angle = Math.atan2(gy, gx) * (180 / Math.PI);
            if (angle < 0) angle += 180;
            
            if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
                angles[idx] = 0;
            } else if (angle >= 22.5 && angle < 67.5) {
                angles[idx] = 45;
            } else if (angle >= 67.5 && angle < 112.5) {
                angles[idx] = 90;
            } else {
                angles[idx] = 135;
            }
        }
    }

    const nms = new Float32Array(width * height);
    for (let y = 2; y < height - 2; y++) {
        for (let x = 2; x < width - 2; x++) {
            const idx = y * width + x;
            const mag = magnitudes[idx];
            const angle = angles[idx];

            let m1 = 0, m2 = 0;
            if (angle === 0) {
                m1 = magnitudes[idx - 1];
                m2 = magnitudes[idx + 1];
            } else if (angle === 45) {
                m1 = magnitudes[idx - width + 1];
                m2 = magnitudes[idx + width - 1];
            } else if (angle === 90) {
                m1 = magnitudes[idx - width];
                m2 = magnitudes[idx + width];
            } else if (angle === 135) {
                m1 = magnitudes[idx - width - 1];
                m2 = magnitudes[idx + width + 1];
            }

            if (mag >= m1 && mag >= m2) {
                nms[idx] = mag;
            } else {
                nms[idx] = 0;
            }
        }
    }

    // High and Low thresholding
    const highThresh = Math.max(10, 255 - threshold);
    const lowThresh = highThresh * 0.4;
    
    const edgeGrid = new Uint8Array(width * height);
    const strongQueue: number[] = [];
    
    for (let i = 0; i < width * height; i++) {
        if (nms[i] >= highThresh) {
            edgeGrid[i] = 2; // Strong edge
            strongQueue.push(i);
        } else if (nms[i] >= lowThresh) {
            edgeGrid[i] = 1; // Weak edge
        }
    }

    // Hysteresis: proper BFS to connect all reachable weak edges
    let head = 0;
    while (head < strongQueue.length) {
        const idx = strongQueue[head++];
        const cy = Math.floor(idx / width);
        const cx = idx % width;
        
        for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
                if (ky === 0 && kx === 0) continue;
                const ny = cy + ky;
                const nx = cx + kx;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nidx = ny * width + nx;
                    if (edgeGrid[nidx] === 1) {
                        edgeGrid[nidx] = 2; // Make it strong
                        strongQueue.push(nidx);
                    }
                }
            }
        }
    }

    // Collect final points
    const points: Point[] = [];
    const stride = Math.max(1, Math.floor(density));

    for (let y = 2; y < height - 2; y += stride) {
        for (let x = 2; x < width - 2; x += stride) {
            if (edgeGrid[y * width + x] === 2) {
                points.push({ x, y });
            }
        }
    }

    return points;
}
