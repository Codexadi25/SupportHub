const nlp = require('compromise');
const natural = require('natural');
const Category = require('../models/Category');
const PermittedWord = require('../models/PermittedWord');

const tokenizer = new natural.WordTokenizer();

// Comprehensive list of standard English function words that are automatically allowed
const FUNCTION_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'because', 'as', 'until', 'while',
    'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn', 'weren', 'won', 'wouldn',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've", "you'll", "you'd", 'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself', 'she', "she's", 'her', 'hers', 'herself', 'it', "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing', 'would', 'should', 'could', 'ought', 'i\'m', 'you\'re', 'he\'s', 'she\'s', 'it\'s', 'we\'re', 'they\'re', 'i\'ve', 'you\'ve', 'we\'ve', 'they\'ve', 'i\'d', 'you\'d', 'he\'d', 'she\'d', 'we\'d', 'they\'d', 'i\'ll', 'you\'ll', 'he\'ll', 'she\'ll', 'we\'ll', 'they\'ll', 'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'hasn\'t', 'haven\'t', 'hadn\'t', 'doesn\'t', 'don\'t', 'didn\'t', 'won\'t', 'wouldn\'t', 'shan\'t', 'shouldn\'t', 'can\'t', 'cannot', 'couldn\'t', 'mustn\'t', 'let\'s', 'here\'s', 'there\'s', 'when\'s', 'where\'s', 'why\'s', 'how\'s', 'a\'s', 'c\'s', 'g\'s', 'h\'s', 'o\'s', 't\'s', 'welcome', 'please', 'hello', 'hi', 'thanks', 'thank', 'sorry', 'apologize', 'dear'
]);

/**
 * Generates all variations (tenses, plurals, singulars) of a word using compromise.
 * @param {string} word 
 * @returns {string[]} array of variation strings
 */
function getWordVariations(word) {
    const variations = new Set();
    const cleanWord = word.trim().toLowerCase();
    
    if (!cleanWord || cleanWord.length < 2) return [];

    try {
        const doc = nlp(cleanWord);
        
        // Verb conjugations (e.g. cancel -> cancelled, cancels, cancelling)
        const verbs = doc.verbs();
        if (verbs.length > 0) {
            const conjugated = verbs.conjugate()[0];
            if (conjugated) {
                Object.values(conjugated).forEach(v => {
                    if (v && typeof v === 'string') {
                        variations.add(v.toLowerCase().trim());
                    }
                });
            }
        }
        
        // Nouns inflections (plurals/singulars)
        const nouns = doc.nouns();
        if (nouns.length > 0) {
            const plural = nouns.toPlural().text().trim().toLowerCase();
            const singular = nouns.toSingular().text().trim().toLowerCase();
            if (plural && plural !== cleanWord) variations.add(plural);
            if (singular && singular !== cleanWord) variations.add(singular);
        }

        // Adjectives comparative/superlative variations (e.g. late -> later, latest)
        const adj = doc.adjectives();
        if (adj.length > 0) {
            // compromise doesn't do direct comparatives easily in text sometimes, but we can do a fallback or manual checks if needed
        }
        
    } catch (err) {
        console.warn(`[NLP Error] Failed to generate variations for "${cleanWord}":`, err.message);
    }
    
    // Always remove the original word from variations
    variations.delete(cleanWord);
    
    return Array.from(variations);
}

/**
 * Extracts and cleans words from a string, ignoring punctuation, numbers, and stop/function words.
 * @param {string} text 
 * @returns {string[]} clean lowercase words
 */
function extractCleanContentWords(text) {
    if (!text || typeof text !== 'string') return [];
    
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
    const contentWords = new Set();
    
    tokens.forEach(tok => {
        // Strip out non-alphabetic characters entirely
        const clean = tok.replace(/[^a-z]/g, '').trim();
        
        if (clean && clean.length > 1 && !FUNCTION_WORDS.has(clean)) {
            contentWords.add(clean);
        }
    });
    
    return Array.from(contentWords);
}

/**
 * Scan database cands and build the PermittedWord vocabulary list.
 * @returns {Promise<{ created: number, updated: number }>}
 */
async function syncWordsFromDatabase() {
    console.log('[Word Sync] Scanning database templates...');
    const categories = await Category.find({});
    const dbWords = new Set();
    
    // Collect all unique content words from all category templates
    categories.forEach(cat => {
        if (cat.templates && Array.isArray(cat.templates)) {
            cat.templates.forEach(tpl => {
                if (tpl.text) {
                    const words = extractCleanContentWords(tpl.text);
                    words.forEach(w => dbWords.add(w));
                }
            });
        }
    });

    // Collect all unique content words from TAG_KEYWORDS
    try {
        const { TAG_KEYWORDS } = require('./autoTagGenerator');
        if (TAG_KEYWORDS) {
            Object.values(TAG_KEYWORDS).forEach(keywordsArr => {
                if (Array.isArray(keywordsArr)) {
                    keywordsArr.forEach(kw => {
                        const words = extractCleanContentWords(kw);
                        words.forEach(w => dbWords.add(w));
                    });
                }
            });
        }
    } catch (err) {
        console.warn('[Word Sync] Failed to extract words from TAG_KEYWORDS:', err.message);
    }
    
    console.log(`[Word Sync] Extracted ${dbWords.size} unique content words from database. Syncing...`);
    
    if (dbWords.size === 0) {
        console.log('[Word Sync] Completed. No words to sync.');
        return { created: 0, updated: 0 };
    }

    const wordsArray = Array.from(dbWords);
    const existingRecords = await PermittedWord.find({ word: { $in: wordsArray } });
    const existingMap = new Map();
    existingRecords.forEach(rec => {
        existingMap.set(rec.word, rec);
    });

    const bulkOps = [];
    let created = 0;
    let updated = 0;
    
    for (const word of wordsArray) {
        const similarWords = getWordVariations(word);
        const existing = existingMap.get(word);
        
        if (existing) {
            const combinedSimilar = Array.from(new Set([...existing.similarWords, ...similarWords]));
            bulkOps.push({
                updateOne: {
                    filter: { _id: existing._id },
                    update: {
                        $set: {
                            similarWords: combinedSimilar,
                            source: 'cands_db'
                        }
                    }
                }
            });
            updated++;
        } else {
            bulkOps.push({
                insertOne: {
                    document: {
                        word,
                        similarWords,
                        source: 'cands_db',
                        isActive: true
                    }
                }
            });
            created++;
        }
    }

    if (bulkOps.length > 0) {
        await PermittedWord.bulkWrite(bulkOps);
    }
    
    console.log(`[Word Sync] Completed. Created: ${created}, Updated: ${updated}`);
    return { created, updated };
}

/**
 * Validates generated response text against the active permitted words.
 * Returns validation status and violated words.
 * @param {string} text 
 * @returns {Promise<{ isValid: boolean, violatedWords: string[] }>}
 */
async function validateTextAgainstPermitted(text) {
    if (!text || typeof text !== 'string') {
        return { isValid: true, violatedWords: [] };
    }

    // 1. Fetch active permitted words
    const permittedList = await PermittedWord.find({ isActive: true });
    
    // 2. Build Set of all allowed variations
    const allowedSet = new Set();
    permittedList.forEach(item => {
        allowedSet.add(item.word);
        if (item.similarWords && Array.isArray(item.similarWords)) {
            item.similarWords.forEach(w => allowedSet.add(w.toLowerCase().trim()));
        }
    });

    // 3. Extract content words from generated response
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
    const violatedWords = new Set();

    tokens.forEach(tok => {
        const clean = tok.replace(/[^a-z]/g, '').trim();
        
        // Ignore empty, single characters, numbers and standard grammatical function words
        if (!clean || clean.length <= 1 || FUNCTION_WORDS.has(clean) || /^\d+$/.test(clean)) {
            return;
        }

        // If the content word is not in permitted vocabulary, it's a violation
        if (!allowedSet.has(clean)) {
            violatedWords.add(clean);
        }
    });

    const violations = Array.from(violatedWords);
    return {
        isValid: violations.length === 0,
        violatedWords: violations
    };
}

module.exports = {
    getWordVariations,
    extractCleanContentWords,
    syncWordsFromDatabase,
    validateTextAgainstPermitted,
    FUNCTION_WORDS
};
