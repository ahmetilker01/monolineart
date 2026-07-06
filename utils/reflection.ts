import { Point } from "../types";

/**
 * Clamps a value inside a range [min, max].
 * (Previously used ping-pong reflection, now modified as requested to clamp)
 */
export const reflectValue = (val: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, val));
};

/**
 * Reflects a point within rectangular bounds.
 */
export const reflectInBox = (p: Point, width: number, height: number): Point => {
    return {
        ...p,
        x: reflectValue(p.x, 0, width),
        y: reflectValue(p.y, 0, height)
    };
};

/**
 * Reflects a point within a circular boundary.
 * If the point is outside the radius, it is reflected inwards along the same vector.
 */
export const reflectInCircle = (p: Point, cx: number, cy: number, radius: number): Point => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist <= radius || radius <= 0) return p;
    
    // Ping-pong reflection for radius
    const reflectedDist = reflectValue(dist, 0, radius);
    const angle = Math.atan2(dy, dx);
    
    return {
        ...p,
        x: cx + Math.cos(angle) * reflectedDist,
        y: cy + Math.sin(angle) * reflectedDist
    };
};
