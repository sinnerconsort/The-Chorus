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
    getVoiceById,
    getVoicesWithPendingDMs,
    getArcana,
} from './src/state.js';
import { initUI, destroyUI, refreshUI } from './src/ui/panel.js';
import { processMessage, initializeFromPersona, resetVoiceCounter } from './src/voices/voice-engine.js';
import {
    renderSidebarCommentary,
    renderCardReading,
    updateEscalationUI,
    showSidebarLoading,
    hideSidebarLoading,
} from './src/ui/reading.js';
import {
    playAwakening,
    playDissolution,
    playTransformation,
    isAnimating,
} from './src/ui/animations.js';
import { initDirectory, openDirectory } from './src/social/directory.js';
import { checkOutreach, resetOutreachCooldown } from './src/social/outreach.js';
import { initCouncil, resetCouncil } from './src/social/council.js';
import {
    narrateConsume,
    narrateMerge,
    recalculateCoherence,
    getCoherence,
    getArchetypeInfo,
} from './src/voices/narrator.js';

// =============================================================================
// SETTINGS PANEL (Extensions drawer)
// =============================================================================

async function addExtensionSettings() {
    const settingsHtml = await renderExtensionTemplateAsync(EXTENSION_NAME, 'settings');
    $('#extensions_settings2').append(settingsHtml);

    // Enabled checkbox
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

    // Voice commentary frequency
    $('#chorus-voice-frequency')
        .val(extensionSettings.voiceFrequency || 1)
        .on('change', function () {
            extensionSettings.voiceFrequency = parseInt($(this).val(), 10);
            saveSettings();
        });

    // Max speakers per message
    $('#chorus-max-speakers')
        .val(extensionSettings.maxSpeakers || 3)
        .on('change', function () {
            extensionSettings.maxSpeakers = parseInt($(this).val(), 10);
            saveSettings();
        });

    // Council auto-continue interval
    $('#chorus-council-interval')
        .val(extensionSettings.councilInterval || 10)
        .on('change', function () {
            extensionSettings.councilInterval = parseInt($(this).val(), 10);
            saveSettings();
        });

    // Max voices
    $('#chorus-max-voices')
        .val(extensionSettings.maxVoices || 5)
        .on('change', function () {
            extensionSettings.maxVoices = parseInt($(this).val(), 10);
            saveSettings();
        });
}

// =============================================================================
// EVENT REGISTRATION
// =============================================================================

function registerEvents() {
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);

    // Manual persona extraction button
    $(document).on('click', '#chorus-btn-extract', handleManualExtract);

    // Refresh deck + outreach UI when directory closes
    $(document).on('chorus:directoryClose', () => {
        refreshUI();
        updateOutreachUI();
    });

    // Open directory from outreach toast click
    $(document).on('chorus:openDirectory', (e, data) => {
        if (data?.voiceId) {
            openDirectory(data.voiceId);
        }
    });

    console.log(`${LOG_PREFIX} Events registered`);
}

async function handleManualExtract() {
    if (!hasActiveChat()) return;

    const $btn = $('#chorus-btn-extract');
    if ($btn.prop('disabled')) return;

    $btn.prop('disabled', true).addClass('extracting');
    $btn.find('.chorus-deck-action__text').text('EXTRACTING...');

    try {
        const bornVoices = await initializeFromPersona();

        if (bornVoices.length > 0) {
            for (const voice of bornVoices) {
                await playAwakening(voice);
                await new Promise(r => setTimeout(r, 400));
            }
            refreshUI();
        } else if (getLivingVoices().length > 0) {
            toastr.info('Voices already exist in this chat', 'The Chorus', { timeOut: 2000 });
        } else {
            toastr.warning('No persona data to extract from', 'The Chorus', { timeOut: 3000 });
        }
    } catch (e) {
        console.error(`${LOG_PREFIX} Manual extract failed:`, e);
        toastr.error('Extraction failed', 'The Chorus', { timeOut: 3000 });
    } finally {
        $btn.prop('disabled', false).removeClass('extracting');
        $btn.find('.chorus-deck-action__text').text('EXTRACT FROM PERSONA');
    }
}

function onChatChanged() {
    // Load per-chat voice state from chat_metadata
    loadChatState();

    // Reset outreach cooldown for new chat
    resetOutreachCooldown();

    // Reset council state for new chat
    resetCouncil();

    // Reset voice commentary counter
    resetVoiceCounter();

    // Re-render UI with loaded state
    if (extensionSettings.enabled) {
        refreshUI();
        updateOutreachUI();
    }

    console.log(`${LOG_PREFIX} Chat changed — state ${hasActiveChat() ? 'loaded' : 'cleared'}`);
}

/**
 * Update FAB state for pending voice DMs.
 * FAB flips to show mini card with voice glyph + name when DM pending.
 * Flips back when cleared.
 */
function updateOutreachUI() {
    const pending = getVoicesWithPendingDMs();
    const $fab = $('#chorus-fab');

    if (pending.length > 0) {
        // Use the first pending voice for the mini card
        const voice = pending[0];
        const arcana = getArcana(voice.arcana);

        // Populate back face
        $('.chorus-fab__back-glyph').text(arcana.glyph || '🂠');
        $('.chorus-fab__back-name').text(voice.name.toUpperCase());

        // Set color CSS vars on the FAB
        $fab.css({
            '--fab-dm-color': arcana.glow || 'rgba(201, 168, 76, 0.4)',
            '--fab-dm-glow': (arcana.glow || 'rgba(201, 168, 76, 0.15)'),
        });

        // Flip it
        $fab.addClass('chorus-fab--flipped');
        $fab.data('dm-voice-id', voice.id);
    } else {
        // Unflip
        $fab.removeClass('chorus-fab--flipped');
        $fab.removeData('dm-voice-id');
    }
}

async function onMessageReceived() {
    if (!hasActiveChat()) return;
    if (!extensionSettings.enabled) return;

    // Get the last message text
    const ctx = getContext();
    const chat = ctx.chat || [];
    const lastMsg = chat[chat.length - 1];
    if (!lastMsg || lastMsg.is_user) return; // Only process AI messages

    const messageText = lastMsg.mes || '';
    if (messageText.trim().length < 10) return;

    // ── Persona extraction (first message only) ──
    const living = getLivingVoices();
    if (living.length === 0) {
        try {
            showSidebarLoading();
            const bornVoices = await initializeFromPersona();
            hideSidebarLoading();

            if (bornVoices.length > 0) {
                // Staggered awakenings — brief pause between each
                for (const voice of bornVoices) {
                    await playAwakening(voice);
                    // Small breath between cards
                    await new Promise(r => setTimeout(r, 400));
                }
                refreshUI();
            }
        } catch (e) {
            hideSidebarLoading();
            console.error(`${LOG_PREFIX} Persona extraction error:`, e);
        }

        // Skip processing the intro message — it's usually just a greeting
        // and the voices were just born, they have nothing to react to yet
        console.log(`${LOG_PREFIX} Intro message — skipping pipeline (${getLivingVoices().length} voices seeded)`);
        return;
    }

    // ── Normal message processing ──
    // Increment draw counter
    incrementMessageCounter();

    // Apply natural influence decay if enabled
    if (extensionSettings.naturalDecay) {
        decayAllInfluence(1);
    }

    // Decay accumulators slightly (natural cooldown)
    decayAccumulators(2);

    try {
        // Show loading indicator
        showSidebarLoading();

        // Run the full voice engine pipeline
        const result = await processMessage(messageText);

        // Hide loading
        hideSidebarLoading();

        // Update escalation bar
        updateEscalationUI(getEscalation());

        // Handle lifecycle events (animations)
        await handleLifecycleEvents(result.lifecycleEvents);

        // Handle new voice birth (awakening animation)
        if (result.newVoice) {
            await playAwakening(result.newVoice);
            refreshUI();
        }

        // Render narrator (before voice commentary — narrator frames, voices react)
        if (result.narrator) {
            renderSidebarCommentary([{
                voiceId: '_narrator',
                name: 'Narrator',
                arcana: 'world',
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

        // Check if any voice wants to reach out via DM
        const outreach = await checkOutreach(
            result.classification.themes || [],
            result.classification.impact || 'none',
            result.classification.summary || ''
        );
        if (outreach) {
            updateOutreachUI();
        }

        console.log(`${LOG_PREFIX} Message processed: impact=${result.classification.impact}, ${result.commentary.length} voices, ${result.lifecycleEvents.length} lifecycle events`);
    } catch (e) {
        hideSidebarLoading();
        console.error(`${LOG_PREFIX} Voice engine error:`, e);
    }
}

/**
 * Handle lifecycle events with proper animations.
 */
async function handleLifecycleEvents(events) {
    if (!events || events.length === 0) return;

    for (const event of events) {
        switch (event.type) {
            case 'resolved': {
                // Look up the voice (still in array, just marked dead)
                const voice = getVoiceById(event.voiceId);
                if (voice) {
                    await playDissolution(voice, event.resolutionType || 'fade');
                }
                refreshUI();
                break;
            }

            case 'transforming': {
                // Old voice → new voice
                const oldVoice = getVoiceById(event.voiceId);
                if (oldVoice && event.newVoice) {
                    await playTransformation(oldVoice, event.newVoice);
                } else if (oldVoice) {
                    // Transform without new voice (shouldn't happen, but safe)
                    await playDissolution(oldVoice, 'fade');
                }
                refreshUI();
                break;
            }

            case 'fade_death': {
                const voice = getVoiceById(event.voiceId);
                if (voice) {
                    await playDissolution(voice, 'fade');
                }
                refreshUI();
                break;
            }

            case 'consumed': {
                // Predator devours prey — animate prey being consumed
                const prey = getVoiceById(event.preyId || event.voiceId);
                const predator = event.predatorId ? getVoiceById(event.predatorId) : null;
                if (prey) {
                    const el = document.getElementById(`chorus-card-${prey.id}`);
                    if (el) {
                        el.classList.add('chorus-tarot--consuming');
                        await new Promise(r => setTimeout(r, 1300));
                    }
                }
                // Narrator reacts to consume
                if (predator && prey) {
                    try {
                        const narration = await narrateConsume(predator, prey);
                        if (narration) {
                            renderSidebarCommentary([{
                                voiceId: '_narrator',
                                name: getArchetypeInfo().name,
                                arcana: 'narrator',
                                relationship: 'narrator',
                                text: narration,
                            }]);
                        }
                    } catch (_e) { /* narrator fail is non-critical */ }
                }
                if (window.toastr) {
                    toastr.warning(event.message || `${event.predatorName} devoured ${event.preyName}.`, 'Voice Consumed', { timeOut: 5000 });
                }
                refreshUI();
                break;
            }

            case 'merged': {
                // Two voices spiral inward and combine
                const el1 = document.getElementById(`chorus-card-${event.voiceId}`);
                const el2 = event.partnerId ? document.getElementById(`chorus-card-${event.partnerId}`) : null;
                if (el1) el1.classList.add('chorus-tarot--merge-left');
                if (el2) el2.classList.add('chorus-tarot--merge-right');
                await new Promise(r => setTimeout(r, 1300));
                // Narrator reacts to merge
                if (event.voiceId && event.partnerId && event.newVoiceId) {
                    try {
                        const voiceA = getVoiceById(event.voiceId);
                        const voiceB = getVoiceById(event.partnerId);
                        const newV = getVoiceById(event.newVoiceId);
                        if (voiceA && voiceB && newV) {
                            const narration = await narrateMerge(voiceA, voiceB, newV);
                            if (narration) {
                                renderSidebarCommentary([{
                                    voiceId: '_narrator',
                                    name: getArchetypeInfo().name,
                                    arcana: 'narrator',
                                    relationship: 'narrator',
                                    text: narration,
                                }]);
                            }
                        }
                    } catch (_e) { /* narrator fail is non-critical */ }
                }
                if (window.toastr) {
                    toastr.info(event.message || `${event.name} and ${event.partnerName} merged.`, 'Voices Merged', { timeOut: 5000 });
                }
                refreshUI();
                break;
            }

            case 'state_change':
                // Subtle — no animation, no toastr. The user sees it in behavior.
                console.log(`${LOG_PREFIX} ${event.name}: ${event.newState}`);
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
        initDirectory();
        initCouncil();
        registerEvents();

        console.log(`${LOG_PREFIX} \u2705 Loaded successfully`);

    } catch (error) {
        console.error(`${LOG_PREFIX} \u274C Critical failure:`, error);
        toastr.error('The Chorus failed to initialize.', 'The Chorus', { timeOut: 10000 });
    }
});
