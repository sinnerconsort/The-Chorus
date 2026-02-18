/**
 * THE CHORUS — SillyTavern Extension
 * Internal voices born from extreme moments, accumulated as tarot cards.
 *
 * Entry point. Handles initialization, settings, event registration,
 * and UI panel lifecycle.
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
    birthSensitivity: 3, // 1-5

    // Readings
    autoDraw: true,
    drawFrequency: 3, // every N messages
    defaultSpread: 'three', // single | three | cross
    reversalChance: 15, // 0-50 percent

    // Influence
    influenceGainRate: 3, // 1-5
    naturalDecay: false,

    // Hijack (future)
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
// UI INITIALIZATION
// =============================================================================

async function initUI() {
    try {
        // Load main panel template
        toastr.info(`Loading template from: ${EXTENSION_NAME}`, 'The Chorus', { timeOut: 5000 });
        const panelHtml = await renderExtensionTemplateAsync(EXTENSION_NAME, 'template');
        $('body').append(panelHtml);

        // Wire up FAB
        $('#chorus-fab').on('click', togglePanel);

        // Wire up close button
        $('#chorus-btn-close').on('click', () => togglePanel(false));

        // Wire up tabs
        $('.chorus-tabs__btn').on('click', function () {
            const tab = $(this).data('tab');
            switchTab(tab);
        });

        // Wire up toggles
        $('.chorus-toggle').on('click', function () {
            $(this).toggleClass('on');
        });

        // Wire up pickers
        $('.chorus-picker__opt').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
        });

        // Wire up spread pills
        $('.chorus-spread-pill').on('click', function () {
            $(this).siblings().removeClass('active');
            $(this).addClass('active');
        });

        // Verify FAB exists in DOM
        const fabExists = $('#chorus-fab').length > 0;
        const panelExists = $('#chorus-panel').length > 0;
        toastr.info(`FAB in DOM: ${fabExists}, Panel in DOM: ${panelExists}`, 'The Chorus', { timeOut: 5000 });

        // Fallback: create FAB manually if template didn't include it
        if (!fabExists) {
            toastr.warning('FAB missing from template, creating manually', 'The Chorus', { timeOut: 5000 });
            $('body').append(`
                <button id="chorus-fab" title="The Chorus">
                    🂠
                    <span class="chorus-fab__pip"></span>
                </button>
            `);
            $('#chorus-fab').on('click', togglePanel);
        }

        // Force FAB visible
        $('#chorus-fab').css({
            'display': 'flex',
            'position': 'fixed',
            'bottom': '60px',
            'right': '12px',
            'z-index': '9998'
        }).show();

        console.log(`${LOG_PREFIX} UI initialized`);
    } catch (error) {
        console.error(`${LOG_PREFIX} UI init failed:`, error);
        throw error;
    }
}

function destroyUI() {
    $('#chorus-panel').remove();
    $('#chorus-fab').remove();
    $('#chorus-awakening-overlay').remove();
    $('#chorus-dissolution-overlay').remove();
}

// =============================================================================
// PANEL MANAGEMENT
// =============================================================================

function togglePanel(forceState) {
    const panel = $('#chorus-panel');
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !panelOpen;

    if (shouldOpen && !panelOpen) {
        panel.addClass('open chorus-panel--opening');
        panel.one('animationend', () => panel.removeClass('chorus-panel--opening'));
        panelOpen = true;
        $('#chorus-fab').addClass('chorus-fab--active');
    } else if (!shouldOpen && panelOpen) {
        panel.addClass('chorus-panel--closing');
        panel.one('animationend', () => {
            panel.removeClass('open chorus-panel--closing');
        });
        panelOpen = false;
        $('#chorus-fab').removeClass('chorus-fab--active');
    }
}

function switchTab(tabName) {
    // Update tab buttons
    $('.chorus-tabs__btn').removeClass('active');
    $(`.chorus-tabs__btn[data-tab="${tabName}"]`).addClass('active');

    // Update pages
    $('.chorus-page').removeClass('active');
    $(`#chorus-page-${tabName}`).addClass('active');

    // Scroll content to top
    $('.chorus-content').scrollTop(0);
}

// =============================================================================
// SETTINGS PANEL (Extensions drawer)
// =============================================================================

async function addExtensionSettings() {
    const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_NAME, 'settings');
    $('#extensions_settings2').append(settingsHtml);

    // Wire up enable toggle
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
        toastr.info('Starting...', 'The Chorus', { timeOut: 3000 });

        // 1. Load settings
        try {
            loadSettings();
        } catch (error) {
            console.error(`${LOG_PREFIX} Settings load failed:`, error);
            toastr.warning('Settings load failed', 'The Chorus');
        }

        // 2. Add settings to Extensions panel
        try {
            await addExtensionSettings();
        } catch (error) {
            console.error(`${LOG_PREFIX} Settings panel failed:`, error);
            toastr.warning('Settings panel failed', 'The Chorus');
        }

        // 3. Check enabled
        if (!extensionSettings.enabled) {
            console.log(`${LOG_PREFIX} Extension disabled`);
            toastr.info('Extension disabled', 'The Chorus');
            return;
        }

        // 4. Initialize UI
        await initUI();
        toastr.success('UI loaded', 'The Chorus', { timeOut: 3000 });

        // 5. Register events
        registerEvents();

        console.log(`${LOG_PREFIX} ✅ Loaded successfully`);
        toastr.success('✅ Ready', 'The Chorus', { timeOut: 3000 });

    } catch (error) {
        console.error(`${LOG_PREFIX} ❌ Critical failure:`, error);
        toastr.error(
            'The Chorus failed to initialize.',
            'The Chorus',
            { timeOut: 10000 }
        );
    }
});
