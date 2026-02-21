/**
 * THE CHORUS — Deck UI
 * Full tarot card rendering with animated arcana glyphs.
 */

import { getVoices, getArcana, hexToRgb, extensionSettings, getVoiceById, resolveVoice, saveChatState } from '../state.js';
import { openDirectory } from '../social/directory.js';
import { playDissolution } from './animations.js';

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

    const stateClass = voice.state ? ` chorus-tarot--${voice.state}` : '';

    return `<div class="chorus-tarot${deadClass}${reversedClass}${stateClass}" id="chorus-card-${voice.id}" data-voice-id="${voice.id}">
        <div class="chorus-tarot__inner">
            <!-- FRONT -->
            <div class="chorus-tarot__face chorus-tarot__front" style="border:${borderStyle};box-shadow:${shadow}">
                <div class="chorus-tarot__frame-outer"></div>
                <div class="chorus-tarot__frame-inner"></div>
                <div class="chorus-tarot__art">
                    <canvas class="chorus-tarot__sigil" id="sigil-${voice.id}" width="146" height="148"></canvas>
                    <div class="chorus-tarot__glyph" style="color:${arc.glow}">${arc.glyph}</div>
                </div>
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
// SIGIL CANVAS — Atmospheric ritual circle behind each glyph
// =============================================================================

const activeSigils = [];

function hashId(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h);
}

function initSigil(voice) {
    const canvas = document.getElementById(`sigil-${voice.id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const arc = getArcana(voice.arcana);
    const { r, g, b } = hexToRgb(arc.color);

    // Deterministic seed for this voice's pattern
    const seed = hashId(voice.id + voice.name);
    const rings = 2 + (seed % 3);           // 2-4 concentric rings
    const spokes = 4 + (seed % 5) * 2;      // 4, 6, 8, 10, or 12
    const innerPoly = 3 + (seed % 4);       // 3-6 sided inner polygon
    const hasOrbit = (seed % 3) !== 0;       // 2/3 chance of orbiting dot
    const rotDir = (seed % 2) ? 1 : -1;     // rotation direction

    let frame = 0;
    let running = true;

    function draw() {
        if (!running) return;
        frame++;
        const t = frame * 0.008;

        ctx.clearRect(0, 0, w, h);

        const baseAlpha = 0.4;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.15 * rotDir);

        // Concentric rings
        for (let i = 0; i < rings; i++) {
            const radius = 20 + i * 16;
            const alpha = baseAlpha * (1 - i * 0.2);
            ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Spokes from center to outer ring
        const outerR = 20 + (rings - 1) * 16;
        for (let i = 0; i < spokes; i++) {
            const a = (i / spokes) * Math.PI * 2;
            ctx.strokeStyle = `rgba(${r},${g},${b},${baseAlpha * 0.5})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
            ctx.stroke();
        }

        // Inner polygon (slowly counter-rotates)
        ctx.save();
        ctx.rotate(-t * 0.3 * rotDir);
        const polyR = 18 + (seed % 8);
        ctx.strokeStyle = `rgba(${r},${g},${b},${baseAlpha * 0.6})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = 0; i <= innerPoly; i++) {
            const a = (i / innerPoly) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(a) * polyR;
            const y = Math.sin(a) * polyR;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        // Orbiting dot
        if (hasOrbit) {
            const orbitR = outerR - 8;
            const orbitA = t * 0.5 * -rotDir;
            const ox = Math.cos(orbitA) * orbitR;
            const oy = Math.sin(orbitA) * orbitR;
            ctx.fillStyle = `rgba(${r},${g},${b},${baseAlpha * 0.8})`;
            ctx.beginPath();
            ctx.arc(ox, oy, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Center dot
        ctx.fillStyle = `rgba(${r},${g},${b},${baseAlpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        requestAnimationFrame(draw);
    }
    draw();

    activeSigils.push({ stop: () => { running = false; } });
}

function cleanupSigils() {
    activeSigils.forEach(s => s.stop());
    activeSigils.length = 0;
}

// No-op kept for backward compat
export function cleanupCanvases() { cleanupSigils(); }

// =============================================================================
// RENDER DECK (export)
// =============================================================================

export function renderDeck() {

    cleanupSigils();
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

    // Init atmospheric sigil canvases
    [...living, ...dead].forEach(voice => initSigil(voice));

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

    updateDeckStats(voices);
}
