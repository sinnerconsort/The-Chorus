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
    getContext,
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
import { processMessage } from './src/voices/voice-engine.js';

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

async function onMessageReceived() {
    if (!hasActiveChat()) return;
    if (!extensionSettings.enabled) return;

    // Increment draw counter
    const count = incrementMessageCounter();

    // Apply natural influence decay if enabled
    if (extensionSettings.naturalDecay) {
        decayAllInfluence(1);
    }

    // Decay accumulators slightly (natural cooldown)
    decayAccumulators(2);

    // Get the last message text
    const ctx = getContext();
    const chat = ctx.chat || [];
    const lastMsg = chat[chat.length - 1];
    if (!lastMsg || lastMsg.is_user) return; // Only process AI messages

    const messageText = lastMsg.mes || '';
    if (messageText.trim().length < 10) return;

    try {
        // Run the full voice engine pipeline
        const result = await processMessage(messageText);

        // Render results to UI
        if (result.commentary.length > 0 || result.cardReading) {
            renderEngineResults(result);
        }

        console.log(`${LOG_PREFIX} Message processed: impact=${result.classification.impact}, ${result.commentary.length} voices spoke`);
    } catch (e) {
        console.error(`${LOG_PREFIX} Voice engine error:`, e);
    }
}

/**
 * Render voice engine results to the UI.
 * Updates sidebar commentary and reading tab.
 */
function renderEngineResults(result) {
    // TODO: Render sidebar commentary to the panel
    // TODO: Render card reading to the reading tab
    // For now, log results for debugging
    if (result.commentary.length > 0) {
        console.log(`${LOG_PREFIX} Commentary:`);
        for (const entry of result.commentary) {
            console.log(`  [${entry.name}]: ${entry.text}`);
        }
    }

    if (result.cardReading) {
        if (result.cardReading.type) {
            // Multi-card spread
            console.log(`${LOG_PREFIX} Spread (${result.cardReading.type}):`);
            for (const card of result.cardReading.cards) {
                console.log(`  [${card.positionName}] ${card.name}${card.reversed ? ' (R)' : ''}: ${card.text}`);
            }
        } else {
            // Single card
            const c = result.cardReading;
            console.log(`${LOG_PREFIX} Card: [${c.name}]${c.reversed ? ' (R)' : ''}: ${c.text}`);
        }
    }
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
