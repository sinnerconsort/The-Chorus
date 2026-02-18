/**
 * THE CHORUS — SillyTavern Extension
 * Internal voices born from extreme moments, accumulated as tarot cards.
 *
 * NOTE: position:fixed breaks on mobile when ancestor elements have
 * CSS transforms (e.g. Moonlit Echoes theme). FAB and panel use
 * position:absolute on #sheld instead.
 */

import {
    renderExtensionTemplateAsync,
    extension_settings,
} from '../../../extensions.js';

import {
    eventSource,
    event_types,
    saveSettingsDebounced,
} from '../../../../script.js';

// Module imports
import { EXTENSION_NAME, LOG_PREFIX } from './src/config.js';
import {
    extensionSettings,
    loadSettings,
    saveSettings,
    loadChatState,
    hasActiveChat,
    incrementMessageCounter,
    decayAllInfluence,
    decayAccumulators,
} from './src/state.js';
import { initUI, destroyUI, refreshUI } from './src/ui/panel.js';

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
    // Load per-chat voice state from chat_metadata
    loadChatState();

    // Re-render UI with loaded state
    if (extensionSettings.enabled) {
        refreshUI();
    }

    console.log(`${LOG_PREFIX} Chat changed — state ${hasActiveChat() ? 'loaded' : 'cleared'}`);
}

function onMessageReceived() {
    if (!hasActiveChat()) return;

    // Increment draw counter
    const count = incrementMessageCounter();

    // Apply natural influence decay if enabled
    if (extensionSettings.naturalDecay) {
        decayAllInfluence(1);
    }

    // Decay accumulators slightly (natural cooldown)
    decayAccumulators(2);

    // TODO: Run detection scanners on new message
    // TODO: Check if draw should trigger (count >= drawFrequency)
    // TODO: Check hijack thresholds

    console.log(`${LOG_PREFIX} Message received (${count} since last draw)`);
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

        console.log(`${LOG_PREFIX} \u2705 Loaded successfully`);

    } catch (error) {
        console.error(`${LOG_PREFIX} \u274C Critical failure:`, error);
        toastr.error('The Chorus failed to initialize.', 'The Chorus', { timeOut: 10000 });
    }
});
