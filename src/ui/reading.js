/**
 * THE CHORUS — Reading Tab UI
 * Spread layouts, escalation, voice selection, commentary.
 */

import { getVoices, getArcana, hexToRgb, extensionSettings } from '../state.js';

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

export { initReadingTab };
