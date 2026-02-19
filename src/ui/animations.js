/**
 * THE CHORUS — Animations
 * Orchestrates card birth, death, and transformation overlays.
 *
 * Three sequences:
 *   Awakening:      card-back → flip → reveal name/glyph/depth → particles → fade
 *   Dissolution:    show card → flavored death (fade/heal/confront/witness) → fragments → fade
 *   Transformation: show old → shatter → fragments → crystallize new → fade
 *
 * All animation is CSS-driven (class toggling) for mobile performance.
 * This module just orchestrates the phase timing and populates card content.
 */

import { getArcana } from '../state.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const AWAKENING_TIMING = {
    fadeIn: 100,      // Overlay becomes visible
    phase1: 300,      // Card back appears
    phase2: 1400,     // Card flips to front
    particles: 1800,  // Sparkle particles spawn
    phase3: 5000,     // Begin fade out
    cleanup: 6200,    // Remove overlay classes
};

const DISSOLUTION_TIMING = {
    fadeIn: 100,
    phase1: 300,      // Card fully shown
    phase2: 2200,     // Death animation begins (type-specific)
    fragments: 2500,  // Fragments scatter
    phase3: 5000,     // Overlay fades
    cleanup: 6000,
};

const TRANSFORM_TIMING = {
    fadeIn: 100,
    phase1: 300,      // Old card shown
    phase2: 2000,     // Old card shatters
    fragments: 2200,  // Fragments scatter
    phase3: 3500,     // New card crystallizes
    phase4: 6500,     // Fade out
    cleanup: 7800,
};

// Resolution type → label text + dissolution flavor
const DISSOLUTION_LABELS = {
    fade:     { label: 'FADING AWAY',        subtitle: 'Gone like it was never there.' },
    heal:     { label: 'A WOUND CLOSES',     subtitle: 'It found what it needed.' },
    confront: { label: 'FACED AND RELEASED', subtitle: 'It was heard. That was enough.' },
    witness:  { label: 'SEEN AT LAST',       subtitle: 'It only needed to know you understood.' },
    endure:   { label: 'SILENCED',           subtitle: 'Torn out by the root.' },
};

// Animation lock — prevents overlapping animations
let animating = false;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Play the awakening animation for a newly born voice.
 * @param {Object} voice - The voice object (needs name, arcana, depth)
 * @returns {Promise<void>} Resolves when animation completes
 */
export function playAwakening(voice) {
    if (animating) return Promise.resolve();
    animating = true;

    return new Promise(resolve => {
        const $overlay = $('#chorus-awakening-overlay');
        const arc = getArcana(voice.arcana);

        // Populate card content
        populateAwakeningCard(voice, arc);

        // Phase sequence
        const t = AWAKENING_TIMING;

        setTimeout(() => $overlay.addClass('visible'), t.fadeIn);
        setTimeout(() => $overlay.addClass('phase-1'), t.phase1);
        setTimeout(() => {
            $overlay.removeClass('phase-1').addClass('phase-2');
            spawnParticles($('#chorus-awakening-particles'), arc.glow, 12);
        }, t.phase2);
        setTimeout(() => spawnParticles($('#chorus-awakening-particles'), arc.glow, 6), t.particles);
        setTimeout(() => $overlay.addClass('phase-3'), t.phase3);
        setTimeout(() => {
            resetOverlay($overlay, ['phase-1', 'phase-2', 'phase-3']);
            $('#chorus-awakening-particles').empty();
            animating = false;
            resolve();
        }, t.cleanup);
    });
}

/**
 * Play the dissolution animation for a dying/resolved voice.
 * @param {Object} voice - The voice being dissolved
 * @param {string} resolutionType - 'fade'|'heal'|'confront'|'witness'|'endure'
 * @returns {Promise<void>}
 */
export function playDissolution(voice, resolutionType = 'fade') {
    if (animating) return Promise.resolve();
    animating = true;

    return new Promise(resolve => {
        const $overlay = $('#chorus-dissolution-overlay');
        const arc = getArcana(voice.arcana);
        const flavor = DISSOLUTION_LABELS[resolutionType] || DISSOLUTION_LABELS.fade;
        const phaseClass = `phase-2-${resolutionType}`;

        // Populate card
        populateDissolutionCard(voice, arc);

        // Labels
        $('#chorus-dissolution-label').text(flavor.label);
        $('#chorus-dissolution-subtitle').text(flavor.subtitle);

        const t = DISSOLUTION_TIMING;

        setTimeout(() => $overlay.addClass('visible'), t.fadeIn);
        setTimeout(() => $overlay.addClass('phase-1'), t.phase1);
        setTimeout(() => {
            $overlay.removeClass('phase-1').addClass(phaseClass);
            spawnFragments($('#chorus-dissolution-fragments'), arc.glow, 16);
        }, t.phase2);
        setTimeout(() => $overlay.addClass('phase-3'), t.phase3);
        setTimeout(() => {
            resetOverlay($overlay, ['phase-1', phaseClass, 'phase-3']);
            $('#chorus-dissolution-fragments').empty();
            animating = false;
            resolve();
        }, t.cleanup);
    });
}

/**
 * Play the transformation animation: old voice dies, new voice is born.
 * @param {Object} oldVoice - The voice being transformed
 * @param {Object} newVoice - The voice being born from transformation
 * @returns {Promise<void>}
 */
export function playTransformation(oldVoice, newVoice) {
    if (animating) return Promise.resolve();
    animating = true;

    return new Promise(resolve => {
        const $overlay = $('#chorus-transform-overlay');
        const oldArc = getArcana(oldVoice.arcana);
        const newArc = getArcana(newVoice.arcana);

        // Populate both cards
        populateTransformCards(oldVoice, oldArc, newVoice, newArc);

        // Labels
        $('#chorus-transform-label').text('TRANSFORMATION');
        $('#chorus-transform-subtitle').text(
            `${oldVoice.name} becomes ${newVoice.name}`
        );

        const t = TRANSFORM_TIMING;

        setTimeout(() => $overlay.addClass('visible'), t.fadeIn);
        setTimeout(() => $overlay.addClass('phase-1'), t.phase1);
        setTimeout(() => {
            $overlay.removeClass('phase-1').addClass('phase-2');
            spawnFragments($('#chorus-transform-fragments'), oldArc.glow, 20);
        }, t.phase2);
        setTimeout(() => {
            $overlay.removeClass('phase-2').addClass('phase-3');
            spawnParticles($('#chorus-transform-fragments'), newArc.glow, 10);
        }, t.phase3);
        setTimeout(() => $overlay.addClass('phase-4'), t.phase4);
        setTimeout(() => {
            resetOverlay($overlay, ['phase-1', 'phase-2', 'phase-3', 'phase-4']);
            $('#chorus-transform-fragments').empty();
            animating = false;
            resolve();
        }, t.cleanup);
    });
}

/**
 * Check if an animation is currently playing.
 */
export function isAnimating() {
    return animating;
}

// =============================================================================
// CARD POPULATION
// =============================================================================

function populateAwakeningCard(voice, arc) {
    const $front = $('#chorus-awakening-front');
    $front.css('border-color', arc.color + '66');

    $('#chorus-awakening-glow').css('background', `radial-gradient(circle, ${arc.glow}44 0%, transparent 70%)`);
    $('#chorus-awakening-glyph').text(arc.glyph).css('color', arc.glow);
    $('#chorus-awakening-name').text(voice.name).css('color', arc.glow);
    $('#chorus-awakening-arcana').text(arc.label);
    $('#chorus-awakening-depth').text(voice.depth || 'rooted').css({
        'color': arc.glow,
        'border-color': arc.color + '44',
    });
    $('#chorus-awakening-ink').css('color', arc.glow);
    $('#chorus-awakening-label').text('A VOICE AWAKENS');
    $('#chorus-awakening-subtitle').text(
        voice.birthMoment
            ? `"${truncate(voice.birthMoment, 80)}"`
            : ''
    );
}

function populateDissolutionCard(voice, arc) {
    const $front = $('#chorus-dissolution-front');
    $front.css('border-color', arc.color + '66');

    $('#chorus-dissolution-glow').css('background', `radial-gradient(circle, ${arc.glow}44 0%, transparent 70%)`);
    $('#chorus-dissolution-glyph').text(arc.glyph).css('color', arc.glow);
    $('#chorus-dissolution-name').text(voice.name).css('color', arc.glow);
    $('#chorus-dissolution-arcana').text(arc.label);
}

function populateTransformCards(oldVoice, oldArc, newVoice, newArc) {
    // Old card
    const $oldFront = $('#chorus-transform-old-front');
    $oldFront.css('border-color', oldArc.color + '66');
    $('#chorus-transform-old-glyph').text(oldArc.glyph).css('color', oldArc.glow);
    $('#chorus-transform-old-name').text(oldVoice.name).css('color', oldArc.glow);

    // New card
    const $newFront = $('#chorus-transform-new-front');
    $newFront.css('border-color', newArc.color + '66');
    $('#chorus-transform-new-glow').css('background', `radial-gradient(circle, ${newArc.glow}44 0%, transparent 70%)`);
    $('#chorus-transform-new-glyph').text(newArc.glyph).css('color', newArc.glow);
    $('#chorus-transform-new-name').text(newVoice.name).css('color', newArc.glow);
    $('#chorus-transform-new-arcana').text(newArc.label);
    $('#chorus-transform-new-depth').text(newVoice.depth || 'rooted').css({
        'color': newArc.glow,
        'border-color': newArc.color + '44',
    });
}

// =============================================================================
// PARTICLE / FRAGMENT EFFECTS
// =============================================================================

/**
 * Spawn rising sparkle particles inside a container.
 */
function spawnParticles($container, color, count) {
    for (let i = 0; i < count; i++) {
        const x = 30 + Math.random() * 60; // % from left
        const y = 40 + Math.random() * 40; // % from top
        const delay = Math.random() * 800;
        const size = 2 + Math.random() * 3;

        const $p = $('<div class="chorus-anim__particle"></div>').css({
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}px`,
            height: `${size}px`,
            background: color,
            boxShadow: `0 0 ${size * 2}px ${color}`,
            animationDelay: `${delay}ms`,
        });

        $container.append($p);

        // Trigger animation after append
        requestAnimationFrame(() => $p.addClass('active'));
    }
}

/**
 * Spawn scattering fragments (for death/transform).
 */
function spawnFragments($container, color, count) {
    const stageW = 210;
    const stageH = 330;

    for (let i = 0; i < count; i++) {
        // Start position: roughly within the card bounds
        const startX = 40 + Math.random() * (stageW - 80);
        const startY = 40 + Math.random() * (stageH - 80);

        // Scatter destination
        const fx = (Math.random() - 0.5) * 300;
        const fy = (Math.random() - 0.5) * 300;
        const fr = (Math.random() - 0.5) * 360;

        const w = 4 + Math.random() * 12;
        const h = 4 + Math.random() * 8;
        const delay = Math.random() * 400;

        const $f = $('<div class="chorus-anim__fragment"></div>').css({
            left: `${startX}px`,
            top: `${startY}px`,
            width: `${w}px`,
            height: `${h}px`,
            background: color,
            boxShadow: `0 0 4px ${color}`,
            '--fx': `${fx}px`,
            '--fy': `${fy}px`,
            '--fr': `${fr}deg`,
            animationDelay: `${delay}ms`,
        });

        $container.append($f);
        requestAnimationFrame(() => $f.addClass('active'));
    }
}

// =============================================================================
// HELPERS
// =============================================================================

function resetOverlay($overlay, phases) {
    $overlay.removeClass('visible');
    for (const p of phases) {
        $overlay.removeClass(p);
    }
}

function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.substring(0, max - 1) + '\u2026' : str;
}
