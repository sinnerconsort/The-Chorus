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
    getEscalation,
    getLivingVoices,
} from './src/state.js';
import { initUI, destroyUI, refreshUI } from './src/ui/panel.js';
import { processMessage, initializeFirstVoice } from './src/voices/voice-engine.js';
import {
    renderSidebarCommentary,
    renderCardReading,
    updateEscalationUI,
    showSidebarLoading,
    hideSidebarLoading,
} from './src/ui/reading.js';

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
        // First voice from persona (if no voices exist yet)
        const living = getLivingVoices();
        if (living.length === 0) {
            showSidebarLoading();
            const firstVoice = await initializeFirstVoice();
            hideSidebarLoading();

            if (firstVoice) {
                toastr.info(`${firstVoice.name} awakens`, 'Voice Born', { timeOut: 3000 });
                refreshUI();
            }
        }

        // Show loading indicator
        showSidebarLoading();

        // Run the full voice engine pipeline
        const result = await processMessage(messageText);

        // Hide loading
        hideSidebarLoading();

        // Update escalation bar
        updateEscalationUI(getEscalation());

        // Handle lifecycle events
        handleLifecycleEvents(result.lifecycleEvents);

        // Handle new voice birth
        if (result.newVoice) {
            toastr.info(`${result.newVoice.name} awakens (${result.newVoice.depth})`, 'Voice Born', { timeOut: 4000 });
            refreshUI();
        }

        // Render narrator (before voice commentary — narrator frames, voices react)
        if (result.narrator) {
            renderSidebarCommentary([{
                voiceId: '_narrator',
                name: 'Narrator',
                arcana: 'world',  // Use world arcana glyph for narrator
                relationship: 'narrator',
                text: result.narrator,
                isNarrator: true,
            }]);
        }

        // Render sidebar commentary
        if (result.commentary.length > 0) {
            renderSidebarCommentary(result.commentary);
        }

        // Render card reading (single card or spread)
        if (result.cardReading) {
            renderCardReading(result.cardReading);
        }

        console.log(`${LOG_PREFIX} Message processed: impact=${result.classification.impact}, ${result.commentary.length} voices, ${result.lifecycleEvents.length} lifecycle events`);
    } catch (e) {
        hideSidebarLoading();
        console.error(`${LOG_PREFIX} Voice engine error:`, e);
    }
}

/**
 * Handle lifecycle events (resolutions, transformations, state changes).
 */
function handleLifecycleEvents(events) {
    if (!events || events.length === 0) return;

    for (const event of events) {
        switch (event.type) {
            case 'resolved':
                toastr.info(event.message, 'Voice Resolved', { timeOut: 5000 });
                refreshUI();
                break;

            case 'transforming':
                toastr.warning(event.message, 'Transformation', { timeOut: 6000 });
                if (event.newVoice) {
                    setTimeout(() => {
                        toastr.info(`${event.newVoice.name} crystallizes from the fragments`, 'Voice Reborn', { timeOut: 5000 });
                        refreshUI();
                    }, 2000);
                }
                break;

            case 'fade_death':
                toastr.info(event.message, 'Voice Faded', { timeOut: 3000 });
                refreshUI();
                break;

            case 'state_change':
                console.log(`${LOG_PREFIX} ${event.name}: ${event.newState}`);
                // Subtle — no toastr, just log. The user sees it in the voice's behavior.
                break;
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
