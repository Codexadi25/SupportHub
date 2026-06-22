// services/aiService.js
// Facade layer to maintain backward compatibility and support legacy imports

const { processFileToSop, generateSopFromText, generateSopFromImage } = require('./sopAiService');
const { generateAiCannedResponse, rephraseAiCannedResponse, TAG_KEYWORDS, expandTagsToNarrative } = require('./cannedAiService');

module.exports = {
  // SOP drafting services
  processFileToSop,
  generateSopDraft: processFileToSop,
  generateSopFromText,
  generateSopFromImage,

  // Canned response services
  generateAiCannedResponse,
  rephraseAiCannedResponse,
  TAG_KEYWORDS,
  expandTagsToNarrative
};