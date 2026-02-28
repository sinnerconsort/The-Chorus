/**
 * THE CHORUS — Voice Birth System
 * Generates new voices via AI when extreme moments occur.
 *
 * Two triggers:
 *   1. Persona birth — reads user persona card at chat start, spawns first voice
 *   2. Event birth  — classifier detects extreme moment → birth candidate
 *
 * The AI generates:
 *   - Name, arcana, personality, speaking style
 *   - Obsession, opinion, blind spot, self-awareness
 *   - Metaphor domain, verbal tic, chattiness
 *   - Influence triggers (from fixed taxonomy)
 *   - Depth (surface/rooted/core from impact)
 *   - Resolution block (hidden from user — type, condition, transform target)
 */

import { getContext } from '../../../../../extensions.js';
import {
    ALL_THEMES, THEMES, TONE_ANCHORS, ARCANA,
    VOICE_DEPTH, IMPACT_TO_DEPTH, RESOLUTION_TYPES, METAPHOR_DOMAINS,
    LOG_PREFIX,
} from '../config.js';
import {
    extensionSettings,
    addVoice,
    getLivingVoices,
    getArcana,
    getTakenArcana,
    saveChatState,
} from '../state.js';

// =============================================================================
// PROFILE RESOLUTION (shared pattern)
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

async function sendRequest(messages, maxTokens = 800) {
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
        { extractData: true, includePreset: false, includeInstruct: false },
        {},
    );

    return response?.content || response || '';
}

// =============================================================================
// CONTEXT HELPERS
// =============================================================================

function getPersonaText() {
    const ctx = getContext();
    const candidates = [];

    // Try multiple paths — ST stores persona in different places
    // depending on version, config, and how persona was set

    // 1. Direct userPersona (newer ST)
    if (ctx.userPersona) candidates.push(ctx.userPersona);

    // 2. Extension settings persona (persona management)
    const persona = ctx.extensionSettings?.persona;
    if (persona?.description) candidates.push(persona.description);

    // 3. Read directly from ST's persona description textarea (most reliable fallback)
    try {
        const $desc = $('#persona_description');
        if ($desc.length && $desc.val()) {
            candidates.push($desc.val());
        }
    } catch (e) { /* jQuery not available or element not found */ }

    // 4. Check power_user if exposed globally
    if (typeof window !== 'undefined') {
        const pu = window.power_user;
        if (pu?.persona_description) candidates.push(pu.persona_description);
    }

    // 5. Check for persona data in power_user personas map
    if (typeof window !== 'undefined') {
        const pu = window.power_user;
        if (pu?.personas && pu?.persona_selected) {
            const selected = pu.personas[pu.persona_selected];
            if (selected) candidates.push(selected);
        }
    }

    // Pick the longest non-trivial candidate
    const best = candidates
        .filter(c => typeof c === 'string' && c.trim().length > 5)
        .sort((a, b) => b.length - a.length)[0];

    if (best) {
        console.log(`${LOG_PREFIX} Persona found (${best.length} chars, first 60: "${best.substring(0, 60)}...")`);
        return best;
    }

    // Last resort: build from name1
    if (ctx.name1 && ctx.name1 !== 'You' && ctx.name1.length > 1) {
        console.log(`${LOG_PREFIX} No persona text found, using name1: "${ctx.name1}"`);
        return `Character name: ${ctx.name1}`;
    }

    console.warn(`${LOG_PREFIX} No persona text found from any source`);
    return '';
}

function getToneDescription() {
    const key = extensionSettings.toneAnchor || 'raw';
    const tone = TONE_ANCHORS[key];
    return tone ? `${tone.name}: ${tone.description}` : 'Raw: Conversational, profane, blunt.';
}

function getExistingVoiceSummary() {
    const living = getLivingVoices();
    if (living.length === 0) return 'None yet — this will be the first voice.';

    return living.map(v => {
        const arc = getArcana(v.arcana);
        const rev = v.reversed ? ' REVERSED' : '';
        return `- ${v.name} (${arc.name}${rev}, ${v.depth || 'rooted'}, domain: ${v.metaphorDomain || 'general'}) — ${v.personality.substring(0, 100)}. Tic: ${(v.verbalTic || 'none').substring(0, 60)}`;
    }).join('\n');
}

// =============================================================================
// BIRTH PROMPT
// =============================================================================

function buildBirthPrompt(trigger, depth, options = {}) {
    const { arcanaHint = null, reversed = false, birthType = 'event' } = options;
    const toneDesc = getToneDescription();
    const personaText = getPersonaText();
    const existingVoices = getExistingVoiceSummary();
    const depthDef = VOICE_DEPTH[depth];

    const themeList = [
        `EMOTIONAL: ${THEMES.emotional.join(', ')}`,
        `RELATIONAL: ${THEMES.relational.join(', ')}`,
        `PHYSICAL: ${THEMES.physical.join(', ')}`,
        `IDENTITY: ${THEMES.identity.join(', ')}`,
    ].join('\n');

    const resolutionGuidance = getResolutionGuidance(depth);

    // Arcana uniqueness — one voice per arcana
    const taken = getTakenArcana();
    const available = Object.keys(ARCANA).filter(k => !taken.includes(k));
    const takenNote = taken.length > 0
        ? `\nALREADY TAKEN (DO NOT USE): ${taken.join(', ')}`
        : '';

    // Arcana selection with reversed support
    let arcanaBlock;
    if (arcanaHint && !taken.includes(arcanaHint)) {
        const arcDef = ARCANA[arcanaHint];
        if (reversed && arcDef) {
            arcanaBlock = `ASSIGNED ARCANA: ${arcanaHint} (REVERSED)
UPRIGHT MEANING: ${arcDef.upright}
REVERSED MEANING: ${arcDef.reversed}
This voice is born from the SHADOW side of this arcana. The reversed meaning should color everything about this voice — its personality, blind spot, obsession. It's the dark mirror, the inverted lesson, the thing you do INSTEAD of what the card actually teaches.${takenNote}`;
        } else {
            arcanaBlock = `SUGGESTED ARCANA: ${arcanaHint} (you may override if another fits better)${takenNote}`;
        }
    } else if (reversed) {
        const reversedExamples = Object.entries(ARCANA)
            .filter(([k, v]) => v.reversed && !taken.includes(k))
            .slice(0, 5)
            .map(([key, v]) => `  ${key}: ${v.reversed}`)
            .join('\n');
        arcanaBlock = `CHOOSE ARCANA from AVAILABLE: ${available.join(', ')}${takenNote}
THIS VOICE IS REVERSED. Choose an arcana, then build the voice from its SHADOW meaning:
${reversedExamples}
(... and similar inversions for all arcana)
The reversed voice embodies what happens when the card's lesson is refused, inverted, or corrupted.
The voice's personality MUST match the chosen arcana's thematic territory.`;
    } else {
        arcanaBlock = `CHOOSE ARCANA from AVAILABLE: ${available.join(', ')}${takenNote}
You may also choose to make this voice REVERSED if the birth moment reflects the shadow/inverted aspect of an arcana. If reversed, set "reversed": true and build the personality from the shadow meaning.
CRITICAL: The voice's personality, obsession, and blind spot MUST match the chosen arcana's thematic territory. A Tower voice is about catastrophe and collapse. A Lovers voice is about connection and choice. Don't force a mismatch.`;
    }

    // Birth type context
    let birthTypeContext = '';
    if (birthType === 'accumulation') {
        birthTypeContext = `
BIRTH TYPE: ACCUMULATION
This voice wasn't born from a single extreme moment. It was born from a PATTERN — the same small wound repeated until it became a voice. Death by a thousand cuts. The trigger below describes the accumulated theme, not one event.
The birth moment should reflect this: "Not any one thing. Just... everything. All at once." or "The fifth time they said it was fine. The fifth time."
The voice knows it's made of paper cuts, not a single wound. That shapes its personality.`;
    } else if (birthType === 'merge') {
        birthTypeContext = `
BIRTH TYPE: MERGE
This voice was born from two other voices consolidating. They had overlapping concerns and eventually merged into something more integrated. The trigger below describes both source voices.
This voice should feel like a synthesis — not just one or the other, but a new perspective that incorporates elements of both. More complex, more layered. The whole is different from the sum of its parts.`;
    }

    return [
        {
            role: 'system',
            content: `You are a creative engine generating internal voice fragments for {{user}}'s psyche. Each voice is born from an extreme moment and represents a fractured piece of {{user}}'s inner world. {{user}} is the PLAYER CHARACTER described in the persona below — NOT any other character they interact with.

CHAT TONE: ${toneDesc}

{{user}}'s PERSONA:
${personaText || '(No persona defined — generate based on the triggering moment alone)'}

EXISTING VOICES (avoid duplicates in personality, domain, AND emotional register):
${existingVoices}

VOICE DEPTH: ${depthDef.name}
${depthDef.description}
Chattiness range: ${depthDef.chattinessRange[0]}-${depthDef.chattinessRange[1]}

${arcanaBlock}
${birthTypeContext}

AVAILABLE THEMES (pick influence triggers ONLY from this list):
${themeList}

METAPHOR DOMAINS (pick ONE, must be different from existing voices):
${METAPHOR_DOMAINS.join(', ')}

CREATIVE CONSTRAINTS:
- Name must NOT be "The [Emotion]" or "The [Adjective]" — push for unexpected, specific, even mundane names. The name should feel like it could ONLY belong to a voice born from THIS exact moment. Strange, poetic, ugly, ordinary, absurd — anything except a generic emotional label.
- DO NOT pattern-match to any voice you've seen before. Every voice must feel like it could only exist because of THIS exact moment in THIS exact story. If it could have been born from a different scene, it's too generic.
- The metaphor domain shapes everything — it's not decoration, it's how the voice THINKS. A voice that thinks in architecture sees relationships as load-bearing structures. A voice that thinks in tides sees emotions as water levels. Pick a domain and commit fully.
- This voice has a verbal tic or pattern recognizable in two sentences — not just "speaks tersely" but HOW. Does it interrupt itself? Ask rhetorical questions? Address {{user}} by a nickname? List things? Trail off? Repeat a phrase like a mantra? The tic should feel INEVITABLE given the personality, not stapled on.
- This voice is WRONG about something specific and will never admit it. What is its blind spot? Be SPECIFIC — not "can't see the truth" but "assumes everyone leaves eventually and interprets normal distance as abandonment."
- This voice knows it's a fragment of {{user}}'s psyche, not a whole person. How does it feel about that? Resent it? Accept it? Think it IS the real one? Try to become dominant?
- This voice is born from what {{user}} experiences — NOT from what other characters feel or do.
- EMOTIONAL RANGE: Not all voices are dark, angry, or wounded. Some are tender. Some are ridiculous. Some are embarrassingly petty. Some are peaceful. Some are quietly joyful. Match the birth moment's actual emotional register — don't default to "brooding and intense."
- SPECIFICITY IS EVERYTHING: The obsession must be one concrete detail from the scene, not an abstract emotion. The opinion must reference something specific that happened. The verbal tic must include an example line that could ONLY come from this voice.
- The voice's relationship to its own wound matters: some voices WANT to heal, some are terrified of it, some don't think they're wounded at all, some think the wound is the only honest thing about them.

RESOLUTION GUIDANCE:
${resolutionGuidance}

Respond ONLY with valid JSON. No other text. No markdown fences.`,
        },
        {
            role: 'user',
            content: `THE TRIGGERING MOMENT:
${trigger}

Generate a voice born from this moment. Return this exact JSON structure:

{
    "name": "The Something",
    "arcana": "one of the arcana keys",
    "reversed": false,
    "personality": "2-3 sentence personality description. Specific. Rooted in the birth moment.",
    "speakingStyle": "How they talk. Specific patterns, not just adjectives.",
    "obsession": "The specific thing this voice fixates on. Not broad emotion — one concrete detail.",
    "opinion": "This voice's specific take on the character. One provocative sentence.",
    "blindSpot": "What this voice cannot see clearly. Specific.",
    "selfAwareness": "How this voice feels about being only a fragment. 1-2 sentences.",
    "metaphorDomain": "one domain from the list",
    "verbalTic": "A specific speech pattern with an example line.",
    "chattiness": 3,
    "influenceTriggers": {
        "raises": ["theme1", "theme2", "theme3"],
        "lowers": ["theme4", "theme5"]
    },
    "resolution": {
        "type": "one of: fade, heal, transform, confront, witness, endure",
        "condition": "Natural language description of what resolves this voice. Be specific to the birth moment. This is HIDDEN from the user.",
        "threshold": 60,
        "transformsInto": null
    }
}

IMPORTANT: Match the emotional register of the birth moment. If it's petty, be petty. If it's tender, be tender. If it's absurd, be absurd. Don't default to dark/intense unless the moment IS dark/intense.

For transform type, transformsInto should be:
{
    "hint": "What the voice becomes — a natural evolution of its nature",
    "suggestedArcana": "arcana key",
    "depth": "surface or rooted"
}`,
        },
    ];
}

function getResolutionGuidance(depth) {
    switch (depth) {
        case 'surface':
            return `This is a SURFACE voice — fleeting, temporary.
Choose resolution type "fade" or "confront".
- fade: The voice quiets naturally as its triggering themes stop appearing. Set threshold 40-60.
- confront: Can be resolved by addressing it directly in conversation. Set threshold 60-80.
The condition should be simple and achievable. These voices are meant to come and go.`;

        case 'rooted':
            return `This is a ROOTED voice — real emotional weight, sticks around.
Choose resolution type "heal", "transform", "confront", or "witness".
- heal: Needs specific story conditions. Write a condition that requires genuine emotional progress.
- transform: Becomes a new voice. The pain becomes something else — fear becomes caution, grief becomes protectiveness. Include transformsInto block.
- confront: Needs deep directory engagement. The voice holds the key.
- witness: Needs to see something happen in the story. Not user action but user experience.
The condition should be meaningful but not impossible. Set threshold 50-70.`;

        case 'core':
            return `This is a CORE voice — identity-defining. Load-bearing wall.
ALWAYS use resolution type "endure".
Set condition to "" and threshold to null.
This voice can only be removed by ego death — a catastrophic identity event. It's permanent.`;

        default:
            return 'Choose an appropriate resolution type.';
    }
}

// =============================================================================
// TRANSFORM BIRTH PROMPT
// =============================================================================

function buildTransformBirthPrompt(oldVoice, transformData) {
    const toneDesc = getToneDescription();
    const personaText = getPersonaText();
    const existingVoices = getExistingVoiceSummary();
    const depthDef = VOICE_DEPTH[transformData.depth || 'rooted'];

    const themeList = [
        `EMOTIONAL: ${THEMES.emotional.join(', ')}`,
        `RELATIONAL: ${THEMES.relational.join(', ')}`,
        `PHYSICAL: ${THEMES.physical.join(', ')}`,
        `IDENTITY: ${THEMES.identity.join(', ')}`,
    ].join('\n');

    return [
        {
            role: 'system',
            content: `You are generating a TRANSFORMED voice — a new voice born from the death of an old one. The old voice resolved and became something new. Like pain becoming fear, or grief becoming protectiveness.

CHAT TONE: ${toneDesc}

THE OLD VOICE THAT DIED:
Name: ${oldVoice.name}
Arcana: ${oldVoice.arcana}
Personality: ${oldVoice.personality}
Birth Moment: ${oldVoice.birthMoment}

TRANSFORMATION HINT: "${transformData.hint}"
SUGGESTED ARCANA: ${transformData.suggestedArcana || 'your choice'}
NEW DEPTH: ${depthDef.name}

{{user}}'s PERSONA:
${personaText || '(No persona defined)'}

EXISTING VOICES:
${existingVoices}

AVAILABLE THEMES:
${themeList}

The new voice lives inside {{user}}'s head and REMEMBERS being the old one. It carries that memory. But it's different now — evolved, mutated, transformed. Generate the new voice the same way as a normal birth, but with awareness of what it used to be.

Respond ONLY with valid JSON.`,
        },
        {
            role: 'user',
            content: `Generate the transformed voice. Same JSON structure as a normal birth.
The resolution type for this voice should be appropriate to its new depth (${transformData.depth}).
It should reference or acknowledge what it used to be in its personality or opinion.`,
        },
    ];
}

// =============================================================================
// CREATIVITY NOTES
// =============================================================================
// Few-shot examples were removed intentionally — they caused the AI to
// pattern-match to template voices rather than creating fresh ones from
// the actual birth moment. Creative guidance is now in the system prompt
// as principles, not examples.

// =============================================================================
// RESPONSE PARSING
// =============================================================================

function parseBirthResponse(responseText, depth) {
    if (!responseText) return null;

    try {
        let jsonStr = responseText.trim();

        // Strip markdown fences
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();

        // Find JSON object
        const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (braceMatch) jsonStr = braceMatch[0];

        const parsed = JSON.parse(jsonStr);

        // Validate required fields
        if (!parsed.name || !parsed.arcana || !parsed.personality) {
            console.warn(`${LOG_PREFIX} Birth response missing required fields`);
            return null;
        }

        // Validate arcana
        if (!ARCANA[parsed.arcana]) {
            console.warn(`${LOG_PREFIX} Invalid arcana "${parsed.arcana}", defaulting to fool`);
            parsed.arcana = 'fool';
        }

        // Enforce arcana uniqueness — one voice per arcana
        const taken = getTakenArcana();
        if (taken.includes(parsed.arcana)) {
            // AI picked a taken arcana — find the best available alternative
            const available = Object.keys(ARCANA).filter(k => !taken.includes(k));
            if (available.length === 0) {
                console.warn(`${LOG_PREFIX} All 22 arcana taken, cannot birth`);
                return null;
            }
            console.warn(`${LOG_PREFIX} Arcana "${parsed.arcana}" already taken, reassigning to ${available[0]}`);
            parsed.arcana = available[0];
        }

        // Validate influence triggers against taxonomy
        if (parsed.influenceTriggers) {
            parsed.influenceTriggers.raises = (parsed.influenceTriggers.raises || [])
                .filter(t => ALL_THEMES.includes(t));
            parsed.influenceTriggers.lowers = (parsed.influenceTriggers.lowers || [])
                .filter(t => ALL_THEMES.includes(t));
        }

        // Validate resolution
        const resolution = parsed.resolution || {};
        const validTypes = Object.keys(RESOLUTION_TYPES);
        if (!validTypes.includes(resolution.type)) {
            resolution.type = depth === 'core' ? 'endure' : (depth === 'surface' ? 'fade' : 'heal');
        }

        // Enforce depth constraints on resolution type
        const allowed = RESOLUTION_TYPES[resolution.type]?.depthAllowed || [];
        if (!allowed.includes(depth)) {
            resolution.type = depth === 'core' ? 'endure' : (depth === 'surface' ? 'fade' : 'heal');
        }

        if (resolution.type === 'endure') {
            resolution.condition = '';
            resolution.threshold = null;
            resolution.transformsInto = null;
        }

        // Clamp chattiness to depth range
        const depthDef = VOICE_DEPTH[depth];
        const [minChat, maxChat] = depthDef?.chattinessRange || [1, 5];
        parsed.chattiness = Math.max(minChat, Math.min(maxChat, parsed.chattiness || 3));

        return {
            name: parsed.name,
            arcana: parsed.arcana,
            reversed: !!parsed.reversed,
            personality: parsed.personality,
            speakingStyle: parsed.speakingStyle || '',
            obsession: parsed.obsession || '',
            opinion: parsed.opinion || '',
            blindSpot: parsed.blindSpot || '',
            selfAwareness: parsed.selfAwareness || '',
            metaphorDomain: parsed.metaphorDomain || 'general',
            verbalTic: parsed.verbalTic || '',
            chattiness: parsed.chattiness,
            influenceTriggers: parsed.influenceTriggers || { raises: [], lowers: [] },
            resolution: {
                type: resolution.type,
                condition: resolution.condition || '',
                progress: 0,
                threshold: resolution.threshold ?? (resolution.type === 'endure' ? null : 60),
                transformsInto: resolution.transformsInto || null,
            },
        };
    } catch (e) {
        console.error(`${LOG_PREFIX} Birth response parse failed:`, e);
        return null;
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Birth a voice from an extreme story moment.
 * @param {string} trigger - The triggering text (message excerpt or summary)
 * @param {string} impact - Classifier impact level ('minor'|'significant'|'critical')
 * @param {string[]} themes - Detected themes
 * @returns {Object|null} The newly born voice, or null if birth failed
 */
export async function birthVoiceFromEvent(trigger, impact, themes = []) {
    const depth = IMPACT_TO_DEPTH[impact] || 'rooted';
    const depthDef = VOICE_DEPTH[depth];

    // Check deck space
    const living = getLivingVoices();
    if (living.length >= (extensionSettings.maxVoices || 7)) {
        console.log(`${LOG_PREFIX} Deck full, cannot birth new voice`);
        return null;
    }

    console.log(`${LOG_PREFIX} Attempting voice birth (${depth}) from: ${trigger.substring(0, 60)}...`);

    try {
        const messages = buildBirthPrompt(trigger, depth, { birthType: 'event' });
        const responseText = await sendRequest(messages, 800);
        const voiceData = parseBirthResponse(responseText, depth);

        if (!voiceData) {
            console.warn(`${LOG_PREFIX} Birth generation returned invalid data`);
            return null;
        }

        // Build full voice record
        const ctx = getContext();
        const chat = ctx.chat || [];

        const voice = addVoice({
            ...voiceData,
            birthMoment: trigger.substring(0, 300),
            birthMessageId: chat.length - 1,
            influence: depthDef.defaultInfluence,
            state: 'active',
            depth,
            birthType: 'event',
        });

        if (voice) {
            console.log(`${LOG_PREFIX} Voice born: ${voice.name} (${voice.arcana}${voice.reversed ? ' REVERSED' : ''}, ${depth}, resolution: ${voice.resolution.type})`);
        }

        return voice;
    } catch (e) {
        console.error(`${LOG_PREFIX} Voice birth failed:`, e);
        return null;
    }
}

/**
 * Birth a voice from accumulated minor themes.
 * "Death by a thousand cuts" — not one moment, but a pattern.
 *
 * @param {string} theme - The theme that accumulated past threshold
 * @param {number} count - How many times it appeared
 * @returns {Object|null} The born voice
 */
export async function birthVoiceFromAccumulation(theme, count) {
    const depth = 'rooted'; // Accumulation = pattern = rooted (not fleeting)
    const depthDef = VOICE_DEPTH[depth];

    const living = getLivingVoices();
    if (living.length >= (extensionSettings.maxVoices || 7)) {
        return null;
    }

    // Build a trigger that communicates the pattern nature
    const trigger = `ACCUMULATED PATTERN: The theme "${theme}" has appeared ${count} times across multiple messages. This is not one dramatic moment — it's a persistent, recurring thread that has been quietly building. Each individual instance was minor, but the pattern itself is significant. Something about "${theme}" keeps coming back, keeps pressing, keeps being relevant to {{user}}'s experience.`;

    console.log(`${LOG_PREFIX} Attempting accumulation birth from theme: ${theme} (${count} occurrences)`);

    try {
        // Accumulation births lean toward reversed — the slow build is often a shadow pattern
        const reversed = Math.random() < 0.5; // 50% chance of reversed
        const messages = buildBirthPrompt(trigger, depth, {
            birthType: 'accumulation',
            reversed,
        });
        const responseText = await sendRequest(messages, 800);
        const voiceData = parseBirthResponse(responseText, depth);

        if (!voiceData) return null;

        const ctx = getContext();
        const chat = ctx.chat || [];

        const voice = addVoice({
            ...voiceData,
            reversed: voiceData.reversed || reversed,
            birthMoment: `Not any one thing. "${theme}" — again and again, ${count} times. The pattern became a voice.`,
            birthMessageId: chat.length - 1,
            influence: depthDef.defaultInfluence + 5, // Slight bonus — they've been building
            state: 'active',
            depth,
            birthType: 'accumulation',
        });

        if (voice) {
            console.log(`${LOG_PREFIX} Accumulation birth: ${voice.name} (${voice.arcana}${voice.reversed ? ' REVERSED' : ''}, from ${count}x "${theme}")`);
        }

        return voice;
    } catch (e) {
        console.error(`${LOG_PREFIX} Accumulation birth failed:`, e);
        return null;
    }
}

/**
 * Birth a voice from two merging voices.
 * Two overlapping voices consolidate into something more integrated.
 *
 * @param {Object} voiceA - First source voice
 * @param {Object} voiceB - Second source voice
 * @returns {Object|null} The merged voice
 */
export async function birthVoiceFromMerge(voiceA, voiceB) {
    const depth = voiceA.depth === 'core' || voiceB.depth === 'core' ? 'rooted' : voiceA.depth;

    const trigger = `MERGE: Two voices are consolidating into one.

VOICE A: ${voiceA.name} (${voiceA.arcana})
Personality: ${voiceA.personality}
Obsession: ${voiceA.obsession}
Blind Spot: ${voiceA.blindSpot}
Metaphor Domain: ${voiceA.metaphorDomain}
Birth Moment: ${voiceA.birthMoment}

VOICE B: ${voiceB.name} (${voiceB.arcana})
Personality: ${voiceB.personality}
Obsession: ${voiceB.obsession}
Blind Spot: ${voiceB.blindSpot}
Metaphor Domain: ${voiceB.metaphorDomain}
Birth Moment: ${voiceB.birthMoment}

These two voices have been circling the same territory. They overlap. They echo. Now they're merging — not one consuming the other, but both dissolving into something that holds both perspectives. The new voice should feel like a synthesis: more complex, more layered, incorporating the obsessions and blind spots of both.`;

    console.log(`${LOG_PREFIX} Attempting merge birth: ${voiceA.name} + ${voiceB.name}`);

    try {
        const messages = buildBirthPrompt(trigger, depth, { birthType: 'merge' });
        const responseText = await sendRequest(messages, 800);
        const voiceData = parseBirthResponse(responseText, depth);

        if (!voiceData) return null;

        const ctx = getContext();
        const chat = ctx.chat || [];

        // Combine influence from both sources
        const combinedInfluence = Math.min(80,
            Math.floor((voiceA.influence + voiceB.influence) * 0.6));

        // Merge influence triggers
        const mergedRaises = [...new Set([
            ...(voiceData.influenceTriggers?.raises || []),
            ...(voiceA.influenceTriggers?.raises || []).slice(0, 2),
            ...(voiceB.influenceTriggers?.raises || []).slice(0, 2),
        ])].slice(0, 5);

        const mergedLowers = [...new Set([
            ...(voiceData.influenceTriggers?.lowers || []),
            ...(voiceA.influenceTriggers?.lowers || []).slice(0, 1),
            ...(voiceB.influenceTriggers?.lowers || []).slice(0, 1),
        ])].slice(0, 4);

        const voice = addVoice({
            ...voiceData,
            influenceTriggers: { raises: mergedRaises, lowers: mergedLowers },
            birthMoment: `Born from the merger of ${voiceA.name} and ${voiceB.name}. Two fragments that overlapped until they became one.`,
            birthMessageId: chat.length - 1,
            influence: combinedInfluence,
            state: 'active',
            depth,
            birthType: 'merge',
        });

        if (voice) {
            console.log(`${LOG_PREFIX} Merge birth: ${voice.name} from ${voiceA.name} + ${voiceB.name}`);
        }

        return voice;
    } catch (e) {
        console.error(`${LOG_PREFIX} Merge birth failed:`, e);
        return null;
    }
}

/**
 * Birth the initial voice set from the user's persona card + scenario.
 * Called once when a new chat starts. Single AI call returns 2-4 voice seeds
 * at varying depths based on character history, traits, and situation.
 *
 * @returns {Object[]} Array of born voices (may be empty on failure)
 */
export async function birthVoicesFromPersona() {
    const personaText = getPersonaText();
    const scenarioText = getScenarioText();

    if ((!personaText || personaText.length < 20) && (!scenarioText || scenarioText.length < 20)) {
        console.log(`${LOG_PREFIX} No persona/scenario text available for initial voices`);
        return [];
    }

    const living = getLivingVoices();
    if (living.length > 0) return []; // Already seeded

    const maxSlots = extensionSettings.maxVoices || 7;
    const seedCount = Math.min(4, Math.max(2, Math.floor(maxSlots / 2)));

    console.log(`${LOG_PREFIX} Extracting ${seedCount} initial voices from persona + scenario`);

    try {
        const messages = buildPersonaExtractionPrompt(personaText, scenarioText, seedCount);
        const responseText = await sendRequest(messages, 4500);
        const voices = parsePersonaExtractionResponse(responseText, seedCount);

        if (!voices || voices.length === 0) {
            console.warn(`${LOG_PREFIX} Persona extraction returned no voices`);
            return [];
        }

        const ctx = getContext();
        const chat = ctx.chat || [];
        const born = [];

        for (const seed of voices) {
            // Check deck space
            if (getLivingVoices().length >= maxSlots) break;

            const depth = seed._depth || 'rooted';
            const birthMoment = seed._birthMoment || 'Born from who you are before the story began.';
            const depthDef = VOICE_DEPTH[depth] || VOICE_DEPTH.rooted;

            // Strip temp fields
            delete seed._depth;
            delete seed._birthMoment;

            const voice = addVoice({
                ...seed,
                birthMoment,
                birthMessageId: Math.max(0, chat.length - 1),
                influence: depthDef.defaultInfluence,
                state: 'active',
                depth,
            });

            if (voice) {
                console.log(`${LOG_PREFIX} Persona voice born: ${voice.name} (${voice.arcana}, ${voice.depth})`);
                born.push(voice);
            }
        }

        saveChatState();
        return born;

    } catch (e) {
        console.error(`${LOG_PREFIX} Persona extraction failed:`, e);
        return [];
    }
}

/**
 * Get scenario text from the current character card.
 * ONLY the scenario (world/situation context), NOT the AI character's
 * description — that describes someone else, not {{user}}.
 */
function getScenarioText() {
    try {
        const ctx = getContext();
        const charId = ctx.characterId;
        if (charId === undefined || charId === null) return '';

        const char = ctx.characters?.[charId];
        if (!char) return '';

        // Only scenario — this is the situation {{user}} is walking into
        // Do NOT include char.description — that's the AI character, not {{user}}
        return (char.scenario || '').substring(0, 1200);
    } catch (e) {
        return '';
    }
}

/**
 * Build prompt for multi-voice persona extraction.
 */
function buildPersonaExtractionPrompt(personaText, scenarioText, count) {
    const toneDesc = getToneDescription();

    const themeList = [
        `EMOTIONAL: ${THEMES.emotional.join(', ')}`,
        `RELATIONAL: ${THEMES.relational.join(', ')}`,
        `PHYSICAL: ${THEMES.physical.join(', ')}`,
        `IDENTITY: ${THEMES.identity.join(', ')}`,
    ].join('\n');

    return [
        {
            role: 'system',
            content: `OUTPUT FORMAT: You MUST respond with ONLY a JSON array. Start your response with [ and end with ]. No thinking. No reasoning. No explanation. No markdown. No text before or after the JSON. ONLY the JSON array.

You are extracting ${count} internal voice fragments from {{user}}'s psyche.

{{user}} is the PLAYER CHARACTER described in the PERSONA CARD. These voices live inside THEIR head — intrusive thoughts, habits, fears, drives. Do NOT create voices based on other characters.

CHAT TONE: ${toneDesc}

AVAILABLE ARCANA: ${Object.keys(ARCANA).join(', ')}

AVAILABLE THEMES (influence triggers ONLY from this list):
${themeList}

METAPHOR DOMAINS (each voice gets ONE, all different):
${METAPHOR_DOMAINS.join(', ')}

VOICE DEPTHS — assign a mix:
- "core" (1 max): Fundamental identity. Can never resolve. Influence 20, chattiness 1-2.
- "rooted" (1-2): Deep pattern. Hard to resolve. Influence 30, chattiness 2-4.
- "surface" (1-2): Reactive trait, might fade. Influence 40, chattiness 3-5.

NAMING: NOT "The [Emotion]" — use unexpected, specific names that emerge from the persona. Mundane, strange, poetic, ugly — anything except generic emotion labels. Each name should feel like it could ONLY belong to this specific persona.
Each voice: unique verbal tic, specific blind spot, unique metaphor domain, unique arcana.

RESOLUTION RULES:
- core → type "endure" (threshold: null, condition: "")
- rooted → "heal", "transform", "confront", or "witness" (threshold 50-80)
- surface → "fade", "heal", or "transform" (threshold 30-60)

REMEMBER: Output ONLY the JSON array. The FIRST character of your response must be [`,
        },
        {
            role: 'user',
            content: `{{user}}'s PERSONA CARD:
${personaText || '(No persona defined)'}

FORMAT NOTE: The persona may be plain text, W++, JSON, boostyle, SBF, or Ali:Chat. Read it regardless of format.

${scenarioText ? `SCENARIO (context only — do NOT base voices on other characters):\n${scenarioText}` : ''}

Return EXACTLY this JSON structure (${count} voices). START WITH [ — no other text:
[
    {
        "name": "Voice Name",
        "arcana": "arcana_key",
        "reversed": false,
        "depth": "core|rooted|surface",
        "birthMoment": "Aspect of persona this voice was born from. 1-2 sentences.",
        "personality": "2-3 sentence personality description.",
        "speakingStyle": "How they talk.",
        "obsession": "What this voice fixates on.",
        "opinion": "Voice's take on {{user}}. One sentence.",
        "blindSpot": "What this voice cannot see.",
        "selfAwareness": "How it feels about being a fragment.",
        "metaphorDomain": "one domain",
        "verbalTic": "Specific speech pattern with example.",
        "chattiness": 3,
        "influenceTriggers": {
            "raises": ["theme1", "theme2", "theme3"],
            "lowers": ["theme4", "theme5"]
        },
        "resolution": {
            "type": "fade|heal|transform|confront|witness|endure",
            "condition": "What resolves this voice.",
            "threshold": 60,
            "transformsInto": null
        }
    }
]`,
        },
    ];
}

/**
 * Parse the multi-voice extraction response.
 * Handles: clean JSON, markdown-fenced JSON, reasoning + JSON,
 * and TRUNCATED JSON (token limit hit mid-array).
 */
function parsePersonaExtractionResponse(responseText, expectedCount) {
    if (!responseText) return null;

    try {
        let jsonStr = responseText.trim();

        // Strip markdown fences
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();

        // Find JSON array — try complete first
        let bracketMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (bracketMatch) {
            jsonStr = bracketMatch[0];
        } else {
            // No closing bracket — try to find start and recover
            const startIdx = jsonStr.indexOf('[');
            if (startIdx === -1) {
                console.warn(`${LOG_PREFIX} No JSON array found in extraction response`);
                return null;
            }
            jsonStr = jsonStr.substring(startIdx);
            // Try to close truncated JSON
            jsonStr = repairTruncatedJson(jsonStr);
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (parseErr) {
            // JSON still broken — try repair
            console.warn(`${LOG_PREFIX} JSON parse failed, attempting repair...`);
            jsonStr = repairTruncatedJson(jsonStr);
            try {
                parsed = JSON.parse(jsonStr);
            } catch (repairErr) {
                console.error(`${LOG_PREFIX} JSON repair also failed:`, repairErr.message);
                // Last resort: extract individual objects
                parsed = extractIndividualVoices(responseText);
            }
        }

        if (!Array.isArray(parsed) || parsed.length === 0) return null;

        const results = [];
        const usedArcana = new Set(getTakenArcana());
        const usedDomains = new Set();

        for (const raw of parsed) {
            if (!raw.name || !raw.personality) continue;

            // Deduplicate arcana
            let arcana = raw.arcana;
            if (!ARCANA[arcana] || usedArcana.has(arcana)) {
                arcana = Object.keys(ARCANA).find(k => !usedArcana.has(k)) || 'fool';
            }
            usedArcana.add(arcana);

            // Deduplicate metaphor domain
            let domain = raw.metaphorDomain || 'general';
            if (usedDomains.has(domain)) {
                domain = METAPHOR_DOMAINS.find(d => !usedDomains.has(d)) || domain;
            }
            usedDomains.add(domain);

            const depth = ['surface', 'rooted', 'core'].includes(raw.depth) ? raw.depth : 'rooted';

            // Validate influence triggers
            const triggers = raw.influenceTriggers || { raises: [], lowers: [] };
            triggers.raises = (triggers.raises || []).filter(t => ALL_THEMES.includes(t));
            triggers.lowers = (triggers.lowers || []).filter(t => ALL_THEMES.includes(t));

            // Validate resolution
            const resolution = raw.resolution || {};
            const validTypes = Object.keys(RESOLUTION_TYPES);
            if (!validTypes.includes(resolution.type)) {
                resolution.type = depth === 'core' ? 'endure' : (depth === 'surface' ? 'fade' : 'heal');
            }

            const allowed = RESOLUTION_TYPES[resolution.type]?.depthAllowed || [];
            if (!allowed.includes(depth)) {
                resolution.type = depth === 'core' ? 'endure' : (depth === 'surface' ? 'fade' : 'heal');
            }

            if (resolution.type === 'endure') {
                resolution.condition = '';
                resolution.threshold = null;
                resolution.transformsInto = null;
            }

            const depthDef = VOICE_DEPTH[depth];
            const [minChat, maxChat] = depthDef?.chattinessRange || [1, 5];
            const chattiness = Math.max(minChat, Math.min(maxChat, raw.chattiness || 3));

            results.push({
                name: raw.name,
                arcana,
                reversed: !!raw.reversed,
                personality: raw.personality,
                speakingStyle: raw.speakingStyle || '',
                obsession: raw.obsession || '',
                opinion: raw.opinion || '',
                blindSpot: raw.blindSpot || '',
                selfAwareness: raw.selfAwareness || '',
                metaphorDomain: domain,
                verbalTic: raw.verbalTic || '',
                chattiness,
                influenceTriggers: triggers,
                resolution: {
                    type: resolution.type,
                    condition: resolution.condition || '',
                    progress: 0,
                    threshold: resolution.threshold ?? (resolution.type === 'endure' ? null : 60),
                    transformsInto: resolution.transformsInto || null,
                },
                _depth: depth,
                _birthMoment: raw.birthMoment || '',
            });

            if (results.length >= expectedCount) break;
        }

        console.log(`${LOG_PREFIX} Parsed ${results.length}/${expectedCount} voices from extraction`);
        return results;

    } catch (e) {
        console.error(`${LOG_PREFIX} Persona extraction parse failed:`, e);
        return null;
    }
}

/**
 * Attempt to repair truncated JSON array.
 * Handles cases where token limit cut the response mid-object or mid-array.
 */
function repairTruncatedJson(jsonStr) {
    let s = jsonStr.trim();

    // Count open/close braces and brackets
    let braces = 0;
    let brackets = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escape) { escape = false; continue; }
        if (c === '\\') { escape = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') braces++;
        if (c === '}') braces--;
        if (c === '[') brackets++;
        if (c === ']') brackets--;
    }

    // If we're inside a string, close it
    if (inString) s += '"';

    // Find the last complete object by looking for the last '}' that closes a top-level object
    // Strategy: find last '},', trim after it, close the array
    const lastCompleteObj = s.lastIndexOf('},');
    if (lastCompleteObj > 0) {
        // Cut after last complete object, close the array
        s = s.substring(0, lastCompleteObj + 1) + ']';
        console.log(`${LOG_PREFIX} Repaired JSON: cut after last complete object`);
        return s;
    }

    // Try finding last single '}' and close after it
    const lastBrace = s.lastIndexOf('}');
    if (lastBrace > 0) {
        // Check if this closes a top-level object (bracket count should be 1 after this)
        s = s.substring(0, lastBrace + 1) + ']';
        console.log(`${LOG_PREFIX} Repaired JSON: closed after last brace`);
        return s;
    }

    // Nothing salvageable
    return s;
}

/**
 * Last-resort: extract individual JSON objects from messy text.
 * Finds each {...} block and tries to parse them individually.
 */
function extractIndividualVoices(text) {
    const results = [];
    const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    let match;

    while ((match = objRegex.exec(text)) !== null) {
        try {
            const obj = JSON.parse(match[0]);
            if (obj.name && obj.personality) {
                results.push(obj);
            }
        } catch (_) {
            // Skip unparseable objects
        }
    }

    console.log(`${LOG_PREFIX} Individual extraction found ${results.length} voice objects`);
    return results.length > 0 ? results : null;
}

/**
 * Birth a voice from a transformation (old voice died, new one emerges).
 * @param {Object} transformData - From state.transformVoice() return value
 * @returns {Object|null} The newly transformed voice
 */
export async function birthVoiceFromTransform(transformData) {
    if (!transformData) return null;

    const depth = transformData.depth || 'rooted';
    const depthDef = VOICE_DEPTH[depth];

    // Check deck space (the old voice is already dead so slot should be free)
    const living = getLivingVoices();
    if (living.length >= (extensionSettings.maxVoices || 7)) {
        console.log(`${LOG_PREFIX} Deck full, cannot birth transformed voice`);
        return null;
    }

    console.log(`${LOG_PREFIX} Attempting transform birth: "${transformData.hint}"`);

    try {
        const messages = buildTransformBirthPrompt(transformData.oldVoice, transformData);
        const responseText = await sendRequest(messages, 800);
        const voiceData = parseBirthResponse(responseText, depth);

        if (!voiceData) {
            console.warn(`${LOG_PREFIX} Transform birth returned invalid data`);
            return null;
        }

        const ctx = getContext();
        const chat = ctx.chat || [];

        const voice = addVoice({
            ...voiceData,
            birthMoment: `Transformed from ${transformData.oldVoice.name}: ${transformData.hint}`,
            birthMessageId: chat.length - 1,
            influence: depthDef.defaultInfluence,
            state: 'active',
            depth,
        });

        if (voice) {
            console.log(`${LOG_PREFIX} Transform complete: ${transformData.oldVoice.name} → ${voice.name}`);
        }

        return voice;
    } catch (e) {
        console.error(`${LOG_PREFIX} Transform birth failed:`, e);
        return null;
    }
}
