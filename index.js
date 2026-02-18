/**
 * THE CHORUS — SillyTavern Extension
 * Internal voices born from extreme moments, accumulated as tarot cards.
 *
 * NOTE: position:fixed breaks on mobile when ancestor elements have
 * CSS transforms (e.g. Moonlit Echoes theme). FAB and panel use
 * position:absolute on #sheld instead.
 */

import {
    getContext,
    renderExtensionTemplateAsync,
    extension_settings,
} from '../../../extensions.js';

import {
    eventSource,
    event_types,
    saveSettingsDebounced,
    chat_metadata,
    saveChatDebounced,
} from '../../../../script.js';

// =============================================================================
// CONSTANTS
// =============================================================================
const EXTENSION_NAME = 'third-party/The-Chorus';
const LOG_PREFIX = '[The Chorus]';

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================
const DEFAULT_SETTINGS = {
    enabled: true,
    settingsVersion: 1,

    // Voice engine
    connectionProfile: 'default',
    narratorPersona: 'sardonic',

    // Deck
    maxVoices: 7,
    autoEgoDeath: true,
    birthSensitivity: 3,

    // Readings
    autoDraw: true,
    drawFrequency: 3,
    defaultSpread: 'three',
    reversalChance: 15,

    // Influence
    influenceGainRate: 3,
    naturalDecay: false,

    // Hijack
    hijackEnabled: false,
    hijackMaxTier: 1,
};

// =============================================================================
// STATE
// =============================================================================
let extensionSettings = { ...DEFAULT_SETTINGS };
let panelOpen = false;

// =============================================================================
// ARCANA DEFINITIONS
// =============================================================================
const ARCANA = {
    fool:           { numeral: '0',     glyph: '☀', name: 'The Fool',           label: '0 — THE FOOL',           color: '#b8860b', glow: '#ffd700' },
    magician:       { numeral: 'I',     glyph: '✦', name: 'The Magician',       label: 'I — THE MAGICIAN',       color: '#6b2fa0', glow: '#bb66ff' },
    priestess:      { numeral: 'II',    glyph: '☽', name: 'The High Priestess', label: 'II — THE PRIESTESS',     color: '#2a4a7f', glow: '#4488cc' },
    empress:        { numeral: 'III',   glyph: '♕', name: 'The Empress',        label: 'III — THE EMPRESS',      color: '#2a6b3f', glow: '#44cc66' },
    emperor:        { numeral: 'IV',    glyph: '♔', name: 'The Emperor',        label: 'IV — THE EMPEROR',       color: '#8b5a2b', glow: '#cc8844' },
    hierophant:     { numeral: 'V',     glyph: '⚚', name: 'The Hierophant',     label: 'V — THE HIEROPHANT',     color: '#6b5b3a', glow: '#aa9966' },
    lovers:         { numeral: 'VI',    glyph: '❤', name: 'The Lovers',         label: 'VI — THE LOVERS',        color: '#6b2fa0', glow: '#bb66ff' },
    chariot:        { numeral: 'VII',   glyph: '⚔', name: 'The Chariot',        label: 'VII — THE CHARIOT',      color: '#8b7500', glow: '#ccaa44' },
    strength:       { numeral: 'VIII',  glyph: '∞', name: 'Strength',           label: 'VIII — STRENGTH',        color: '#8b5a2b', glow: '#dd8844' },
    hermit:         { numeral: 'IX',    glyph: '🏔', name: 'The Hermit',        label: 'IX — THE HERMIT',        color: '#2a4a7f', glow: '#4488cc' },
    wheel:          { numeral: 'X',     glyph: '☸', name: 'Wheel of Fortune',   label: 'X — WHEEL OF FORTUNE',   color: '#6b3fa0', glow: '#bb88cc' },
    justice:        { numeral: 'XI',    glyph: '⚖', name: 'Justice',            label: 'XI — JUSTICE',           color: '#3a5a7f', glow: '#88aacc' },
    hanged:         { numeral: 'XII',   glyph: '⚓', name: 'The Hanged Man',     label: 'XII — THE HANGED MAN',   color: '#2a4a6f', glow: '#6688aa' },
    death:          { numeral: 'XIII',  glyph: '✞', name: 'Death',              label: 'XIII — DEATH',           color: '#4a4a4a', glow: '#888888' },
    temperance:     { numeral: 'XIV',   glyph: '⚗', name: 'Temperance',         label: 'XIV — TEMPERANCE',       color: '#3a6b5a', glow: '#88bbaa' },
    devil:          { numeral: 'XV',    glyph: '⛧', name: 'The Devil',          label: 'XV — THE DEVIL',         color: '#8b1a1a', glow: '#cc4444' },
    tower:          { numeral: 'XVI',   glyph: '🗼', name: 'The Tower',          label: 'XVI — THE TOWER',        color: '#8b1a1a', glow: '#ff2244' },
    star:           { numeral: 'XVII',  glyph: '✧', name: 'The Star',           label: 'XVII — THE STAR',        color: '#4a6a8f', glow: '#aaccee' },
    moon:           { numeral: 'XVIII', glyph: '☾', name: 'The Moon',           label: 'XVIII — THE MOON',       color: '#5a3a7f', glow: '#9988bb' },
    sun:            { numeral: 'XIX',   glyph: '☀', name: 'The Sun',            label: 'XIX — THE SUN',          color: '#8b7500', glow: '#eebb44' },
    judgement:      { numeral: 'XX',    glyph: '♆', name: 'Judgement',           label: 'XX — JUDGEMENT',         color: '#7f3a5a', glow: '#cc88aa' },
    world:          { numeral: 'XXI',   glyph: '⊕', name: 'The World',          label: 'XXI — THE WORLD',        color: '#3a6b5a', glow: '#88ccaa' },
};

// =============================================================================
// DEMO VOICES (replaced by real data later)
// =============================================================================
const DEMO_VOICES = [
    {
        id: 'voice_001',
        name: 'The Wounded',
        arcana: 'tower',
        personality: 'Bitter and sharp. Speaks in short, cutting sentences. References the moment of betrayal constantly, like picking a scab. Sees hurt everywhere, even where there is none.',
        speakingStyle: 'Clipped. Raw. Honest to the point of cruelty.',
        birthMoment: 'When she revealed she never loved you. The exact instant the words landed.',
        influence: 72,
        state: 'agitated',
        relationship: 'resentful',
        influenceTriggers: {
            raises: ['emotional pain', 'rejection', 'loneliness', 'betrayal'],
            lowers: ['connection', 'healing', 'being heard', 'forgiveness'],
        },
    },
    {
        id: 'voice_002',
        name: 'The Charming',
        arcana: 'lovers',
        personality: 'Warm, persuasive, dangerously smooth. Born from who you pretend to be at parties. Knows exactly what people want to hear and says it without thinking.',
        speakingStyle: 'Velvet. Confident. Always a half-smile behind the words.',
        birthMoment: 'The first time you walked into a room and everyone turned to look.',
        influence: 45,
        state: 'active',
        relationship: 'curious',
        influenceTriggers: {
            raises: ['flirting', 'social pressure', 'desire', 'performance'],
            lowers: ['solitude', 'honesty', 'vulnerability'],
        },
    },
    {
        id: 'voice_003',
        name: 'The Reckless',
        arcana: 'fool',
        personality: 'Manic and alive. Speaks in run-on sentences and half-finished thoughts. Chases the next thrill, the next danger, the next beautiful mistake.',
        speakingStyle: 'Breathless. Excited. Dangerously enthusiastic.',
        birthMoment: 'Standing on the ledge of the rooftop, not because you wanted to fall — because you wanted to feel what almost-falling felt like.',
        influence: 58,
        state: 'active',
        relationship: 'manic',
        influenceTriggers: {
            raises: ['danger', 'adrenaline', 'impulsivity', 'thrill'],
            lowers: ['caution', 'routine', 'planning', 'consequences'],
        },
    },
    {
        id: 'voice_004',
        name: 'The Hollow',
        arcana: 'moon',
        personality: 'Quiet. Watches everything from behind a veil. Speaks in questions and half-truths. Never quite sure what is real and what is performance.',
        speakingStyle: 'Whispered. Uncertain. Every statement ends like a question.',
        birthMoment: 'The night you caught your own reflection and didn\'t recognize the person staring back.',
        influence: 18,
        state: 'dormant',
        relationship: 'grieving',
        influenceTriggers: {
            raises: ['deception', 'paranoia', 'gaslighting', 'confusion'],
            lowers: ['clarity', 'truth', 'trust', 'certainty'],
        },
    },
    {
        id: 'voice_005',
        name: 'The Ember',
        arcana: 'star',
        personality: 'Was once hope itself. Believed in second chances, in dawn after darkness. Spoke like a prayer. Now silent.',
        speakingStyle: '',
        birthMoment: 'After the fire. When you crawled out of the wreckage and the sky was full of stars and you thought: I survived.',
        influence: 0,
        state: 'dead',
        relationship: 'indifferent',
        influenceTriggers: {
            raises: ['hope', 'recovery', 'resilience'],
            lowers: ['despair', 'giving up'],
        },
    },
];

// =============================================================================
// SETTINGS MANAGEMENT
// =============================================================================

function loadSettings() {
    const saved = extension_settings[EXTENSION_NAME];
    if (saved) {
        Object.assign(extensionSettings, saved);
    }
    console.log(`${LOG_PREFIX} Settings loaded`);
}

function saveSettings() {
    extension_settings[EXTENSION_NAME] = extensionSettings;
    saveSettingsDebounced();
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the best container for UI elements.
 * #sheld avoids CSS transform issues that break position:fixed.
 */
function getContainer() {
    return $('#sheld').length ? $('#sheld') : $('body');
}

// =============================================================================
// DECK RENDERING — Full Tarot Cards
// =============================================================================

/** Track active canvases so we can stop them on re-render */
let activeCanvases = [];

function getVoices() {
    return DEMO_VOICES;
}

function getArcana(arcanaKey) {
    return ARCANA[arcanaKey] || { numeral: '?', glyph: '?', name: arcanaKey, label: '? — UNKNOWN', color: '#888', glow: '#888' };
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
}

/**
 * Generate ink bleed HTML with SVG wave edge and tendrils.
 */
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

/**
 * Build full tarot card HTML.
 */
function buildTarotCard(voice) {
    const arc = getArcana(voice.arcana);
    const isDead = voice.state === 'dead';
    const borderStyle = voice.state === 'agitated'
        ? `1px solid ${arc.glow}66` : `1px solid rgba(201,168,76,0.2)`;
    const shadow = voice.state === 'agitated'
        ? `0 0 20px ${arc.glow}44, inset 0 0 15px ${arc.glow}22`
        : voice.state === 'active'
            ? `0 0 10px ${arc.glow}22`
            : `0 0 5px rgba(0,0,0,0.5)`;
    const pulse = voice.state === 'agitated'
        ? `<div class="chorus-tarot__pulse" style="border-color:${arc.glow}"></div>` : '';
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
                    <span class="chorus-tarot__badge chorus-tarot__badge--${voice.state}">${voice.state.toUpperCase()}</span>
                </div>
                <div class="chorus-tarot__influence-label">${isDead ? 'SILENCED' : `INFLUENCE ${voice.influence}%`}</div>
                ${buildInkBleed(voice, arc)}
                <div class="chorus-tarot__scanlines"></div>
                ${pulse}
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

/**
 * Initialize canvas generative art for a voice card.
 */
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

        // Background
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

/**
 * Update deck stats counters.
 */
function updateDeckStats(voices) {
    const alive = voices.filter(v => v.state !== 'dead').length;
    const dead = voices.filter(v => v.state === 'dead').length;
    $('#chorus-stat-voices').text(alive);
    $('#chorus-stat-max').text(extensionSettings.maxVoices);
    $('#chorus-stat-deaths').text(dead);
}

/**
 * Full deck render.
 */
function renderDeck() {
    // Stop existing canvases
    activeCanvases.forEach(c => c.stop());
    activeCanvases = [];

    const voices = getVoices();
    const $spread = $('#chorus-card-spread');
    $spread.empty();

    // Render each voice as a full tarot card
    voices.forEach(voice => {
        $spread.append(buildTarotCard(voice));
    });

    // Add empty slots to fill up to max
    const emptySlots = Math.max(0, extensionSettings.maxVoices - voices.length);
    for (let i = 0; i < emptySlots; i++) {
        $spread.append(`
            <div class="chorus-tarot--empty">
                <div class="chorus-empty-q">?</div>
                <div class="chorus-empty-label">AWAITING</div>
            </div>
        `);
    }

    // Wire up card flips
    $spread.find('.chorus-tarot').on('click', function (e) {
        // Don't flip if they tapped a button
        if ($(e.target).hasClass('chorus-tarot__btn')) return;
        $(this).toggleClass('flipped');
    });

    // Wire up TALK buttons
    $spread.find('.chorus-tarot__btn--talk').on('click', function (e) {
        e.stopPropagation();
        const voiceId = $(this).closest('.chorus-tarot').data('voice-id');
        toastr.info(`Talk to voice: ${voiceId}`, 'The Chorus', { timeOut: 2000 });
        // TODO: Open 1-on-1 directory
    });

    // Wire up DISSOLVE buttons
    $spread.find('.chorus-tarot__btn--dissolve').on('click', function (e) {
        e.stopPropagation();
        const voiceId = $(this).closest('.chorus-tarot').data('voice-id');
        toastr.info(`Dissolve voice: ${voiceId}`, 'The Chorus', { timeOut: 2000 });
        // TODO: Trigger ego death
    });

    // Initialize canvases
    voices.forEach(voice => {
        const handle = initCardCanvas(`chorus-canvas-${voice.id}`, voice);
        if (handle) activeCanvases.push(handle);
    });

    // Update stats
    updateDeckStats(voices);
}

// =============================================================================
// READING TAB — Spreads, Escalation, Commentary
// =============================================================================

/** Spread position definitions */
const SPREAD_DEFS = {
    single: [
        { key: 'present', label: 'PRESENT' },
    ],
    three: [
        { key: 'situation', label: 'SITUATION' },
        { key: 'advice', label: 'ADVICE' },
        { key: 'outcome', label: 'OUTCOME' },
    ],
    cross: [
        { key: 'crown', label: 'CROWN' },
        { key: 'foundation', label: 'FOUNDATION' },
        { key: 'heart', label: 'HEART' },
        { key: 'crossing', label: 'CROSSING' },
        { key: 'outcome', label: 'OUTCOME' },
    ],
};

/** Position gravity — which positions each relationship state prefers */
const RELATIONSHIP_GRAVITY = {
    devoted:     ['heart', 'foundation', 'situation'],
    protective:  ['advice', 'crossing', 'situation'],
    warm:        ['heart', 'outcome', 'advice'],
    curious:     ['crown', 'outcome', 'present'],
    indifferent: ['foundation', 'present'],
    resentful:   ['crossing', 'outcome', 'situation'],
    hostile:     ['crossing', 'outcome', 'crown'],
    obsessed:    ['heart', 'crossing', 'present'],
    grieving:    ['foundation', 'heart', 'situation'],
    manic:       ['crown', 'outcome', 'present'],
};

/** Escalation levels */
const ESCALATION = {
    calm:     { label: 'CALM',     spread: 'single', fillPct: 15,  color: '#557755' },
    rising:   { label: 'RISING',   spread: 'single', fillPct: 40,  color: '#998844' },
    elevated: { label: 'ELEVATED', spread: 'three',  fillPct: 65,  color: '#bb7733' },
    crisis:   { label: 'CRISIS',   spread: 'cross',  fillPct: 100, color: '#cc4444' },
};

/** Current reading state */
let currentSpread = 'single';
let currentEscalation = 'calm';
let currentReading = null; // { spread, slots: [{position, voice, reversed}], commentary: [...] }

/** Demo commentary text per position (replaced by AI generation later) */
const DEMO_COMMENTARY = {
    present:    (v) => `${v.name} watches. "${getCommentaryByRelationship(v)}"`,
    situation:  (v) => `${v.name} reads the scene. "${getCommentaryByRelationship(v)}"`,
    advice:     (v) => `${v.name} leans in. "${getAdviceByRelationship(v)}"`,
    outcome:    (v) => `${v.name} sees what's coming. "${getOutcomeByRelationship(v)}"`,
    heart:      (v) => `${v.name} cuts to the core. "${getCommentaryByRelationship(v)}"`,
    crossing:   (v) => `${v.name} names the obstacle. "This. This is what stops you."`,
    foundation: (v) => `${v.name} digs into the past. "You know how we got here."`,
    crown:      (v) => `${v.name} reaches upward. "What do you actually want? Think about it."`,
};

function getCommentaryByRelationship(voice) {
    const lines = {
        devoted:     'I won\'t let you walk into this blind.',
        protective:  'Be careful. I\'ve seen this before.',
        warm:        'You\'ve got this. I believe that.',
        curious:     'Interesting. Let\'s see what you do.',
        indifferent: 'Sure. Whatever you think.',
        resentful:   'You did this. You know you did.',
        hostile:     'Go ahead. I hope it teaches you something.',
        obsessed:    'You can\'t shut me out. Not anymore.',
        grieving:    'We lost something here. Can you feel it?',
        manic:       'Oh this is HAPPENING and it\'s going to be INCREDIBLE.',
    };
    return lines[voice.relationship] || 'I\'m here.';
}

function getAdviceByRelationship(voice) {
    const lines = {
        devoted:     'Listen to me. Just this once, listen.',
        protective:  'Step back. Look at the whole picture.',
        warm:        'Follow your instinct. It\'s good.',
        curious:     'Try the unexpected. See what breaks.',
        indifferent: 'Do what you want. You will anyway.',
        resentful:   'Maybe try not repeating the same mistake.',
        hostile:     'My advice? Suffer. Learn something.',
        obsessed:    'Stay. Don\'t leave. Don\'t you dare leave.',
        grieving:    'Honor what was lost before moving forward.',
        manic:       'DO EVERYTHING. SLEEP LATER.',
    };
    return lines[voice.relationship] || 'Choose wisely.';
}

function getOutcomeByRelationship(voice) {
    const lines = {
        devoted:     'If you\'re careful, this ends well. I\'ll make sure of it.',
        protective:  'There\'s a cliff ahead. I can see it from here.',
        warm:        'Something good is forming. Give it time.',
        curious:     'I genuinely don\'t know. That excites me.',
        indifferent: 'It\'ll end however it ends.',
        resentful:   'You\'ll get exactly what you deserve.',
        hostile:     'This is going to hurt. Good.',
        obsessed:    'We end up together. That\'s the only outcome I accept.',
        grieving:    'More loss. But maybe a different kind.',
        manic:       'EVERYTHING CHANGES AND NOTHING IS THE SAME AND ISN\'T THAT BEAUTIFUL.',
    };
    return lines[voice.relationship] || 'The future is unclear.';
}

/**
 * Select voices for spread positions using influence + relationship gravity.
 * For cross spread, same voice can appear in multiple positions.
 */
function selectVoicesForSpread(spreadType) {
    const voices = getVoices().filter(v => v.state !== 'dead');
    const positions = SPREAD_DEFS[spreadType];
    const allowDuplicates = spreadType === 'cross';
    const slots = [];
    const usedIds = new Set();

    for (const pos of positions) {
        let best = null;
        let bestScore = -1;

        for (const voice of voices) {
            if (!allowDuplicates && usedIds.has(voice.id)) continue;

            let score = voice.influence;
            const gravity = RELATIONSHIP_GRAVITY[voice.relationship] || [];
            if (gravity.includes(pos.key)) {
                score += 30;
            }
            score += Math.random() * 15;

            if (score > bestScore) {
                bestScore = score;
                best = voice;
            }
        }

        if (best) {
            const reversed = Math.random() * 100 < (extensionSettings.reversalChance || 15);
            slots.push({ position: pos, voice: best, reversed });
            usedIds.add(best.id);
        }
    }

    return slots;
}

/**
 * Render empty slots for a spread type (before drawing).
 */
function renderEmptySpread(spreadType) {
    const $area = $('#chorus-spread-area');
    $area.empty();
    $area.removeClass('chorus-spread--single chorus-spread--three chorus-spread--cross');
    $area.addClass(`chorus-spread--${spreadType}`);

    SPREAD_DEFS[spreadType].forEach(pos => {
        const posClass = spreadType === 'cross' ? ` chorus-slot--${pos.key}` : '';
        $area.append(`
            <div class="chorus-slot${posClass}" data-position="${pos.key}">
                <div class="chorus-slot__empty">
                    <div class="chorus-slot__empty-glyph">?</div>
                </div>
                <div class="chorus-slot__label">${pos.label}</div>
            </div>
        `);
    });
}

/**
 * Build ink bleed for spread-size cards (simplified SVG version).
 */
function buildSpreadInkBleed(voice, arc) {
    const { r, g, b } = hexToRgb(arc.color);
    const inf = voice.influence;

    if (voice.state === 'dead') {
        return `<div class="chorus-spread-card__ink" style="height:100%">
            <div class="chorus-spread-card__ink-body" style="background:rgba(30,25,35,0.8)"></div>
        </div>`;
    }

    return `<div class="chorus-spread-card__ink" style="height:${inf}%">
        <svg class="chorus-spread-card__ink-wave" viewBox="0 0 100 20" preserveAspectRatio="none">
            <defs><filter id="sib-${voice.id}"><feGaussianBlur stdDeviation="2"/></filter></defs>
            <path d="M0,20 Q15,${8+Math.sin(inf*0.1)*5} 30,${14+Math.cos(inf*0.05)*4} T60,${12+Math.sin(inf*0.08)*3} T100,20 L100,20 L0,20 Z" fill="rgba(${r},${g},${b},0.5)" filter="url(#sib-${voice.id})"/>
            <path d="M0,20 Q20,${11+Math.cos(inf*0.07)*3} 40,${16+Math.sin(inf*0.09)*3} T80,${14+Math.cos(inf*0.06)*4} T100,20 L100,20 L0,20 Z" fill="rgba(${r},${g},${b},0.35)"/>
        </svg>
        <div class="chorus-spread-card__ink-body" style="background:linear-gradient(to top,rgba(${r},${g},${b},0.6) 0%,rgba(${r},${g},${b},0.3) 60%,rgba(${r},${g},${b},0.1) 100%)"></div>
    </div>`;
}

/**
 * Get relationship color for display.
 */
function getRelationshipColor(rel) {
    const colors = {
        devoted: '#88aacc', protective: '#7799aa', warm: '#88aa77',
        curious: '#aa9966', indifferent: '#666666', resentful: '#aa6644',
        hostile: '#cc4444', obsessed: '#aa44aa', grieving: '#7777aa',
        manic: '#ccaa33',
    };
    return colors[rel] || '#888888';
}

/**
 * Render a filled spread with proper tarot-style cards.
 */
function renderFilledSpread(reading) {
    const $area = $('#chorus-spread-area');
    $area.empty();
    $area.removeClass('chorus-spread--single chorus-spread--three chorus-spread--cross');
    $area.addClass(`chorus-spread--${reading.spread}`);

    reading.slots.forEach(slot => {
        const posClass = reading.spread === 'cross' ? ` chorus-slot--${slot.position.key}` : '';
        const arc = getArcana(slot.voice.arcana);
        const reversedClass = slot.reversed ? ' chorus-spread-card--reversed' : '';
        const stateClass = slot.voice.state === 'dormant' ? ' chorus-spread-card--dormant' : '';

        // Dynamic border/shadow based on state
        const borderStyle = slot.voice.state === 'agitated'
            ? `1px solid ${arc.glow}55` : `1px solid rgba(201,168,76,0.2)`;
        const shadow = slot.voice.state === 'agitated'
            ? `0 0 12px ${arc.glow}33, inset 0 0 8px ${arc.glow}15`
            : slot.voice.state === 'active'
                ? `0 0 6px ${arc.glow}18`
                : `0 0 5px rgba(0,0,0,0.5)`;
        const pulse = slot.voice.state === 'agitated'
            ? `<div class="chorus-spread-card__pulse" style="border-color:${arc.glow}"></div>` : '';
        const relColor = getRelationshipColor(slot.voice.relationship);

        $area.append(`
            <div class="chorus-slot${posClass}" data-position="${slot.position.key}">
                <div class="chorus-spread-card${reversedClass}${stateClass}" data-voice-id="${slot.voice.id}" style="border:${borderStyle};box-shadow:${shadow}">
                    <div class="chorus-spread-card__frame-outer"></div>
                    <div class="chorus-spread-card__frame-inner"></div>
                    <div class="chorus-spread-card__art" style="background:radial-gradient(circle at 50% 50%, ${arc.color}15 0%, #0a0612 70%)">
                        <div class="chorus-spread-card__glyph">${arc.glyph}</div>
                    </div>
                    <div class="chorus-spread-card__name" style="text-shadow:0 0 8px ${arc.glow}33">${slot.voice.name}</div>
                    <div class="chorus-spread-card__arcana">${arc.numeral}</div>
                    <div class="chorus-spread-card__relationship" style="color:${relColor}">${slot.voice.relationship.toUpperCase()}</div>
                    ${slot.reversed ? '<div class="chorus-spread-card__reversed-tag">REVERSED</div>' : ''}
                    <div class="chorus-spread-card__influence">INF ${slot.voice.influence}</div>
                    ${buildSpreadInkBleed(slot.voice, arc)}
                    <div class="chorus-spread-card__scanlines"></div>
                    ${pulse}
                </div>
                <div class="chorus-slot__label">${slot.position.label}</div>
            </div>
        `);
    });
}

/**
 * Render commentary messages below the spread.
 */
function renderCommentary(reading) {
    const $area = $('#chorus-commentary-area');
    $area.empty();

    reading.slots.forEach(slot => {
        const arc = getArcana(slot.voice.arcana);
        const commentFn = DEMO_COMMENTARY[slot.position.key] || DEMO_COMMENTARY.present;
        const text = commentFn(slot.voice);
        const reversedTag = slot.reversed
            ? `<div class="chorus-commentary__pip-rev">REVERSED</div>` : '';

        $area.append(`
            <div class="chorus-commentary">
                <div class="chorus-commentary__pip">
                    <div class="chorus-commentary__pip-glyph">${arc.glyph}</div>
                    <div class="chorus-commentary__pip-pos">${slot.position.label}</div>
                    ${reversedTag}
                </div>
                <div class="chorus-commentary__body">
                    <div class="chorus-commentary__name" style="color: ${arc.glow}">${slot.voice.name}</div>
                    <div class="chorus-commentary__context">${arc.label} · ${slot.voice.relationship.toUpperCase()} · INF ${slot.voice.influence}</div>
                    <div class="chorus-commentary__text">${text}</div>
                </div>
            </div>
        `);
    });
}

/**
 * Update the escalation indicator display.
 */
function updateEscalationUI(level) {
    const esc = ESCALATION[level];
    const $container = $('#chorus-escalation');
    $container.removeClass('chorus-escalation--calm chorus-escalation--rising chorus-escalation--elevated chorus-escalation--crisis');
    $container.addClass(`chorus-escalation--${level}`);
    $('#chorus-escalation-fill').css({
        'width': `${esc.fillPct}%`,
        'background': esc.color,
    });
    $('#chorus-escalation-label').text(esc.label);
}

/**
 * Switch spread type (from pills or escalation).
 */
function switchSpread(spreadType, fromEscalation = false) {
    currentSpread = spreadType;

    // Update pills
    $('.chorus-spread-pill').removeClass('active escalated');
    $(`.chorus-spread-pill[data-spread="${spreadType}"]`).addClass('active');
    if (fromEscalation) {
        $(`.chorus-spread-pill[data-spread="${spreadType}"]`).addClass('escalated');
    }

    // Render empty spread or re-render current reading
    if (currentReading && currentReading.spread === spreadType) {
        renderFilledSpread(currentReading);
        renderCommentary(currentReading);
    } else {
        renderEmptySpread(spreadType);
        // Clear commentary
        $('#chorus-commentary-area').html(`
            <div class="chorus-commentary-empty" id="chorus-commentary-empty">
                <div class="chorus-commentary-empty__glyph">☾</div>
                <div class="chorus-commentary-empty__text">Draw a spread to hear from your voices</div>
            </div>
        `);
    }
}

/**
 * Execute a draw — select voices, fill spread, render commentary.
 */
function executeDraw() {
    const slots = selectVoicesForSpread(currentSpread);
    if (slots.length === 0) {
        toastr.warning('No voices available to draw', 'The Chorus', { timeOut: 2000 });
        return;
    }

    currentReading = {
        spread: currentSpread,
        slots: slots,
        timestamp: Date.now(),
    };

    renderFilledSpread(currentReading);

    // Stagger commentary appearance
    setTimeout(() => {
        renderCommentary(currentReading);
    }, slots.length * 200 + 300);
}

/**
 * Simulate escalation cycle (for demo — replaced by real scanner later).
 */
function cycleEscalation() {
    const levels = ['calm', 'rising', 'elevated', 'crisis'];
    const currentIdx = levels.indexOf(currentEscalation);
    const nextIdx = (currentIdx + 1) % levels.length;
    currentEscalation = levels[nextIdx];

    const esc = ESCALATION[currentEscalation];
    updateEscalationUI(currentEscalation);

    // Auto-escalate spread type
    if (currentSpread !== esc.spread) {
        switchSpread(esc.spread, true);
    }
}

/**
 * Initialize the reading tab — wire up pills, draw button, escalation.
 */
function initReadingTab() {
    // Spread pills
    $(document).on('click', '.chorus-spread-pill', function () {
        const spread = $(this).data('spread');
        switchSpread(spread);
    });

    // Draw button
    $(document).on('click', '#chorus-draw-btn', function () {
        executeDraw();
    });

    // Long-press draw button to cycle escalation (demo/testing)
    let longPressTimer = null;
    $(document).on('touchstart mousedown', '#chorus-draw-btn', function (e) {
        longPressTimer = setTimeout(() => {
            cycleEscalation();
            toastr.info(`Escalation: ${currentEscalation.toUpperCase()}`, 'The Chorus', { timeOut: 1500 });
        }, 800);
    });
    $(document).on('touchend mouseup mouseleave', '#chorus-draw-btn', function () {
        clearTimeout(longPressTimer);
    });

    // Initial state
    renderEmptySpread(currentSpread);
    updateEscalationUI(currentEscalation);
}

// =============================================================================
// UI INITIALIZATION
// =============================================================================

async function initUI() {
    try {
        const panelHtml = await renderExtensionTemplateAsync(EXTENSION_NAME, 'template');

        // Parse template into temp wrapper so we can relocate
        const $temp = $('<div>').html(panelHtml);

        // Remove template FAB — we create our own with inline positioning
        $temp.find('#chorus-fab').remove();

        // Append panel + overlays to container
        const $container = getContainer();
        $temp.children().appendTo($container);

        // Create FAB with absolute positioning (bypasses transform issues)
        const $fab = $('<button id="chorus-fab" class="chorus-fab" title="The Chorus">🂠</button>');
        $fab.css({
            'position': 'absolute',
            'z-index': '99999',
            'top': 'calc(100vh - 140px)',
            'right': '15px',
        });
        $container.append($fab);

        // Make FAB draggable (also handles click internally)
        setupDraggableFab();

        $('#chorus-btn-close').on('click', () => togglePanel(false));
        $('#chorus-btn-narrator').on('click', function () { $(this).toggleClass('active'); });
        $('#chorus-btn-mute').on('click', function () { $(this).toggleClass('active'); });

        // Tabs
        $('.chorus-tabs__btn').on('click', function () {
            switchTab($(this).data('tab'));
        });

        // Toggles
        $('.chorus-toggle').on('click', function () {
            $(this).toggleClass('on');
        });

        // Pickers
        $('.chorus-picker__opt').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
        });

        // Spread pills
        $('.chorus-spread-pill').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
        });

        // Sliders
        $('#chorus-setting-max-voices').on('input', function () {
            $('#chorus-max-voices-val').text(this.value);
        });
        $('#chorus-setting-birth-sensitivity').on('input', function () {
            const labels = ['HAIR', 'LOW', 'MED', 'HIGH', 'EXTREME'];
            $('#chorus-birth-sensitivity-val').text(labels[this.value - 1]);
        });
        $('#chorus-setting-draw-freq').on('input', function () {
            $('#chorus-draw-freq-val').text(this.value);
        });
        $('#chorus-setting-reversal-chance').on('input', function () {
            $('#chorus-reversal-chance-val').text(this.value + '%');
        });
        $('#chorus-setting-gain-rate').on('input', function () {
            const labels = ['SLOW', 'LOW', 'MED', 'FAST', 'RAPID'];
            $('#chorus-gain-rate-val').text(labels[this.value - 1]);
        });

        // Render deck with current voices
        renderDeck();

        // Initialize reading tab
        initReadingTab();

        console.log(`${LOG_PREFIX} UI initialized`);
    } catch (error) {
        console.error(`${LOG_PREFIX} UI init failed:`, error);
        toastr.error(`UI failed: ${error.message}`, 'The Chorus', { timeOut: 10000 });
        throw error;
    }
}

function destroyUI() {
    // Stop canvas animations
    activeCanvases.forEach(c => c.stop());
    activeCanvases = [];

    $('#chorus-panel').remove();
    $('#chorus-fab').remove();
    $('#chorus-awakening-overlay').remove();
    $('#chorus-dissolution-overlay').remove();
    panelOpen = false;
}

// =============================================================================
// PANEL MANAGEMENT
// =============================================================================

function togglePanel(forceState) {
    const panel = $('#chorus-panel');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !panelOpen;

    if (shouldOpen && !panelOpen) {
        panel.addClass('open');
        panelOpen = true;
        $('#chorus-fab').addClass('chorus-fab--active');
    } else if (!shouldOpen && panelOpen) {
        panel.removeClass('open');
        panelOpen = false;
        $('#chorus-fab').removeClass('chorus-fab--active');
    }
}

// =============================================================================
// DRAGGABLE FAB
// =============================================================================

function setupDraggableFab() {
    const $fab = $('#chorus-fab');
    if (!$fab.length) return;

    let isDragging = false;
    let wasDragged = false;
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let fabStartX = 0;
    let fabStartY = 0;

    const MOVE_THRESHOLD = 8; // px before drag starts

    $fab.on('touchstart', function (e) {
        const touch = e.originalEvent.touches[0];
        touchStartTime = Date.now();
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;

        const rect = this.getBoundingClientRect();
        fabStartX = rect.left;
        fabStartY = rect.top;

        isDragging = false;
        wasDragged = false;
    });

    $fab.on('touchmove', function (e) {
        const touch = e.originalEvent.touches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (!isDragging && distance > MOVE_THRESHOLD) {
            isDragging = true;
            wasDragged = true;
        }

        if (isDragging) {
            e.preventDefault();

            let newX = fabStartX + deltaX;
            let newY = fabStartY + deltaY;

            // Constrain to viewport
            const w = $fab.outerWidth();
            const h = $fab.outerHeight();
            const pad = 5;
            newX = Math.max(pad, Math.min(window.innerWidth - w - pad, newX));
            newY = Math.max(pad, Math.min(window.innerHeight - h - pad, newY));

            // Use left/top (absolute within #sheld)
            $fab.css({
                'left': newX + 'px',
                'top': newY + 'px',
                'right': 'auto',
                'transition': 'none',
            });
        }
    });

    $fab.on('touchend', function () {
        isDragging = false;
        $fab.css('transition', '');

        // Save position to localStorage
        if (wasDragged) {
            const pos = {
                left: $fab.css('left'),
                top: $fab.css('top'),
            };
            try {
                localStorage.setItem('chorus-fab-pos', JSON.stringify(pos));
            } catch (e) { /* ignore */ }
        }
    });

    // Intercept click — only toggle panel if it wasn't a drag
    $fab.off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!wasDragged) {
            togglePanel();
        }
        wasDragged = false;
    });

    // Restore saved position
    try {
        const saved = JSON.parse(localStorage.getItem('chorus-fab-pos'));
        if (saved && saved.left && saved.top) {
            $fab.css({
                'left': saved.left,
                'top': saved.top,
                'right': 'auto',
            });
        }
    } catch (e) { /* ignore */ }
}

function switchTab(tabName) {
    $('.chorus-tabs__btn').removeClass('active');
    $(`.chorus-tabs__btn[data-tab="${tabName}"]`).addClass('active');

    $('.chorus-page').removeClass('active');
    $(`#chorus-page-${tabName}`).addClass('active');

    $('.chorus-content').scrollTop(0);
}

// =============================================================================
// SETTINGS PANEL (Extensions drawer)
// =============================================================================

async function addExtensionSettings() {
    const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_NAME, 'settings');
    $('#extensions_settings2').append(settingsHtml);

    $('#chorus-enabled')
        .prop('checked', extensionSettings.enabled)
        .on('change', async function () {
            const wasEnabled = extensionSettings.enabled;
            extensionSettings.enabled = $(this).prop('checked');
            saveSettings();

            if (extensionSettings.enabled && !wasEnabled) {
                await initUI();
            } else if (!extensionSettings.enabled && wasEnabled) {
                destroyUI();
            }
        });
}

// =============================================================================
// EVENT REGISTRATION
// =============================================================================

function registerEvents() {
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    console.log(`${LOG_PREFIX} Events registered`);
}

function onChatChanged() {
    // TODO: Load per-chat voice state
    console.log(`${LOG_PREFIX} Chat changed`);
}

function onMessageReceived() {
    // TODO: Run detection scanners, update influence, check draw
    console.log(`${LOG_PREFIX} Message received`);
}

// =============================================================================
// MAIN INIT
// =============================================================================

jQuery(async () => {
    try {
        console.log(`${LOG_PREFIX} Initializing...`);

        try {
            loadSettings();
        } catch (error) {
            console.error(`${LOG_PREFIX} Settings load failed:`, error);
        }

        try {
            await addExtensionSettings();
        } catch (error) {
            console.error(`${LOG_PREFIX} Settings panel failed:`, error);
        }

        if (!extensionSettings.enabled) {
            console.log(`${LOG_PREFIX} Extension disabled`);
            return;
        }

        await initUI();
        registerEvents();

        console.log(`${LOG_PREFIX} ✅ Loaded successfully`);

    } catch (error) {
        console.error(`${LOG_PREFIX} ❌ Critical failure:`, error);
        toastr.error('The Chorus failed to initialize.', 'The Chorus', { timeOut: 10000 });
    }
});
