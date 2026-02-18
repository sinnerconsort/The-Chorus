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
let activeDetailId = null; // currently expanded voice detail

// =============================================================================
// ARCANA DEFINITIONS
// =============================================================================
const ARCANA = {
    fool:           { numeral: '0',     glyph: '◎', name: 'The Fool',           color: '#e8d888' },
    magician:       { numeral: 'I',     glyph: '✦', name: 'The Magician',       color: '#a88cff' },
    priestess:      { numeral: 'II',    glyph: '☽', name: 'The High Priestess', color: '#8ca8ff' },
    empress:        { numeral: 'III',   glyph: '♕', name: 'The Empress',        color: '#88cc88' },
    emperor:        { numeral: 'IV',    glyph: '♔', name: 'The Emperor',        color: '#cc8844' },
    hierophant:     { numeral: 'V',     glyph: '⚚', name: 'The Hierophant',     color: '#aa9966' },
    lovers:         { numeral: 'VI',    glyph: '♡', name: 'The Lovers',         color: '#ee88aa' },
    chariot:        { numeral: 'VII',   glyph: '⚔', name: 'The Chariot',        color: '#ccaa44' },
    strength:       { numeral: 'VIII',  glyph: '∞', name: 'Strength',           color: '#dd8844' },
    hermit:         { numeral: 'IX',    glyph: '◈', name: 'The Hermit',         color: '#7788aa' },
    wheel:          { numeral: 'X',     glyph: '☸', name: 'Wheel of Fortune',   color: '#bb88cc' },
    justice:        { numeral: 'XI',    glyph: '⚖', name: 'Justice',            color: '#88aacc' },
    hanged:         { numeral: 'XII',   glyph: '⚓', name: 'The Hanged Man',     color: '#6688aa' },
    death:          { numeral: 'XIII',  glyph: '✞', name: 'Death',              color: '#888888' },
    temperance:     { numeral: 'XIV',   glyph: '⚗', name: 'Temperance',         color: '#88bbaa' },
    devil:          { numeral: 'XV',    glyph: '⛧', name: 'The Devil',          color: '#cc4444' },
    tower:          { numeral: 'XVI',   glyph: '⚡', name: 'The Tower',          color: '#ff6644' },
    star:           { numeral: 'XVII',  glyph: '✧', name: 'The Star',           color: '#aaccee' },
    moon:           { numeral: 'XVIII', glyph: '☾', name: 'The Moon',           color: '#9988bb' },
    sun:            { numeral: 'XIX',   glyph: '☀', name: 'The Sun',            color: '#eebb44' },
    judgement:      { numeral: 'XX',    glyph: '♆', name: 'Judgement',           color: '#cc88aa' },
    world:          { numeral: 'XXI',   glyph: '⊕', name: 'The World',          color: '#88ccaa' },
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
        relationships: { voice_002: 'hostile', voice_004: 'allied' },
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
        relationships: { voice_001: 'hostile', voice_003: 'allied' },
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
        relationships: { voice_002: 'allied' },
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
        relationships: { voice_001: 'allied' },
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
        relationships: {},
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
// DECK RENDERING
// =============================================================================

/**
 * Get voices for the current chat. Uses demo data for now.
 */
function getVoices() {
    // TODO: Replace with per-chat state from chat_metadata
    return DEMO_VOICES;
}

/**
 * Get the arcana definition for a voice, with fallback.
 */
function getArcana(arcanaKey) {
    return ARCANA[arcanaKey] || { numeral: '?', glyph: '?', name: arcanaKey, color: '#888' };
}

/**
 * Get influence bar color based on level (green → gold → red).
 */
function getInfluenceColor(influence) {
    if (influence <= 25) return '#557755';
    if (influence <= 50) return '#998844';
    if (influence <= 75) return '#bb7733';
    return '#cc4444';
}

/**
 * Build the HTML for a single mini card (used in fan and spreads).
 */
function buildMiniCard(voice, index) {
    const arc = getArcana(voice.arcana);
    const stateClass = `chorus-mini-card--${voice.state}`;
    const inkHeight = Math.min(voice.influence, 100);
    const inkColor = voice.state === 'dead' ? '#222' : arc.color;

    return `
        <div class="chorus-fan__card chorus-mini-card ${stateClass}"
             data-voice-id="${voice.id}"
             style="z-index: ${10 + index};"
             title="${voice.name}">
            <div class="chorus-mini-card__glyph">${arc.glyph}</div>
            <div class="chorus-mini-card__name">${voice.name.toUpperCase()}</div>
            <div class="chorus-mini-card__arcana">${arc.numeral}</div>
            <div class="chorus-mini-card__influence">${voice.influence}</div>
            <div class="chorus-mini-card__ink" style="
                height: ${inkHeight}%;
                background: linear-gradient(to top,
                    ${inkColor}33 0%,
                    ${inkColor}15 60%,
                    transparent 100%
                );
            "></div>
        </div>
    `;
}

/**
 * Build the HTML for a voice detail panel (expandable info card).
 */
function buildVoiceDetail(voice) {
    const arc = getArcana(voice.arcana);
    const infColor = getInfluenceColor(voice.influence);
    const isDead = voice.state === 'dead';
    const raises = (voice.influenceTriggers?.raises || []).join(', ');
    const lowers = (voice.influenceTriggers?.lowers || []).join(', ');

    return `
        <div class="chorus-voice-detail" id="chorus-detail-${voice.id}" data-voice-id="${voice.id}">
            <div class="chorus-voice-detail__header">
                <div class="chorus-voice-detail__glyph">${arc.glyph}</div>
                <div>
                    <div class="chorus-voice-detail__name">${voice.name.toUpperCase()}</div>
                    <div class="chorus-voice-detail__arcana">${arc.name} · ${arc.numeral}</div>
                </div>
                <button class="chorus-voice-detail__close" data-voice-id="${voice.id}">✕</button>
            </div>

            ${isDead ? `
                <div class="chorus-voice-detail__label">STATUS</div>
                <div class="chorus-voice-detail__text" style="color: var(--chorus-text-dead);">
                    This voice has been silenced. The card is cracked and empty.
                </div>
            ` : `
                <div class="chorus-voice-detail__label">INFLUENCE</div>
                <div class="chorus-inf-bar">
                    <div class="chorus-inf-bar__fill" style="width: ${voice.influence}%; background: ${infColor};"></div>
                </div>
                <div style="font-family: var(--chorus-font-mono); font-size: 7px; color: var(--chorus-text-ghost); margin-top: 3px;">
                    ${voice.influence}/100 · ${voice.state.toUpperCase()}
                </div>

                <div class="chorus-voice-detail__label">PERSONALITY</div>
                <div class="chorus-voice-detail__text">${voice.personality}</div>

                <div class="chorus-voice-detail__label">SPEAKING STYLE</div>
                <div class="chorus-voice-detail__text">${voice.speakingStyle}</div>

                <div class="chorus-voice-detail__label">BIRTH MOMENT</div>
                <div class="chorus-voice-detail__text">${voice.birthMoment}</div>

                <div class="chorus-voice-detail__label">RAISES</div>
                <div class="chorus-voice-detail__text" style="color: var(--chorus-danger-dim);">${raises}</div>

                <div class="chorus-voice-detail__label">LOWERS</div>
                <div class="chorus-voice-detail__text" style="color: #557755;">${lowers}</div>

                <div class="chorus-voice-detail__actions">
                    <button class="chorus-vd-btn chorus-vd-btn--talk">TALK</button>
                    <button class="chorus-vd-btn chorus-vd-btn--info">HISTORY</button>
                </div>
            `}
        </div>
    `;
}

/**
 * Render the fan (fanned hand of cards) into #chorus-fan.
 */
function renderFan(voices) {
    const $fan = $('#chorus-fan');
    $fan.empty();

    const alive = voices.filter(v => v.state !== 'dead');
    const dead = voices.filter(v => v.state === 'dead');
    const all = [...alive, ...dead]; // dead cards go to the right edge

    const count = all.length;
    if (count === 0) {
        $fan.append('<div style="text-align: center; color: var(--chorus-text-ghost); font-family: var(--chorus-font-mono); font-size: 8px; letter-spacing: 2px; padding-top: 50px;">NO VOICES YET</div>');
        return;
    }

    // Fan layout: cards arc from center
    const maxArc = Math.min(count * 10, 50); // total arc degrees
    const step = count > 1 ? maxArc / (count - 1) : 0;
    const startAngle = -(maxArc / 2);
    // Horizontal offset from center per card
    const spreadPx = Math.min(count * 22, 140);
    const startX = -(spreadPx / 2);
    const stepX = count > 1 ? spreadPx / (count - 1) : 0;

    all.forEach((voice, i) => {
        const angle = startAngle + (step * i);
        const xOffset = startX + (stepX * i);
        const cardHtml = buildMiniCard(voice, i);
        const $card = $(cardHtml);

        $card.css({
            'left': `calc(50% + ${xOffset}px - 33px)`,
            'transform': `rotate(${angle}deg)`,
        });

        // Lift on hover/touch
        $card.on('touchstart mouseenter', function () {
            $(this).css({
                'transform': `rotate(${angle}deg) translateY(-14px)`,
                'z-index': '50',
            });
        });
        $card.on('touchend mouseleave', function () {
            $(this).css({
                'transform': `rotate(${angle}deg)`,
                'z-index': `${10 + i}`,
            });
        });

        // Tap to open detail
        $card.on('click', function () {
            toggleVoiceDetail(voice.id);
        });

        $fan.append($card);
    });

    // Fan label
    const aliveCount = alive.length;
    const deadCount = dead.length;
    let label = `${aliveCount} VOICE${aliveCount !== 1 ? 'S' : ''}`;
    if (deadCount > 0) label += ` · ${deadCount} SILENCED`;
    $('#chorus-fan-label').text(label);
}

/**
 * Render voice detail panels below the fan.
 */
function renderVoiceDetails(voices) {
    const $container = $('#chorus-voice-details');
    $container.empty();

    voices.forEach(voice => {
        $container.append(buildVoiceDetail(voice));
    });

    // Wire up close buttons
    $container.find('.chorus-voice-detail__close').on('click', function (e) {
        e.stopPropagation();
        const id = $(this).data('voice-id');
        closeVoiceDetail(id);
    });
}

/**
 * Update the deck stats counters.
 */
function updateDeckStats(voices) {
    const alive = voices.filter(v => v.state !== 'dead').length;
    const dead = voices.filter(v => v.state === 'dead').length;
    $('#chorus-stat-voices').text(alive);
    $('#chorus-stat-max').text(extensionSettings.maxVoices);
    $('#chorus-stat-deaths').text(dead);
}

/**
 * Toggle a voice detail panel open/closed.
 */
function toggleVoiceDetail(voiceId) {
    const $detail = $(`#chorus-detail-${voiceId}`);

    if (activeDetailId === voiceId) {
        // Close it
        closeVoiceDetail(voiceId);
    } else {
        // Close any open detail
        if (activeDetailId) {
            closeVoiceDetail(activeDetailId);
        }
        // Open this one
        $detail.addClass('open');
        activeDetailId = voiceId;

        // Scroll into view
        setTimeout(() => {
            $detail[0]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
}

function closeVoiceDetail(voiceId) {
    $(`#chorus-detail-${voiceId}`).removeClass('open');
    if (activeDetailId === voiceId) {
        activeDetailId = null;
    }
}

/**
 * Full deck render — call this whenever voices change.
 */
function renderDeck() {
    const voices = getVoices();
    renderFan(voices);
    renderVoiceDetails(voices);
    updateDeckStats(voices);
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

        console.log(`${LOG_PREFIX} UI initialized`);
    } catch (error) {
        console.error(`${LOG_PREFIX} UI init failed:`, error);
        toastr.error(`UI failed: ${error.message}`, 'The Chorus', { timeOut: 10000 });
        throw error;
    }
}

function destroyUI() {
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
