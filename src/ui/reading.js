/**
 * THE CHORUS — Reading Tab UI
 * Renders engine output: sidebar commentary and spread readings.
 *
 * Public API (called from index.js):
 *   renderSidebarCommentary(commentary[])  — voice reactions per message
 *   renderCardReading(cardReading)         — single card or spread
 *   updateEscalationUI(level)              — escalation bar
 *   showSidebarLoading() / hideSidebarLoading()
 *   clearSidebar()                         — reset on chat switch
 *   initReadingTab()                       — wire up interactive elements
 */

import { getVoices, getArcana, hexToRgb, extensionSettings, getEscalation } from '../state.js';
import {
    manualSingleDraw,
    manualSpreadDraw,
} from '../voices/voice-engine.js';

// =============================================================================
// SPREAD DEFINITIONS
// =============================================================================

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

const ESCALATION = {
    calm:     { label: 'CALM',     spread: 'single', fillPct: 15,  color: '#557755' },
    rising:   { label: 'RISING',   spread: 'single', fillPct: 40,  color: '#998844' },
    elevated: { label: 'ELEVATED', spread: 'three',  fillPct: 65,  color: '#bb7733' },
    crisis:   { label: 'CRISIS',   spread: 'cross',  fillPct: 100, color: '#cc4444' },
};

const RELATIONSHIP_COLORS = {
    devoted: '#88aacc', protective: '#7799aa', warm: '#88aa77',
    curious: '#aa9966', indifferent: '#666666', resentful: '#aa6644',
    hostile: '#cc4444', obsessed: '#aa44aa', grieving: '#7777aa',
    manic: '#ccaa33',
};

let currentSpread = 'single';
let currentReading = null;

// =============================================================================
// SIDEBAR COMMENTARY (public)
// =============================================================================

/**
 * Render sidebar commentary from voice engine output.
 * @param {Object[]} commentary - Array of { voiceId, name, arcana, relationship, text }
 */
export function renderSidebarCommentary(commentary) {
    const $feed = $('#chorus-sidebar-feed');
    const $empty = $('#chorus-sidebar-empty');
    const $count = $('#chorus-sidebar-count');

    if (!commentary || commentary.length === 0) return;

    // Hide empty state
    $empty.hide();

    // Build messages
    for (const entry of commentary) {
        const arc = getArcana(entry.arcana);
        const relColor = RELATIONSHIP_COLORS[entry.relationship] || '#888888';
        const isAgitated = (entry.relationship === 'manic' || entry.relationship === 'obsessed' || entry.relationship === 'hostile');

        const $msg = $(`
            <div class="chorus-sidebar-msg${isAgitated ? ' chorus-sidebar-msg--agitated' : ''}" data-voice-id="${entry.voiceId}">
                <div class="chorus-sidebar-msg__glyph" style="color:${arc.glow};border-color:${arc.color}44">${arc.glyph}</div>
                <div class="chorus-sidebar-msg__body">
                    <div class="chorus-sidebar-msg__header">
                        <span class="chorus-sidebar-msg__name" style="color:${arc.glow}">${entry.name}</span>
                        <span class="chorus-sidebar-msg__rel" style="color:${relColor}">${entry.relationship}</span>
                    </div>
                    <div class="chorus-sidebar-msg__text">${escapeHtml(entry.text)}</div>
                </div>
            </div>
        `);

        $feed.append($msg);
    }

    // Update count
    const total = $feed.find('.chorus-sidebar-msg').length;
    $count.text(total);

    // Auto-scroll to bottom
    const feedEl = $feed[0];
    if (feedEl) {
        feedEl.scrollTop = feedEl.scrollHeight;
    }

    // Trim old messages (keep last ~30)
    const $msgs = $feed.find('.chorus-sidebar-msg');
    if ($msgs.length > 30) {
        $msgs.slice(0, $msgs.length - 30).remove();
    }
}

/**
 * Show loading indicator in sidebar.
 */
export function showSidebarLoading() {
    const $feed = $('#chorus-sidebar-feed');
    $('#chorus-sidebar-empty').hide();
    $feed.find('.chorus-sidebar__loading').remove();

    $feed.append(`
        <div class="chorus-sidebar__loading">
            <div class="chorus-sidebar__loading-dot"></div>
            <div class="chorus-sidebar__loading-dot"></div>
            <div class="chorus-sidebar__loading-dot"></div>
        </div>
    `);

    const feedEl = $feed[0];
    if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
}

/**
 * Hide loading indicator in sidebar.
 */
export function hideSidebarLoading() {
    $('#chorus-sidebar-feed .chorus-sidebar__loading').remove();
}

/**
 * Clear sidebar (on chat switch).
 */
export function clearSidebar() {
    const $feed = $('#chorus-sidebar-feed');
    $feed.find('.chorus-sidebar-msg, .chorus-sidebar__loading').remove();
    $('#chorus-sidebar-empty').show();
    $('#chorus-sidebar-count').text('');
}

// =============================================================================
// CARD READING (public)
// =============================================================================

/**
 * Render a card reading from voice engine output.
 *
 * Single card: { voiceId, name, arcana, relationship, influence, position,
 *                positionName, reversed, text }
 *
 * Spread:      { type: 'three'|'cross', cards: [...same shape] }
 */
export function renderCardReading(cardReading) {
    if (!cardReading) return;

    if (cardReading.type) {
        // Multi-card spread
        currentReading = {
            spread: cardReading.type,
            slots: cardReading.cards.map(card => ({
                position: { key: card.position, label: card.positionName.toUpperCase() },
                voice: buildVoiceForRender(card),
                reversed: card.reversed,
                text: card.text,
            })),
            timestamp: Date.now(),
        };
        currentSpread = cardReading.type;
    } else {
        // Single card
        currentReading = {
            spread: 'single',
            slots: [{
                position: { key: cardReading.position, label: cardReading.positionName.toUpperCase() },
                voice: buildVoiceForRender(cardReading),
                reversed: cardReading.reversed,
                text: cardReading.text,
            }],
            timestamp: Date.now(),
        };
        currentSpread = 'single';
    }

    // Update pills
    $('.chorus-spread-pill').removeClass('active escalated');
    $(`.chorus-spread-pill[data-spread="${currentSpread}"]`).addClass('active');

    // Render
    renderFilledSpread(currentReading);
    setTimeout(() => {
        renderCommentary(currentReading);
    }, currentReading.slots.length * 200 + 200);
}

function buildVoiceForRender(card) {
    return {
        id: card.voiceId,
        name: card.name,
        arcana: card.arcana,
        relationship: card.relationship || 'curious',
        influence: card.influence || 50,
        state: 'active',
    };
}

// =============================================================================
// ESCALATION (public)
// =============================================================================

/**
 * Update the escalation indicator display.
 */
export function updateEscalationUI(level) {
    const esc = ESCALATION[level] || ESCALATION.calm;
    const $container = $('#chorus-escalation');
    $container.removeClass('chorus-escalation--calm chorus-escalation--rising chorus-escalation--elevated chorus-escalation--crisis');
    $container.addClass(`chorus-escalation--${level}`);
    $('#chorus-escalation-fill').css({
        'width': `${esc.fillPct}%`,
        'background': esc.color,
    });
    $('#chorus-escalation-label').text(esc.label);

    // Auto-escalate spread pills if no active reading
    if (currentSpread !== esc.spread && !currentReading) {
        switchSpread(esc.spread, true);
    }
}

// =============================================================================
// INTERNAL RENDERING
// =============================================================================

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
            <path d="M0,20 Q15,${8 + Math.sin(inf * 0.1) * 5} 30,${14 + Math.cos(inf * 0.05) * 4} T60,${12 + Math.sin(inf * 0.08) * 3} T100,20 L100,20 L0,20 Z" fill="rgba(${r},${g},${b},0.5)" filter="url(#sib-${voice.id})"/>
            <path d="M0,20 Q20,${11 + Math.cos(inf * 0.07) * 3} 40,${16 + Math.sin(inf * 0.09) * 3} T80,${14 + Math.cos(inf * 0.06) * 4} T100,20 L100,20 L0,20 Z" fill="rgba(${r},${g},${b},0.35)"/>
        </svg>
        <div class="chorus-spread-card__ink-body" style="background:linear-gradient(to top,rgba(${r},${g},${b},0.6) 0%,rgba(${r},${g},${b},0.3) 60%,rgba(${r},${g},${b},0.1) 100%)"></div>
    </div>`;
}

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

        const borderStyle = slot.voice.state === 'agitated'
            ? `1px solid ${arc.glow}55` : `1px solid rgba(201,168,76,0.2)`;
        const shadow = slot.voice.state === 'agitated'
            ? `0 0 12px ${arc.glow}33, inset 0 0 8px ${arc.glow}15`
            : `0 0 6px ${arc.glow}18`;
        const pulse = slot.voice.state === 'agitated'
            ? `<div class="chorus-spread-card__pulse" style="border-color:${arc.glow}"></div>` : '';
        const relColor = RELATIONSHIP_COLORS[slot.voice.relationship] || '#888888';

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
 * Render commentary below spread — uses REAL AI text from engine.
 */
function renderCommentary(reading) {
    const $area = $('#chorus-commentary-area');
    $area.empty();

    reading.slots.forEach(slot => {
        const arc = getArcana(slot.voice.arcana);
        const text = slot.text || '\u2026';
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
                    <div class="chorus-commentary__context">${arc.label} \u00B7 ${slot.voice.relationship.toUpperCase()} \u00B7 INF ${slot.voice.influence}</div>
                    <div class="chorus-commentary__text">${escapeHtml(text)}</div>
                </div>
            </div>
        `);
    });
}

function switchSpread(spreadType, fromEscalation = false) {
    currentSpread = spreadType;

    $('.chorus-spread-pill').removeClass('active escalated');
    $(`.chorus-spread-pill[data-spread="${spreadType}"]`).addClass('active');
    if (fromEscalation) {
        $(`.chorus-spread-pill[data-spread="${spreadType}"]`).addClass('escalated');
    }

    if (currentReading && currentReading.spread === spreadType) {
        renderFilledSpread(currentReading);
        renderCommentary(currentReading);
    } else {
        renderEmptySpread(spreadType);
        $('#chorus-commentary-area').html(`
            <div class="chorus-commentary-empty" id="chorus-commentary-empty">
                <div class="chorus-commentary-empty__glyph">\u263E</div>
                <div class="chorus-commentary-empty__text">Draw a spread to hear from your voices</div>
            </div>
        `);
    }
}

// =============================================================================
// MANUAL DRAW (button press → calls engine)
// =============================================================================

let isDrawing = false;

async function executeManualDraw() {
    if (isDrawing) return;

    const voices = getVoices().filter(v => v.state !== 'dead');
    if (voices.length === 0) {
        toastr.warning('No voices available to draw', 'The Chorus', { timeOut: 2000 });
        return;
    }

    isDrawing = true;
    const $btn = $('#chorus-draw-btn');
    $btn.text('DRAWING\u2026').prop('disabled', true);

    try {
        let result;
        if (currentSpread === 'single') {
            result = await manualSingleDraw();
        } else {
            result = await manualSpreadDraw(currentSpread);
        }

        if (result) {
            renderCardReading(result);
        } else {
            toastr.warning('Draw returned no result', 'The Chorus', { timeOut: 2000 });
        }
    } catch (e) {
        console.error('[The Chorus] Manual draw failed:', e);
        toastr.error(`Draw failed: ${e.message}`, 'The Chorus', { timeOut: 3000 });
    } finally {
        isDrawing = false;
        $btn.text('DRAW').prop('disabled', false);
    }
}

// =============================================================================
// ESCALATION CYCLE (long-press for testing)
// =============================================================================

function cycleEscalation() {
    const levels = ['calm', 'rising', 'elevated', 'crisis'];
    const current = getEscalation();
    const currentIdx = levels.indexOf(current);
    const nextIdx = (currentIdx + 1) % levels.length;
    updateEscalationUI(levels[nextIdx]);
    toastr.info(`Escalation: ${levels[nextIdx].toUpperCase()}`, 'The Chorus', { timeOut: 1500 });
}

// =============================================================================
// HTML ESCAPE
// =============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// INIT
// =============================================================================

export function initReadingTab() {
    // Spread pills
    $(document).on('click', '.chorus-spread-pill', function () {
        switchSpread($(this).data('spread'));
    });

    // Draw button — calls engine
    $(document).on('click', '#chorus-draw-btn', function () {
        executeManualDraw();
    });

    // Long-press draw button to cycle escalation (testing)
    let longPressTimer = null;
    $(document).on('touchstart mousedown', '#chorus-draw-btn', function () {
        longPressTimer = setTimeout(() => {
            cycleEscalation();
        }, 800);
    });
    $(document).on('touchend mouseup mouseleave', '#chorus-draw-btn', function () {
        clearTimeout(longPressTimer);
    });

    // Initial state
    renderEmptySpread(currentSpread);
    updateEscalationUI(getEscalation());
}
