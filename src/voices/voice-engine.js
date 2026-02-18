/**
 * THE CHORUS — Voice Engine
 * Orchestrates the per-message flow:
 *   1. Classify message (impact + themes)
 *   2. Update state (influence, accumulators, decay)
 *   3. Roll for sidebar speakers → batched generation
 *   4. Card pull / spread (conditional on impact + settings)
 *
 * Also handles spread generation (individual calls per position).
 */

import { getContext } from '../../../../../extensions.js';
import {
    ALL_THEMES, THEMES, TONE_ANCHORS, SPREAD_POSITIONS,
    LOG_PREFIX, IMPACT_TO_DEPTH,
} from '../config.js';
import {
    extensionSettings,
    getVoices,
    getLivingVoices,
    getVoiceById,
    getArcana,
    adjustInfluence,
    updateVoice,
    saveChatState,
    getEscalation,
    setEscalation,
} from '../state.js';
import { classifyMessage } from './classifier.js';
import {
    rollForParticipation,
    selectMostOpinionated,
    selectForSpread,
    calculateInfluenceDeltas,
} from './participation.js';
import { birthVoiceFromEvent, birthVoiceFromPersona } from './voice-birth.js';
import { processLifecycle, completeTransformation } from './voice-lifecycle.js';
import { tryAmbientNarration, narrateBirth, narrateDeath } from './narrator.js';

// =============================================================================
// PROFILE RESOLUTION (shared with classifier)
// =============================================================================

function getProfileId() {
    const ctx = getContext();
    const connectionManager = ctx.extensionSettings?.connectionManager;
    if (!connectionManager) return null;

    const profileName = extensionSettings.connectionProfile || 'current';
    if (profileName === 'current' || profileName === 'default') {
        return connectionManager.selectedProfile;
    }

    const profile = connectionManager.profiles?.find(p => p.name === profileName);
    return profile ? profile.id : connectionManager.selectedProfile;
}

async function sendRequest(messages, maxTokens = 500) {
    const ctx = getContext();
    if (!ctx.ConnectionManagerRequestService) {
        throw new Error('ConnectionManagerRequestService not available');
    }

    const profileId = getProfileId();
    if (!profileId) {
        throw new Error('No connection profile available');
    }

    const response = await ctx.ConnectionManagerRequestService.sendRequest(
        profileId,
        messages,
        maxTokens,
        {
            extractData: true,
            includePreset: true,
            includeInstruct: false,
        },
        {},
    );

    return response?.content || response || '';
}

// =============================================================================
// CONTEXT HELPERS
// =============================================================================

/**
 * Get recent chat messages for context.
 */
function getRecentMessages(count = 5) {
    const ctx = getContext();
    const chat = ctx.chat || [];
    const recent = chat.slice(-count);

    return recent.map(msg => {
        const speaker = msg.is_user ? '{{user}}' : (msg.name || '{{char}}');
        const text = (msg.mes || '').substring(0, 500); // Truncate long messages
        return `${speaker}: ${text}`;
    }).join('\n\n');
}

/**
 * Get persona excerpt for voice context.
 */
function getPersonaExcerpt() {
    const ctx = getContext();

    // Try user persona first
    if (ctx.userPersona) {
        return ctx.userPersona.substring(0, 800);
    }

    // Fallback to persona description
    const persona = ctx.extensionSettings?.persona;
    if (persona?.description) {
        return persona.description.substring(0, 800);
    }

    return '(No persona available)';
}

/**
 * Get tone anchor description.
 */
function getToneDescription() {
    const key = extensionSettings.toneAnchor || 'raw';
    const tone = TONE_ANCHORS[key];
    return tone ? `${tone.name}: ${tone.description}` : 'Raw: Conversational, profane, blunt.';
}

// =============================================================================
// SIDEBAR COMMENTARY (batched)
// =============================================================================

/**
 * Build the batched sidebar prompt for multiple voices.
 */
function buildSidebarPrompt(speakers, recentMessages, personaExcerpt) {
    const toneDesc = getToneDescription();

    const voiceBlocks = speakers.map(voice => {
        const arcana = getArcana(voice.arcana);
        return `---
VOICE: ${voice.name} (${arcana.name})
Personality: ${voice.personality}
Speaking Style: ${voice.speakingStyle}
Obsession: ${voice.obsession || 'None defined'}
Opinion of {{user}}: ${voice.opinion || 'No opinion yet'}
Blind Spot: ${voice.blindSpot || 'None defined'}
Fragment Identity: ${voice.selfAwareness || 'Uncertain about its nature'}
Thinks In Terms Of: ${voice.metaphorDomain || 'general'}
Verbal Tic: ${voice.verbalTic || 'None'}
Relationship: ${voice.relationship} | Influence: ${voice.influence}/100
Silent for: ${voice.silentStreak || 0} messages
${voice.lastCommentary ? `You just said: "${voice.lastCommentary}" — do NOT repeat yourself or rephrase this.` : ''}`;
    }).join('\n');

    return [
        {
            role: 'system',
            content: `You are generating the internal voices of {{user}}'s psyche. These voices are fragments — born from extreme moments, carrying their weight ever since. They exist inside {{user}}'s head, inside the fiction. They are intrusive thoughts with names and grudges.

CHAT TONE: ${toneDesc}

{{user}}'s PERSONA:
${personaExcerpt}

VOICES PRESENT (generate a response for each):

${voiceBlocks}

RECENT SCENE:
${recentMessages}`,
        },
        {
            role: 'user',
            content: `For each voice listed above, generate their reaction to what just happened.
Stay in each voice's character — use their speaking style, verbal tic, and metaphor domain.
Be brief — one to three sentences per voice unless something big happened.
Voices may argue with each other or respond to each other.
If a voice has nothing to say: [SILENT]
Do not narrate. Do not describe the scene. React to it.

Format (one per voice, in order):
[VOICE_NAME]: response or [SILENT]`,
        },
    ];
}

/**
 * Parse batched sidebar response into per-voice lines.
 * Expected format: [VOICE_NAME]: response text
 */
function parseSidebarResponse(responseText, speakers) {
    const results = {};

    if (!responseText) return results;

    // Initialize all speakers as silent
    for (const voice of speakers) {
        results[voice.id] = { text: null, silent: true };
    }

    // Parse each line
    const lines = responseText.split('\n');
    let currentVoice = null;
    let currentText = '';

    for (const line of lines) {
        // Check for voice label: [Name]: text or Name: text
        const labelMatch = line.match(/^\[?([^\]:\n]+)\]?\s*:\s*(.*)$/);
        if (labelMatch) {
            // Save previous voice's text
            if (currentVoice) {
                finalizeLine(results, speakers, currentVoice, currentText.trim());
            }

            currentVoice = labelMatch[1].trim();
            currentText = labelMatch[2].trim();
        } else if (currentVoice && line.trim()) {
            // Continuation of previous voice's response
            currentText += ' ' + line.trim();
        }
    }

    // Save last voice
    if (currentVoice) {
        finalizeLine(results, speakers, currentVoice, currentText.trim());
    }

    return results;
}

function finalizeLine(results, speakers, voiceName, text) {
    // Match voice name to speaker (case-insensitive, flexible)
    const voice = speakers.find(v =>
        v.name.toLowerCase() === voiceName.toLowerCase() ||
        v.name.toLowerCase().replace(/^the\s+/, '') === voiceName.toLowerCase().replace(/^the\s+/, ''),
    );

    if (!voice) return;

    const isSilent = !text || text === '[SILENT]' || text.toLowerCase().includes('[silent]');

    results[voice.id] = {
        text: isSilent ? null : text,
        silent: isSilent,
    };
}

/**
 * Generate sidebar commentary for this message.
 * Returns array of { voiceId, name, arcana, text } for rendering.
 */
export async function generateSidebarCommentary(themes = []) {
    const speakers = rollForParticipation(themes, 3);
    if (speakers.length === 0) return [];

    const recentMessages = getRecentMessages(5);
    const personaExcerpt = getPersonaExcerpt();
    const messages = buildSidebarPrompt(speakers, recentMessages, personaExcerpt);

    try {
        const responseText = await sendRequest(messages, 600);
        const parsed = parseSidebarResponse(responseText, speakers);

        const commentary = [];
        for (const voice of speakers) {
            const result = parsed[voice.id] || { text: null, silent: true };

            if (!result.silent && result.text) {
                // Update voice tracking
                updateVoice(voice.id, {
                    lastSpoke: Date.now(),
                    lastCommentary: result.text,
                    silentStreak: 0,
                });

                commentary.push({
                    voiceId: voice.id,
                    name: voice.name,
                    arcana: voice.arcana,
                    relationship: voice.relationship,
                    text: result.text,
                });
            } else {
                // Voice chose silence — increment streak
                updateVoice(voice.id, {
                    silentStreak: (voice.silentStreak || 0) + 1,
                });
            }
        }

        // Also increment silent streak for voices that didn't even roll
        const speakerIds = new Set(speakers.map(v => v.id));
        for (const voice of getLivingVoices()) {
            if (!speakerIds.has(voice.id)) {
                updateVoice(voice.id, {
                    silentStreak: (voice.silentStreak || 0) + 1,
                });
            }
        }

        saveChatState();
        console.log(`${LOG_PREFIX} Sidebar: ${commentary.length} voices spoke`);
        return commentary;
    } catch (e) {
        console.error(`${LOG_PREFIX} Sidebar generation failed:`, e);
        return [];
    }
}

// =============================================================================
// SPREAD GENERATION (individual calls)
// =============================================================================

/**
 * Build prompt for a single spread position.
 */
function buildSpreadPrompt(voice, positionKey, positionDef, eventSummary, reversed) {
    const arcana = getArcana(voice.arcana);
    const toneDesc = getToneDescription();
    const recentMessages = getRecentMessages(3);
    const personaExcerpt = getPersonaExcerpt();

    const reversalBlock = reversed
        ? `\nYOU ARE REVERSED. Your perspective is shadowed, inverted, or self-sabotaging. Speak from your blind spot, not your strength. What you normally see clearly is now obscured.`
        : '';

    return [
        {
            role: 'system',
            content: `You are ${voice.name}, a fragment of {{user}}'s psyche.

CHAT TONE: ${toneDesc}

YOUR IDENTITY:
Name: ${voice.name}
Arcana: ${arcana.name} (${arcana.numeral})
Personality: ${voice.personality}
Speaking Style: ${voice.speakingStyle}
Obsession: ${voice.obsession || 'None defined'}
Opinion of {{user}}: ${voice.opinion || 'No opinion yet'}
Blind Spot: ${voice.blindSpot || 'None defined'}
Thinks In Terms Of: ${voice.metaphorDomain || 'general'}
Verbal Tic: ${voice.verbalTic || 'None'}

Relationship with {{user}}: ${voice.relationship}
Influence: ${voice.influence}/100

THIS IS A FORMAL READING. You have been drawn into a spread.

YOUR POSITION: ${positionDef.name}
POSITION MEANING: ${positionDef.framing}${reversalBlock}

THE TRIGGERING EVENT:
${eventSummary || 'The current scene'}

RECENT SCENE:
${recentMessages}

{{user}}'s PERSONA:
${personaExcerpt}`,
        },
        {
            role: 'user',
            content: `Speak from your position. This is not casual commentary — this is your formal reading of the moment. Give {{user}} your honest take, your advice, your warning, or your prediction based on your position in the spread.

Be specific. Reference the event. Speak in character.
2-4 sentences.

Do NOT reference other voices or other cards in the spread.
This is YOUR reading, YOUR position, YOUR perspective alone.`,
        },
    ];
}

/**
 * Generate a single card reading.
 * Returns { voiceId, name, arcana, position, reversed, text }
 */
export async function generateSingleCard(themes = [], eventSummary = '') {
    const voice = selectMostOpinionated(themes);
    if (!voice) return null;

    const position = SPREAD_POSITIONS.single.present;
    const reversed = Math.random() * 100 < (extensionSettings.reversalChance || 15);
    const messages = buildSpreadPrompt(voice, 'present', position, eventSummary, reversed);

    try {
        const text = await sendRequest(messages, 300);

        return {
            voiceId: voice.id,
            name: voice.name,
            arcana: voice.arcana,
            relationship: voice.relationship,
            influence: voice.influence,
            position: 'present',
            positionName: position.name,
            reversed,
            text: text.trim(),
        };
    } catch (e) {
        console.error(`${LOG_PREFIX} Single card generation failed:`, e);
        return null;
    }
}

/**
 * Generate a full spread reading (three or cross).
 * Returns array of card objects.
 */
export async function generateSpread(spreadType, themes = [], eventSummary = '') {
    const positions = SPREAD_POSITIONS[spreadType];
    if (!positions) {
        console.warn(`${LOG_PREFIX} Unknown spread type: ${spreadType}`);
        return [];
    }

    const assignments = selectForSpread(themes, positions);
    const cards = [];

    // Generate each position (individual calls for quality)
    for (const [posKey, voice] of Object.entries(assignments)) {
        const positionDef = positions[posKey];
        const reversed = Math.random() * 100 < (extensionSettings.reversalChance || 15);
        const messages = buildSpreadPrompt(voice, posKey, positionDef, eventSummary, reversed);

        try {
            const text = await sendRequest(messages, 300);

            cards.push({
                voiceId: voice.id,
                name: voice.name,
                arcana: voice.arcana,
                relationship: voice.relationship,
                influence: voice.influence,
                position: posKey,
                positionName: positionDef.name,
                reversed,
                text: text.trim(),
            });
        } catch (e) {
            console.error(`${LOG_PREFIX} Spread position ${posKey} failed:`, e);
        }
    }

    console.log(`${LOG_PREFIX} Spread (${spreadType}): ${cards.length} cards generated`);
    return cards;
}

// =============================================================================
// ORCHESTRATOR — Per-Message Flow
// =============================================================================

// Birth cooldown — prevent rapid-fire births
let lastBirthTime = 0;
const BIRTH_COOLDOWN_MS = 30000; // 30 seconds between births

/**
 * Main per-message processing pipeline.
 * Called from index.js onMessageReceived.
 *
 * @param {string} messageText - The incoming message text
 * @returns {Object} { classification, commentary[], cardReading, lifecycleEvents[], newVoice }
 */
export async function processMessage(messageText) {
    const result = {
        classification: { impact: 'none', themes: [], summary: '', resolutionProgress: [] },
        commentary: [],
        cardReading: null,
        lifecycleEvents: [],
        newVoice: null,
        narrator: null,  // Narrator text (if it speaks)
    };

    // ─── Step 1: Classify (includes resolution assessment) ───
    result.classification = await classifyMessage(messageText);
    const { impact, themes, summary, resolutionProgress } = result.classification;

    // ─── Step 2: Update influence from themes ───
    const deltas = calculateInfluenceDeltas(themes, extensionSettings.influenceGainRate || 3);
    for (const { voiceId, delta } of deltas) {
        adjustInfluence(voiceId, delta);
    }

    // ─── Step 3: Update escalation from impact ───
    updateEscalation(impact);

    // ─── Step 4: Process lifecycle (resolution, fading, transformation) ───
    result.lifecycleEvents = processLifecycle(result.classification, resolutionProgress);

    // Handle any transformations that completed
    for (const event of result.lifecycleEvents) {
        if (event.type === 'transforming' && event.transformData) {
            const newVoice = await completeTransformation(event.transformData);
            if (newVoice) {
                event.newVoice = newVoice;
                result.newVoice = newVoice;
            }
        }
    }

    // Narrate lifecycle events (births from transform, deaths)
    for (const event of result.lifecycleEvents) {
        if ((event.type === 'resolved' || event.type === 'fade_death') && !result.narrator) {
            result.narrator = await narrateDeath(event);
        }
        if (event.type === 'transforming' && event.newVoice && !result.narrator) {
            result.narrator = await narrateBirth(event.newVoice);
        }
    }

    // ─── Step 5: Birth check ───
    if (!result.newVoice) {
        result.newVoice = await checkBirth(impact, themes, summary, messageText);
    }

    // Narrate new birth
    if (result.newVoice && !result.narrator) {
        result.narrator = await narrateBirth(result.newVoice);
    }

    // ─── Step 6: Sidebar commentary ───
    result.commentary = await generateSidebarCommentary(themes);

    // ─── Step 7: Ambient narrator (if nothing triggered above) ───
    if (!result.narrator) {
        result.narrator = await tryAmbientNarration(messageText, result.commentary);
    }

    // ─── Step 8: Card pull / spread (conditional) ───
    result.cardReading = await handleCardDraw(impact, themes, summary);

    return result;
}

/**
 * Check if a new voice should be born from this message.
 */
async function checkBirth(impact, themes, summary, messageText) {
    // Only birth on significant+ impact
    if (impact !== 'significant' && impact !== 'critical') return null;

    // Cooldown check
    if (Date.now() - lastBirthTime < BIRTH_COOLDOWN_MS) return null;

    // Deck space check
    const living = getLivingVoices();
    if (living.length >= (extensionSettings.maxVoices || 7)) {
        // If autoEgoDeath is enabled, we could force a sacrifice here
        // For now, just block
        return null;
    }

    // Birth sensitivity check — higher sensitivity = more births
    // 1=HAIR (always), 2=LOW (significant+), 3=MED (significant w/ strong themes),
    // 4=HIGH (critical only), 5=EXTREME (critical + rare)
    const sensitivity = extensionSettings.birthSensitivity || 3;
    if (sensitivity >= 4 && impact !== 'critical') return null;
    if (sensitivity >= 3 && impact === 'significant' && themes.length < 2) return null;

    // Use summary as trigger, fall back to message excerpt
    const trigger = summary || messageText.substring(0, 300);

    try {
        const voice = await birthVoiceFromEvent(trigger, impact, themes);
        if (voice) {
            lastBirthTime = Date.now();
        }
        return voice;
    } catch (e) {
        console.error(`${LOG_PREFIX} Birth check failed:`, e);
        return null;
    }
}

/**
 * Initialize the first voice from persona card.
 * Called once on first message in a new chat.
 */
export async function initializeFirstVoice() {
    const living = getLivingVoices();
    if (living.length > 0) return null; // Already have voices

    try {
        const voice = await birthVoiceFromPersona();
        return voice;
    } catch (e) {
        console.error(`${LOG_PREFIX} First voice birth failed:`, e);
        return null;
    }
}

/**
 * Update escalation level based on impact.
 */
function updateEscalation(impact) {
    const current = getEscalation();
    const levels = ['calm', 'rising', 'elevated', 'crisis'];
    const currentIdx = levels.indexOf(current);

    let newIdx = currentIdx;

    switch (impact) {
        case 'critical':
            newIdx = 3; // Jump to crisis
            break;
        case 'significant':
            newIdx = Math.max(newIdx, 2); // At least elevated
            break;
        case 'minor':
            newIdx = Math.max(newIdx, 1); // At least rising
            break;
        case 'none':
            newIdx = Math.max(0, newIdx - 1); // Cool down one step
            break;
    }

    setEscalation(levels[newIdx]);
}

/**
 * Handle card draw based on settings and impact.
 */
async function handleCardDraw(impact, themes, summary) {
    const mode = extensionSettings.drawMode || 'auto';

    if (mode === 'manual') {
        // In manual mode, draws only happen via UI button
        return null;
    }

    // Auto mode: determine spread type from impact
    let spreadType = null;

    if (impact === 'critical') {
        spreadType = 'cross';
    } else if (impact === 'significant') {
        spreadType = 'three';
    } else {
        // none or minor — single card pull (respecting frequency)
        spreadType = 'single';
    }

    if (spreadType === 'single') {
        return await generateSingleCard(themes, summary);
    } else {
        const cards = await generateSpread(spreadType, themes, summary);
        return { type: spreadType, cards };
    }
}

// =============================================================================
// MANUAL DRAW (UI-triggered)
// =============================================================================

/**
 * Manual single card draw (from UI button).
 */
export async function manualSingleDraw() {
    // Get themes from last message if available, otherwise empty
    const recentText = getRecentMessages(1);
    const classification = await classifyMessage(recentText);
    return await generateSingleCard(classification.themes, classification.summary);
}

/**
 * Manual spread draw (from UI button).
 * @param {string} spreadType - 'three' or 'cross'
 */
export async function manualSpreadDraw(spreadType = 'three') {
    const recentText = getRecentMessages(1);
    const classification = await classifyMessage(recentText);
    return await generateSpread(spreadType, classification.themes, classification.summary);
}
