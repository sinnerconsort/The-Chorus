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
        { extractData: true, includePreset: true, includeInstruct: false },
        {},
    );

    return response?.content || response || '';
}

// =============================================================================
// CONTEXT HELPERS
// =============================================================================

function getPersonaText() {
    const ctx = getContext();
    if (ctx.userPersona) return ctx.userPersona;
    const persona = ctx.extensionSettings?.persona;
    if (persona?.description) return persona.description;
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
        return `- ${v.name} (${arc.name}, ${v.depth || 'rooted'}) — ${v.personality.substring(0, 80)}`;
    }).join('\n');
}

// =============================================================================
// BIRTH PROMPT
// =============================================================================

function buildBirthPrompt(trigger, depth, arcanaHint = null) {
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

    const arcanaBlock = arcanaHint
        ? `SUGGESTED ARCANA: ${arcanaHint} (you may override if another fits better)`
        : `CHOOSE ARCANA from: ${Object.keys(ARCANA).join(', ')}`;

    return [
        {
            role: 'system',
            content: `You are a creative engine generating internal voice fragments for {{user}}'s psyche. Each voice is born from an extreme moment and represents a fractured piece of {{user}}'s inner world. {{user}} is the PLAYER CHARACTER described in the persona below — NOT any other character they interact with.

CHAT TONE: ${toneDesc}

{{user}}'s PERSONA:
${personaText || '(No persona defined — generate based on the triggering moment alone)'}

EXISTING VOICES (avoid duplicates in personality or domain):
${existingVoices}

VOICE DEPTH: ${depthDef.name}
${depthDef.description}
Chattiness range: ${depthDef.chattinessRange[0]}-${depthDef.chattinessRange[1]}

${arcanaBlock}

AVAILABLE THEMES (pick influence triggers ONLY from this list):
${themeList}

METAPHOR DOMAINS (pick ONE, must be different from existing voices):
${METAPHOR_DOMAINS.join(', ')}

CREATIVE CONSTRAINTS:
- Name must NOT be "The [Emotion]" — push for unexpected, specific, even mundane names. "The Accountant." "The Teeth." "The Wednesday." "Sweet Nothing." "The Flinch."
- This voice has a verbal tic or pattern recognizable in two sentences — not just "speaks tersely" but HOW.
- This voice is WRONG about something specific and will never admit it. What is its blind spot?
- This voice knows it's a fragment of {{user}}'s psyche, not a whole person. How does it feel about that?
- This voice is born from what {{user}} experiences — NOT from what other characters feel or do.

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
// FEW-SHOT EXAMPLES (injected before user message)
// =============================================================================
// These are included in the system prompt to set the creativity bar.
// Currently embedded in the prompt text above. Could be extracted as
// separate messages for multi-shot if needed.

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
        const messages = buildBirthPrompt(trigger, depth);
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
        });

        if (voice) {
            console.log(`${LOG_PREFIX} Voice born: ${voice.name} (${voice.arcana}, ${depth}, resolution: ${voice.resolution.type})`);
        }

        return voice;
    } catch (e) {
        console.error(`${LOG_PREFIX} Voice birth failed:`, e);
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
        const responseText = await sendRequest(messages, 1500);
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
        return (char.scenario || '').substring(0, 600);
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
            content: `You are a psychological profiler extracting the internal voice fragments that already exist inside {{user}}'s psyche BEFORE the story begins.

CRITICAL: {{user}} is the PLAYER CHARACTER — the person described in the PERSONA CARD below. These voices live inside THEIR head. They are {{user}}'s intrusive thoughts, habits, fears, and drives. Do NOT create voices based on any other character in the scenario — other characters are external people {{user}} interacts with, not parts of {{user}}'s mind.

These are not reactions to events — they are the pre-existing fractures that {{user}} carries into every room.

CHAT TONE: ${toneDesc}

AVAILABLE ARCANA: ${Object.keys(ARCANA).join(', ')}

AVAILABLE THEMES (influence triggers ONLY from this list):
${themeList}

METAPHOR DOMAINS (each voice gets ONE, all different):
${METAPHOR_DOMAINS.join(', ')}

VOICE DEPTHS — assign a mix:
- "core" (1 max): Fundamental identity fragment. Can never truly resolve. Default influence 20, chattiness 1-2.
- "rooted" (1-2): Deep psychological pattern. Hard to resolve. Default influence 30, chattiness 2-4.
- "surface" (1-2): Reactive trait, might fade. Default influence 40, chattiness 3-5.

CREATIVE CONSTRAINTS:
- Names must NOT be "The [Emotion]" — push for unexpected, specific, even mundane. "The Accountant." "The Teeth." "Sweet Nothing." "The Flinch."
- Each voice needs a verbal tic recognizable in two sentences
- Each voice is WRONG about something specific — their blind spot
- Each voice knows it's a fragment of {{user}}, not a whole person — how does it feel about that?
- NO duplicates in metaphor domain, arcana, or personality type
- These voices should feel like they've ALWAYS been inside {{user}} — not freshly generated
- Base EVERYTHING on the persona card. If the scenario mentions other characters, those are people {{user}} knows — NOT sources for voices.

Respond ONLY with a valid JSON array. No other text. No markdown fences.`,
        },
        {
            role: 'user',
            content: `{{user}}'s PERSONA CARD (this is who the voices belong to):
${personaText || '(No persona defined)'}

${scenarioText ? `SCENARIO (the situation {{user}} is entering — for context only, do NOT base voices on other characters mentioned here):\n${scenarioText}` : ''}

Extract ${count} pre-existing voice fragments from {{user}}'s psyche. What psychological pieces were already in place before the story started?

For each voice, consider:
- What trait or pattern would {{user}} carry from their background?
- What fear, drive, or habit defines a piece of {{user}}?
- What part of themselves does {{user}} not want to look at?

Return this exact JSON array:
[
    {
        "name": "Voice Name",
        "arcana": "arcana_key",
        "depth": "core|rooted|surface",
        "birthMoment": "The specific aspect of the persona this voice was born from. 1-2 sentences.",
        "personality": "2-3 sentence personality description rooted in the persona.",
        "speakingStyle": "How they talk. Specific patterns.",
        "obsession": "The specific thing this voice fixates on.",
        "opinion": "This voice's take on the character. One provocative sentence.",
        "blindSpot": "What this voice cannot see clearly.",
        "selfAwareness": "How this voice feels about being only a fragment.",
        "metaphorDomain": "one domain from the list",
        "verbalTic": "A specific speech pattern with example.",
        "chattiness": 3,
        "influenceTriggers": {
            "raises": ["theme1", "theme2", "theme3"],
            "lowers": ["theme4", "theme5"]
        },
        "resolution": {
            "type": "fade|heal|transform|confront|witness|endure",
            "condition": "What resolves this voice. Hidden from user.",
            "threshold": 60,
            "transformsInto": null
        }
    }
]

DEPTH RULES for resolution:
- core: MUST use "endure" (threshold: null, condition: empty). These never resolve.
- rooted: Use heal, transform, confront, or witness. Threshold 50-80.
- surface: Use fade, heal, or transform. Threshold 30-60.`,
        },
    ];
}

/**
 * Parse the multi-voice extraction response.
 */
function parsePersonaExtractionResponse(responseText, expectedCount) {
    if (!responseText) return null;

    try {
        let jsonStr = responseText.trim();

        // Strip markdown fences
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();

        // Find JSON array
        const bracketMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (bracketMatch) jsonStr = bracketMatch[0];

        const parsed = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) return null;

        const results = [];
        const usedArcana = new Set();
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

            // Determine depth
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

            // Clamp chattiness
            const depthDef = VOICE_DEPTH[depth];
            const [minChat, maxChat] = depthDef?.chattinessRange || [1, 5];
            const chattiness = Math.max(minChat, Math.min(maxChat, raw.chattiness || 3));

            results.push({
                name: raw.name,
                arcana,
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
                // Temp fields for the caller (stripped by addVoice)
                _depth: depth,
                _birthMoment: raw.birthMoment || '',
            });

            if (results.length >= expectedCount) break;
        }

        return results;

    } catch (e) {
        console.error(`${LOG_PREFIX} Persona extraction parse failed:`, e);
        return null;
    }
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
