import { GoogleGenAI, Type, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { Book, BookParameters, Chapter, TargetAudience, NarrativePerspective, ModelType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * Helper to handle quota errors and fallback to a different model.
 * Supports both Gemini and OpenRouter models.
 */
async function safeGenerateContent(
  params: GenerateContentParameters,
  fallbackModel: ModelType = 'gemini-3-flash-preview',
  openRouterKey?: string
): Promise<GenerateContentResponse> {
  const isOpenRouter = params.model.startsWith('openrouter/');
  
  if (isOpenRouter) {
    if (!openRouterKey) {
      throw new Error("OpenRouter API Key ist erforderlich für dieses Modell.");
    }
    
    const modelId = params.model.replace('openrouter/', '');
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "Creative Book Generator",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "user", content: typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents) }
        ],
        response_format: params.config?.responseMimeType === "application/json" ? { type: "json_object" } : undefined
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(`OpenRouter Error: ${errData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content;
    
    // Mocking GenerateContentResponse
    return {
      text,
      candidates: [{ content: { parts: [{ text }] } }]
    } as any;
  }

  try {
    return await ai.models.generateContent(params);
  } catch (error: any) {
    // Check if it's a quota error (Resource has been exhausted (e.g. check quota).)
    if (error?.message?.includes('exhausted') || error?.message?.includes('429')) {
      console.warn(`Quota exceeded for ${params.model}. Falling back to ${fallbackModel}.`);
      return await ai.models.generateContent({
        ...params,
        model: fallbackModel,
      });
    }
    throw error;
  }
}

export const suggestParameters = async (topic: string, openRouterKey?: string): Promise<Partial<BookParameters>> => {
  const model = "gemini-3.1-pro-preview";
  const response = await safeGenerateContent({
    model,
    contents: `Analysiere das Thema "${topic}" und schlage die optimalen Buchparameter vor. 
    ANTWORTE AUSSCHLIESSLICH IM JSON-FORMAT.
    
    Wähle aus: 
    - targetAudience: 'Beginner', 'Intermediate', 'Advanced', 'Expert'
    - narrativePerspective: 'FirstPerson', 'SecondPerson', 'ThirdPerson'
    - languageStyle: 'Casual', 'Neutral', 'Academic'
    - localization: 'DACH', 'US', 'Global'
    - structureType: 'Chronological', 'ProblemSolution', 'Modular'
    - interactivity: 0 bis 4 (0=niedrig, 4=hoch)
    - useExamples, reflectionQuestions, dialogueStyle, scientific, easyToRead, entertaining (jeweils true/false)`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          targetAudience: { type: Type.STRING, enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] },
          narrativePerspective: { type: Type.STRING, enum: ['FirstPerson', 'SecondPerson', 'ThirdPerson'] },
          languageStyle: { type: Type.STRING, enum: ['Casual', 'Neutral', 'Academic'] },
          localization: { type: Type.STRING, enum: ['DACH', 'US', 'Global'] },
          structureType: { type: Type.STRING, enum: ['Chronological', 'ProblemSolution', 'Modular'] },
          interactivity: { type: Type.INTEGER },
          useExamples: { type: Type.BOOLEAN },
          reflectionQuestions: { type: Type.BOOLEAN },
          dialogueStyle: { type: Type.BOOLEAN },
          scientific: { type: Type.BOOLEAN },
          easyToRead: { type: Type.BOOLEAN },
          entertaining: { type: Type.BOOLEAN }
        }
      }
    }
  }, 'gemini-3-flash-preview', openRouterKey);
  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    throw new Error(`Fehler beim Verarbeiten der KI-Antwort (JSON): ${response.text?.substring(0, 200)}...`);
  }
};

export const generateCoverImage = async (title: string, topic: string, model: string = "gemini-2.5-flash-image"): Promise<string> => {
  const response = await safeGenerateContent({
    model,
    contents: {
      parts: [
        { text: `Erstelle ein professionelles Buchcover für ein Buch mit dem Titel "${title}" zum Thema "${topic}". 
        Das Cover sollte modern, künstlerisch und ansprechend sein. 
        
        WICHTIGSTE REGELN:
        1. Der Titel "${title}" MUSS deutlich lesbar und korrekt geschrieben auf dem Cover stehen.
        2. Es darf KEIN Autorenname (weder echt noch fiktiv) auf dem Cover erscheinen.
        3. Keine zusätzlichen Texte außer dem Buchtitel.` }
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

export const generateToC = async (topic: string, preferredModel: ModelType = 'gemini-3.1-pro-preview', openRouterKey?: string): Promise<{ title: string; chapters: Chapter[] }> => {
  const response = await safeGenerateContent({
    model: preferredModel,
    contents: `Erstelle ein strukturiertes Inhaltsverzeichnis für ein Buch zum Thema: "${topic}". 
    ANTWORTE AUSSCHLIESSLICH IM JSON-FORMAT.
    
    WICHTIG FÜR DEN BUCHTITEL:
    - Der Titel soll kreativ, fesselnd und professionell sein, wie ein Bestseller auf dem Markt.
    - Vermeide generische Titel wie "Der [Thema] Architekt" oder "Die Architektur von [Thema]".
    - Nutze Metaphern, starke Verben oder neugierig machende Phrasen.
    - Das Wort "Architekt" oder "Architektur" darf NUR verwendet werden, wenn das Buch tatsächlich von Bauwesen oder IT-Architektur handelt.
    
    Struktur:
    {
      "title": "Kreativer Buchtitel",
      "chapters": [
        { "title": "Kapitelname", "description": "Beschreibung" }
      ]
    }
    
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
  }, 'gemini-3-flash-preview', openRouterKey);

  try {
    const data = JSON.parse(response.text || "{}");
    
    if (!data.chapters || data.chapters.length === 0) {
      throw new Error("Die KI hat ein leeres Inhaltsverzeichnis generiert. Bitte versuche es mit einem anderen Modell oder Thema erneut.");
    }

    return {
      title: data.title || "Unbenanntes Buch",
      chapters: data.chapters.map((c: any, index: number) => ({
        id: `chapter-${index}`,
        title: c.title,
        description: c.description
      }))
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Unbekannter Fehler beim Parsen";
    throw new Error(`${errorMsg} | Roh-Antwort der KI: ${response.text?.substring(0, 500)}...`);
  }
};

export const regenerateChapterInToC = async (
  bookTitle: string,
  topic: string,
  currentChapter: Chapter,
  allChapters: Chapter[],
  preferredModel: ModelType = 'gemini-3.1-pro-preview',
  openRouterKey?: string
): Promise<Chapter> => {
  const response = await safeGenerateContent({
    model: preferredModel,
    contents: `Überarbeite das Kapitel "${currentChapter.title}" für das Buch "${bookTitle}" zum Thema "${topic}".
    Aktuelle Beschreibung: ${currentChapter.description}
    Andere Kapitel im Buch: ${allChapters.map(c => c.title).join(", ")}
    
    Erstelle einen neuen, besseren Titel und eine detailliertere Beschreibung für dieses Kapitel, die sich gut in den Gesamtkontext einfügt.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["title", "description"]
      }
    }
  }, 'gemini-3-flash-preview', openRouterKey);

  try {
    const data = JSON.parse(response.text || "{}");
    return {
      ...currentChapter,
      title: data.title || currentChapter.title,
      description: data.description || currentChapter.description
    };
  } catch (e) {
    throw new Error(`Fehler beim Verarbeiten der Kapitel-Regenerierung (JSON): ${response.text?.substring(0, 200)}...`);
  }
};

export const summarizeChapter = async (
  title: string,
  content: string,
  preferredModel: ModelType = 'gemini-3-flash-preview',
  openRouterKey?: string
): Promise<string> => {
  const prompt = `
    Fasse den Inhalt des folgenden Kapitels "${title}" kurz zusammen (max. 3-5 Sätze). 
    Ziel ist es, den roten Faden für die folgenden Kapitel beizubehalten.
    
    Inhalt:
    ${content.substring(0, 5000)} ...
  `;

  const response = await safeGenerateContent({
    model: preferredModel,
    contents: prompt,
  }, 'gemini-3-flash-preview', openRouterKey);

  return response.text || "";
};

export const generateChapterContent = async (
  bookTitle: string,
  chapter: Chapter,
  params: BookParameters,
  allChapters: Chapter[],
  previousContext: string = ""
): Promise<string> => {
  const styleInstructions = [
    params.useExamples ? "- Verwende viele praktische Beispiele." : "",
    params.reflectionQuestions ? "- Füge am Ende Reflexionsfragen ein." : "",
    params.dialogueStyle ? "- Schreibe teilweise in Dialogform." : "",
    params.scientific ? "- Verwende einen wissenschaftlichen, präzisen Ton." : "",
    params.easyToRead ? "- Achte auf leichte Lesbarkeit und klare Sätze." : "",
    params.entertaining ? "- Gestalte den Inhalt unterhaltsam und fesselnd." : "",
    `- Zielgruppe: ${params.targetAudience}`,
    `- Erzählperspektive: ${params.narrativePerspective === 'FirstPerson' ? 'Ich-Form' : params.narrativePerspective === 'SecondPerson' ? 'Du-Form' : 'Dritte Person'}`,
    `- Sprachstil: ${params.languageStyle === 'Casual' ? 'Locker/Umgangssprachlich' : params.languageStyle === 'Academic' ? 'Akademisch/Hochgestochen' : 'Neutral'}`,
    `- Lokalisierung/Kulturkreis: ${params.localization === 'DACH' ? 'DACH-Region (Deutschland, Österreich, Schweiz)' : params.localization === 'US' ? 'USA/Amerikanisch' : 'Global/International'}`,
    `- Interaktivitäts-Grad: ${params.interactivity} von 4 (0=passiv, 4=sehr interaktiv mit direkter Leseransprache und Übungen)`,
    `- Struktur-Typ: ${params.structureType === 'ProblemSolution' ? 'Problem-Lösung-orientiert' : params.structureType === 'Modular' ? 'Modular/Nachschlagewerk' : 'Chronologisch'}`,
  ].filter(Boolean).join("\n");

  const contextPrompt = previousContext 
    ? `Bisheriger Handlungsverlauf/Zusammenfassung der vorherigen Kapitel:\n${previousContext}\n\n`
    : "";

  const prompt = `
    Schreibe das Kapitel "${chapter.title}" für das Buch "${bookTitle}".
    
    ${contextPrompt}
    
    Kontext dieses Kapitels: ${chapter.description}
    
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

  const response = await safeGenerateContent({
    model: params.preferredModel,
    contents: prompt,
  }, 'gemini-3-flash-preview', params.openRouterKey);

  return response.text || "Fehler bei der Generierung des Inhalts.";
};

export const generateWorksheets = async (book: Book): Promise<string> => {
  const prompt = `
    Erstelle interaktive Arbeitsblätter und Checklisten für das Buch "${book.title}" (Thema: ${book.topic}).
    Basierend auf den Kapiteln:
    ${book.chapters.map(c => `- ${c.title}`).join("\n")}

    Anforderungen:
    - Erstelle mindestens 3 verschiedene Arbeitsblätter oder Checklisten.
    - Jedes Blatt sollte Übungen, Ausfüllbereiche oder Kontrollpunkte enthalten.
    - Verwende ein klares Markdown-Format.
    - Sprache: Deutsch.
  `;

  const response = await safeGenerateContent({
    model: book.parameters.preferredModel,
    contents: prompt,
  }, 'gemini-3-flash-preview', book.parameters.openRouterKey);

  return response.text || "";
};

export const generateCheatSheet = async (book: Book): Promise<string> => {
  const prompt = `
    Erstelle einen Zusammenfassungs-Spickzettel (Cheat Sheet) für das Buch "${book.title}" (Thema: ${book.topic}).
    Basierend auf den Kapiteln:
    ${book.chapters.map(c => `- ${c.title}`).join("\n")}

    Anforderungen:
    - Kompakte Zusammenfassung der wichtigsten Kernbotschaften.
    - Verwende Listen, Tabellen oder kurze Absätze.
    - Fokus auf "Wissen auf einen Blick".
    - Sprache: Deutsch.
  `;

  const response = await safeGenerateContent({
    model: book.parameters.preferredModel,
    contents: prompt,
  }, 'gemini-3-flash-preview', book.parameters.openRouterKey);

  return response.text || "";
};

export const generateActionPlan = async (book: Book): Promise<string> => {
  const prompt = `
    Erstelle einen extrem detaillierten 30-Tage-Aktionsplan basierend auf dem Buch "${book.title}" (Thema: ${book.topic}).
    Basierend auf den Kapiteln:
    ${book.chapters.map(c => `- ${c.title}`).join("\n")}

    Anforderungen:
    - Unterteile den Plan in 4 Wochen.
    - Gib für JEDEN EINZELNEN TAG (Tag 1 bis Tag 30) eine ausführliche Anleitung.
    - JEDER TAG muss mindestens 2 Paragraphen Text und insgesamt mindestens 20 Sätze enthalten.
    - Beschreibe pro Tag nicht nur das "WAS" (die Aufgabe), sondern vor allem das "WIE" (konkrete Umsetzungsschritte, Methoden, Tipps).
    - Gehe tief ins Detail, damit der Leser eine exakte Schritt-für-Schritt-Anleitung hat.
    - Verwende ein klares Markdown-Format mit Überschriften für Wochen und Tage.
    - Sprache: Deutsch.
  `;

  const response = await safeGenerateContent({
    model: book.parameters.preferredModel,
    contents: prompt,
  }, 'gemini-3-flash-preview', book.parameters.openRouterKey);

  return response.text || "";
};

export const generateInspiration = async (
  category1: string, 
  category2: string, 
  wordFocus: string, 
  tone: string, 
  preferredModel: ModelType = 'gemini-3.1-pro-preview', 
  openRouterKey?: string
): Promise<string> => {
  let categoryContext = `für die Kategorie "${category1}"`;
  if (category2 && category2 !== "Keine zweite Kategorie") {
    categoryContext = `aus einer Kombination der Kategorien "${category1}" und "${category2}"`;
  }

  let focusContext = "";
  if (wordFocus.trim()) {
    focusContext = `Berücksichtige dabei unbedingt den Wortfokus: "${wordFocus}". Dieses Wort/Thema soll die Richtung der Inspiration maßgeblich beeinflussen.`;
  }

  const prompt = `
    Generiere eine inspirierende Buchidee und eine kurze Beschreibung (max. 3 Sätze) ${categoryContext}.
    Der Tonfall der Beschreibung soll "${tone}" sein.
    ${focusContext}
    
    WICHTIG FÜR DEN TITEL:
    - Der Titel soll wie ein echter Buchtitel auf dem Markt klingen (kreativ, nicht generisch).
    - Vermeide das Wort "Architekt" oder "Architektur", außer es passt fachlich exakt zum Thema.
    
    Gib nur den Text der Idee und Beschreibung zurück, ohne Einleitung oder Formatierung.
    Beispiel: "Der Code der Sterne: Eine Reise durch die Geschichte der Astronomie von den ersten Teleskopen bis zur modernen Astrophysik."
  `;

  const response = await safeGenerateContent({
    model: preferredModel,
    contents: prompt,
  }, 'gemini-3-flash-preview', openRouterKey);

  return response.text || "";
};

export const refineChapterContent = async (
  currentContent: string,
  feedback: string,
  params: BookParameters
): Promise<string> => {
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

  const response = await safeGenerateContent({
    model: params.preferredModel,
    contents: prompt,
  }, 'gemini-3-flash-preview', params.openRouterKey);

  return response.text || currentContent;
};
