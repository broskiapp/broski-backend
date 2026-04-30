/**
 * New AI Controller — Chat Completions API
 *
 * Replaces ai-controller.js (kept untouched for rollback safety).
 *
 * Key differences from ai-controller.js:
 *  - Uses Chat Completions API (newAIService.js) instead of Assistants API (aiService.js)
 *  - Single API call per request — no thread creation, no run polling, no message retrieval
 *  - No toneInstructions map — system prompts in aiPrompts.js own persona and tone matching.
 *    Tone is passed as a plain value; the model understands it natively.
 *  - No regex JSON parsing — response_format: json_object guarantees clean JSON from OpenAI
 *  - analyzeScreenshot: image passed as base64 directly to OpenAI — no Cloudinary upload needed
 *  - No assistantId dependency — no pre-configured Assistants on platform.openai.com required
 */

const { generateTextCompletion, analyzeScreenshotCompletion } = require('../services/newAIService');
const {
    CHAT_REPLIES_SYSTEM_PROMPT,
    SCREENSHOT_ANALYSIS_SYSTEM_PROMPT,
    RIZZ_DRILL_SYSTEM_PROMPT,
    SCORE_DRILL_SYSTEM_PROMPT,
    CONFIDENCE_MESSAGE_SYSTEM_PROMPT,
    AWKWARD_SITUATIONS_SYSTEM_PROMPT,
} = require('../prompts/aiPrompts');

// ============ CHAT COACH MODE ============
const generateChatReplies = async (req, res) => {
    const { userMessage, contextMessages, tone } = req.body;

    if (!userMessage) {
        return res.status(400).json({ error: 'User message is required' });
    }

    if (!tone) {
        return res.status(400).json({ error: 'Tone is required' });
    }

    try {
        const message = `Tone: ${tone}\nMessage: "${userMessage}"${contextMessages ? `\nContext: ${contextMessages}` : ""}`;
        const rawJson = await generateTextCompletion(CHAT_REPLIES_SYSTEM_PROMPT, message);
        const parsed = JSON.parse(rawJson);
        res.json({ success: true, data: parsed, trialInfo: req.trialInfo || null });
    } catch (error) {
        res.json({
            success: true,
            data: { smooth: "I like where this is going... what else?", funny: "Hey, that's interesting! Tell me more 😄", real: "That's cool. What made you think of that?", tip: "Keep it natural bro, you got this 💪" },
            trialInfo: req.trialInfo || null
        });
    }
};

// ============ DAILY RIZZ DRILLS ============
const generateDailyRizzDrill = async (req, res) => {
    try {
        const rawJson = await generateTextCompletion(RIZZ_DRILL_SYSTEM_PROMPT, "Generate a challenge for the user to respond to.");
        const parsed = JSON.parse(rawJson);
        res.json({ success: true, data: parsed, trialInfo: req.trialInfo || null });
    } catch (error) {
        res.json({
            success: true,
            data: { scenario: "You're texting your crush", challenge: "She says: 'You're so quiet 😅' - What do you reply?" },
            trialInfo: req.trialInfo || null
        });
    }
};

// ============ SCORE RIZZ DRILL ============
const scoreRizzDrillResponse = async (req, res) => {
    const { drill, userResponse } = req.body;

    if (!drill || !userResponse) {
        return res.status(400).json({ error: 'Drill and user response are required' });
    }

    try {
        const message = `Challenge: ${drill.challenge}\nUser's response: "${userResponse}"`;
        const rawJson = await generateTextCompletion(SCORE_DRILL_SYSTEM_PROMPT, message);
        const parsed = JSON.parse(rawJson);
        res.json({ success: true, data: parsed, trialInfo: req.trialInfo || null });
    } catch (error) {
        res.json({
            success: true,
            data: { score: 6, feedback: "Not bad! Keep practicing to improve your delivery.", suggestion: "Try being more playful and confident in your tone." },
            trialInfo: req.trialInfo || null
        });
    }
};

// ============ CONFIDENCE MODE ============
const generateConfidenceMessage = async (req, res) => {
    try {
        const rawJson = await generateTextCompletion(CONFIDENCE_MESSAGE_SYSTEM_PROMPT, "Generate a daily confidence message.");
        const parsed = JSON.parse(rawJson);
        res.json({ success: true, data: parsed, trialInfo: req.trialInfo || null });
    } catch (error) {
        res.json({
            success: true,
            data: { message: "You've got this, bro. She's lucky to text you." },
            trialInfo: req.trialInfo || null
        });
    }
};

// ============ AWKWARD SITUATIONS RECOVERY ============
const generateAwkwardSituationRecovery = async (req, res) => {
    const { situation, tone } = req.body;

    if (!situation) {
        return res.status(400).json({ error: 'Situation is required' });
    }

    if (!tone) {
        return res.status(400).json({ error: 'Tone is required' });
    }

    try {
        const message = `Tone: ${tone}\nSituation: "${situation}"`;
        const rawJson = await generateTextCompletion(AWKWARD_SITUATIONS_SYSTEM_PROMPT, message);
        const parsed = JSON.parse(rawJson);
        res.json({ success: true, data: parsed, trialInfo: req.trialInfo || null });
    } catch (error) {
        res.json({
            success: true,
            data: { smooth: "I think you're just playing hard to get 😏 But I'm patient", funny: "Haha fair, I'll give you that one 😅 But I promise my jokes get better", real: "Hey no worries, just wanted to check in and see what's up" },
            trialInfo: req.trialInfo || null
        });
    }
};

// ============ SCREENSHOT ANALYSIS ============
const analyzeScreenshot = async (req, res) => {
    const { tone } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'Image file is required' });
    }

    if (!tone) {
        return res.status(400).json({ error: 'Tone is required' });
    }

    try {
        const message = `Tone: ${tone}\nAnalyze the conversation in this screenshot and provide reply suggestions.`;
        const base64Image = req.file.buffer.toString('base64');
        const rawJson = await analyzeScreenshotCompletion(SCREENSHOT_ANALYSIS_SYSTEM_PROMPT, message, base64Image, req.file.mimetype);
        const result = JSON.parse(rawJson);
        res.json({ success: true, data: result, trialInfo: req.trialInfo || null });
    } catch (error) {
        res.json({
            success: true,
            data: { smooth: "I like where this is going... what else?", funny: "Hey, that's interesting! Tell me more 😄", real: "That's cool. What made you think of that?", tip: "Keep it natural bro, you got this 💪" },
            trialInfo: req.trialInfo || null
        });
    }
};

module.exports = {
    generateChatReplies,
    generateDailyRizzDrill,
    scoreRizzDrillResponse,
    generateConfidenceMessage,
    generateAwkwardSituationRecovery,
    analyzeScreenshot
};
