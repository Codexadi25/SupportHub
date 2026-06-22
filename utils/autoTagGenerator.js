/**
 * autoTagGenerator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * NLP-powered tag generator for SupportHub canned responses.
 *
 * Pipeline:
 *  1. Tokenise & normalise the input text (lowercase, strip punctuation).
 *  2. Remove stop-words so common English words don't inflate scores.
 *  3. Stem every token with the Porter algorithm so "cancelling" matches
 *     "cancelled", "cancels", "cancel", etc.
 *  4. Score each candidate tag using a weighted keyword-match approach:
 *       • Multi-word (phrase) keywords  → weight 3  (highly specific)
 *       • Single-word keywords          → weight 1
 *     A tag's raw score = Σ weights of all matched keywords.
 *  5. Normalise the score by the total number of keywords in that tag's
 *     dictionary so shorter lists aren't unfairly penalised.
 *  6. Keep only tags whose normalised score exceeds SCORE_THRESHOLD.
 *  7. Return the top MAX_TAGS tags, sorted by descending relevance.
 *
 * Dependencies: `natural` (tokeniser + Porter stemmer) – zero paid APIs.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const natural = require('natural');

const tokenizer  = new natural.WordTokenizer();
const stemmer    = natural.PorterStemmer;

// ─── Tuneable parameters ────────────────────────────────────────────────────
const MAX_TAGS        = 5;    // hard cap on returned tags
const SCORE_THRESHOLD = 0.08; // minimum normalised score to qualify
const PHRASE_WEIGHT   = 3;    // multi-word match bonus over single-word
const SINGLE_WEIGHT   = 1;

// ─── English stop-words (compact set) ────────────────────────────────────────
const STOP_WORDS = new Set([
    'a','an','the','and','or','but','if','in','on','at','to','for',
    'of','with','by','from','up','about','into','through','during',
    'is','was','are','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might',
    'i','me','my','we','our','you','your','he','she','it','its',
    'they','them','their','this','that','these','those','what','which',
    'who','whom','not','no','so','just','more','also','very','too',
    'as','out','can','get','got','let','via','per','than','then',
]);

// ─── Tag keyword dictionary ───────────────────────────────────────────────────
// Each key is a tag name; its value is an array of representative phrases/words.
// Prefer specific multi-word phrases over generic single words for precision.
const TAG_KEYWORDS = {
    address_issue:      ['incorrect address', 'wrong address', 'location issue', 'address problem', 'hard to find', 'facing difficulty', 'address', 'location'],
    arrival_cx:         ['arriving customer', 'reaching customer', 'going to customer', 'arriving', 'reaching', 'towards customer'],
    arrival_res:        ['arriving restaurant', 'reaching restaurant', 'going to restaurant', 'arriving', 'reaching', 'towards restaurant'],
    arrived:            ['arrived', 'near gate', 'near entrance', 'geofence', 'nearby', 'near location', 'close to'],
    arriving_soon:      ['arriving soon', 'on the way', 'almost there', 'reaching soon'],
    assignment_delay:   ['assignment delay', 'assigning partner', 'no delivery partner', 'partner delay', 'late assignment'],
    awaiting_pickup:    ['awaiting pickup', 'waiting for pickup', 'waiting at restaurant'],
    batched:            ['batched order', 'multiple deliveries', 'grouped delivery'],
    battery:            ['battery dead', 'battery low', 'battery issue', 'battery'],
    bill:               ['bill', 'invoice', 'billing issue', 'token', 'printing bill'],
    cancelation:        ['cancel order', 'order cancelled', 'cancellation', 'cancelled'],
    check_post:         ['checkpoint', 'security check', 'police check', 'guard', 'check post'],
    closed_mx:          ['restaurant closed', 'outlet closed', 'store closed'],
    cx_address_missmatch:['customer address mismatch', 'wrong customer address', 'address mismatch', 'location mismatch'],
    cx_canceled:        ['cancelled by customer', 'customer cancelled', 'customer canceled'],
    damaged:            ['damaged item', 'damaged order', 'damaged food', 'damaged'],
    delivered:          ['order delivered', 'successfully delivered', 'delivered'],
    device_issues:      ['unable to mark delivered', 'unable to mark picked', 'app issue', 'gps issue', 'phone issue', 'device issues'],
    dp_issue:           ['delivery partner issue', 'driver issue', 'rider problem', 'traffic issue', 'vehicle problem'],
    dp_mx_ur:           ['partner unresponsive at restaurant', 'delivery partner unresponsive restaurant'],
    dp_ur:              ['delivery partner unresponsive', 'driver unresponsive', 'partner not responding'],
    electricity:        ['power cut', 'electricity issue', 'no electricity', 'electric failure'],
    exchange:           ['exchange order', 'replacement', 'exchange item'],
    fog:                ['fog', 'foggy', 'low visibility fog'],
    food_not_prepared:  ['food not prepared', 'not ready yet', 'preparation delay', 'food prep delay', 'kitchen delay', 'still preparing', 'being prepared'],
    forgot_pickup:      ['forgot to pick', 'forgot pickup', 'forgot order', 'forgot to pick up'],
    fuel:               ['fuel issue', 'out of fuel', 'no fuel', 'fuel problem', 'fuel'],
    gas:                ['gas problem', 'gas issue', 'gas leak', 'gas'],
    grouped:            ['grouped order', 'batched delivery', 'grouped deliveries'],
    just_assigned:      ['just assigned', 'newly assigned', 'recently assigned'],
    kitchen_full:       ['kitchen full', 'kitchen overloaded', 'kitchen at capacity'],
    long_distance:      ['long distance', 'far location', 'long route'],
    mx_address_mismatch:['restaurant address mismatch', 'wrong restaurant address', 'incorrect restaurant location'],
    mx_closed:          ['restaurant closed', 'merchant closed'],
    mx_issues:          ['restaurant not accepting', 'out of stock at restaurant', 'merchant issue'],
    item_out_of_stock:  ['out of stock', 'item not available', 'unavailable item', 'missing item'],
    network_issues:     ['network issue', 'no internet', 'connectivity issue', 'poor network', 'network problem'],
    on_time:            ['on time', 'delivered on time', 'arrived on time'],
    packing:            ['packing delay', 'still packing', 'being packed', 'packing issue'],
    picked_by_another_dp:['picked by another partner', 'wrong partner picked', 'another dp picked'],
    pickup_mistake:     ['wrong order picked', 'picked wrong food', 'pickup mistake', 'mistakenly picked', 'wrong item picked'],
    poor_road:          ['bad road', 'potholes', 'road damage', 'road construction', 'poor road condition'],
    power_cut:          ['power cut', 'no power', 'electricity cut', 'power outage', 'power shortfall'],
    preparation_delay:  ['preparation delay', 'food taking long', 'slow preparation'],
    railway_crossing:   ['railway crossing', 'train crossing', 'level crossing'],
    rain_affected:      ['rain affected', 'heavy rain', 'rain', 'flood', 'storm', 'waterlogged due to rain'],
    reassignment:       ['reassigned', 'transfer order', 'reassigning', 'order transferred'],
    road_blocked:       ['road blocked', 'road closure', 'blocked road'],
    rush:               ['rush hour', 'busy time', 'peak rush', 'rush'],
    snatched:           ['order snatched', 'item snatched', 'snatched'],
    strike:             ['strike', 'bandh', 'work stoppage'],
    traffic:            ['heavy traffic', 'traffic jam', 'traffic congestion', 'roadblock', 'traffic'],
    transfer_order:     ['order transferred', 'previous partner', 'previous dp', 'reassigned partner'],
    unable_to_mark_delivered: ['unable to mark delivered', 'cannot mark delivered', 'not able to mark delivered'],
    unresponsive:       ['unresponsive', 'not responding', 'no response'],
    unsafe:             ['unsafe area', 'not safe', 'dangerous area', 'unsafe'],
    vehicle_issue:      ['vehicle breakdown', 'flat tire', 'engine trouble', 'accident', 'vehicle issue', 'breakdown'],
    waterlogging:       ['waterlogging', 'water logged', 'flooded road', 'waterlogged'],
    wrong_order:        ['wrong order', 'incorrect order', 'wrong food delivered'],

    // testing
    test_tag:           ['test case', 'bug testing', 'feature testing', 'testing', 'bugs'],
};

// ─── Pre-compute stemmed keyword sets for each tag ───────────────────────────
// We build two structures per tag:
//   • phrases : [ { original, stemmedTokens[], weight } ]  (multi-word first)
//   • For single tokens, stemmedTokens has length 1.
// Sorting phrases by length DESC ensures we try longer (more specific) phrases first.
const compiledTags = Object.entries(TAG_KEYWORDS).map(([tag, keywords]) => {
    const phrases = keywords.map(kw => {
        const tokens       = tokenizer.tokenize(kw.toLowerCase()).filter(t => !STOP_WORDS.has(t));
        const stemmedTokens = tokens.map(t => stemmer.stem(t));
        return {
            original:      kw,
            stemmedTokens,
            weight: stemmedTokens.length > 1 ? PHRASE_WEIGHT : SINGLE_WEIGHT,
        };
    }).sort((a, b) => b.stemmedTokens.length - a.stemmedTokens.length); // phrases first

    return { tag, phrases };
});

// ─── Core NLP pipeline ───────────────────────────────────────────────────────

/**
 * Tokenises and stems the input text, removing stop-words.
 * @param {string} text
 * @returns {{ tokens: string[], stemmed: string[] }}
 */
function preprocessText(text) {
    const raw     = tokenizer.tokenize(text.toLowerCase()) || [];
    const tokens  = raw.filter(t => !STOP_WORDS.has(t));
    const stemmed = tokens.map(t => stemmer.stem(t));
    return { tokens, stemmed };
}

/**
 * Checks whether a phrase's stemmed tokens appear in the document's stemmed
 * token array as a contiguous subsequence.
 * @param {string[]} phraseStemmed
 * @param {string[]} docStemmed
 * @returns {boolean}
 */
function phraseMatchesStemmed(phraseStemmed, docStemmed) {
    if (phraseStemmed.length === 0) return false;
    if (phraseStemmed.length === 1) return docStemmed.includes(phraseStemmed[0]);

    // Sliding-window check for contiguous phrase
    for (let i = 0; i <= docStemmed.length - phraseStemmed.length; i++) {
        let matched = true;
        for (let j = 0; j < phraseStemmed.length; j++) {
            if (docStemmed[i + j] !== phraseStemmed[j]) { matched = false; break; }
        }
        if (matched) return true;
    }
    return false;
}

/**
 * Main entry point — generates the most relevant tags for `text`.
 *
 * @param {string} text  Raw input text (template body, etc.)
 * @returns {string[]}   Up to MAX_TAGS tag strings, best match first.
 */
const generateTags = (text) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) return [];

    const { stemmed: docStemmed } = preprocessText(text);
    const lowerText = text.toLowerCase();

    const scored = [];

    for (const { tag, phrases } of compiledTags) {
        let rawScore    = 0;
        let totalWeight = phrases.reduce((s, p) => s + p.weight, 0);

        for (const phrase of phrases) {
            // Try stemmed contiguous match first (robust to morphology)
            const stemHit = phraseMatchesStemmed(phrase.stemmedTokens, docStemmed);
            // Fallback: literal substring match (catches compound / hyphenated forms)
            const litHit  = !stemHit && lowerText.includes(phrase.original);

            if (stemHit || litHit) {
                rawScore += phrase.weight;
            }
        }

        if (rawScore === 0) continue;

        // Normalise: score as a fraction of total possible weight for this tag.
        const normScore = rawScore / totalWeight;

        if (normScore >= SCORE_THRESHOLD) {
            scored.push({ tag, score: normScore, rawScore });
        }
    }

    // Sort descending by normalised score, then by raw score as tiebreaker
    scored.sort((a, b) => b.score - a.score || b.rawScore - a.rawScore);

    // Extract hashtags from text (always include them)
    const hashtagRegex  = /#(\w+)/g;
    const hashtagMatches = [...lowerText.matchAll(hashtagRegex)].map(m => m[1]);

    const topTags = scored.slice(0, MAX_TAGS).map(s => s.tag);

    // Deduplicate and return
    return [...new Set([...topTags, ...hashtagMatches])];
};

module.exports = { generateTags, TAG_KEYWORDS };