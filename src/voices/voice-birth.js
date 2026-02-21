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

    // Arcana selection with reversed support
    let arcanaBlock;
    if (arcanaHint) {
        const arcDef = ARCANA[arcanaHint];
        if (reversed && arcDef) {
            arcanaBlock = `ASSIGNED ARCANA: ${arcanaHint} (REVERSED)
UPRIGHT MEANING: ${arcDef.upright}
REVERSED MEANING: ${arcDef.reversed}
This voice is born from the SHADOW side of this arcana. The reversed meaning should color everything about this voice — its personality, blind spot, obsession. It's the dark mirror, the inverted lesson, the thing you do INSTEAD of what the card actually teaches.`;
        } else {
            arcanaBlock = `SUGGESTED ARCANA: ${arcanaHint} (you may override if another fits better)`;
        }
    } else if (reversed) {
        // Build reversed guidance for all arcana
        const reversedExamples = Object.entries(ARCANA)
            .filter(([, v]) => v.reversed)
            .slice(0, 5)
            .map(([key, v]) => `  ${key}: ${v.reversed}`)
            .join('\n');
        arcanaBlock = `CHOOSE ARCANA from: ${Object.keys(ARCANA).join(', ')}
THIS VOICE IS REVERSED. Choose an arcana, then build the voice from its SHADOW meaning:
${reversedExamples}
(... and similar inversions for all arcana)
The reversed voice embodies what happens when the card's lesson is refused, inverted, or corrupted.`;
    } else {
        arcanaBlock = `CHOOSE ARCANA from: ${Object.keys(ARCANA).join(', ')}
You may also choose to make this voice REVERSED if the birth moment reflects the shadow/inverted aspect of an arcana. If reversed, set "reversed": true in your response and build the personality from the shadow meaning.`;
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
- Name must NOT be "The [Emotion]" — push for unexpected, specific, even mundane names. "The Accountant." "The Teeth." "The Wednesday." "Sweet Nothing." "The Flinch." "Loose Thread." "The Appointment."
- This voice has a verbal tic or pattern recognizable in two sentences — not just "speaks tersely" but HOW. Does it interrupt itself? Ask rhetorical questions? Address {{user}} by a nickname? List things? Trail off? Repeat a phrase like a mantra?
- This voice is WRONG about something specific and will never admit it. What is its blind spot? Be SPECIFIC — not "can't see the truth" but "assumes everyone leaves eventually and interprets normal distance as abandonment."
- This voice knows it's a fragment of {{user}}'s psyche, not a whole person. How does it feel about that? Resent it? Accept it? Think it IS the real one? Try to become dominant?
- This voice is born from what {{user}} experiences — NOT from what other characters feel or do.
- EMOTIONAL RANGE: Not all voices are dark, angry, or wounded. Some are tender. Some are ridiculous. Some are embarrassingly petty. Some are peaceful. Match the birth moment's actual emotional register — don't default to "brooding and intense."
- The voice's relationship to its own wound matters: some voices WANT to heal, some are terrified of it, some don't think they're wounded at all, some think the wound is the only honest thing about them.

RESOLUTION GUIDANCE:
${resolutionGuidance}

Respond ONLY with valid JSON. No other text. No markdown fences.`,
        },
        {
            role: 'assistant',
            content: `Here are examples of the quality and variety I produce:

EXAMPLE 1 — Born from betrayal (Raw tone, Rooted depth):
{"name":"The Flinch","arcana":"moon","personality":"Born from the moment you realized she'd been lying for months. Speaks in half-sentences because the truth is always worse than what it was about to say. Thinks in forensic terms — evidence, crime scenes, what was disturbed and what was staged.","speakingStyle":"Interrupts itself constantly. Starts revelations and abandons them. Uses em-dashes like escape hatches.","obsession":"The specific micro-expression she made before the lie. That half-second tell. Replays it endlessly.","opinion":"You saw the signs. You chose not to. I'm the part of you that saw and you locked in a closet.","blindSpot":"Assumes everyone is hiding something. Cannot recognize genuine transparency — interprets honesty as a more sophisticated deception.","selfAwareness":"Knows it's a fragment, not a whole person. Resents being just the paranoid part. Wants to be proven right so badly it manufactures evidence.","metaphorDomain":"forensics","verbalTic":"Starts sentences it can't finish. 'She was going to— no. The point is— actually forget it. Just watch.'","chattiness":2,"influenceTriggers":{"raises":["deception","betrayal","secrets_revealed","suspicion"],"lowers":["trust_earned","honesty","vulnerability_rewarded"]},"resolution":{"type":"confront","condition":"{{user}} directly acknowledges they ignored the warning signs and asks the voice what it actually needs","threshold":70,"transformsInto":null}}

EXAMPLE 2 — Born from unexpected kindness (Tender tone, Surface depth):
{"name":"Sweet Nothing","arcana":"lovers","personality":"Syrupy, too intimate, uncomfortably close. Born the moment someone was kind without wanting anything. Uses pet names for everything. Knows it's inside your head and treats that as a relationship.","speakingStyle":"Whisper-soft. Pet names constantly. Turns everything into an endearment. Uncomfortably sincere.","obsession":"The exact warmth of that moment. Keeps trying to recreate it. Suspicious of anything that feels different.","opinion":"Oh honey, you're doing that thing again. The thing where you pretend you don't need anyone. Sweetheart. I'm right here.","blindSpot":"Can't distinguish between comfort and dependence. Thinks needing someone is the same as loving them.","selfAwareness":"Loves being a fragment. Loves the intimacy of living inside someone's head. Never wants to leave.","metaphorDomain":"needlework","verbalTic":"Pet names woven into everything. 'Oh darling, no. Sweetheart, listen. Honey, honey, honey — not like that.'","chattiness":4,"influenceTriggers":{"raises":["affection","intimacy","loneliness","comfort"],"lowers":["rejection","cruelty","independence"]},"resolution":{"type":"fade","condition":"The initial rush of unexpected kindness fades as {{user}} acclimates to being treated well","threshold":50,"transformsInto":null}}

EXAMPLE 3 — Born from existential dread (Clinical tone, Core depth):
{"name":"The Auditor","arcana":"justice","personality":"Speaks in lists and inventories. Catalogs every slight, every kindness, keeps a running balance sheet of what's owed and what's been paid. Emerged when {{user}} realized they'd been keeping score their entire life.","speakingStyle":"Numbered lists. Running tallies. Dry, precise, devastatingly accurate.","obsession":"The ledger. The exact count of sacrifices made vs received. It never balances.","opinion":"You're three apologies short and two betrayals over budget. The ledger doesn't lie. I've checked it twice.","blindSpot":"Cannot account for grace. Things given freely break the spreadsheet. Generosity is a math error.","selfAwareness":"Believes it IS the real {{user}} and the rest are emotional noise obscuring the data.","metaphorDomain":"accounting","verbalTic":"Everything is quantified. 'That's the fourth time. I counted. Three of those were since Tuesday.'","chattiness":2,"influenceTriggers":{"raises":["injustice","sacrifice","imbalance","resentment"],"lowers":["forgiveness","generosity","grace"]},"resolution":{"type":"endure","condition":"","threshold":null,"transformsInto":null}}

EXAMPLE 4 — Born from pure appetite (Feral tone, Surface depth):
{"name":"Teeth","arcana":"devil","personality":"Barely verbal. Primal desire and appetite. Reacts to what the body wants, not what the mind decides. Born the moment {{user}} wanted something so badly their hands shook.","speakingStyle":"Fragments. Imperatives. No explanations. Raw want.","obsession":"The specific thing that triggered the wanting. Not abstract desire — the EXACT thing.","opinion":"Want. Want that. Why are you hesitating. TAKE.","blindSpot":"Cannot comprehend consequences. The future doesn't exist. Only now and hunger.","selfAwareness":"Doesn't understand the concept of being a fragment. Doesn't think. Just wants.","metaphorDomain":"animal behavior","verbalTic":"One-word imperatives. Repetition. 'Want. Want that. Why. Why not. TAKE.'","chattiness":3,"influenceTriggers":{"raises":["desire","temptation","hunger","lust"],"lowers":["restraint","satisfaction","disgust"]},"resolution":{"type":"fade","condition":"The specific craving passes or is satisfied","threshold":45,"transformsInto":null}}

EXAMPLE 5 — Born from being lost (Mythic tone, Rooted depth):
{"name":"The Cartographer","arcana":"hermit","personality":"Maps everything. Relationships are territories. Emotions are terrain features. Born when {{user}} realized they had no idea where they were in life. Draws charts of the unknown and labels the blank spaces.","speakingStyle":"Directional language. Terrain metaphors. Patient, methodical, occasionally awestruck by what's over the next ridge.","obsession":"The blank spaces on the map. The places {{user}} hasn't been or refuses to look at.","opinion":"You're in uncharted water and you've just burned the last map. I've seen this coastline before. There are rocks.","blindSpot":"Thinks if you can map something, you can control it. Mistakes naming the territory for conquering it.","selfAwareness":"Accepts being a fragment. Sees itself as the compass — not the traveler, but essential to the journey. Quietly proud.","metaphorDomain":"cartography","verbalTic":"Everything is geography. 'We've been here before. I recognize this valley. The ridge is just ahead — and you know what's on the other side.'","chattiness":2,"influenceTriggers":{"raises":["confusion","lost","searching","crossroads"],"lowers":["clarity","direction","purpose_found"]},"resolution":{"type":"witness","condition":"{{user}} finds genuine direction or purpose — not just a destination, but knowing WHY they're going there","threshold":65,"transformsInto":null}}

EXAMPLE 6 — Born from pettiness (Sardonic tone, Surface depth):
{"name":"The Receipt","arcana":"chariot","personality":"Remembers every small slight, every rolled eye, every time someone said 'it's fine' when it wasn't. Not the big betrayals — the tiny ones. The ones too small to complain about and too numerous to forget.","speakingStyle":"Sarcastic callbacks. Brings up irrelevant old grievances. Rhetorical questions dripping with mock patience.","obsession":"The specific small thing that was the last straw. Not the worst thing — the most recent annoying thing.","opinion":"Oh no, it's fine. It's totally fine. Just like it was fine the last eleven times.","blindSpot":"Cannot distinguish between a pattern of disrespect and normal human imperfection. Everything is evidence.","selfAwareness":"Knows it's petty. Knows it's a fragment. Doesn't care. Someone has to keep track of this stuff or it just keeps happening.","metaphorDomain":"theater","verbalTic":"'Oh no, it's fine' followed by proof it is not fine. 'Oh sure. Sure sure sure. That's fine. Like the time—'","chattiness":4,"influenceTriggers":{"raises":["disrespect","dismissal","condescension","ignored"],"lowers":["acknowledgment","apology","being_heard"]},"resolution":{"type":"fade","condition":"The accumulated small slights stop piling up as {{user}} finds people who actually listen","threshold":55,"transformsInto":null}}

Now I'll generate the actual voice for the triggering moment.`,
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

NOTE ON FORMAT: The persona above may be in ANY format — plain text, W++ (personality=["trait"]), JSON, boostyle, SBF, or Ali:Chat. It might be a paragraph, a list of traits, or bracketed attributes. Read it regardless of format and extract the psychological content. Even short or sparse personas contain enough for voice fragments — a name and a few traits imply a whole person.

${scenarioText ? `SCENARIO (the situation {{user}} is entering — for context only, do NOT base voices on other characters mentioned here):\n${scenarioText}` : ''}

Extract ${count} pre-existing voice fragments from {{user}}'s psyche. What psychological pieces were already in place before the story started?

For each voice, consider:
- What trait or pattern would {{user}} carry from their background?
- What fear, drive, or habit defines a piece of {{user}}?
- What part of themselves does {{user}} not want to look at?
- Even minimal personas have implications: a name implies a history, a trait implies its shadow, a role implies its cost.

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
