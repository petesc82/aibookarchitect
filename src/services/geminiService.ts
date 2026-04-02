import { GoogleGenAI, Type } from "@google/genai";
import { BookParameters, Chapter, TargetAudience, NarrativePerspective } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const suggestParameters = async (topic: string): Promise<Partial<BookParameters>> => {
  const model = "gemini-3.1-pro-preview";
  const response = await ai.models.generateContent({
    model,
    contents: `Analysiere das Thema "${topic}" und schlage die optimalen Buchparameter vor. 
    Wähle aus: 
    - targetAudience: 'Beginners', 'Experts', 'Children', 'Seniors'
    - narrativePerspective: 'FirstPerson', 'SecondPerson', 'ThirdPerson'
    - useExamples, reflectionQuestions, dialogueStyle, scientific, easyToRead, entertaining (jeweils true/false)`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          targetAudience: { type: Type.STRING, enum: ['Beginners', 'Experts', 'Children', 'Seniors'] },
          narrativePerspective: { type: Type.STRING, enum: ['FirstPerson', 'SecondPerson', 'ThirdPerson'] },
          useExamples: { type: Type.BOOLEAN },
          reflectionQuestions: { type: Type.BOOLEAN },
          dialogueStyle: { type: Type.BOOLEAN },
          scientific: { type: Type.BOOLEAN },
          easyToRead: { type: Type.BOOLEAN },
          entertaining: { type: Type.BOOLEAN }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const generateCoverImage = async (title: string, topic: string): Promise<string> => {
  const model = "gemini-2.5-flash-image";
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        { text: `Erstelle ein professionelles Buchcover für ein Buch mit dem Titel "${title}" zum Thema "${topic}". 
        Das Cover sollte modern und ansprechend sein. 
        WICHTIG: Der Titel "${title}" MUSS deutlich lesbar auf dem Cover stehen.` }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: "3:4",
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Kein Bild generiert");
};

export const generateToC = async (topic: string): Promise<{ title: string; chapters: Chapter[] }> => {
  const model = "gemini-3.1-pro-preview";
  
  const response = await ai.models.generateContent({
    model,
    contents: `Erstelle ein strukturiertes Inhaltsverzeichnis für ein Buch zum Thema: "${topic}". 
    Gib den Titel des Buches und eine Liste von Kapiteln zurück. 
    Jedes Kapitel sollte einen Titel und eine kurze Beschreibung haben, was darin behandelt wird.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          chapters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["title", "description"]
            }
          }
        },
        required: ["title", "chapters"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    title: data.title || "Unbenanntes Buch",
    chapters: (data.chapters || []).map((c: any, index: number) => ({
      id: `chapter-${index}`,
      title: c.title,
      description: c.description
    }))
  };
};

export const generateChapterContent = async (
  bookTitle: string,
  chapter: Chapter,
  params: BookParameters,
  allChapters: Chapter[]
): Promise<string> => {
  const model = "gemini-3.1-pro-preview";
  
  const styleInstructions = [
    params.useExamples ? "- Verwende viele praktische Beispiele." : "",
    params.reflectionQuestions ? "- Füge am Ende Reflexionsfragen ein." : "",
    params.dialogueStyle ? "- Schreibe teilweise in Dialogform." : "",
    params.scientific ? "- Verwende einen wissenschaftlichen, präzisen Ton." : "",
    params.easyToRead ? "- Achte auf leichte Lesbarkeit und klare Sätze." : "",
    params.entertaining ? "- Gestalte den Inhalt unterhaltsam und fesselnd." : "",
    `- Zielgruppe: ${params.targetAudience}`,
    `- Erzählperspektive: ${params.narrativePerspective === 'FirstPerson' ? 'Ich-Form' : params.narrativePerspective === 'SecondPerson' ? 'Du-Form' : 'Dritte Person'}`,
  ].filter(Boolean).join("\n");

  const prompt = `
    Schreibe das Kapitel "${chapter.title}" für das Buch "${bookTitle}".
    
    Kontext des Kapitels: ${chapter.description}
    
    Gesamtstruktur des Buches:
    ${allChapters.map(c => `- ${c.title}`).join("\n")}
    
    Anforderungen an den Stil:
    ${styleInstructions}
    
    Ziel-Wortzahl für dieses Kapitel: ca. ${params.wordsPerChapter} Wörter.
    
    Schreibe den Inhalt in Markdown-Format. 
    WICHTIG: Verwende immer doppelte Zeilenumbrüche zwischen Absätzen für eine klare Struktur.
    Verwende Überschriften (## für Kapitelabschnitte), Listen und Fettdruck (**Text**), wo es sinnvoll ist.
    Vermeide es, das Wort "Kapitel" oder die Kapitelnummer in den Text selbst zu schreiben, da dies vom System hinzugefügt wird.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || "Fehler bei der Generierung des Inhalts.";
};

export const generateInspiration = async (category: string, tone: string): Promise<string> => {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Generiere eine inspirierende Buchidee und eine kurze Beschreibung (max. 3 Sätze) für die Kategorie "${category}".
    Der Tonfall der Beschreibung soll "${tone}" sein.
    
    Gib nur den Text der Idee und Beschreibung zurück, ohne Einleitung oder Formatierung.
    Beispiel: "Der Code der Sterne: Eine Reise durch die Geschichte der Astronomie von den ersten Teleskopen bis zur modernen Astrophysik."
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || "";
};

export const refineChapterContent = async (
  currentContent: string,
  feedback: string,
  params: BookParameters
): Promise<string> => {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Überarbeite den folgenden Kapitelinhalt basierend auf dem Feedback des Nutzers.
    
    Aktueller Inhalt:
    ${currentContent}
    
    Nutzer-Feedback:
    "${feedback}"
    
    Behalte die grundsätzlichen Parameter bei:
    - Zielgruppe: ${params.targetAudience}
    - Stil: ${params.scientific ? 'Wissenschaftlich' : 'Unterhaltsam'}
    
    Gib den überarbeiteten Text im Markdown-Format zurück.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
  });

  return response.text || currentContent;
};
