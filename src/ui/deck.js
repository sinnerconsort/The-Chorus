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

    if (isDead) {
        return `<div class="chorus-tarot__ink" style="height:100%">
            <div class="chorus-tarot__ink-body" style="background: rgba(30,25,35,0.8)"></div>
        </div>`;
    }

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
    const hasDM = !isDead && voice.pendingDM !== null && voice.pendingDM !== undefined;
    const borderStyle = voice.state === 'agitated'
        ? `1px solid ${arc.glow}66` : `1px solid rgba(201,168,76,0.2)`;
    const shadow = voice.state === 'agitated'
        ? `0 0 20px ${arc.glow}44, inset 0 0 15px ${arc.glow}22`
        : voice.state === 'active'
            ? `0 0 10px ${arc.glow}22`
            : `0 0 5px rgba(0,0,0,0.5)`;
    const pulse = voice.state === 'agitated'
        ? `<div class="chorus-tarot__pulse" style="border-color:${arc.glow}"></div>` : '';
    const dmBadge = hasDM
        ? `<div class="chorus-tarot__dm-badge" style="background:${arc.glow};box-shadow:0 0 8px ${arc.glow}">✦</div>` : '';
    const deadClass = isDead ? ' chorus-tarot--dead' : '';

    return `<div class="chorus-tarot${deadClass}" id="chorus-card-${voice.id}" data-voice-id="${voice.id}">
        <div class="chorus-tarot__inner">
            <!-- FRONT -->
            <div class="chorus-tarot__face chorus-tarot__front" style="border:${borderStyle};box-shadow:${shadow}">
                <div class="chorus-tarot__frame-outer"></div>
                <div class="chorus-tarot__frame-inner"></div>
                <div class="chorus-tarot__art"><canvas id="chorus-canvas-${voice.id}"></canvas></div>
                <div class="chorus-tarot__arcana-label">${arc.label}</div>
                <div class="chorus-tarot__name" style="text-shadow:0 0 10px ${arc.glow}44">${voice.name}</div>
                <div class="chorus-tarot__state-badge">
                    <span class="chorus-tarot__badge chorus-tarot__badge--${voice.state || 'active'}">${(voice.state || 'active').toUpperCase()}</span>
                </div>
                <div class="chorus-tarot__influence-label">${isDead ? 'SILENCED' : `INFLUENCE ${voice.influence}%`}</div>
                ${buildInkBleed(voice, arc)}
                <div class="chorus-tarot__scanlines"></div>
                ${pulse}
                ${dmBadge}
            </div>
            <!-- BACK -->
            <div class="chorus-tarot__face chorus-tarot__back" style="border:1px solid rgba(201,168,76,0.2);box-shadow:${shadow}">
                <div class="chorus-tarot__back-content">
                    <div class="chorus-tarot__back-name">${voice.name}</div>
                    <div class="chorus-tarot__back-arcana">${arc.label}</div>
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
// CANVAS GENERATIVE ART
// =============================================================================

function initCardCanvas(canvasId, voice) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = 150;
    const h = canvas.height = 148;
    const arc = getArcana(voice.arcana);
    const { r, g, b } = hexToRgb(arc.color);
    let frame = 0;
    let running = true;

    // Seed from voice id for unique geometry
    let hash = 0;
    const seed = voice.id + voice.name;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }

    function draw() {
        if (!running) return;
        frame++;

        const st = voice.state;
        const intensity = st === 'agitated' ? 0.8 : st === 'active' ? 0.4 : st === 'dead' ? 0.05 : 0.15;

        ctx.fillStyle = '#0a0612';
        ctx.fillRect(0, 0, w, h);

        const cx = w / 2, cy = h / 2 - 5;
        const time = frame * 0.02;

        // Outer circle
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 + intensity * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 48 + Math.sin(time) * 3 * intensity, 0, Math.PI * 2);
        ctx.stroke();

        // Inner polygon
        const sides = 3 + (Math.abs(hash) % 5);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 + intensity * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= sides; i++) {
            const angle = (i / sides) * Math.PI * 2 + time * 0.5;
            const rad = 26 + Math.sin(time + i) * 5 * intensity;
            const x = cx + Math.cos(angle) * rad;
            const y = cy + Math.sin(angle) * rad;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        // Radial lines
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 + time * 0.3;
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.2 + intensity * 0.2})`;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(angle) * 48, cy + Math.sin(angle) * 48);
            ctx.stroke();
        }

        // Center dot
        ctx.fillStyle = `rgba(${r},${g},${b},${0.6 + intensity * 0.4})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 3 + Math.sin(time * 2) * intensity * 2, 0, Math.PI * 2);
        ctx.fill();

        // Canvas scanlines
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
}

// =============================================================================
// RENDER DECK (export)
// =============================================================================

export function renderDeck() {
    cleanupCanvases();

    const voices = getVoices();
    const $spread = $('#chorus-card-spread');
    $spread.empty();

    voices.forEach(voice => {
        $spread.append(buildTarotCard(voice));
    });

    // Empty slots
    const emptySlots = Math.max(0, extensionSettings.maxVoices - voices.length);
    for (let i = 0; i < emptySlots; i++) {
        $spread.append(`
            <div class="chorus-tarot--empty">
                <div class="chorus-empty-q">?</div>
                <div class="chorus-empty-label">AWAITING</div>
            </div>
        `);
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
