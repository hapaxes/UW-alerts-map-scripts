const { GoogleGenerativeAI } = require("@google/generative-ai");

require("dotenv").config();

const API_KEY = process.env.GEMINI_API_KEY;

const apiKey = API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const postCategories = [
  "crime",
  "weather",
  "environment",
  "health & wellness",
  "infrastructure",
  "facility",
  "academic",
  "administrative",
  "general",
  "traffic",
  "IT",
  "Hazardous Material",
  "fire",
];

const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

async function run(prompt) {
  const chatSession = model.startChat({
    generationConfig,
    history: [],
  });

  const result = await chatSession.sendMessage(prompt);
  return result.response.text();
}

function extractCategoriesPrompt(article, categories = postCategories) {
  const prompt = `
  Read the following blog post content and determine which category or categories best describe its content. Choose from the following list of categories: ${categories.join(
    ", "
  )}

  Please assign at least one category but no more than three in total. If multiple categories apply, select the ones that capture the most critical aspects of the post.
  
  blog post content: 
  "${article}"

  Output format:

  Return your answer as a comma-separated list of categories.
  `;

  return prompt;
}

function extractLocationPrompt(article) {
  const prompt = `
  Extract the location from the following text. If the text contains a specific location, such as an address, intersection, or named building, return only that location. If the location is somewhat vague but still refers to a specific place (e.g., "a garage on campus" or "the fountain in the park"), return that phrase as it appears. If the text does not refer to a specific location but is instead a general notice (e.g., about an entire city, a university, or general event updates), return "N/A". Do not return anything other than the extracted location or "N/A".
  
  Text:
  "${article}"
  
  Output format:
  
  If a specific location exists, return it exactly as stated.
  If a vague but meaningful location exists, return it exactly as stated.
  If no specific location is mentioned, return "N/A".
  `;

  return prompt;
}

const article = `
UPDATE at 2:23 p.m. Tuesday: UW-IT has resolved the issue affecting the availability of many UW applications and of the UW Groups service. If you continue to have trouble accessing any UW web applications, you may need to quit and restart your browser to refresh your session.

Some applications known to have been impacted were MyUW, Canvas, Panopto, Husky OnNet, Zoom, eSignatures, and Document Management. Requirements for two-factor authentication (2FA) with Duo were also not enforced during the outage.

We encourage you to sign up for the eOutage mailing list to find out about major UW-IT computing incidents in the future. You can sign up for eOutage here: https://eoutage.uw.edu/.

ORIGINAL POST: UW-IT engineers are investigating an outage that could prevent users from accessing content on pages such as my.uw.edu, and problems creating, updating, or accessing the UW Groups service. This may impact logging into services including, but not limited to Zoom, Canvas, MyUW, etc.

Updates will be provided here as they become available.
`;

// for testing
// run(extractCategoriesPrompt(article, postCategories));

module.exports = { run, extractLocationPrompt, extractCategoriesPrompt };
