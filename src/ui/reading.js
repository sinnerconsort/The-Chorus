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
    setDrawLock,
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
let isDrawing = false;  // Shared mutex — blocks auto-draws during manual draws

// =============================================================================
// SIDEBAR COMMENTARY (public)
// =============================================================================

/**
 * Render sidebar commentary from voice engine output.
 * @param {Object[]} commentary - Array of { voiceId, name, arcana, relationship, text }
 */
/**
 * Render voice commentary as inline reactions in the main ST chat.
 * Injects a compact voice block after the last AI message.
 * These are visual-only — not stored in chat history.
 */
export function renderSidebarCommentary(commentary) {
    if (!commentary || commentary.length === 0) return;

    // Find the last AI message in the chat
    const $chat = $('#chat');
    const $lastMes = $chat.find('.mes').last();
    if ($lastMes.length === 0) return;

    const mesId = $lastMes.attr('mesid');

    // Don't duplicate — check if we already injected for this message
    if ($chat.find(`.chorus-chat-voices[data-mesid="${mesId}"]`).length > 0) {
        // Append to existing block
        const $existing = $chat.find(`.chorus-chat-voices[data-mesid="${mesId}"]`);
        for (const entry of commentary) {
            $existing.append(buildChatVoiceMessage(entry));
        }
        scrollChat();
        return;
    }

    // Build the voice block
    const $block = $(`<div class="chorus-chat-voices" data-mesid="${mesId}"></div>`);

    for (const entry of commentary) {
        $block.append(buildChatVoiceMessage(entry));
    }

    // Insert after the last message
    $lastMes.after($block);
    scrollChat();
}

/**
 * Build a single voice message for inline chat display.
 */
function buildChatVoiceMessage(entry) {
    const arc = getArcana(entry.arcana);
    const isNarrator = entry.isNarrator || entry.voiceId === '_narrator';
    const relColor = RELATIONSHIP_COLORS[entry.relationship] || '#888';

    const glyphColor = isNarrator ? '#c9a84c' : arc.glow;
    const glyph = isNarrator ? '\u2726' : arc.glyph;
    const name = entry.name;
    const rel = isNarrator ? '' : `<span class="chorus-chat-voice__rel" style="color:${relColor}">${entry.relationship}</span>`;
    const agitatedClass = (!isNarrator && (entry.relationship === 'manic' || entry.relationship === 'obsessed' || entry.relationship === 'hostile'))
        ? ' chorus-chat-voice--agitated' : '';
    const narratorClass = isNarrator ? ' chorus-chat-voice--narrator' : '';

    return `<div class="chorus-chat-voice${agitatedClass}${narratorClass}" data-voice-id="${entry.voiceId}">
        <div class="chorus-chat-voice__glyph" style="color:${glyphColor}">${glyph}</div>
        <div class="chorus-chat-voice__body">
            <span class="chorus-chat-voice__name" style="color:${glyphColor}">${name}</span>
            ${rel}
            <span class="chorus-chat-voice__text">${escapeHtml(entry.text)}</span>
        </div>
    </div>`;
}

/**
 * Scroll the main chat to bottom.
 */
function scrollChat() {
    const chatEl = document.getElementById('chat');
    if (chatEl) {
        requestAnimationFrame(() => {
            chatEl.scrollTop = chatEl.scrollHeight;
        });
    }
}

/**
 * Show loading indicator (FAB pulses while voices are thinking).
 */
export function showSidebarLoading() {
    $('#chorus-fab').addClass('chorus-fab--loading');
}

/**
 * Hide loading indicator.
 */
export function hideSidebarLoading() {
    $('#chorus-fab').removeClass('chorus-fab--loading');
}

/**
 * Clear injected commentary from chat (on chat switch).
 */
export function clearSidebar() {
    $('#chat .chorus-chat-voices').remove();
}

/**
 * Check if a manual draw is in progress (mutex for auto-draws).
 */
export function isManualDrawing() {
    return isDrawing;
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

    if (cardReading.type && Array.isArray(cardReading.cards)) {
        // Multi-card spread
        currentReading = {
            spread: cardReading.type,
            slots: cardReading.cards.map(card => ({
                position: { key: card.position || 'present', label: (card.positionName || 'READING').toUpperCase() },
                voice: buildVoiceForRender(card),
                reversed: card.reversed,
                text: card.text,
            })),
            timestamp: Date.now(),
        };
        currentSpread = cardReading.type;
    } else if (cardReading.voiceId) {
        // Single card
        currentReading = {
            spread: 'single',
            slots: [{
                position: { key: cardReading.position || 'present', label: (cardReading.positionName || 'PRESENT').toUpperCase() },
                voice: buildVoiceForRender(cardReading),
                reversed: cardReading.reversed,
                text: cardReading.text,
            }],
            timestamp: Date.now(),
        };
        currentSpread = 'single';
    } else {
        console.warn('[The Chorus] renderCardReading: unrecognized shape', cardReading);
        return;
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
        id: card.voiceId || 'unknown',
        name: card.name || 'Unknown',
        arcana: card.arcana || 'fool',
        relationship: card.relationship || 'curious',
        influence: card.influence || 50,
        state: card.state || 'active',
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

    // Highlight the suggested spread pill but DON'T auto-switch
    // User's selection is sacred — just pulse the suggested one
    $('.chorus-spread-pill').removeClass('escalated');
    if (esc.spread !== currentSpread) {
        $(`.chorus-spread-pill[data-spread="${esc.spread}"]`).addClass('escalated');
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
                    <div class="chorus-spread-card__relationship" style="color:${relColor}">${(slot.voice.relationship || 'curious').toUpperCase()}</div>
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
                    <div class="chorus-commentary__context">${arc.label} \u00B7 ${(slot.voice.relationship || 'curious').toUpperCase()} \u00B7 INF ${slot.voice.influence || 0}</div>
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

async function executeManualDraw() {
    if (isDrawing) return;

    const voices = getVoices().filter(v => v.state !== 'dead');
    if (voices.length === 0) {
        toastr.warning('No voices available to draw', 'The Chorus', { timeOut: 2000 });
        return;
    }

    isDrawing = true;
    setDrawLock(true);
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
        setDrawLock(false);
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
