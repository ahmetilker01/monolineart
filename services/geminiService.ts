import { GoogleGenAI } from "@google/genai";
import { AnalysisResult } from "../types";

// Always initialize with the apiKey from process.env.API_KEY using the correct named parameter.
export const analyzeImageForCNC = async (base64Image: string): Promise<AnalysisResult> => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
      console.warn("Gemini API key not found. Skipping analysis.");
      return {
        title: "Drawing",
        description: "CNC processed image",
        suggestedFeedRate: 1500
      };
    }

    const ai = new GoogleGenAI({ apiKey });
    
    // Detect MIME type
    const mimeMatch = base64Image.match(/^data:(.+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    
    // Gemini Vision doesn't officially support SVG directly via base64 in this manner usually,
    // so we return default to prevent API error 400.
    if (mimeType.includes('svg')) {
        return {
          title: "SVG Artwork",
          description: "Vector imported file",
          suggestedFeedRate: 1500
        };
    }

    const cleanBase64 = base64Image.split(',')[1];

    // Using gemini-3-flash-preview for general text and vision analysis tasks as per instructions.
    const model = "gemini-3-flash-preview";
    const prompt = `
      Analyze this image for a CNC vector line art conversion.
      1. Provide a short, creative filename/title (max 3 words).
      2. Provide a 1-sentence description of the subject.
      3. Suggest a CNC feed rate (mm/min) between 500 and 3000 based on complexity (slower for complex/curved, faster for simple).
      
      Return ONLY valid JSON in this format:
      {
        "title": "string",
        "description": "string",
        "suggestedFeedRate": number
      }
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    // Directly access the text property of the GenerateContentResponse object.
    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Fallback defaults
    return {
      title: "Drawing",
      description: "CNC processed image",
      suggestedFeedRate: 1500
    };
  }
};