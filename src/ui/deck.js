/**
 * THE CHORUS — Deck UI
 * Full tarot card rendering with canvas generative art.
 */

import { getVoices, getArcana, hexToRgb, extensionSettings, getVoiceById, resolveVoice, saveChatState } from '../state.js';
import { openDirectory } from '../social/directory.js';
import { playDissolution } from './animations.js';

// =============================================================================
// CANVAS TRACKING
// =============================================================================

let activeCanvases = [];

export function cleanupCanvases() {
    activeCanvases.forEach(c => c.stop());
    activeCanvases = [];
}

// =============================================================================
// INK BLEED (deck cards)
// =============================================================================

function buildInkBleed(voice, arc) {
    const { r, g, b } = hexToRgb(arc.color);
    const inf = voice.influence;
    const isDead = voice.state === 'dead';
    const isReversed = !!voice.reversed;

    if (isDead) {
        return `<div class="chorus-tarot__ink" style="height:100%">
            <div class="chorus-tarot__ink-body" style="background: rgba(30,25,35,0.8)"></div>
        </div>`;
    }

    // Reversed: ink bleeds DOWN from top. Normal: ink rises UP from bottom.
    if (isReversed) {
        const tendrils = [];
        if (inf > 40) tendrils.push(`<div class="chorus-tarot__ink-tendril" style="bottom:-20px;left:20%;height:16px;background:linear-gradient(to bottom,rgba(${r},${g},${b},0.4),transparent)"></div>`);
        if (inf > 60) tendrils.push(`<div class="chorus-tarot__ink-tendril" style="bottom:-18px;left:65%;width:3px;height:20px;background:linear-gradient(to bottom,rgba(${r},${g},${b},0.3),transparent)"></div>`);
        if (inf > 75) tendrils.push(`<div class="chorus-tarot__ink-tendril" style="bottom:-26px;left:45%;height:24px;background:linear-gradient(to bottom,rgba(${r},${g},${b},0.5),transparent)"></div>`);

        return `<div class="chorus-tarot__ink chorus-tarot__ink--reversed" style="height:${inf}%">
            <div class="chorus-tarot__ink-body" style="background:linear-gradient(to bottom,rgba(${r},${g},${b},0.7) 0%,rgba(${r},${g},${b},0.4) 60%,rgba(${r},${g},${b},0.15) 100%)"></div>
            <svg class="chorus-tarot__ink-wave chorus-tarot__ink-wave--reversed" viewBox="0 0 200 30" preserveAspectRatio="none">
                <defs><filter id="ib-${voice.id}"><feGaussianBlur stdDeviation="3"/></filter></defs>
                <path d="M0,0 Q25,${20 - Math.sin(inf * 0.1) * 8} 50,${12 - Math.cos(inf * 0.05) * 6} T100,${15 - Math.sin(inf * 0.08) * 5} T150,${10 - Math.cos(inf * 0.12) * 7} T200,0 L200,0 L0,0 Z" fill="rgba(${r},${g},${b},0.6)" filter="url(#ib-${voice.id})"/>
                <path d="M0,0 Q30,${16 - Math.cos(inf * 0.07) * 5} 60,${10 - Math.sin(inf * 0.09) * 4} T120,${14 - Math.cos(inf * 0.06) * 6} T180,${8 - Math.sin(inf * 0.11) * 3} T200,0 L200,0 L0,0 Z" fill="rgba(${r},${g},${b},0.4)"/>
            </svg>
            ${tendrils.join('')}
        </div>`;
    }

    // Normal: ink rises from bottom
    const tendrils = [];
    if (inf > 40) tendrils.push(`<div class="chorus-tarot__ink-tendril" style="top:-20px;left:20%;height:16px;background:linear-gradient(to top,rgba(${r},${g},${b},0.4),transparent)"></div>`);
    if (inf > 60) tendrils.push(`<div class="chorus-tarot__ink-tendril" style="top:-18px;left:65%;width:3px;height:20px;background:linear-gradient(to top,rgba(${r},${g},${b},0.3),transparent)"></div>`);
    if (inf > 75) tendrils.push(`<div class="chorus-tarot__ink-tendril" style="top:-26px;left:45%;height:24px;background:linear-gradient(to top,rgba(${r},${g},${b},0.5),transparent)"></div>`);

    return `<div class="chorus-tarot__ink" style="height:${inf}%">
        <svg class="chorus-tarot__ink-wave" viewBox="0 0 200 30" preserveAspectRatio="none">
            <defs><filter id="ib-${voice.id}"><feGaussianBlur stdDeviation="3"/></filter></defs>
            <path d="M0,30 Q25,${10 + Math.sin(inf * 0.1) * 8} 50,${18 + Math.cos(inf * 0.05) * 6} T100,${15 + Math.sin(inf * 0.08) * 5} T150,${20 + Math.cos(inf * 0.12) * 7} T200,30 L200,30 L0,30 Z" fill="rgba(${r},${g},${b},0.6)" filter="url(#ib-${voice.id})"/>
            <path d="M0,30 Q30,${14 + Math.cos(inf * 0.07) * 5} 60,${20 + Math.sin(inf * 0.09) * 4} T120,${16 + Math.cos(inf * 0.06) * 6} T180,${22 + Math.sin(inf * 0.11) * 3} T200,30 L200,30 L0,30 Z" fill="rgba(${r},${g},${b},0.4)"/>
        </svg>
        <div class="chorus-tarot__ink-body" style="background:linear-gradient(to top,rgba(${r},${g},${b},0.7) 0%,rgba(${r},${g},${b},0.4) 60%,rgba(${r},${g},${b},0.15) 100%)"></div>
        ${tendrils.join('')}
    </div>`;
}

// =============================================================================
// TAROT CARD HTML
// =============================================================================

function buildTarotCard(voice) {
    const arc = getArcana(voice.arcana);
    const isDead = voice.state === 'dead';
    const isReversed = !!voice.reversed;
    const hasDM = !isDead && voice.pendingDM !== null && voice.pendingDM !== undefined;
    const inf = voice.influence || 0;

    // Border intensity scales with influence
    const borderAlpha = isDead ? 0.1 : Math.max(0.15, inf / 150);
    const glowIntensity = isDead ? 0 : Math.max(0, (inf - 20) / 100);
    const glowSpread = Math.round(5 + glowIntensity * 20);
    const glowAlpha = (glowIntensity * 0.5).toFixed(2);
    const insetAlpha = (glowIntensity * 0.3).toFixed(2);

    const borderStyle = `1px solid ${isDead ? 'rgba(85,85,85,0.15)' : arc.color + Math.round(borderAlpha * 255).toString(16).padStart(2, '0')}`;
    const shadow = isDead
        ? '0 0 5px rgba(0,0,0,0.5)'
        : `0 0 ${glowSpread}px ${arc.glow.replace(/[\d.]+\)$/, glowAlpha + ')')}, inset 0 0 ${Math.round(glowSpread * 0.6)}px ${arc.glow.replace(/[\d.]+\)$/, insetAlpha + ')')}`;

    const pulse = voice.state === 'agitated'
        ? `<div class="chorus-tarot__pulse" style="border-color:${arc.glow}"></div>` : '';
    const dmBadge = hasDM
        ? `<div class="chorus-tarot__dm-badge" style="background:${arc.glow};box-shadow:0 0 8px ${arc.glow}">✦</div>` : '';
    const deadClass = isDead ? ' chorus-tarot--dead' : '';
    const reversedClass = isReversed ? ' chorus-tarot--reversed' : '';

    // Reversed label treatment
    const reversedIndicator = isReversed
        ? `<div class="chorus-tarot__reversed-mark">⟲ REVERSED</div>` : '';

    // Birth type badge
    const birthTypeBadge = voice.birthType === 'accumulation'
        ? `<div class="chorus-tarot__birth-type">⧖ PATTERN</div>`
        : voice.birthType === 'merge'
            ? `<div class="chorus-tarot__birth-type">⧉ MERGED</div>`
            : '';

    return `<div class="chorus-tarot${deadClass}${reversedClass}" id="chorus-card-${voice.id}" data-voice-id="${voice.id}">
        <div class="chorus-tarot__inner">
            <!-- FRONT -->
            <div class="chorus-tarot__face chorus-tarot__front" style="border:${borderStyle};box-shadow:${shadow}">
                <div class="chorus-tarot__frame-outer"></div>
                <div class="chorus-tarot__frame-inner"></div>
                <div class="chorus-tarot__art"><canvas id="chorus-canvas-${voice.id}"></canvas></div>
                <div class="chorus-tarot__arcana-label">${arc.label}</div>
                ${reversedIndicator}
                <div class="chorus-tarot__name" style="text-shadow:0 0 10px ${arc.glow}44">${voice.name}</div>
                <div class="chorus-tarot__state-badge">
                    <span class="chorus-tarot__badge chorus-tarot__badge--${voice.state || 'active'}">${(voice.state || 'active').toUpperCase()}</span>
                </div>
                <div class="chorus-tarot__influence-label">${isDead ? 'SILENCED' : `INFLUENCE ${voice.influence}%`}</div>
                ${buildInkBleed(voice, arc)}
                <div class="chorus-tarot__scanlines"></div>
                ${pulse}
                ${dmBadge}
                ${birthTypeBadge}
            </div>
            <!-- BACK -->
            <div class="chorus-tarot__face chorus-tarot__back" style="border:1px solid rgba(201,168,76,0.2);box-shadow:${shadow}">
                <div class="chorus-tarot__back-content">
                    <div class="chorus-tarot__back-name">${voice.name}${isReversed ? ' ⟲' : ''}</div>
                    <div class="chorus-tarot__back-arcana">${arc.label}${isReversed ? ' (REVERSED)' : ''}</div>
                    <div class="chorus-tarot__back-divider"></div>
                    <div class="chorus-tarot__back-personality">${voice.personality}</div>
                    <div class="chorus-tarot__back-divider"></div>
                    <div class="chorus-tarot__back-label">BIRTH MEMORY</div>
                    <div class="chorus-tarot__back-memory">${voice.birthMoment}</div>
                    ${!isDead ? `
                        <div class="chorus-tarot__back-buttons">
                            <button class="chorus-tarot__btn chorus-tarot__btn--talk">TALK</button>
                            <button class="chorus-tarot__btn chorus-tarot__btn--dissolve">DISSOLVE</button>
                        </div>
                    ` : ''}
                </div>
                <div class="chorus-tarot__scanlines"></div>
            </div>
        </div>
    </div>`;
}

// =============================================================================
// CANVAS GENERATIVE ART — Unique visual thumbprints per voice
// =============================================================================

// Seeded PRNG for deterministic art per voice
function seededRng(seed) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}

function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

/**
 * Get RGB color modified by voice relationship (mood).
 * Warmer relationships → brighter, more saturated
 * Colder/hostile → darker, desaturated
 * Obsessed/manic → oversaturated, high contrast
 */
function getMoodColor(r, g, b, relationship) {
    const mods = {
        devoted:     { brightness: 1.3,  saturation: 1.2  },
        warm:        { brightness: 1.15, saturation: 1.1  },
        curious:     { brightness: 1.05, saturation: 1.05 },
        neutral:     { brightness: 1.0,  saturation: 1.0  },
        indifferent: { brightness: 0.7,  saturation: 0.6  },
        resentful:   { brightness: 0.8,  saturation: 0.8  },
        hostile:     { brightness: 0.65, saturation: 0.7  },
        obsessed:    { brightness: 1.2,  saturation: 1.4  },
        manic:       { brightness: 1.35, saturation: 1.5  },
        grieving:    { brightness: 0.6,  saturation: 0.5  },
    };
    const mod = mods[relationship] || mods.neutral;

    // Convert to HSL-ish manipulation via brightness/saturation
    const avg = (r + g + b) / 3;
    const nr = Math.min(255, Math.round((r + (r - avg) * (mod.saturation - 1)) * mod.brightness));
    const ng = Math.min(255, Math.round((g + (g - avg) * (mod.saturation - 1)) * mod.brightness));
    const nb = Math.min(255, Math.round((b + (b - avg) * (mod.saturation - 1)) * mod.brightness));
    return { r: Math.max(0, nr), g: Math.max(0, ng), b: Math.max(0, nb) };
}

// --- Shape Layer Drawing Functions ---

/** Sigil: polygon inscribed in circle with radial lines */
function drawSigil(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const sides = 3 + Math.floor(rng() * 5);     // 3-7 sides
    const radius = 26 + rng() * 12;
    const outerR = 44 + rng() * 8;
    const rotation = rng() * Math.PI * 2;

    // Outer circle
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.25 + intensity * 0.2})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR + Math.sin(time) * 2 * intensity, 0, Math.PI * 2);
    ctx.stroke();

    // Inner polygon
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + intensity * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
        const a = (i / sides) * Math.PI * 2 + rotation + time * 0.4;
        const rad = radius + Math.sin(time + i * 0.7) * 4 * intensity;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Radial lines from center to polygon vertices
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 + rotation + time * 0.2;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.15 + intensity * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
        ctx.stroke();
    }
}

/** Constellation: scattered points connected by thin lines */
function drawConstellation(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const count = 6 + Math.floor(rng() * 8);
    const stars = [];
    for (let i = 0; i < count; i++) {
        const angle = rng() * Math.PI * 2;
        const dist = 12 + rng() * 38;
        stars.push({
            x: cx + Math.cos(angle) * dist + Math.sin(time * 0.5 + i) * 2 * intensity,
            y: cy + Math.sin(angle) * dist + Math.cos(time * 0.5 + i) * 2 * intensity,
            size: 1.5 + rng() * 2.5,
            bright: 0.3 + rng() * 0.5,
        });
    }

    // Connection lines (nearest neighbor style)
    ctx.lineWidth = 0.5;
    for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        // Connect to 1-2 nearest
        const connections = Math.floor(rng() * 2) + 1;
        for (let c = 0; c < connections && c + i + 1 < stars.length; c++) {
            const t = stars[(i + c + 1) % stars.length];
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.1 + intensity * 0.15})`;
            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
        }
    }

    // Star dots
    for (const s of stars) {
        const flicker = 0.7 + Math.sin(time * 3 + s.x) * 0.3 * intensity;
        ctx.fillStyle = `rgba(${r},${g},${b},${s.bright * flicker})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Ripple: concentric circles emanating from center */
function drawRipple(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const rings = 3 + Math.floor(rng() * 4);
    const baseSpacing = 10 + rng() * 6;
    const offset = rng() * 20;

    for (let i = 0; i < rings; i++) {
        const radius = offset + (i + 1) * baseSpacing + Math.sin(time * 0.8 + i * 1.2) * 3 * intensity;
        const alpha = (0.4 - i * 0.06) + intensity * 0.2;
        ctx.strokeStyle = `rgba(${r},${g},${b},${Math.max(0.05, alpha)})`;
        ctx.lineWidth = 1.5 - i * 0.15;
        ctx.beginPath();
        // Slightly irregular circles
        for (let a = 0; a <= 64; a++) {
            const angle = (a / 64) * Math.PI * 2;
            const wobble = Math.sin(angle * 3 + time + i) * 2 * intensity;
            const x = cx + Math.cos(angle) * (radius + wobble);
            const y = cy + Math.sin(angle) * (radius + wobble);
            a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }
}

/** Lattice: grid pattern with nodes and connecting lines */
function drawLattice(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const cols = 3 + Math.floor(rng() * 3);
    const rows = 3 + Math.floor(rng() * 3);
    const spacing = 16 + rng() * 6;
    const angleOffset = rng() * 0.5 - 0.25;  // Slight rotation

    const nodes = [];
    const startX = cx - (cols - 1) * spacing / 2;
    const startY = cy - (rows - 1) * spacing / 2;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const bx = startX + col * spacing;
            const by = startY + row * spacing;
            // Rotate around center
            const dx = bx - cx, dy = by - cy;
            const x = cx + dx * Math.cos(angleOffset) - dy * Math.sin(angleOffset);
            const y = cy + dx * Math.sin(angleOffset) + dy * Math.cos(angleOffset);
            // Breathing motion
            const mx = x + Math.sin(time * 0.6 + col + row) * 3 * intensity;
            const my = y + Math.cos(time * 0.6 + col * 2) * 3 * intensity;
            nodes.push({ x: mx, y: my, col, row });
        }
    }

    // Connections
    ctx.lineWidth = 0.7;
    for (const n of nodes) {
        const right = nodes.find(o => o.col === n.col + 1 && o.row === n.row);
        const down = nodes.find(o => o.col === n.col && o.row === n.row + 1);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.15 + intensity * 0.15})`;
        if (right) { ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(right.x, right.y); ctx.stroke(); }
        if (down) { ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(down.x, down.y); ctx.stroke(); }
    }

    // Nodes
    for (const n of nodes) {
        const pulse = 0.6 + Math.sin(time * 2 + n.col + n.row * 3) * 0.3 * intensity;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.3 * pulse + intensity * 0.3})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2 + intensity * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Spiral: golden spiral or nautilus */
function drawSpiral(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const turns = 2 + rng() * 3;
    const direction = rng() > 0.5 ? 1 : -1;
    const growth = 1.5 + rng() * 1.5;
    const startAngle = rng() * Math.PI * 2;

    ctx.strokeStyle = `rgba(${r},${g},${b},${0.35 + intensity * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const steps = 120;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = startAngle + t * turns * Math.PI * 2 * direction + time * 0.3;
        const radius = 4 + t * 42 * (growth / 2.5);
        const wobble = Math.sin(t * 10 + time) * 2 * intensity;
        const x = cx + Math.cos(angle) * (radius + wobble);
        const y = cy + Math.sin(angle) * (radius + wobble);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Accent dots along spiral
    for (let i = 0; i < 5; i++) {
        const t = (i + 1) / 6;
        const angle = startAngle + t * turns * Math.PI * 2 * direction + time * 0.3;
        const radius = 4 + t * 42 * (growth / 2.5);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.4 + intensity * 0.3})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + intensity, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Orbit: elliptical paths around center */
function drawOrbit(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const orbits = 2 + Math.floor(rng() * 3);

    for (let i = 0; i < orbits; i++) {
        const rx = 20 + rng() * 30;
        const ry = 12 + rng() * 24;
        const tilt = rng() * Math.PI;
        const speed = (0.3 + rng() * 0.4) * (rng() > 0.5 ? 1 : -1);

        // Orbit path
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.12 + intensity * 0.12})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let a = 0; a <= 64; a++) {
            const angle = (a / 64) * Math.PI * 2;
            const ox = Math.cos(angle) * rx;
            const oy = Math.sin(angle) * ry;
            const x = cx + ox * Math.cos(tilt) - oy * Math.sin(tilt);
            const y = cy + ox * Math.sin(tilt) + oy * Math.cos(tilt);
            a === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Orbiting body
        const bodyAngle = time * speed + i * 2;
        const bx = Math.cos(bodyAngle) * rx;
        const by = Math.sin(bodyAngle) * ry;
        const x = cx + bx * Math.cos(tilt) - by * Math.sin(tilt);
        const y = cy + bx * Math.sin(tilt) + by * Math.cos(tilt);
        ctx.fillStyle = `rgba(${r},${g},${b},${0.5 + intensity * 0.4})`;
        ctx.beginPath();
        ctx.arc(x, y, 2.5 + intensity * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Rune: angular intersecting lines, norse/symbolic */
function drawRune(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const lines = 3 + Math.floor(rng() * 4);
    const segments = [];

    // Generate angular line segments
    for (let i = 0; i < lines; i++) {
        const angle = rng() * Math.PI;
        const len = 20 + rng() * 30;
        const offX = (rng() - 0.5) * 20;
        const offY = (rng() - 0.5) * 20;
        segments.push({
            x1: cx + offX - Math.cos(angle) * len / 2,
            y1: cy + offY - Math.sin(angle) * len / 2,
            x2: cx + offX + Math.cos(angle) * len / 2,
            y2: cy + offY + Math.sin(angle) * len / 2,
        });
    }

    // Draw with slight breathing
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        const breathe = Math.sin(time * 0.5 + i) * 2 * intensity;
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + intensity * 0.3})`;
        ctx.beginPath();
        ctx.moveTo(s.x1 + breathe, s.y1);
        ctx.lineTo(s.x2 - breathe, s.y2);
        ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Intersection accents
    for (let i = 0; i < segments.length - 1; i++) {
        const mid = {
            x: (segments[i].x1 + segments[i].x2) / 2,
            y: (segments[i].y1 + segments[i].y2) / 2,
        };
        ctx.fillStyle = `rgba(${r},${g},${b},${0.4 + intensity * 0.3})`;
        ctx.beginPath();
        ctx.arc(mid.x, mid.y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Bloom: petal/flower pattern, organic */
function drawBloom(ctx, cx, cy, r, g, b, intensity, time, rng) {
    const petals = 4 + Math.floor(rng() * 5);
    const petalLen = 18 + rng() * 18;
    const petalWidth = 6 + rng() * 8;
    const rotation = rng() * Math.PI * 2 + time * 0.2;

    for (let i = 0; i < petals; i++) {
        const angle = rotation + (i / petals) * Math.PI * 2;
        const breathe = 1 + Math.sin(time * 0.8 + i) * 0.15 * intensity;
        const tipX = cx + Math.cos(angle) * petalLen * breathe;
        const tipY = cy + Math.sin(angle) * petalLen * breathe;

        // Petal as quadratic curve
        const perpAngle = angle + Math.PI / 2;
        const cpDist = petalWidth * breathe;

        ctx.strokeStyle = `rgba(${r},${g},${b},${0.25 + intensity * 0.25})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(
            cx + Math.cos(angle) * petalLen * 0.5 + Math.cos(perpAngle) * cpDist,
            cy + Math.sin(angle) * petalLen * 0.5 + Math.sin(perpAngle) * cpDist,
            tipX, tipY
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(
            cx + Math.cos(angle) * petalLen * 0.5 - Math.cos(perpAngle) * cpDist,
            cy + Math.sin(angle) * petalLen * 0.5 - Math.sin(perpAngle) * cpDist,
            tipX, tipY
        );
        ctx.stroke();

        // Petal tip dot
        ctx.fillStyle = `rgba(${r},${g},${b},${0.35 + intensity * 0.3})`;
        ctx.beginPath();
        ctx.arc(tipX, tipY, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Shape family registry
const SHAPE_FAMILIES = [drawSigil, drawConstellation, drawRipple, drawLattice, drawSpiral, drawOrbit, drawRune, drawBloom];

function initCardCanvas(canvasId, voice) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = 150;
    const h = canvas.height = 148;
    const arc = getArcana(voice.arcana);
    const baseColor = hexToRgb(arc.color);

    // Mood-shifted color based on relationship
    const { r, g, b } = getMoodColor(baseColor.r, baseColor.g, baseColor.b, voice.relationship || 'neutral');

    let frame = 0;
    let running = true;

    // Deterministic seed from voice identity
    const hash = hashString(voice.id + voice.name + (voice.arcana || ''));
    const rng1 = seededRng(hash);
    const rng2 = seededRng(hash * 7 + 13);
    const rng3 = seededRng(hash * 31 + 97);

    // Pick 2-3 shape layers (unique combination per voice)
    const layerCount = 2 + (hash % 2);                         // 2 or 3 layers
    const primaryIdx = hash % SHAPE_FAMILIES.length;
    const secondaryIdx = (hash * 3 + 7) % SHAPE_FAMILIES.length;
    const tertiaryIdx = (hash * 11 + 23) % SHAPE_FAMILIES.length;

    // Ensure at least primary and secondary differ
    const layers = [primaryIdx];
    if (secondaryIdx !== primaryIdx) layers.push(secondaryIdx);
    else layers.push((primaryIdx + 1) % SHAPE_FAMILIES.length);
    if (layerCount > 2) {
        if (tertiaryIdx !== layers[0] && tertiaryIdx !== layers[1]) layers.push(tertiaryIdx);
        else layers.push((layers[1] + 2) % SHAPE_FAMILIES.length);
    }

    // Pre-generate RNG seeds for each layer (so art is stable across frames)
    const layerRngs = layers.map((_, i) => seededRng(hash * (i + 1) * 17 + i * 53));

    function draw() {
        if (!running) return;
        frame++;

        const st = voice.state;
        const intensity = st === 'agitated' ? 0.8 : st === 'active' ? 0.4 : st === 'dead' ? 0.05 : 0.15;

        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2 - 5;
        const time = frame * 0.02;

        // Draw shape layers (each reseeds its own RNG per frame for stability)
        for (let i = 0; i < layers.length; i++) {
            const layerRng = seededRng(hash * (i + 1) * 17 + i * 53);
            const alpha = i === 0 ? 1.0 : (i === 1 ? 0.7 : 0.4);
            ctx.globalAlpha = alpha;
            SHAPE_FAMILIES[layers[i]](ctx, cx, cy, r, g, b, intensity, time, layerRng);
        }
        ctx.globalAlpha = 1.0;

        // Center dot (always present)
        ctx.fillStyle = `rgba(${r},${g},${b},${0.6 + intensity * 0.4})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5 + Math.sin(time * 2) * intensity * 2, 0, Math.PI * 2);
        ctx.fill();

        // Scanlines
        ctx.fillStyle = `rgba(0,0,0,${0.08 + intensity * 0.06})`;
        for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

        // Glitch slices
        if (st === 'agitated' || (st === 'active' && frame % 60 < 5)) {
            const count = st === 'agitated' ? 3 + Math.floor(Math.random() * 4) : 1;
            for (let i = 0; i < count; i++) {
                const sy = Math.random() * h;
                const sh = 2 + Math.random() * 8;
                const shift = (Math.random() - 0.5) * 12 * intensity;
                try {
                    const imgData = ctx.getImageData(0, sy, w, Math.min(sh, h - sy));
                    ctx.putImageData(imgData, shift, sy);
                } catch (e) { /* ignore */ }
            }
        }

        // Static noise
        const noiseAmt = st === 'agitated' ? 100 : st === 'active' ? 35 : 12;
        for (let i = 0; i < noiseAmt; i++) {
            const nx = Math.random() * w, ny = Math.random() * h;
            const br = Math.random() * 100 + 50;
            ctx.fillStyle = `rgba(${br},${br},${br + 30},${0.05 + intensity * 0.08})`;
            ctx.fillRect(nx, ny, 1, 1);
        }

        requestAnimationFrame(draw);
    }
    draw();

    return { stop: () => { running = false; } };
}

// =============================================================================
// DECK STATS
// =============================================================================

function updateDeckStats(voices) {
    const alive = voices.filter(v => v.state !== 'dead').length;
    const dead = voices.filter(v => v.state === 'dead').length;
    $('#chorus-stat-voices').text(alive);
    $('#chorus-stat-max').text(extensionSettings.maxVoices);
    $('#chorus-stat-deaths').text(dead);

    // Hide death counter when zero — looks weird on fresh chats
    const $deathStat = $('#chorus-stat-deaths').closest('.chorus-deck-stat');
    if (dead === 0) {
        $deathStat.css('opacity', '0.3');
    } else {
        $deathStat.css('opacity', '1');
    }
}

// =============================================================================
// RENDER DECK (export)
// =============================================================================

export function renderDeck() {
    cleanupCanvases();

    const voices = getVoices();
    const $spread = $('#chorus-card-spread');
    $spread.empty();

    // Separate living from dead
    const living = voices.filter(v => v.state !== 'dead');
    const dead = voices.filter(v => v.state === 'dead');

    // Sort living: agitated first, then active, then dormant
    const stateOrder = { agitated: 0, active: 1, dormant: 2 };
    living.sort((a, b) => (stateOrder[a.state] ?? 4) - (stateOrder[b.state] ?? 4));

    // Render living cards
    living.forEach(voice => {
        $spread.append(buildTarotCard(voice));
    });

    // Empty slots (only count living toward max)
    const emptySlots = Math.max(0, extensionSettings.maxVoices - living.length);
    for (let i = 0; i < emptySlots; i++) {
        $spread.append(`
            <div class="chorus-tarot--empty">
                <div class="chorus-empty-q">?</div>
                <div class="chorus-empty-label">AWAITING</div>
            </div>
        `);
    }

    // Graveyard section (dead cards, if any)
    if (dead.length > 0) {
        $spread.append(`
            <div class="chorus-graveyard">
                <div class="chorus-graveyard__label">⸸ GRAVEYARD ⸸</div>
                <div class="chorus-graveyard__subtitle">${dead.length} silenced</div>
            </div>
        `);
        dead.forEach(voice => {
            $spread.append(buildTarotCard(voice));
        });
    }

    // Card flips
    $spread.find('.chorus-tarot').on('click', function (e) {
        if ($(e.target).hasClass('chorus-tarot__btn')) return;
        $(this).toggleClass('flipped');
    });

    // TALK buttons
    $spread.find('.chorus-tarot__btn--talk').on('click', function (e) {
        e.stopPropagation();
        const voiceId = $(this).closest('.chorus-tarot').data('voice-id');
        openDirectory(voiceId);
    });

    // DISSOLVE buttons
    $spread.find('.chorus-tarot__btn--dissolve').on('click', async function (e) {
        e.stopPropagation();
        const voiceId = $(this).closest('.chorus-tarot').data('voice-id');
        const voice = getVoiceById(voiceId);
        if (!voice || voice.state === 'dead') return;

        // Play dissolution animation
        await playDissolution(voice, voice.resolution?.type || 'fade');

        // Kill the voice in state
        resolveVoice(voiceId, 'manual dissolution');
        saveChatState();

        // Re-render deck
        renderDeck();
    });

    // Canvases
    voices.forEach(voice => {
        const handle = initCardCanvas(`chorus-canvas-${voice.id}`, voice);
        if (handle) activeCanvases.push(handle);
    });

    updateDeckStats(voices);
}
