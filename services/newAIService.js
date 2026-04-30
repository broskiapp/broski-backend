/**
 * New AI Service — Chat Completions API
 *
 * Replaces the Assistants API pattern in aiService.js.
 * Key differences:
 *  - Single API call instead of 5+ calls with polling
 *  - No thread creation, no run polling, no message retrieval
 *  - response_format: json_object enforces clean JSON — no regex parsing needed
 *  - gpt-4o-mini for text (10x cheaper, faster), gpt-4o for vision (screenshot)
 *  - Screenshots passed as base64 directly — no Cloudinary upload needed
 *
 * Old file (aiService.js) is kept untouched for rollback safety.
 */

const OpenAI = require('openai');
const config = require('../config');

let openai;
try {
    if (!config.OPENAI_API_KEY || config.OPENAI_API_KEY === 'your_openai_api_key_here') {
        throw new Error('OpenAI API key is not configured');
    }
    openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
} catch (error) {
    openai = null;
}

/**
 * Generate text-based AI replies using Chat Completions.
 * Replaces: getChatGPTAssistantResponse() in aiService.js
 *
 * @param {string} systemPrompt - The system prompt from prompts/aiPrompts.js
 * @param {string} userMessage  - The user message built in the controller
 * @returns {string} Raw JSON string — parse with JSON.parse() in controller
 */
const generateTextCompletion = async (systemPrompt, userMessage) => {
    if (!openai) {
        throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
    }

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        max_tokens: 350,
        temperature: 0.8,
        response_format: { type: 'json_object' },
    });

    return response.choices[0].message.content;
};

/**
 * Analyze a screenshot image and generate reply suggestions using Chat Completions with Vision.
 * Replaces: getChatGPTAssistantImageResponse() in aiService.js
 * Eliminates Cloudinary — image is passed as base64 directly to OpenAI.
 *
 * @param {string} systemPrompt  - The system prompt from prompts/aiPrompts.js
 * @param {string} userMessage   - The user message built in the controller
 * @param {string} base64Image   - Base64-encoded image string (from req.file.buffer)
 * @param {string} mimeType      - Image MIME type (from req.file.mimetype)
 * @returns {string} Raw JSON string — parse with JSON.parse() in controller
 */
const analyzeScreenshotCompletion = async (systemPrompt, userMessage, base64Image, mimeType) => {
    if (!openai) {
        throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
    }

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: userMessage,
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            // Embed image directly — no external URL, no Cloudinary needed
                            url: `data:${mimeType};base64,${base64Image}`,
                            // 'low' detail: 85 tokens flat regardless of image size
                            // sufficient for reading text in screenshots
                            detail: 'low',
                        },
                    },
                ],
            },
        ],
        max_tokens: 350,
        temperature: 0.8,
        response_format: { type: 'json_object' },
    });

    return response.choices[0].message.content;
};

module.exports = {
    generateTextCompletion,
    analyzeScreenshotCompletion,
};
