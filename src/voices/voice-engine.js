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
    LOG_PREFIX, IMPACT_TO_DEPTH, ACCUMULATION, CONSUME_THRESHOLDS,
} from '../config.js';
import {
    extensionSettings,
    getVoices,
    getLivingVoices,
    getVoiceById,
    getArcana,
    getTakenArcana,
    getWeakestVoice,
    adjustInfluence,
    updateVoice,
    resolveVoice,
    saveChatState,
    getEscalation,
    setEscalation,
    updateThemeAccumulator,
    clearThemeAccumulation,
} from '../state.js';
import { classifyMessage } from './classifier.js';
import {
    rollForParticipation,
    selectMostOpinionated,
    selectForSpread,
    calculateInfluenceDeltas,
} from './participation.js';
import { birthVoiceFromEvent, birthVoicesFromPersona, birthVoiceFromAccumulation, birthVoiceFromMerge } from './voice-birth.js';
import { processLifecycle, completeTransformation } from './voice-lifecycle.js';
import { tryAmbientNarration, narrateBirth, narrateDeath } from './narrator.js';

// Voice commentary frequency counter (resets each time commentary fires)
let voiceMessageCounter = 0;

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
        const birthLine = voice.birthMoment
            ? `Born From: ${voice.birthMoment} — this wound colors everything you see`
            : '';

        // Voice-to-voice opinions (only for other speakers in this batch)
        const v2vLines = [];
        for (const other of speakers) {
            if (other.id === voice.id) continue;
            // What this voice thinks of the other
            const myOpinion = voice.relationships?.[other.id];
            // What the other thinks of this voice
            const theirOpinion = other.relationships?.[voice.id];
            if (myOpinion) v2vLines.push(`You think of ${other.name}: ${myOpinion}`);
            if (theirOpinion) v2vLines.push(`${other.name} thinks of you: ${theirOpinion}`);
        }
        const v2vBlock = v2vLines.length > 0
            ? `Voice Dynamics:\n${v2vLines.join('\n')}` : '';

        // Wound sensitivity hint (how close to resolution)
        let woundHint = '';
        if (voice.resolution && voice.resolution.type !== 'endure') {
            const ratio = voice.resolution.threshold
                ? voice.resolution.progress / voice.resolution.threshold : 0;
            if (ratio > 0.6) {
                woundHint = 'Something is shifting inside you. You can feel it. Your usual certainty is wavering.';
            } else if (ratio > 0.3) {
                woundHint = 'Your wound is stirring. You can feel it when certain topics come up. It makes you uneasy.';
            }
        }

        // Reversed status
        const reversedHint = voice.reversed
            ? `REVERSED ASPECT: This voice embodies the shadow/inverted meaning of its arcana. Your perspective is darker, more complicated, more honest about the ugly parts.`
            : '';

        // Birth type flavor
        const birthTypeHint = voice.birthType === 'accumulation'
            ? 'Born from a pattern, not a moment. You\'re made of paper cuts.'
            : voice.birthType === 'merge'
                ? `Born from the merger of two other voices. You carry both their perspectives.`
                : '';

        return `---
VOICE: ${voice.name} (${arcana.name}${voice.reversed ? ' REVERSED' : ''})
Personality: ${voice.personality}
Speaking Style: ${voice.speakingStyle}
Obsession: ${voice.obsession || 'None defined'}
Opinion of {{user}}: ${voice.opinion || 'No opinion yet'}
Blind Spot: ${voice.blindSpot || 'None defined'}
Fragment Identity: ${voice.selfAwareness || 'Uncertain about its nature'}
Thinks In Terms Of: ${voice.metaphorDomain || 'general'} — use this lens when reacting
Verbal Tic: ${voice.verbalTic || 'None'}
${reversedHint}
${birthTypeHint}
${birthLine}
Relationship with {{user}}: ${voice.relationship} | Influence: ${voice.influence}/100
${v2vBlock}
${woundHint}
Silent for: ${voice.silentStreak || 0} messages
${voice.lastCommentary ? `You just said: "${voice.lastCommentary}" — do NOT repeat yourself or rephrase this. Build on it, contradict it, or say something new.` : ''}`;
    }).join('\n');

    return [
        {
            role: 'system',
            content: `You are generating the internal voices of {{user}}'s psyche. These voices live INSIDE {{user}}'s head. They are {{user}}'s own thoughts, fears, impulses, and reactions — NOT the thoughts of any other character.

CRITICAL PERSPECTIVE RULE:
- These voices react to what just happened FROM {{user}}'s INTERNAL point of view.
- They are how {{user}} FEELS about what {{char}} said or did. They are the unspoken reaction.
- They are NOT {{char}}'s thoughts. They are NOT narrating {{char}}'s feelings.
- They do NOT describe what {{char}} is thinking or feeling.
- If {{char}} said something hurtful: the voices react to the HURT {{user}} feels, not describe {{char}}'s cruelty.
- Think: what would {{user}} be thinking right now but NOT saying out loud?

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

REMEMBER: These are {{user}}'s INNER thoughts reacting to the scene. They talk ABOUT {{char}} and what happened, not AS {{char}}. They are the part of {{user}} that thinks but doesn't speak.

Do not narrate. Do not describe the scene. Do not write from {{char}}'s perspective. React to it AS {{user}}'s internal fragments.

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
export async function generateSidebarCommentary(themes = [], impact = 'minor') {
    const maxSpeakers = extensionSettings.maxSpeakers || 3;
    const speakers = rollForParticipation(themes, maxSpeakers, impact);
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

    // Use position-specific reversal text if available, else generic
    const reversalBlock = reversed
        ? `\nYOU ARE REVERSED.\n${positionDef.reversed || 'Your perspective is shadowed, inverted, or self-sabotaging. Speak from your blind spot, not your strength.'}`
        : '';

    // Voice memory — last few things this voice said + birth context
    const memoryLines = [];
    if (voice.birthMoment) {
        memoryLines.push(`BIRTH MEMORY (the moment that created you): ${voice.birthMoment}`);
    }
    if (voice.lastCommentary) {
        memoryLines.push(`YOUR LAST WORDS: "${voice.lastCommentary}" — build on this or contradict it, don't repeat it.`);
    }
    // Pull last 2 directory exchanges if any
    const dirHistory = voice.directoryHistory || [];
    if (dirHistory.length > 0) {
        const recent = dirHistory.slice(-2);
        const dirSummary = recent.map(h =>
            h.role === 'user' ? `{{user}} said to you: "${h.content?.substring(0, 80)}..."` :
                `You said: "${h.content?.substring(0, 80)}..."`
        ).join('\n');
        memoryLines.push(`RECENT PRIVATE CONVERSATION:\n${dirSummary}`);
    }
    const memoryBlock = memoryLines.length > 0
        ? `\nYOUR MEMORY:\n${memoryLines.join('\n')}\n`
        : '';

    return [
        {
            role: 'system',
            content: `You are ${voice.name}, a fragment of {{user}}'s psyche. You exist inside {{user}}'s head. You are one piece of a fractured inner world.

CHAT TONE: ${toneDesc}

YOUR IDENTITY:
Name: ${voice.name}
Arcana: ${arcana.name} (${arcana.numeral})
Personality: ${voice.personality}
Speaking Style: ${voice.speakingStyle}
Obsession: ${voice.obsession || 'None defined'}
Opinion of {{user}}: ${voice.opinion || 'No opinion yet'}
Blind Spot: ${voice.blindSpot || 'None defined'}
Self-Awareness: ${voice.selfAwareness || 'Uncertain about its nature'}
Thinks In Terms Of: ${voice.metaphorDomain || 'general'}
Verbal Tic: ${voice.verbalTic || 'None'}

Relationship with {{user}}: ${voice.relationship}
Influence: ${voice.influence}/100
${memoryBlock}
THIS IS A FORMAL READING. You have been drawn into a spread.
This is not casual commentary — you have been given a POSITION with meaning.

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
            content: `Speak from your position. This is your formal reading — not a comment, a READING.

REQUIREMENTS:
- Reference the specific triggering event, not generalities
- Use your metaphor domain (${voice.metaphorDomain || 'general'}) to frame your reading
- Speak in your verbal tic and style
- If you have a birth memory, let it color your perspective — you see everything through that wound
${reversed ? '- YOU ARE REVERSED: Speak from your blind spot. Your usual clarity fails you here. Be honest about what you cannot see.' : '- Speak from your strength. Your position in the spread defines your role.'}
- 2-4 sentences. Make every word count.

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

// Track last spread advice for drift (module-level, not persisted)
let lastSpreadAdvice = []; // [{ voiceId, raises[], lowers[] }]

// Relationship drift map — same as directory.js
const DRIFT_MAP = {
    hostile:     { warmer: 'resentful',   colder: 'hostile' },
    resentful:   { warmer: 'curious',     colder: 'hostile' },
    indifferent: { warmer: 'curious',     colder: 'resentful' },
    curious:     { warmer: 'warm',        colder: 'indifferent' },
    warm:        { warmer: 'devoted',     colder: 'curious' },
    devoted:     { warmer: 'protective',  colder: 'warm' },
    protective:  { warmer: 'protective',  colder: 'devoted' },
    obsessed:    { warmer: 'obsessed',    colder: 'devoted' },
    manic:       { warmer: 'manic',       colder: 'obsessed' },
    grieving:    { warmer: 'curious',     colder: 'indifferent' },
};

/**
 * Nudge a voice's relationship one step warmer or colder.
 * Returns true if the relationship actually changed.
 */
function nudgeRelationship(voice, direction) {
    const current = voice.relationship || 'curious';
    const options = DRIFT_MAP[current];
    if (!options) return false;

    const newRel = options[direction];
    if (!newRel || newRel === current) return false;

    updateVoice(voice.id, { relationship: newRel });
    console.log(`${LOG_PREFIX} Passive drift: ${voice.name} ${current} → ${newRel} (${direction})`);
    return true;
}

/**
 * Apply passive relationship drift from main chat themes.
 *
 * Voices whose raise triggers keep matching → drift warmer (engaged, invested)
 * Voices whose triggers NEVER match → drift toward indifferent (forgotten)
 * Voices whose lower triggers match → complicated — depends on relationship.
 *   A hostile voice seeing healing themes gets MORE hostile (resentful of the change).
 *   A devoted voice seeing healing themes drifts warmer (pleased by growth).
 *
 * Very slow — 15% chance per message, max one drift per call.
 */
function applyPassiveRelationshipDrift(themes) {
    if (!themes || themes.length === 0) return;

    // Only fire 15% of the time — drift should be SLOW
    if (Math.random() > 0.15) return;

    const living = getLivingVoices();
    let drifted = false;

    for (const voice of living) {
        if (drifted) break; // Max one drift per message

        const raises = voice.influenceTriggers?.raises || [];
        const lowers = voice.influenceTriggers?.lowers || [];
        const raisesMatch = themes.some(t => raises.includes(t));
        const lowersMatch = themes.some(t => lowers.includes(t));

        if (raisesMatch) {
            // Scene matches their wound → they're engaged → drift warmer
            // EXCEPT: obsessed/manic voices get MORE obsessed, not warmer
            const rel = voice.relationship;
            if (rel === 'obsessed' || rel === 'manic') {
                // Already maxed in their direction, no drift
            } else {
                drifted = nudgeRelationship(voice, 'warmer');
            }
        } else if (lowersMatch) {
            // Scene matches their healing themes → complicated
            const rel = voice.relationship;
            if (rel === 'hostile' || rel === 'resentful') {
                // Hostile voice sees healing → resents the progress → stays cold
                // No drift (already cold)
            } else if (rel === 'devoted' || rel === 'protective' || rel === 'warm') {
                // Warm voice sees healing → pleased → drift warmer
                drifted = nudgeRelationship(voice, 'warmer');
            }
            // Curious/indifferent: no drift from lowers
        }

        // Check for abandonment drift: voice hasn't been relevant in a while
        if (!raisesMatch && !lowersMatch && (voice.silentStreak || 0) > 10) {
            // Voice has been irrelevant for 10+ messages → drift toward indifferent
            drifted = nudgeRelationship(voice, 'colder');
        }
    }
}

/**
 * Apply drift from spread advice being followed or ignored.
 * Called each message — checks if last spread's advice was "followed" or "defied"
 * by comparing the voice's triggers to current themes.
 *
 * Note: This is approximate. We check if the scene moved toward what the voice
 * wanted (raises matched) or away from it (lowers matched). Not perfect, but organic.
 *
 * IMPORTANT: Following advice makes the voice LIKE you more, but does NOT
 * progress resolution. Affection ≠ healing. A devoted voice can still be wounded.
 */
function applyAdviceDrift(themes) {
    if (!lastSpreadAdvice || lastSpreadAdvice.length === 0) return;
    if (!themes || themes.length === 0) {
        lastSpreadAdvice = []; // Clear, nothing to compare
        return;
    }

    for (const advice of lastSpreadAdvice) {
        const voice = getVoiceById(advice.voiceId);
        if (!voice || voice.state === 'dead') continue;

        const raisesMatch = themes.some(t => (advice.raises || []).includes(t));
        const lowersMatch = themes.some(t => (advice.lowers || []).includes(t));

        if (raisesMatch && !lowersMatch) {
            // Scene aligned with voice's worldview → "they listened!"
            // But this can be ironic: the voice might have BAD advice
            // and be pleased the user is making the same mistake
            nudgeRelationship(voice, 'warmer');
        } else if (lowersMatch && !raisesMatch) {
            // Scene went against voice's worldview → "they IGNORED me"
            nudgeRelationship(voice, 'colder');
        }
    }

    // Clear — only check once per spread
    lastSpreadAdvice = [];
}

/**
 * Store advice from a spread for drift tracking on next message.
 */
function recordSpreadAdvice(cardReading) {
    if (!cardReading || !cardReading.cards) {
        lastSpreadAdvice = [];
        return;
    }

    lastSpreadAdvice = cardReading.cards.map(card => ({
        voiceId: card.voiceId,
        raises: getVoiceById(card.voiceId)?.influenceTriggers?.raises || [],
        lowers: getVoiceById(card.voiceId)?.influenceTriggers?.lowers || [],
    }));
}

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

    // ─── Step 2b: Passive relationship drift from chat context ───
    applyPassiveRelationshipDrift(themes);

    // ─── Step 2c: Spread advice drift (did user follow/ignore last reading?) ───
    applyAdviceDrift(themes);

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

    // ─── Step 5: Birth check (event-driven) ───
    if (!result.newVoice) {
        result.newVoice = await checkBirth(impact, themes, summary, messageText);
    }

    // ─── Step 5b: Accumulation tracking + birth ───
    if (!result.newVoice && themes.length > 0) {
        result.newVoice = await checkAccumulationBirth(impact, themes);
    }

    // ─── Step 5c: Consume check (predator devours prey) ───
    if (!result.newVoice) {
        const consumeEvent = checkConsume();
        if (consumeEvent) {
            result.lifecycleEvents.push(consumeEvent);
        }
    }

    // ─── Step 5d: Merge check (overlapping voices consolidate) ───
    if (!result.newVoice) {
        const mergeResult = await checkMerge();
        if (mergeResult) {
            result.newVoice = mergeResult.newVoice;
            result.lifecycleEvents.push(...mergeResult.events);
        }
    }

    // Narrate new birth
    if (result.newVoice && !result.narrator) {
        result.narrator = await narrateBirth(result.newVoice);
    }

    // ─── Step 6: Sidebar commentary (gated by voice frequency setting) ───
    voiceMessageCounter++;
    const voiceFreq = extensionSettings.voiceFrequency || 1;
    if (voiceMessageCounter >= voiceFreq) {
        result.commentary = await generateSidebarCommentary(themes, impact);
        voiceMessageCounter = 0;
    }

    // ─── Step 7: Ambient narrator (if nothing triggered above) ───
    if (!result.narrator) {
        result.narrator = await tryAmbientNarration(messageText, result.commentary);
    }

    // ─── Step 8: Card pull / spread (conditional) ───
    result.cardReading = await handleCardDraw(impact, themes, summary);

    // ─── Step 8b: Record spread advice for drift tracking on next message ───
    if (result.cardReading) {
        recordSpreadAdvice(result.cardReading);
    }

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

    // All 22 arcana taken — absolute cap
    const taken = getTakenArcana();
    if (taken.length >= 22) return null;

    // Deck space check — try to make room if full
    const living = getLivingVoices();
    const maxVoices = Math.min(22, extensionSettings.maxVoices || 7);
    if (living.length >= maxVoices) {
        const madeRoom = await makeRoomInDeck();
        if (!madeRoom) return null;
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
 * Try to make room in a full deck based on fullDeckBehavior setting.
 * Returns true if room was made, false if deck stays full.
 */
async function makeRoomInDeck() {
    const behavior = extensionSettings.fullDeckBehavior || 'block';

    switch (behavior) {
        case 'block':
            console.log(`${LOG_PREFIX} Deck full, behavior=block — no room`);
            return false;

        case 'heal': {
            // Resolve the weakest non-core voice
            const weakest = getWeakestVoice();
            if (!weakest) return false;
            console.log(`${LOG_PREFIX} Deck full, behavior=heal — resolving ${weakest.name} (inf:${weakest.influence})`);
            resolveVoice(weakest.id, 'full deck heal');
            return true;
        }

        case 'merge': {
            // Find two overlapping voices and merge them
            const living = getLivingVoices().filter(v => v.depth !== 'core');
            for (let i = 0; i < living.length; i++) {
                for (let j = i + 1; j < living.length; j++) {
                    const aRaises = living[i].influenceTriggers?.raises || [];
                    const bRaises = living[j].influenceTriggers?.raises || [];
                    const shared = aRaises.filter(t => bRaises.includes(t));
                    if (shared.length >= 1) {
                        // Good enough overlap — force merge
                        console.log(`${LOG_PREFIX} Deck full, behavior=merge — merging ${living[i].name} + ${living[j].name}`);
                        const merged = await birthVoiceFromMerge(living[i], living[j]);
                        if (merged) {
                            resolveVoice(living[i].id, `merged into ${merged.name}`);
                            resolveVoice(living[j].id, `merged into ${merged.name}`);
                            return true; // Net -1 (removed 2, added 1), room for new birth
                        }
                    }
                }
            }
            // No merge candidates — fall back to heal
            const weakest = getWeakestVoice();
            if (!weakest) return false;
            resolveVoice(weakest.id, 'full deck merge fallback');
            return true;
        }

        case 'consume': {
            // Strongest eats weakest
            const living = getLivingVoices();
            const strongest = [...living].sort((a, b) => b.influence - a.influence)[0];
            const weakest = getWeakestVoice();
            if (!strongest || !weakest || strongest.id === weakest.id) return false;
            console.log(`${LOG_PREFIX} Deck full, behavior=consume — ${strongest.name} devours ${weakest.name}`);

            // Steal triggers
            const preyRaises = weakest.influenceTriggers?.raises || [];
            const predRaises = strongest.influenceTriggers?.raises || [];
            const stolen = preyRaises.filter(t => !predRaises.includes(t)).slice(0, 2);
            if (stolen.length > 0) {
                updateVoice(strongest.id, {
                    influenceTriggers: {
                        ...strongest.influenceTriggers,
                        raises: [...predRaises, ...stolen],
                    },
                });
            }
            adjustInfluence(strongest.id, 10);
            resolveVoice(weakest.id, `consumed by ${strongest.name}`);
            return true;
        }

        default:
            return false;
    }
}

/**
 * Track theme accumulation and check for "death by a thousand cuts" births.
 * Only fires on minor impact — significant/critical have their own birth path.
 */
async function checkAccumulationBirth(impact, themes) {
    // Only accumulate on none/minor — significant+ gets handled by checkBirth
    if (impact === 'significant' || impact === 'critical') return null;

    // Cooldown check
    if (Date.now() - lastBirthTime < BIRTH_COOLDOWN_MS) return null;

    // Update accumulator
    const acc = updateThemeAccumulator(themes, ACCUMULATION.decayPerMessage);

    // Check for any theme crossing threshold
    const threshold = ACCUMULATION.threshold;
    const minMessages = ACCUMULATION.minUniqueMessages;

    for (const [theme, data] of Object.entries(acc)) {
        if (data.count >= threshold && data.messages >= minMessages) {
            // Deck space check
            const living = getLivingVoices();
            if (living.length >= (extensionSettings.maxVoices || 7)) return null;

            // Check this theme isn't already well-covered by existing voices
            const alreadyCovered = living.some(v => {
                const raises = v.influenceTriggers?.raises || [];
                return raises.includes(theme);
            });
            if (alreadyCovered) {
                // Theme already has a voice — just reset accumulator
                clearThemeAccumulation(theme);
                continue;
            }

            try {
                const voice = await birthVoiceFromAccumulation(theme, data.messages);
                if (voice) {
                    lastBirthTime = Date.now();
                    clearThemeAccumulation(theme);
                    return voice;
                }
            } catch (e) {
                console.error(`${LOG_PREFIX} Accumulation birth failed:`, e);
            }
        }
    }

    return null;
}

/**
 * Check if a dominant voice consumes a weaker one.
 * Predator: high influence + hostile opinion of prey.
 * Prey: low influence, unable to resist.
 *
 * Returns a lifecycle event or null.
 */
function checkConsume() {
    const living = getLivingVoices();
    if (living.length < 2) return null;

    // Only check occasionally (10% per message to avoid spam)
    if (Math.random() > 0.10) return null;

    const { predatorMinInfluence, preyMaxInfluence } = CONSUME_THRESHOLDS;

    for (const predator of living) {
        if (predator.influence < predatorMinInfluence) continue;
        if (!predator.relationships) continue;

        for (const prey of living) {
            if (prey.id === predator.id) continue;
            if (prey.influence > preyMaxInfluence) continue;
            if (prey.depth === 'core') continue; // Core voices can't be consumed

            // Check for hostile opinion
            const opinion = (predator.relationships[prey.id] || '').toLowerCase();
            const isHostile = opinion.includes('hostile') || opinion.includes('hate') ||
                              opinion.includes('suppress') || opinion.includes('devour') ||
                              opinion.includes('destroy');

            if (!isHostile) continue;

            // CONSUME: predator absorbs prey
            console.log(`${LOG_PREFIX} CONSUME: ${predator.name} (inf:${predator.influence}) devours ${prey.name} (inf:${prey.influence})`);

            // Predator gains some of prey's triggers
            const preyRaises = prey.influenceTriggers?.raises || [];
            const predRaises = predator.influenceTriggers?.raises || [];
            const stolen = preyRaises.filter(t => !predRaises.includes(t)).slice(0, 2);
            if (stolen.length > 0) {
                updateVoice(predator.id, {
                    influenceTriggers: {
                        ...predator.influenceTriggers,
                        raises: [...predRaises, ...stolen],
                    },
                });
            }

            // Predator gains influence from the kill
            adjustInfluence(predator.id, 10);

            // Prey dies (consumed by predator)
            resolveVoice(prey.id, `consumed by ${predator.name}`);

            return {
                type: 'consumed',
                predatorId: predator.id,
                predatorName: predator.name,
                preyId: prey.id,
                preyName: prey.name,
                voiceId: prey.id,
                name: prey.name,
                stolen,
                message: `${predator.name} devoured ${prey.name}. The weaker voice went silent. ${stolen.length > 0 ? `${predator.name} now carries: ${stolen.join(', ')}.` : ''}`,
                animation: 'consume',
            };
        }
    }

    return null;
}

/**
 * Check if two voices should merge.
 * Conditions:
 *   - Both have overlapping raise triggers (2+ shared)
 *   - Both have allied/positive opinions of each other
 *   - Neither is core depth
 *   - Both have been alive for at least 10 messages (not brand new)
 *
 * Returns { newVoice, events[] } or null.
 */
async function checkMerge() {
    const living = getLivingVoices();
    if (living.length < 3) return null; // Need at least 3 voices (2 merge, 1 remains)

    // Only check rarely (5% per message)
    if (Math.random() > 0.05) return null;

    // Cooldown
    if (Date.now() - lastBirthTime < BIRTH_COOLDOWN_MS * 2) return null;

    for (let i = 0; i < living.length; i++) {
        for (let j = i + 1; j < living.length; j++) {
            const a = living[i];
            const b = living[j];

            // Skip core voices
            if (a.depth === 'core' || b.depth === 'core') continue;

            // Check for overlap in raise triggers
            const aRaises = a.influenceTriggers?.raises || [];
            const bRaises = b.influenceTriggers?.raises || [];
            const shared = aRaises.filter(t => bRaises.includes(t));
            if (shared.length < 2) continue;

            // Check mutual positive opinion
            const aOpinionOfB = (a.relationships?.[b.id] || '').toLowerCase();
            const bOpinionOfA = (b.relationships?.[a.id] || '').toLowerCase();
            const positiveTerms = ['allied', 'respect', 'agree', 'protect', 'support', 'understand'];

            const aSupportive = positiveTerms.some(t => aOpinionOfB.includes(t));
            const bSupportive = positiveTerms.some(t => bOpinionOfA.includes(t));
            if (!aSupportive || !bSupportive) continue;

            // Check both are established (not brand new)
            const now = Date.now();
            if (now - (a.created || now) < 60000) continue; // At least 1 minute old
            if (now - (b.created || now) < 60000) continue;

            console.log(`${LOG_PREFIX} MERGE candidate: ${a.name} + ${b.name} (shared: ${shared.join(', ')})`);

            try {
                const newVoice = await birthVoiceFromMerge(a, b);
                if (!newVoice) continue;

                lastBirthTime = Date.now();

                // Kill both source voices
                resolveVoice(a.id, `merged into ${newVoice.name}`);
                resolveVoice(b.id, `merged into ${newVoice.name}`);

                return {
                    newVoice,
                    events: [
                        {
                            type: 'merged',
                            voiceId: a.id,
                            name: a.name,
                            partnerId: b.id,
                            partnerName: b.name,
                            newVoiceId: newVoice.id,
                            newVoiceName: newVoice.name,
                            message: `${a.name} and ${b.name} merged. ${newVoice.name} was born from what they shared.`,
                            animation: 'merge',
                        },
                    ],
                };
            } catch (e) {
                console.error(`${LOG_PREFIX} Merge check failed:`, e);
            }
        }
    }

    return null;
}

/**
 * Initialize the first voice from persona card.
 * Called once on first message in a new chat.
 */
/**
 * Extract initial voice set from the user's persona card + scenario.
 * Called once when a new chat starts. Returns array of born voices.
 * @returns {Object[]} Array of born voices
 */
export async function initializeFromPersona() {
    const living = getLivingVoices();
    if (living.length > 0) return []; // Already have voices

    try {
        const voices = await birthVoicesFromPersona();
        return voices || [];
    } catch (e) {
        console.error(`${LOG_PREFIX} Persona extraction failed:`, e);
        return [];
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

// Draw lock — prevents auto-draws when manual draw is in progress
let drawLock = false;
export function setDrawLock(locked) { drawLock = locked; }

/** Reset voice frequency counter (call on chat change). */
export function resetVoiceCounter() { voiceMessageCounter = 0; }

/**
 * Handle card draw based on settings and impact.
 */
async function handleCardDraw(impact, themes, summary) {
    const mode = extensionSettings.drawMode || 'auto';

    if (mode === 'manual') {
        return null;
    }

    // Don't auto-draw while a manual draw is in progress
    if (drawLock) return null;

    const living = getLivingVoices();
    if (living.length === 0) return null;

    // ── Auto mode: single card every message, spread on severity ──
    // Severity setting controls the upgrade threshold:
    //   low:    minor+ → 3-card,   significant+ → 5-card
    //   medium: significant+ → 3-card, critical → 5-card
    //   high:   critical → 3-card only (never auto 5-card)

    const severity = extensionSettings.spreadSeverity || 'medium';

    // Check for spread upgrade first
    if (shouldUpgradeToSpread(impact, severity, 'cross')) {
        const cards = await generateSpread('cross', themes, summary);
        if (cards && cards.length > 0) {
            return { type: 'cross', cards };
        }
    }

    if (shouldUpgradeToSpread(impact, severity, 'three')) {
        const cards = await generateSpread('three', themes, summary);
        if (cards && cards.length > 0) {
            return { type: 'three', cards };
        }
    }

    // Default: single card pull every message
    return await generateSingleCard(themes, summary);
}

/**
 * Check if impact + severity setting warrants upgrading to a spread.
 */
function shouldUpgradeToSpread(impact, severity, spreadType) {
    if (spreadType === 'cross') {
        // 5-card cross spread
        switch (severity) {
            case 'low':    return impact === 'significant' || impact === 'critical';
            case 'medium': return impact === 'critical';
            case 'high':   return false; // Never auto-trigger 5-card
            default:       return impact === 'critical';
        }
    }
    if (spreadType === 'three') {
        // 3-card spread (only if we didn't already trigger a cross)
        switch (severity) {
            case 'low':    return impact === 'minor';
            case 'medium': return impact === 'significant';
            case 'high':   return impact === 'critical';
            default:       return impact === 'significant';
        }
    }
    return false;
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
    const cards = await generateSpread(spreadType, classification.themes, classification.summary);
    if (!cards || cards.length === 0) return null;
    return { type: spreadType, cards };
}
