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
