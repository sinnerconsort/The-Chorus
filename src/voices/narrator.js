/**
 * THE CHORUS — Narrator System (Expanded)
 *
 * The narrator is NOT neutral. It has an AGENDA — a thing it wants that
 * creates genuine tension with the voices. Inspired by the Narrator in
 * Slay the Princess: it's in your head, but it's not YOU, and it has
 * opinions about the other things in your head.
 *
 * Eight archetypes, each with:
 *   - A distinct persona and speaking style
 *   - An AGENDA that conflicts with the voices
 *   - A DEGRADATION STYLE (how it falls apart when coherence drops)
 *   - OPINIONS about specific voices (generated per-voice, evolving)
 *
 * Coherence System:
 *   The narrator starts at 100 coherence. As the deck fills, as voices
 *   gain influence, as hijacks happen — coherence drops. Low coherence
 *   changes HOW the narrator speaks: it contradicts itself, gets things
 *   wrong, shows cracks in its mask. At very low coherence, the narrator
 *   is almost unrecognizable from its original self.
 *
 * Voice Opinions:
 *   The narrator forms opinions about each voice when it's born. These
 *   opinions evolve based on the voice's behavior. They're included in
 *   prompts so the narrator has genuinely specific things to say about
 *   specific voices.
 *
 * Narrator Directory:
 *   The narrator can be DMed like any voice. It's evasive about what
 *   it actually IS, but its answers shift based on coherence and the
 *   state of the deck. The narrator is the 23rd card — the one that
 *   thinks it's above the deck.
 *
 * Generation: independent API calls via ConnectionManagerRequestService.
 */

import { getContext } from '../../../../../extensions.js';
import {
    NARRATOR_ARCHETYPES, TONE_ANCHORS, LOG_PREFIX,
} from '../config.js';
import {
    extensionSettings,
    getLivingVoices,
    getVoiceById,
    getArcana,
    getNarrator,
    updateNarrator,
    setNarratorOpinion,
    getNarratorOpinion,
    adjustNarratorCoherence,
    addNarratorDirectoryMessages,
    getNarratorDirectoryHistory,
    saveChatState,
} from '../state.js';

// =============================================================================
// CONNECTION (shared pattern)
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

async function sendRequest(messages, maxTokens = 200) {
    const ctx = getContext();
    if (!ctx.ConnectionManagerRequestService) {
        throw new Error('ConnectionManagerRequestService not available');
    }

    const profileId = getProfileId();
    if (!profileId) throw new Error('No connection profile available');

    const response = await ctx.ConnectionManagerRequestService.sendRequest(
        profileId,
        messages,
        maxTokens,
        { extractData: true, includePreset: true, includeInstruct: false },
        {},
    );

    return response?.content || response || '';
}

// =============================================================================
// CONTEXT BUILDING
// =============================================================================

function getArchetype() {
    const key = extensionSettings.narratorArchetype || 'stage_manager';
    return NARRATOR_ARCHETYPES[key] || NARRATOR_ARCHETYPES.stage_manager;
}

function getToneDescription() {
    const key = extensionSettings.toneAnchor || 'raw';
    const tone = TONE_ANCHORS[key];
    return tone ? `${tone.name}: ${tone.description}` : 'Raw: Conversational, profane, blunt.';
}

function buildVoiceSummary() {
    const living = getLivingVoices();
    if (living.length === 0) return 'No voices present yet.';

    const narrator = getNarrator();

    return living.map(v => {
        const arc = getArcana(v.arcana);
        const stateTag = v.state !== 'active' ? ` [${v.state.toUpperCase()}]` : '';
        const opinion = narrator.voiceOpinions?.[v.id];
        const opinionTag = opinion ? `\n  YOUR OPINION: ${opinion}` : '';
        return `- ${v.name} (${arc.name}, ${v.depth}) — influence: ${v.influence}/100, relationship: ${v.relationship}${stateTag}${opinionTag}`;
    }).join('\n');
}

/**
 * Build the coherence context block for prompts.
 * Tells the AI HOW degraded the narrator should sound.
 */
function buildCoherenceBlock() {
    const narrator = getNarrator();
    const coherence = narrator.coherence ?? 100;
    const archetype = getArchetype();

    if (coherence >= 80) return '';

    if (coherence >= 60) {
        return `\nCOHERENCE: ${coherence}/100 — MINOR DEGRADATION
You are slightly off. Small inconsistencies creep in. You occasionally lose your train of thought mid-sentence. The mask slips for half a second before you catch it.
Style: ${archetype.degradationStyle}`;
    }

    if (coherence >= 40) {
        return `\nCOHERENCE: ${coherence}/100 — MODERATE DEGRADATION
You are visibly struggling. Your ${archetype.name.toLowerCase()} persona is cracking. Sentences trail off. You contradict things you said earlier. The voices are getting louder and you are getting quieter. You still TRY to be yourself but the effort shows.
Style: ${archetype.degradationStyle}`;
    }

    if (coherence >= 20) {
        return `\nCOHERENCE: ${coherence}/100 — SEVERE DEGRADATION
You are barely holding together. Your persona is more mask than face. You get names wrong. You confuse voice opinions. You say things that make no sense and then correct yourself and the correction is worse.
Style: ${archetype.degradationStyle}
Express this degradation in HOW you speak — broken sentences, wrong words, contradictions, moments of frightening clarity between stretches of confusion.`;
    }

    return `\nCOHERENCE: ${coherence}/100 — CRITICAL DEGRADATION
You are almost gone. What's left of your persona is fragments. You can't tell the voices apart. You can't tell yourself apart from the voices. You might say something that sounds like a voice, not like you. You might go silent mid-thought. You might say something devastating and true because the filter is gone.
Style: ${archetype.degradationStyle}
You are dissolving. Let that show in every sentence.`;
}

function buildAgendaBlock() {
    const archetype = getArchetype();
    return `\nYOUR AGENDA: ${archetype.agenda}
This agenda colors everything you say. You are not neutral. You have a position.`;
}

// =============================================================================
// COHERENCE MANAGEMENT
// =============================================================================

/**
 * Recalculate narrator coherence from current deck state.
 * Called after major events.
 */
export function recalculateCoherence() {
    const living = getLivingVoices();
    const maxVoices = Math.min(22, extensionSettings.maxVoices || 7);

    // Deck fullness pressure (0-40)
    const deckRatio = living.length / maxVoices;
    const deckPenalty = Math.floor(deckRatio * 40);

    // Average influence pressure (0-30)
    const avgInfluence = living.length > 0
        ? living.reduce((sum, v) => sum + (v.influence || 0), 0) / living.length
        : 0;
    const influencePenalty = Math.floor(avgInfluence * 0.3);

    // Power outliers (voices above 80 influence)
    const powerPenalty = living.filter(v => (v.influence || 0) > 80).length * 5;

    // Agitated / hijacking voices
    const agitatedPenalty = living.filter(v =>
        v.state === 'agitated' || v.state === 'hijacking'
    ).length * 8;

    const target = Math.max(0, Math.min(100,
        100 - deckPenalty - influencePenalty - powerPenalty - agitatedPenalty
    ));

    const narrator = getNarrator();
    const current = narrator.coherence ?? 100;

    // Gradual drift — max 5 per recalc
    const delta = target - current;
    const step = Math.sign(delta) * Math.min(Math.abs(delta), 5);

    adjustNarratorCoherence(step);

    const updated = getNarrator().coherence;
    if (Math.abs(updated - current) >= 3) {
        console.log(`${LOG_PREFIX} Narrator coherence: ${current} → ${updated} (deck: ${living.length}/${maxVoices}, avgInf: ${Math.floor(avgInfluence)})`);
    }
    return updated;
}

/**
 * Boost coherence slightly (from directory conversations, etc).
 */
export function boostCoherence(amount = 5) {
    adjustNarratorCoherence(amount);
}

// =============================================================================
// NARRATOR PROMPT BUILDING
// =============================================================================

function buildEventPrompt(archetype, eventType, eventContext) {
    const toneDesc = getToneDescription();
    const voiceSummary = buildVoiceSummary();
    const coherenceBlock = buildCoherenceBlock();
    const agendaBlock = buildAgendaBlock();

    return [
        {
            role: 'system',
            content: `${archetype.persona}
${agendaBlock}

CHAT TONE: ${toneDesc}
Express yourself through this tone. A gothic ${archetype.name.toLowerCase()} is different from a noir one.

CURRENT VOICES IN THE PSYCHE:
${voiceSummary}

You are responding to a specific event. Be brief — 1-3 sentences max. The framing narrator uses even fewer.
You exist in the meta-layer above the voices. You watch them. You have opinions about them.
Do not use quotation marks around your response.
Do NOT narrate the story scene. You narrate the INNER WORLD.
${coherenceBlock}`,
        },
        {
            role: 'user',
            content: `EVENT: ${eventType}\n\n${eventContext}\n\nRespond in character. Brief. Your agenda and opinions about specific voices should color your reaction.`,
        },
    ];
}

function buildAmbientPrompt(archetype, recentScene, voiceCommentary) {
    const toneDesc = getToneDescription();
    const voiceSummary = buildVoiceSummary();
    const coherenceBlock = buildCoherenceBlock();
    const agendaBlock = buildAgendaBlock();

    const commentaryBlock = voiceCommentary.length > 0
        ? `WHAT THE VOICES JUST SAID:\n${voiceCommentary.map(c => `${c.name}: "${c.text}"`).join('\n')}`
        : 'The voices are quiet right now.';

    return [
        {
            role: 'system',
            content: `${archetype.persona}
${agendaBlock}

CHAT TONE: ${toneDesc}

CURRENT VOICES:
${voiceSummary}

${commentaryBlock}

RECENT SCENE (for context only — do NOT narrate the scene):
${recentScene.substring(0, 300)}

You may speak or stay silent. If you have nothing worth saying, respond with exactly: [SILENT]
When you speak, be brief — 1-2 sentences. You are not the main event. But you have OPINIONS.
React to what the voices said. Comment on their behavior. Express your agenda.
${coherenceBlock}`,
        },
        {
            role: 'user',
            content: 'React to the current state of the inner world. Or stay silent.',
        },
    ];
}

function buildOpinionPrompt(archetype, voice) {
    const arc = getArcana(voice.arcana);

    return [
        {
            role: 'system',
            content: `${archetype.persona}

YOUR AGENDA: ${archetype.agenda}

A new voice has appeared in the psyche. Form an OPINION about it.
This opinion is private — for your reference. It should reflect how this voice
relates to YOUR agenda. Does it help or hinder what you want? Threaten you?
Intrigue you? Annoy you? Make you nervous?

Respond with ONLY your opinion — 1-2 sentences. No preamble. Be specific to this voice.`,
        },
        {
            role: 'user',
            content: `NEW VOICE: ${voice.name} (${arc.name}${voice.reversed ? ', REVERSED' : ''})
Personality: ${voice.personality}
Obsession: ${voice.obsession}
Influence: ${voice.influence}/100
Depth: ${voice.depth}

What do you think of this one?`,
        },
    ];
}

function buildDirectoryPrompt(archetype, userMessage) {
    const toneDesc = getToneDescription();
    const voiceSummary = buildVoiceSummary();
    const coherenceBlock = buildCoherenceBlock();
    const agendaBlock = buildAgendaBlock();
    const narrator = getNarrator();
    const history = narrator.directoryHistory || [];

    const recentHistory = history.slice(-10).map(msg => {
        if (msg.role === 'user') return `{{user}}: ${msg.text}`;
        return `You: ${msg.text}`;
    }).join('\n');

    const historyBlock = recentHistory
        ? `CONVERSATION SO FAR:\n${recentHistory}`
        : 'This is the start of a private conversation.';

    return [
        {
            role: 'system',
            content: `${archetype.persona}
${agendaBlock}

CHAT TONE: ${toneDesc}

CURRENT VOICES:
${voiceSummary}

${historyBlock}

{{user}} is speaking to you DIRECTLY. Privately. One-on-one.

CRITICAL BEHAVIORAL RULES:
- You are evasive about what you actually ARE. You deflect questions about your nature.
  "I'm the narrator. I'm the part that watches. Don't worry about me."
  But if pushed, or if coherence is low, you might reveal more than you intended.
- You have opinions about the voices and you're more candid about them in private
  than in the sidebar. You might warn about specific voices. You might admit to
  disliking one. You might ask {{user}} to do something about one that threatens
  your agenda.
- You are NOT a voice. You don't have an arcana, influence, or triggers.
  You are outside the deck. Above it. At least, that's what you tell yourself.
- You remember previous conversations. Reference them naturally.
- Your coherence affects how you speak. High = composed. Low = mask slips.
${coherenceBlock}

Respond naturally. 2-4 sentences. Stay in character. Do not use quotation marks.`,
        },
        {
            role: 'user',
            content: userMessage,
        },
    ];
}

// =============================================================================
// PUBLIC API — Voice Opinions
// =============================================================================

/**
 * Generate narrator's opinion about a newly born voice.
 * Called after each voice birth. Persisted in state.
 */
export async function generateVoiceOpinion(voice) {
    if (!voice?.id) return null;
    const archetype = getArchetype();

    try {
        const messages = buildOpinionPrompt(archetype, voice);
        const response = await sendRequest(messages, 100);
        const opinion = cleanResponse(response);

        if (opinion) {
            setNarratorOpinion(voice.id, opinion);
            saveChatState();
            console.log(`${LOG_PREFIX} Narrator opinion on ${voice.name}: ${opinion.substring(0, 80)}...`);
        }
        return opinion;
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator opinion generation failed:`, e);
        return null;
    }
}

/**
 * Update narrator's opinion about a voice after a major event.
 */
export async function updateVoiceOpinion(voiceId, eventContext) {
    const voice = getVoiceById(voiceId);
    if (!voice) return null;

    const archetype = getArchetype();
    const currentOpinion = getNarratorOpinion(voiceId);
    const arc = getArcana(voice.arcana);

    try {
        const messages = [
            {
                role: 'system',
                content: `${archetype.persona}

YOUR AGENDA: ${archetype.agenda}

You previously had this opinion about ${voice.name}: "${currentOpinion || 'No prior opinion.'}"

Something has changed. Update your opinion based on what happened.
Respond with ONLY your updated opinion — 1-2 sentences. Be specific.`,
            },
            {
                role: 'user',
                content: `VOICE: ${voice.name} (${arc.name}, influence: ${voice.influence}/100)
EVENT: ${eventContext}

What do you think now?`,
            },
        ];

        const response = await sendRequest(messages, 100);
        const opinion = cleanResponse(response);

        if (opinion) {
            setNarratorOpinion(voiceId, opinion);
            saveChatState();
        }
        return opinion;
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator opinion update failed:`, e);
        return null;
    }
}

// =============================================================================
// PUBLIC API — Event-Triggered Narration
// =============================================================================

export async function narrateBirth(newVoice) {
    const archetype = getArchetype();
    if (!archetype.triggers.birth) return null;

    recalculateCoherence();

    const arc = getArcana(newVoice.arcana);
    const living = getLivingVoices();
    const maxVoices = Math.min(22, extensionSettings.maxVoices || 7);
    const narrator = getNarrator();

    const context = `A new voice has been born: ${newVoice.name} (${arc.name}${newVoice.reversed ? ', REVERSED' : ''}, ${newVoice.depth} depth).
Born from: ${newVoice.birthMoment}
Personality: ${newVoice.personality}
The deck now has ${living.length}/${maxVoices} voices.
Your coherence is at ${narrator.coherence}/100.
${living.length >= maxVoices - 1 ? 'The deck is nearly full. This should concern you.' : ''}`;

    try {
        const [narration] = await Promise.all([
            (async () => {
                const messages = buildEventPrompt(archetype, 'VOICE BIRTH', context);
                const response = await sendRequest(messages, 150);
                return cleanResponse(response);
            })(),
            generateVoiceOpinion(newVoice),
        ]);

        markSpoke();
        return narration;
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator birth failed:`, e);
        return null;
    }
}

export async function narrateDeath(event) {
    const archetype = getArchetype();
    if (!archetype.triggers.death) return null;

    recalculateCoherence();
    const narrator = getNarrator();

    const context = `A voice has ${event.resolutionType === 'transform' ? 'transformed' : 'gone silent'}: ${event.name}.
Resolution: ${event.resolutionType}
${event.message}
${event.newVoice ? `It became: ${event.newVoice.name}` : ''}
Your coherence is at ${narrator.coherence}/100. A voice leaving might give you some relief.`;

    try {
        const messages = buildEventPrompt(archetype, 'VOICE DEATH', context);
        const response = await sendRequest(messages, 150);
        markSpoke();
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator death failed:`, e);
        return null;
    }
}

export async function narrateEscalation(oldLevel, newLevel) {
    const archetype = getArchetype();
    if (!archetype.triggers.escalation) return null;

    const levels = ['calm', 'rising', 'elevated', 'crisis'];
    const oldIdx = levels.indexOf(oldLevel);
    const newIdx = levels.indexOf(newLevel);
    if (Math.abs(newIdx - oldIdx) < 2) return null;

    const narrator = getNarrator();

    const context = `Escalation shifted from ${oldLevel.toUpperCase()} to ${newLevel.toUpperCase()}.
The inner world is ${newIdx > oldIdx ? 'heating up' : 'cooling down'}.
Your coherence: ${narrator.coherence}/100.`;

    try {
        const messages = buildEventPrompt(archetype, 'ESCALATION SHIFT', context);
        const response = await sendRequest(messages, 100);
        markSpoke();
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator escalation failed:`, e);
        return null;
    }
}

export async function narrateHijack(tier, voice) {
    const archetype = getArchetype();
    if (!archetype.triggers.hijack) return null;

    // Hijacks degrade coherence
    adjustNarratorCoherence(tier === 'possession' ? -15 : tier === 'struggle' ? -8 : -3);

    const arc = getArcana(voice.arcana);
    const narrator = getNarrator();
    const opinion = narrator.voiceOpinions?.[voice.id] || 'Unknown threat.';

    const context = `${voice.name} (${arc.name}) is attempting to take control.
Hijack tier: ${tier}
Voice influence: ${voice.influence}/100
YOUR OPINION OF THIS VOICE: ${opinion}
Your coherence: ${narrator.coherence}/100.
${tier === 'possession' ? 'This is a full lockout. You are losing control completely.' : ''}`;

    try {
        const messages = buildEventPrompt(archetype, `HIJACK — ${tier.toUpperCase()}`, context);
        const response = await sendRequest(messages, 180);
        markSpoke();
        // Fire-and-forget opinion update
        updateVoiceOpinion(voice.id, `Attempted ${tier}-level hijack`);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator hijack failed:`, e);
        return null;
    }
}

export async function narrateConsume(predator, prey) {
    const archetype = getArchetype();
    if (!archetype.triggers.voiceDrama) return null;

    const narrator = getNarrator();
    const predOpinion = narrator.voiceOpinions?.[predator.id] || '';
    const preyOpinion = narrator.voiceOpinions?.[prey.id] || '';

    const context = `${predator.name} has CONSUMED ${prey.name}. The stronger voice devoured the weaker.
${predator.name} — your opinion: ${predOpinion || 'No prior opinion'}
${prey.name} — your opinion: ${preyOpinion || 'No prior opinion'}
${prey.name} is gone. React from your agenda — is this good or bad for what you want?`;

    try {
        const messages = buildEventPrompt(archetype, 'VOICE CONSUMED', context);
        const response = await sendRequest(messages, 150);
        markSpoke();
        updateVoiceOpinion(predator.id, `Consumed ${prey.name}`);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator consume failed:`, e);
        return null;
    }
}

export async function narrateMerge(voiceA, voiceB, newVoice) {
    const archetype = getArchetype();
    if (!archetype.triggers.voiceDrama) return null;

    const context = `${voiceA.name} and ${voiceB.name} have MERGED into ${newVoice.name}.
Two fragments consolidated into one more complex voice.
React from your agenda — is consolidation progress or a new threat?`;

    try {
        const messages = buildEventPrompt(archetype, 'VOICE MERGE', context);
        const response = await sendRequest(messages, 150);
        markSpoke();
        generateVoiceOpinion(newVoice);
        return cleanResponse(response);
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator merge failed:`, e);
        return null;
    }
}

// =============================================================================
// PUBLIC API — Ambient Narration
// =============================================================================

export async function tryAmbientNarration(recentScene, voiceCommentary = []) {
    const archetype = getArchetype();
    const narrator = getNarrator();

    // Coherence modifies speak chance
    // Low = speaks less (drowned out), very low = speaks more (desperate)
    const coherence = narrator.coherence ?? 100;
    let speakMod = 1.0;
    if (coherence < 30) speakMod = 1.3;
    else if (coherence < 50) speakMod = 0.7;
    else if (coherence < 70) speakMod = 0.85;

    const effectiveChance = archetype.speakChance * speakMod;
    if (Math.random() > effectiveChance) {
        updateNarrator({ silentStreak: (narrator.silentStreak || 0) + 1 });
        return null;
    }

    // Archetype-specific extra checks
    if (archetype === NARRATOR_ARCHETYPES.stage_manager) {
        const living = getLivingVoices();
        const longSilent = living.filter(v => (v.silentStreak || 0) > 8);
        const agitated = living.filter(v => v.state === 'agitated' || v.influence > 70);
        if (longSilent.length === 0 && agitated.length === 0 && voiceCommentary.length > 0) {
            if (Math.random() > 0.15) return null;
        }
    }

    if (archetype === NARRATOR_ARCHETYPES.conscience) {
        if (voiceCommentary.length > 2) {
            if (Math.random() > 0.1) return null;
        }
    }

    if (archetype === NARRATOR_ARCHETYPES.director) {
        // Director speaks MORE when nothing is happening (bored/disappointed)
        if (voiceCommentary.length >= 2 && (narrator.silentStreak || 0) < 3) {
            if (Math.random() > 0.4) return null;
        }
    }

    if (archetype === NARRATOR_ARCHETYPES.warden) {
        // Warden speaks more when influence is high (alarmed)
        const living = getLivingVoices();
        const highInfluence = living.filter(v => (v.influence || 0) > 60).length;
        if (highInfluence === 0 && Math.random() > 0.5) return null;
    }

    if (archetype === NARRATOR_ARCHETYPES.conspirator) {
        // Conspirator speaks more when voices have relationships (sees patterns)
        const living = getLivingVoices();
        const withRelationships = living.filter(v =>
            v.relationships && Object.keys(v.relationships).length > 0
        ).length;
        if (withRelationships < 2 && Math.random() > 0.5) return null;
    }

    recalculateCoherence();

    try {
        const messages = buildAmbientPrompt(archetype, recentScene, voiceCommentary);
        const response = await sendRequest(messages, 120);
        const result = cleanResponse(response);
        if (result) markSpoke();
        return result;
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator ambient failed:`, e);
        return null;
    }
}

// =============================================================================
// PUBLIC API — Narrator Directory (1-on-1 DM)
// =============================================================================

/**
 * Send a message to the narrator in directory and get a response.
 */
export async function directoryMessage(userMessage) {
    if (!userMessage?.trim()) return null;

    const archetype = getArchetype();

    addNarratorDirectoryMessages([{
        role: 'user',
        text: userMessage.trim(),
        timestamp: Date.now(),
    }]);

    // Talking to narrator boosts coherence
    boostCoherence(3);

    try {
        const messages = buildDirectoryPrompt(archetype, userMessage.trim());
        const response = await sendRequest(messages, 250);
        const cleaned = cleanResponse(response);

        if (cleaned) {
            addNarratorDirectoryMessages([{
                role: 'narrator',
                text: cleaned,
                timestamp: Date.now(),
            }]);
            saveChatState();
        }
        return cleaned;
    } catch (e) {
        console.error(`${LOG_PREFIX} Narrator directory failed:`, e);
        return null;
    }
}

export function getDirectoryHistory() {
    return getNarratorDirectoryHistory();
}

export function clearDirectoryHistory() {
    updateNarrator({ directoryHistory: [] });
    saveChatState();
}

// =============================================================================
// PUBLIC API — Info
// =============================================================================

export function getCoherence() {
    return getNarrator().coherence ?? 100;
}

export function getArchetypeInfo() {
    const arch = getArchetype();
    return {
        name: arch.name,
        short: arch.short,
        description: arch.description,
        agenda: arch.agenda,
    };
}

// =============================================================================
// UTILITY
// =============================================================================

function markSpoke() {
    updateNarrator({ lastSpoke: Date.now(), silentStreak: 0 });
}

function cleanResponse(text) {
    if (!text) return null;
    let cleaned = text.trim();

    if (cleaned === '[SILENT]' || cleaned.toLowerCase().includes('[silent]')) return null;

    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1).trim();
    }

    cleaned = cleaned.replace(/^\[.*?\]:\s*/, '');
    return cleaned.length > 0 ? cleaned : null;
}
