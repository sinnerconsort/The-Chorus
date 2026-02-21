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
// CANVAS GENERATIVE ART — Bold arcana symbols, Persona-style
// =============================================================================

/**
 * Mood color: relationship shifts brightness/saturation of base arcana color.
 * Warm → brighter. Cold → darker. Obsessed → oversaturated.
 */
function getMoodColor(r, g, b, relationship) {
    const mods = {
        devoted:     { br: 1.3,  sat: 1.2  },
        warm:        { br: 1.15, sat: 1.1  },
        curious:     { br: 1.05, sat: 1.05 },
        neutral:     { br: 1.0,  sat: 1.0  },
        indifferent: { br: 0.7,  sat: 0.6  },
        resentful:   { br: 0.8,  sat: 0.8  },
        hostile:     { br: 0.65, sat: 0.7  },
        obsessed:    { br: 1.2,  sat: 1.4  },
        manic:       { br: 1.35, sat: 1.5  },
        grieving:    { br: 0.6,  sat: 0.5  },
    };
    const m = mods[relationship] || mods.neutral;
    const avg = (r + g + b) / 3;
    return {
        r: Math.max(0, Math.min(255, Math.round((r + (r - avg) * (m.sat - 1)) * m.br))),
        g: Math.max(0, Math.min(255, Math.round((g + (g - avg) * (m.sat - 1)) * m.br))),
        b: Math.max(0, Math.min(255, Math.round((b + (b - avg) * (m.sat - 1)) * m.br))),
    };
}

// --- Per-arcana symbol drawers ---
// Each receives (ctx, cx, cy, scale, time) where scale~1.0, time is slow clock.
// Draw FILLED, BOLD shapes. Canvas is 150×148.

const ARCANA_SYMBOLS = {

    // 0 — THE FOOL: circle with a gap (the leap)
    fool(ctx, cx, cy, s, t) {
        const r = 36 * s;
        const gapAngle = -Math.PI / 2;
        const gapSize = 0.5 + Math.sin(t) * 0.1;
        ctx.lineWidth = 5 * s;
        ctx.beginPath();
        ctx.arc(cx, cy, r, gapAngle + gapSize, gapAngle + Math.PI * 2 - gapSize);
        ctx.stroke();
        // Small circle "stepping" into the gap
        const dotAngle = gapAngle + Math.sin(t * 0.8) * 0.15;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(dotAngle) * (r + 10 * s), cy + Math.sin(dotAngle) * (r + 10 * s), 5 * s, 0, Math.PI * 2);
        ctx.fill();
    },

    // I — THE MAGICIAN: infinity / lemniscate
    magician(ctx, cx, cy, s, t) {
        ctx.lineWidth = 4.5 * s;
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
            const a = (i / 100) * Math.PI * 2;
            const scale = 32 * s;
            const x = cx + scale * Math.cos(a) / (1 + Math.sin(a) ** 2);
            const y = cy + scale * Math.sin(a) * Math.cos(a) / (1 + Math.sin(a) ** 2);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 4 * s, 0, Math.PI * 2);
        ctx.fill();
    },

    // II — HIGH PRIESTESS: crescent between two pillars
    priestess(ctx, cx, cy, s, t) {
        const pw = 6 * s, ph = 50 * s;
        // Pillars
        ctx.fillRect(cx - 28 * s, cy - ph / 2, pw, ph);
        ctx.fillRect(cx + 22 * s, cy - ph / 2, pw, ph);
        // Crescent moon between
        ctx.beginPath();
        ctx.arc(cx, cy, 16 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx + 8 * s, cy, 14 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    // III — THE EMPRESS: Venus symbol ♀
    empress(ctx, cx, cy, s, t) {
        const r = 22 * s;
        ctx.lineWidth = 5 * s;
        // Circle
        ctx.beginPath();
        ctx.arc(cx, cy - 8 * s, r, 0, Math.PI * 2);
        ctx.stroke();
        // Stem
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8 * s + r);
        ctx.lineTo(cx, cy + 30 * s);
        ctx.stroke();
        // Cross bar
        ctx.beginPath();
        ctx.moveTo(cx - 14 * s, cy + 18 * s);
        ctx.lineTo(cx + 14 * s, cy + 18 * s);
        ctx.stroke();
    },

    // IV — THE EMPEROR: angular crown
    emperor(ctx, cx, cy, s, t) {
        ctx.lineWidth = 2 * s;
        const w = 40 * s, h = 30 * s;
        // Crown shape — filled
        ctx.beginPath();
        ctx.moveTo(cx - w, cy + h * 0.3);
        ctx.lineTo(cx - w * 0.6, cy - h);
        ctx.lineTo(cx - w * 0.2, cy - h * 0.2);
        ctx.lineTo(cx, cy - h * 1.1);
        ctx.lineTo(cx + w * 0.2, cy - h * 0.2);
        ctx.lineTo(cx + w * 0.6, cy - h);
        ctx.lineTo(cx + w, cy + h * 0.3);
        ctx.closePath();
        ctx.fill();
        // Base bar
        ctx.fillRect(cx - w, cy + h * 0.3, w * 2, 8 * s);
    },

    // V — THE HIEROPHANT: triple cross / papal cross
    hierophant(ctx, cx, cy, s, t) {
        ctx.lineWidth = 5 * s;
        // Vertical
        ctx.beginPath();
        ctx.moveTo(cx, cy - 38 * s);
        ctx.lineTo(cx, cy + 38 * s);
        ctx.stroke();
        // Three horizontal bars (widening)
        const bars = [{ y: -26, w: 14 }, { y: -10, w: 20 }, { y: 8, w: 26 }];
        for (const b of bars) {
            ctx.beginPath();
            ctx.moveTo(cx - b.w * s, cy + b.y * s);
            ctx.lineTo(cx + b.w * s, cy + b.y * s);
            ctx.stroke();
        }
    },

    // VI — THE LOVERS: two overlapping circles
    lovers(ctx, cx, cy, s, t) {
        const r = 22 * s;
        const sep = 14 * s;
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.arc(cx - sep, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + sep, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Filled intersection hint
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(cx - sep, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + sep, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    },

    // VII — THE CHARIOT: bold upward arrow
    chariot(ctx, cx, cy, s, t) {
        ctx.beginPath();
        ctx.moveTo(cx, cy - 40 * s);
        ctx.lineTo(cx + 28 * s, cy + 5 * s);
        ctx.lineTo(cx + 12 * s, cy + 5 * s);
        ctx.lineTo(cx + 12 * s, cy + 36 * s);
        ctx.lineTo(cx - 12 * s, cy + 36 * s);
        ctx.lineTo(cx - 12 * s, cy + 5 * s);
        ctx.lineTo(cx - 28 * s, cy + 5 * s);
        ctx.closePath();
        ctx.fill();
    },

    // VIII — STRENGTH: infinity above a filled circle
    strength(ctx, cx, cy, s, t) {
        // Lemniscate on top
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
            const a = (i / 80) * Math.PI * 2;
            const sc = 20 * s;
            const x = cx + sc * Math.cos(a) / (1 + Math.sin(a) ** 2);
            const y = (cy - 16 * s) + sc * 0.6 * Math.sin(a) * Math.cos(a) / (1 + Math.sin(a) ** 2);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Solid circle below
        ctx.beginPath();
        ctx.arc(cx, cy + 18 * s, 18 * s, 0, Math.PI * 2);
        ctx.fill();
    },

    // IX — THE HERMIT: lantern (diamond on a line)
    hermit(ctx, cx, cy, s, t) {
        // Staff
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 10 * s);
        ctx.lineTo(cx, cy + 40 * s);
        ctx.stroke();
        // Lantern diamond
        const lcy = cy - 20 * s;
        const d = 18 * s;
        ctx.beginPath();
        ctx.moveTo(cx, lcy - d);
        ctx.lineTo(cx + d * 0.7, lcy);
        ctx.lineTo(cx, lcy + d);
        ctx.lineTo(cx - d * 0.7, lcy);
        ctx.closePath();
        ctx.fill();
    },

    // X — WHEEL OF FORTUNE: circle with spokes and inner ring
    wheel(ctx, cx, cy, s, t) {
        const r = 34 * s;
        ctx.lineWidth = 4 * s;
        // Outer ring
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Inner ring
        ctx.beginPath();
        ctx.arc(cx, cy, 14 * s, 0, Math.PI * 2);
        ctx.stroke();
        // 8 spokes
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + t * 0.3;
            ctx.lineWidth = 3 * s;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 14 * s, cy + Math.sin(a) * 14 * s);
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            ctx.stroke();
        }
    },

    // XI — JUSTICE: balanced scales
    justice(ctx, cx, cy, s, t) {
        ctx.lineWidth = 4 * s;
        // Beam
        ctx.beginPath();
        ctx.moveTo(cx - 34 * s, cy - 8 * s);
        ctx.lineTo(cx + 34 * s, cy - 8 * s);
        ctx.stroke();
        // Fulcrum triangle
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8 * s);
        ctx.lineTo(cx - 10 * s, cy + 20 * s);
        ctx.lineTo(cx + 10 * s, cy + 20 * s);
        ctx.closePath();
        ctx.fill();
        // Pans (arcs)
        ctx.lineWidth = 3.5 * s;
        ctx.beginPath();
        ctx.arc(cx - 28 * s, cy - 4 * s, 14 * s, 0, Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 28 * s, cy - 4 * s, 14 * s, 0, Math.PI);
        ctx.stroke();
    },

    // XII — HANGED MAN: inverted cross / ankh variant
    hanged(ctx, cx, cy, s, t) {
        // Inverted triangle
        ctx.beginPath();
        ctx.moveTo(cx, cy + 28 * s);
        ctx.lineTo(cx - 24 * s, cy - 16 * s);
        ctx.lineTo(cx + 24 * s, cy - 16 * s);
        ctx.closePath();
        ctx.fill();
        // Circle at top (the head)
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.arc(cx, cy - 28 * s, 12 * s, 0, Math.PI * 2);
        ctx.stroke();
        // Line connecting
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 16 * s);
        ctx.lineTo(cx, cy - 16 * s);
        ctx.stroke();
    },

    // XIII — DEATH: scythe blade
    death(ctx, cx, cy, s, t) {
        // Staff
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(cx + 5 * s, cy - 36 * s);
        ctx.lineTo(cx - 5 * s, cy + 36 * s);
        ctx.stroke();
        // Blade — curved filled shape
        ctx.beginPath();
        ctx.moveTo(cx + 5 * s, cy - 36 * s);
        ctx.quadraticCurveTo(cx + 40 * s, cy - 28 * s, cx + 34 * s, cy - 4 * s);
        ctx.quadraticCurveTo(cx + 24 * s, cy - 10 * s, cx + 2 * s, cy - 18 * s);
        ctx.closePath();
        ctx.fill();
    },

    // XIV — TEMPERANCE: two cups / hourglass
    temperance(ctx, cx, cy, s, t) {
        // Top triangle (inverted)
        ctx.beginPath();
        ctx.moveTo(cx - 24 * s, cy - 32 * s);
        ctx.lineTo(cx + 24 * s, cy - 32 * s);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();
        // Bottom triangle
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx - 24 * s, cy + 32 * s);
        ctx.lineTo(cx + 24 * s, cy + 32 * s);
        ctx.closePath();
        ctx.fill();
    },

    // XV — THE DEVIL: horns / inverted pentagram simplified
    devil(ctx, cx, cy, s, t) {
        // Two horns
        ctx.lineWidth = 5 * s;
        ctx.beginPath();
        ctx.moveTo(cx - 12 * s, cy + 20 * s);
        ctx.quadraticCurveTo(cx - 30 * s, cy - 20 * s, cx - 18 * s, cy - 38 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 12 * s, cy + 20 * s);
        ctx.quadraticCurveTo(cx + 30 * s, cy - 20 * s, cx + 18 * s, cy - 38 * s);
        ctx.stroke();
        // Filled circle between
        ctx.beginPath();
        ctx.arc(cx, cy + 10 * s, 16 * s, 0, Math.PI * 2);
        ctx.fill();
        // Horn tips
        ctx.beginPath();
        ctx.arc(cx - 18 * s, cy - 38 * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + 18 * s, cy - 38 * s, 4 * s, 0, Math.PI * 2);
        ctx.fill();
    },

    // XVI — THE TOWER: lightning bolt
    tower(ctx, cx, cy, s, t) {
        ctx.beginPath();
        ctx.moveTo(cx + 4 * s, cy - 40 * s);
        ctx.lineTo(cx - 14 * s, cy - 6 * s);
        ctx.lineTo(cx + 2 * s, cy - 6 * s);
        ctx.lineTo(cx - 10 * s, cy + 40 * s);
        ctx.lineTo(cx + 18 * s, cy + 4 * s);
        ctx.lineTo(cx + 2 * s, cy + 4 * s);
        ctx.lineTo(cx + 20 * s, cy - 40 * s);
        ctx.closePath();
        ctx.fill();
    },

    // XVII — THE STAR: 8-pointed star
    star(ctx, cx, cy, s, t) {
        const outer = 34 * s, inner = 14 * s;
        const points = 8;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            const r = i % 2 === 0 ? outer : inner;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    },

    // XVIII — THE MOON: bold crescent
    moon(ctx, cx, cy, s, t) {
        const r = 30 * s;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        // Cut out offset circle
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx + 16 * s, cy - 6 * s, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    },

    // XIX — THE SUN: circle with bold rays
    sun(ctx, cx, cy, s, t) {
        // Rays
        const rays = 12;
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2;
            const inner = 18 * s, outer = 36 * s;
            const spread = Math.PI / rays * 0.4;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a - spread) * inner, cy + Math.sin(a - spread) * inner);
            ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
            ctx.lineTo(cx + Math.cos(a + spread) * inner, cy + Math.sin(a + spread) * inner);
            ctx.closePath();
            ctx.fill();
        }
        // Center circle
        ctx.beginPath();
        ctx.arc(cx, cy, 18 * s, 0, Math.PI * 2);
        ctx.fill();
    },

    // XX — JUDGEMENT: trumpet / horn
    judgement(ctx, cx, cy, s, t) {
        // Bell of trumpet (widening to right)
        ctx.beginPath();
        ctx.moveTo(cx - 30 * s, cy - 4 * s);
        ctx.lineTo(cx + 16 * s, cy - 22 * s);
        ctx.quadraticCurveTo(cx + 38 * s, cy, cx + 16 * s, cy + 22 * s);
        ctx.lineTo(cx - 30 * s, cy + 4 * s);
        ctx.closePath();
        ctx.fill();
        // Mouthpiece
        ctx.beginPath();
        ctx.arc(cx - 32 * s, cy, 5 * s, 0, Math.PI * 2);
        ctx.fill();
    },

    // XXI — THE WORLD: circle with a cross inside
    world(ctx, cx, cy, s, t) {
        const r = 32 * s;
        ctx.lineWidth = 5 * s;
        // Outer circle
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Inner cross
        ctx.lineWidth = 4 * s;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r * 0.7);
        ctx.lineTo(cx, cy + r * 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.7, cy);
        ctx.lineTo(cx + r * 0.7, cy);
        ctx.stroke();
        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, 5 * s, 0, Math.PI * 2);
        ctx.fill();
    },
};

function initCardCanvas(canvasId, voice) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = 150;
    const h = canvas.height = 148;
    const arc = getArcana(voice.arcana);
    const baseColor = hexToRgb(arc.color);
    const { r, g, b } = getMoodColor(baseColor.r, baseColor.g, baseColor.b, voice.relationship || 'neutral');

    let frame = 0;
    let running = true;

    const drawSymbol = ARCANA_SYMBOLS[voice.arcana] || ARCANA_SYMBOLS.wheel;

    // Pre-generate floating particles (deterministic per voice)
    let seed = 0;
    for (let i = 0; i < (voice.id || '').length; i++) seed = ((seed << 5) - seed + voice.id.charCodeAt(i)) | 0;
    const particles = [];
    for (let i = 0; i < 12; i++) {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        particles.push({
            x: (seed >>> 0) % w,
            speed: 0.15 + ((seed >>> 8) % 100) / 400,
            drift: ((seed >>> 16) % 100 - 50) / 200,
            size: 0.8 + ((seed >>> 4) % 100) / 80,
            phase: ((seed >>> 12) % 628) / 100,
            y: h,
        });
    }

    function draw() {
        if (!running) return;
        frame++;

        const st = voice.state;
        const intensity = st === 'agitated' ? 0.8 : st === 'active' ? 0.4 : st === 'dead' ? 0.05 : 0.15;
        const time = frame * 0.015;

        // Clear
        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2;

        // --- Floating particles (rise slowly like embers) ---
        if (st !== 'dead') {
            const pAlpha = 0.15 + intensity * 0.25;
            for (const p of particles) {
                p.y -= p.speed * (1 + intensity);
                p.x += Math.sin(time * 2 + p.phase) * p.drift;
                if (p.y < -5) { p.y = h + 5; p.x = (p.x + 37) % w; }

                const fadeIn = Math.min(1, (h - p.y) / 30);
                const fadeOut = Math.min(1, p.y / 30);
                const alpha = pAlpha * fadeIn * fadeOut * (0.6 + Math.sin(time * 3 + p.phase) * 0.4);

                ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // --- Symbol with glow, drift, and breathing ---
        const breathe = 1.0 + Math.sin(time * 0.8) * 0.04 * (1 + intensity);
        // Lissajous drift
        const driftX = Math.sin(time * 0.3) * 2 * intensity;
        const driftY = Math.cos(time * 0.4) * 1.5 * intensity;
        // Pulsing glow (varies more dramatically)
        const glowPulse = 0.6 + Math.sin(time * 1.2) * 0.35;

        ctx.save();

        // Glow halo
        ctx.shadowColor = `rgba(${r},${g},${b},${(0.3 + intensity * 0.5) * glowPulse})`;
        ctx.shadowBlur = 14 + intensity * 22 + Math.sin(time * 1.5) * 6;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Color with slight alpha pulse
        const symAlpha = (0.55 + intensity * 0.35 + Math.sin(time * 1.2) * 0.08).toFixed(3);
        ctx.fillStyle = `rgba(${r},${g},${b},${symAlpha})`;
        ctx.strokeStyle = `rgba(${r},${g},${b},${(parseFloat(symAlpha) + 0.1).toFixed(3)})`;

        // Transform: drift + breathe
        ctx.translate(cx + driftX, cy + driftY);
        ctx.scale(breathe, breathe);
        ctx.translate(-(cx + driftX), -(cy + driftY));

        drawSymbol(ctx, cx + driftX, cy + driftY, 1.0, time);
        ctx.restore();

        // --- Ambient glow halo behind symbol (soft radial) ---
        if (st !== 'dead') {
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55 + intensity * 15);
            grad.addColorStop(0, `rgba(${r},${g},${b},${(0.06 + intensity * 0.08) * glowPulse})`);
            grad.addColorStop(0.5, `rgba(${r},${g},${b},${(0.02 + intensity * 0.03) * glowPulse})`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        }

        // --- Scanlines ---
        ctx.fillStyle = `rgba(0,0,0,${0.05 + intensity * 0.03})`;
        for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);

        // --- Glitch slices (agitated) ---
        if (st === 'agitated' && frame % 3 === 0) {
            const count = 2 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                const sy = Math.random() * h;
                const sh = 2 + Math.random() * 6;
                const shift = (Math.random() - 0.5) * 10;
                try {
                    const imgData = ctx.getImageData(0, sy, w, Math.min(sh, h - sy));
                    ctx.putImageData(imgData, shift, sy);
                } catch (_) {}
            }
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

    // Card flips (2D scaleX — stays in bounds)
    $spread.find('.chorus-tarot').on('click', function (e) {
        if ($(e.target).hasClass('chorus-tarot__btn')) return;
        const $card = $(this);
        if ($card.hasClass('flipping')) return; // mid-animation

        // Phase 1: squeeze to scaleX(0)
        $card.addClass('flipping');

        // Phase 2: at midpoint, swap face visibility and expand back
        $card.find('.chorus-tarot__inner').one('transitionend', function () {
            $card.toggleClass('flipped');
            $card.removeClass('flipping');
        });
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
