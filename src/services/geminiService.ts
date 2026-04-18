import { GoogleGenAI, Type, GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { Book, BookParameters, Chapter, SubChapter, TargetAudience, NarrativePerspective, ModelType, MindMapNode } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * Extracts text from Gemini or OpenRouter response.
 */
function getText(response: any): string {
  if (!response) return "";
  let text = "";
  if (typeof response.text === 'function') text = response.text();
  else if (typeof response.text === 'string') text = response.text;
  
  if (text) {
    // Attempt to extract JSON (array or object) if it's wrapped in markdown or has leading/trailing text
    const jsonMatch = text.match(/(\[\s*\{[\s\S]*\}\s*\]|\{\s*"[\s\S]*\}\s*)/);
    if (jsonMatch) return jsonMatch[0].trim();
    
    // Fallback: standard cleanup
    return text.replace(/```json\n?|```\n?/g, '').trim();
  }
  return "";
}

/**
 * Helper to handle quota errors and fallback to a different model.
 */
async function safeGenerateContent(
  params: any,
  fallbackModel: ModelType = 'gemini-flash-latest',
  openRouterKey?: string
): Promise<GenerateContentResponse> {
  const isOpenRouter = params.model && params.model.startsWith('openrouter/');
  
  if (isOpenRouter) {
    if (!openRouterKey) {
      throw new Error("OpenRouter API Key ist erforderlich für dieses Modell.");
    }
    
    const modelId = params.model.replace('openrouter/', '');
    const promptText = typeof params.contents === 'string' 
      ? params.contents 
      : Array.isArray(params.contents) 
        ? params.contents[0].parts[0].text 
        : JSON.stringify(params.contents);

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
          { role: "user", content: promptText }
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
    
    return {
      text,
      candidates: [{ content: { parts: [{ text }] } }]
    } as any;
  }

  // Standard Gemini Call
  let contents: any[] = [];
  if (typeof params.contents === 'string') {
    contents = [{ role: 'user', parts: [{ text: params.contents }] }];
  } else if (Array.isArray(params.contents)) {
    contents = params.contents;
  } else if (params.contents && params.contents.parts) {
    contents = [params.contents];
  } else {
    contents = params.contents ? [params.contents] : [];
  }

  try {
    const result = await (ai as any).models.generateContent({ 
      model: params.model,
      contents,
      generationConfig: params.config
    });
    return (result.response || result) as GenerateContentResponse;
  } catch (error: any) {
    console.error(`AI Generation error for model ${params.model}:`, error);
    if (error?.message?.includes('exhausted') || error?.message?.includes('429')) {
      console.warn(`Quota exceeded for ${params.model}. Falling back to ${fallbackModel}.`);
      const result = await (ai as any).models.generateContent({ 
        model: fallbackModel,
        contents,
        generationConfig: params.config
      });
      return (result.response || result) as GenerateContentResponse;
    }
    throw error;
  }
}

export const suggestParameters = async (topic: string, openRouterKey?: string): Promise<Partial<BookParameters>> => {
  const model = "gemini-3-flash-preview";
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
  }, 'gemini-flash-latest', openRouterKey);
  try {
    const text = getText(response);
    return JSON.parse(text || "{}");
  } catch (e) {
    const text = getText(response);
    throw new Error(`Fehler beim Verarbeiten der KI-Antwort (JSON): ${text?.substring(0, 200)}...`);
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

export const generateChapterImage = async (
  bookTitle: string,
  chapterTitle: string,
  chapterDescription: string,
  model: string = "gemini-2.5-flash-image"
): Promise<string> => {
  const response = await safeGenerateContent({
    model,
    contents: {
      parts: [
        { text: `Erstelle eine atmosphärische Illustration für das Kapitel "${chapterTitle}" aus dem Buch "${bookTitle}".
        Kapitelbeschreibung: ${chapterDescription}
        
        Der Stil sollte künstlerisch, hochwertig und passend zum Thema sein. 
        WICHTIG: Kein Text im Bild.` }
      ]
    },
    config: {
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Kein Kapitelbild generiert");
};

export const safeGenerateChapterImageWithRetry = async (
  bookTitle: string,
  chapterTitle: string,
  chapterDescription: string,
  primaryModel: string,
  backupModel: string = "gemini-3-pro-image-preview"
): Promise<string> => {
  // Attempt 1: Primary Model
  try {
    return await generateChapterImage(bookTitle, chapterTitle, chapterDescription, primaryModel);
  } catch (err) {
    console.warn(`Attempt 1 failed with ${primaryModel}. Retrying same model...`, err);
  }

  // Attempt 2: Primary Model again
  try {
    return await generateChapterImage(bookTitle, chapterTitle, chapterDescription, primaryModel);
  } catch (err) {
    console.warn(`Attempt 2 failed with ${primaryModel}. Switching to backup ${backupModel}...`, err);
  }

  // Attempt 3: Backup Model
  try {
    return await generateChapterImage(bookTitle, chapterTitle, chapterDescription, backupModel);
  } catch (err) {
    console.warn(`Attempt 3 failed with ${backupModel}. Final attempt...`, err);
  }

  // Attempt 4: Backup Model again
  try {
    return await generateChapterImage(bookTitle, chapterTitle, chapterDescription, backupModel);
  } catch (err) {
    console.error("All image generation attempts failed.", err);
    throw err;
  }
};

export const generateToC = async (
  topic: string, 
  preferredModel: ModelType = 'gemini-3-flash-preview', 
  openRouterKey?: string, 
  language: string = 'German',
  chapterRange: string = '8-10',
  bookType: 'NonFiction' | 'Fiction' = 'NonFiction'
): Promise<{ title: string; chapters: Chapter[] }> => {
  const typeContext = bookType === 'Fiction' 
    ? "Dieses Buch ist ein ROMAN (Belletristik). Das Inhaltsverzeichnis sollte eine spannende, dramaturgische Struktur haben (z.B. Prolog, verschiedene Akte/Kapitel mit fesselnden Titeln, Epilog)."
    : "Dieses Buch ist ein SACHBUCH. Das Inhaltsverzeichnis sollte logisch strukturiert, informativ und fachlich fundiert sein.";

  const response = await safeGenerateContent({
    model: preferredModel,
    contents: `Erstelle ein strukturiertes Inhaltsverzeichnis für ein Buch zum Thema: "${topic}". 
    ${typeContext}
    WICHTIG: Antworte in der Sprache: ${language}.
    WICHTIG: Das Buch MUSS zwischen ${chapterRange.split('-')[0]} und ${chapterRange.split('-')[1]} Kapitel haben.
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
  }, 'gemini-flash-latest', openRouterKey);

  try {
    const text = getText(response);
    const data = JSON.parse(text || "{}");
    
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
    throw new Error(`${errorMsg} | Roh-Antwort der KI: ${getText(response)?.substring(0, 500)}...`);
  }
};

export const regenerateChapterInToC = async (
  bookTitle: string,
  topic: string,
  currentChapter: Chapter,
  allChapters: Chapter[],
  preferredModel: ModelType = 'gemini-3.1-pro-preview',
  openRouterKey?: string,
  language: string = 'German'
): Promise<Chapter> => {
  const response = await safeGenerateContent({
    model: preferredModel,
    contents: `Überarbeite das Kapitel "${currentChapter.title}" für das Buch "${bookTitle}" zum Thema "${topic}".
    WICHTIG: Antworte in der Sprache: ${language}.
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
    const text = getText(response);
    const data = JSON.parse(text || "{}");
    return {
      ...currentChapter,
      title: data.title || currentChapter.title,
      description: data.description || currentChapter.description
    };
  } catch (e) {
    const text = getText(response);
    throw new Error(`Fehler beim Verarbeiten der Kapitel-Regenerierung (JSON): ${text?.substring(0, 200)}...`);
  }
};

export const summarizeChapter = async (
  title: string,
  content: string,
  preferredModel: ModelType = 'gemini-3-flash-preview',
  openRouterKey?: string,
  language: string = 'German'
): Promise<string> => {
  const prompt = `
    Fasse den Inhalt des folgenden Kapitels "${title}" kurz zusammen (max. 3-5 Sätze). 
    WICHTIG: Antworte in der Sprache: ${language}.
    Ziel ist es, den roten Faden für die folgenden Kapitel beizubehalten.
    
    Inhalt:
    ${content.substring(0, 5000)} ...
  `;

  const response = await safeGenerateContent({
    model: preferredModel,
    contents: prompt,
  }, 'gemini-flash-latest', openRouterKey);

  const text = getText(response);
  return text || "";
};

export const generateSubChapters = async (
  bookTitle: string,
  chapter: Chapter,
  params: BookParameters
): Promise<SubChapter[]> => {
  const prompt = `
    Unterteile das Kapitel "${chapter.title}" für das Buch "${bookTitle}" in logische Unterkapitel.
    WICHTIG: Antworte in der Sprache: ${params.outputLanguage}.
    
    Kontext des Kapitels: ${chapter.description}
    Ziel-Wortzahl für dieses GESAMTE Kapitel: ${params.wordsPerChapter} Wörter.
    
    Basierend auf dieser Wortzahl, erstelle zw. 3 und 6 Unterkapitel, die zusammen das Thema umfassend behandeln.
    Jedes Unterkapitel sollte einen klaren Fokus haben, damit wir für jedes Unterkapitel separat viel Text generieren können.
    
    WICHTIG: Antworte AUSSCHLIESSLICH mit einer JSON-Liste, keine Markierungen wie \`\`\`json.
    Struktur:
    [
      { "title": "Unterkapitel Titel", "description": "Was genau hier detailliert beschrieben werden soll" },
      ...
    ]
  `;

  const response = await safeGenerateContent({
    model: 'gemini-3-flash-preview', 
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
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
    }
  }, 'gemini-flash-latest', params.openRouterKey);

  try {
    const text = getText(response);
    if (!text) throw new Error("Keine Antwort von der KI erhalten");
    return JSON.parse(text);
  } catch (e) {
    console.error("Fehler beim Parsen der Unterkapitel", e);
    // Attempt extra cleaning if needed
    const text = getText(response);
    try {
      if (text) {
        const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
        return JSON.parse(cleaned);
      }
    } catch (innerE) {
      console.error("Final parse attempt failed", innerE);
    }
    return [];
  }
};

export const generateSubChapterContent = async (
  bookTitle: string,
  chapterTitle: string,
  subChapter: { title: string; description: string },
  params: BookParameters,
  targetWords: number,
  allChapters: Chapter[],
  previousContext: string = ""
): Promise<string> => {
  const styleInstructions = params.bookType === 'NonFiction' ? [
    params.useExamples ? "- Verwende viele praktische Beispiele." : "",
    params.reflectionQuestions ? "- Füge Reflexionsfragen am Ende ein." : "",
    params.dialogueStyle ? "- Schreibe teilweise in Dialogform." : "",
    params.scientific ? "- Verwende einen wissenschaftlichen, präzisen Tonfall." : "",
    params.easyToRead ? "- Achte auf hohe Lesbarkeit und klare Sätze." : "",
    params.entertaining ? "- Gestalte den Inhalt unterhaltsam und fesselnd." : "",
  ].filter(Boolean).join("\n") : [
    params.atmosphericDescriptions ? "- Lege großen Wert auf atmosphärische und detaillierte Beschreibungen von Orten und Stimmungen." : "",
    params.deepCharacterDevelopment ? "- Zeige die inneren Konflikte und die emotionale Entwicklung der Charaktere." : "",
    params.suspensefulPlot ? "- Erzeuge Spannung durch geschicktes Pacing und Cliffhanger." : "",
    params.emotionalPoetic ? "- Nutze eine emotionale, teils bildhafte und poetische Sprache." : "",
    params.directDialogue ? "- Integriere lebendige, charaktertypische direkte Rede." : "",
    params.multiplePerspectives ? "- Beleuchte die Handlung aus verschiedenen Blickwinkeln." : "",
  ].filter(Boolean).join("\n");

  const metaInstructions = [
    `- Target audience: ${params.targetAudience}`,
    `- Narrative perspective: ${params.narrativePerspective === 'FirstPerson' ? 'I-form' : params.narrativePerspective === 'SecondPerson' ? 'You-form' : 'Third person'}`,
    `- Language style: ${params.languageStyle === 'Casual' ? 'Casual/Colloquial' : params.languageStyle === 'Academic' ? 'Academic/Formal' : 'Neutral'}`,
    `- Localization/Culture: ${params.localization === 'DACH' ? 'DACH region (Germany, Austria, Switzerland)' : params.localization === 'US' ? 'USA/American' : 'Global/International'}`,
    `- Interactivity level: ${params.interactivity} out of 4 (0=passive, 4=very interactive with direct reader address and exercises)`,
    `- Structure type: ${params.structureType === 'ProblemSolution' ? 'Problem-solution oriented' : params.structureType === 'Modular' ? 'Modular/Reference' : 'Chronological'}`,
    `- Book type: ${params.bookType === 'Fiction' ? 'Novel / Fiction' : 'Non-fiction / Text book'}`,
    params.bookType === 'Fiction' 
      ? "- Fokus auf: Narrativ, Charakterentwicklung, Weltenbau, Dialoge und Atmosphäre (Show, don't tell)."
      : "- Fokus auf: Wissensvermittlung, Struktur, Klarheit und praktische Relevanz.",
    params.bookType === 'Fiction' ? [
      `- Dramaturgisches Modell: ${params.dramaticModel === 'HerosJourney' ? 'Heldenreise' : params.dramaticModel === 'ThreeAct' ? '3-Akt-Struktur' : 'In Medias Res'}`,
      `- Spannungs-Level: ${params.tensionLevel}/4`,
      `- Fokus: ${params.characterFocus === 'PlotDriven' ? 'Handlungsgetrieben (Plot-driven)' : 'Charaktergetrieben (Character-driven)'}`,
      `- Erzählzeit: ${params.narrativeTense === 'Past' ? 'Vergangenheit (Präteritum)' : 'Gegenwart (Präsens)'}`,
      `- Weltenbau-Detailtiefe: ${params.worldbuildingIntensity}/4`
    ].join("\n") : "",
    `- Author persona: ${
      params.persona === 'Philosopher' ? 'A profound, stoic philosopher' :
      params.persona === 'TechBlogger' ? 'A motivating, modern tech blogger' :
      params.persona === 'Journalist' ? 'A factual, investigative journalist' :
      params.persona === 'Storyteller' ? 'A captivating storyteller' :
      params.persona === 'Professor' ? 'An explaining, academic professor' :
      'Standard (Neutral)'
    }`,
    `- Output language: ${params.outputLanguage}`,
  ].filter(Boolean).join("\n");

  const prompt = `
    Schreibe den Abschnitt "${subChapter.title}" für das Kapitel "${chapterTitle}" des Buches "${bookTitle}".
    WICHTIG: Schreibe in der Sprache: ${params.outputLanguage}.
    
    Kontext dieses Abschnitts: ${subChapter.description}
    ZIEL-WORTZAHL für diesen Abschnitt: ca. ${targetWords} Wörter.
    
    Anforderungen:
    - GEHE EXTREM INS DETAIL.
    - Nutze Beispiele, Analogien und tiefgehende Erklärungen.
    - Schreibe in flüssigem Markdown-Format.
    - Verwende Überschriften (###), falls sinnvoll für die Struktur innerhalb des Abschnitts.
    
    Stil-Vorgaben:
    ${styleInstructions}
    
    Vorheriger Kontext/Zusammenfassung:
    ${previousContext}
  `;

  const response = await safeGenerateContent({
    model: params.preferredModel,
    contents: prompt,
  }, 'gemini-flash-latest', params.openRouterKey);

  return getText(response) || "";
};

export const generateChapterContent = async (
  bookTitle: string,
  chapter: Chapter,
  params: BookParameters,
  allChapters: Chapter[],
  previousContext: string = ""
): Promise<string> => {
  const styleInstructions = [
    params.useExamples ? "- Use many practical examples." : "",
    params.reflectionQuestions ? "- Add reflection questions at the end." : "",
    params.dialogueStyle ? "- Write partially in dialogue form." : "",
    params.scientific ? "- Use a scientific, precise tone." : "",
    params.easyToRead ? "- Ensure easy readability and clear sentences." : "",
    params.entertaining ? "- Make the content entertaining and engaging." : "",
    `- Target audience: ${params.targetAudience}`,
    `- Narrative perspective: ${params.narrativePerspective === 'FirstPerson' ? 'I-form' : params.narrativePerspective === 'SecondPerson' ? 'You-form' : 'Third person'}`,
    `- Language style: ${params.languageStyle === 'Casual' ? 'Casual/Colloquial' : params.languageStyle === 'Academic' ? 'Academic/Formal' : 'Neutral'}`,
    `- Localization/Culture: ${params.localization === 'DACH' ? 'DACH region (Germany, Austria, Switzerland)' : params.localization === 'US' ? 'USA/American' : 'Global/International'}`,
    `- Interactivity level: ${params.interactivity} out of 4 (0=passive, 4=very interactive with direct reader address and exercises)`,
    `- Structure type: ${params.structureType === 'ProblemSolution' ? 'Problem-solution oriented' : params.structureType === 'Modular' ? 'Modular/Reference' : 'Chronological'}`,
    `- Book type: ${params.bookType === 'Fiction' ? 'Novel / Fiction' : 'Non-fiction / Text book'}`,
    params.bookType === 'Fiction' 
      ? "- Fokus auf: Dramaturgie, Emotionen, lebendige Beschreibungen und fesselndes Storytelling."
      : "- Fokus auf: Fachliche Tiefe, logischer Aufbau und klare Erklärungen.",
    params.bookType === 'Fiction' ? [
      `- Dramaturgisches Modell: ${params.dramaticModel === 'HerosJourney' ? 'Heldenreise' : params.dramaticModel === 'ThreeAct' ? '3-Akt-Struktur' : 'In Medias Res'}`,
      `- Spannungs-Level: ${params.tensionLevel}/4`,
      `- Fokus: ${params.characterFocus === 'PlotDriven' ? 'Handlungsgetrieben (Plot-driven)' : 'Charaktergetrieben (Character-driven)'}`,
      `- Erzählzeit: ${params.narrativeTense === 'Past' ? 'Vergangenheit (Präteritum)' : 'Gegenwart (Präsens)'}`,
      `- Weltenbau-Detailtiefe: ${params.worldbuildingIntensity}/4`
    ].join("\n") : "",
    `- Author persona: ${
      params.persona === 'Philosopher' ? 'A profound, stoic philosopher' :
      params.persona === 'TechBlogger' ? 'A motivating, modern tech blogger' :
      params.persona === 'Journalist' ? 'A factual, investigative journalist' :
      params.persona === 'Storyteller' ? 'A captivating storyteller' :
      params.persona === 'Professor' ? 'An explaining, academic professor' :
      'Standard (Neutral)'
    }`,
    `- Output language: ${params.outputLanguage}`,
  ].filter(Boolean).join("\n");

  const contextPrompt = previousContext 
    ? `Bisheriger Handlungsverlauf/Zusammenfassung der vorherigen Kapitel:\n${previousContext}\n\n`
    : "";

  const prompt = `
    Schreibe das Kapitel "${chapter.title}" für das Buch "${bookTitle}".
    WICHTIG: Schreibe das gesamte Kapitel in der Sprache: ${params.outputLanguage}.
    
    ${contextPrompt}
    
    Kontext dieses Kapitels: ${chapter.description}
    
    Gesamtstruktur des Buches:
    ${allChapters.map(c => `- ${c.title}`).join("\n")}
    
    Anforderungen an den Stil:
    ${styleInstructions}
    
    ZIEL-WORTZAHL: ca. ${params.wordsPerChapter} Wörter.
    WICHTIG FÜR DIE LÄNGE: 
    - GEHE EXTREM INS DETAIL. 
    - Jedes Unterthema muss ausführlich erläutert werden. 
    - Nutze viele Fallbeispiele, Analogien, Experten-Tipps und tiefgehende Erklärungen, um die angestrebte Wortzahl von ${params.wordsPerChapter} zu erreichen.
    - Wenn nötig, erweitere das Kapitel um zusätzliche relevante Aspekte, die zur Kapitelbeschreibung passen.
    - Schreibe einen langen, flüssigen Text mit vielen Details.
    
    Schreibe den Inhalt in Markdown-Format. 
    WICHTIG: Verwende immer doppelte Zeilenumbrüche zwischen Absätzen für eine klare Struktur.
    Verwende Überschriften (## für Kapitelabschnitte), Listen und Fettdruck (**Text**), wo es sinnvoll ist.
    Vermeide es, das Wort "Kapitel" oder die Kapitelnummer in den Text selbst zu schreiben, da dies vom System hinzugefügt wird.
  `;

  const response = await safeGenerateContent({
    model: params.preferredModel,
    contents: prompt,
  }, 'gemini-flash-latest', params.openRouterKey);

  return getText(response) || "Fehler bei der Generierung des Inhalts.";
};

export const generateMindMap = async (
  topic: string,
  category1: string,
  category2: string,
  preferredModel: ModelType = 'gemini-3.1-pro-preview',
  openRouterKey?: string,
  language: string = 'German',
  bookType: 'NonFiction' | 'Fiction' = 'NonFiction'
): Promise<MindMapNode[]> => {
  const categories = category2 && category2 !== "Keine zweite Kategorie" ? `${category1} und ${category2}` : category1;
  const typeContext = bookType === 'Fiction'
    ? `Es handelt sich um einen ROMAN. Erstelle Mind-Map-Zweige, die spannende Handlungsideen, Plot-Twists, Charakter-Beziehungen oder atmosphärische Schauplätze darstellen.`
    : `Es handelt sich um ein SACHBUCH. Erstelle Mind-Map-Zweige, die spezifische Wissensbereiche, Anwendungsbeispiele oder vertiefende Fachthemen darstellen.`;

  const prompt = `
    Erstelle 6 kreative Themen-Vorschläge (als JSON-Liste) basierend auf dem Fokus "${topic}" und den Kategorien "${categories}".
    ${typeContext}
    WICHTIG: Antworte in der Sprache: ${language}.
    
    Jedes Unterthema soll einen spannenden Blickwinkel darstellen, der über das Offensichtliche hinausgeht.
    
    WICHTIG FÜR DIE BESCHREIBUNG:
    - Jede Beschreibung MUSS ausführlich sein (ca. 2 bis 3 Sätze).
    - Gehe auf spezifische Details und spannende Facetten ein.
    - Die Beschreibungen sollen informativ sein und dem Nutzer Lust auf das Thema machen.
    
    ANTWORTE AUSSCHLIESSLICH IM JSON-FORMAT.
    Struktur:
    [
      { "id": "1", "label": "Kreativer Buchtitel", "description": "Detaillierte Beschreibung der Buchidee (2-3 Sätze)", "color": "hex-color (hell/pastell)" },
      ...
    ]
    
    WICHTIG: Die Titel sollen wie echte Buchtitel klingen (kreativ, nicht generisch).
  `;

  const response = await safeGenerateContent({
    model: preferredModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            description: { type: Type.STRING },
            color: { type: Type.STRING }
          },
          required: ["id", "label", "description"]
        }
      }
    }
  }, 'gemini-flash-latest', openRouterKey);

  try {
    const text = getText(response);
    return JSON.parse(text || "[]");
  } catch (e) {
    console.error("MindMap Parsing Error", e);
    return [];
  }
};

export interface TopicRefinement {
  id: string;
  label: string;
  description: string;
}

export const refineTopicSuggestions = async (
  topic: string,
  preferredModel: ModelType = 'gemini-3.1-pro-preview',
  openRouterKey?: string,
  language: string = 'German',
  bookType: 'NonFiction' | 'Fiction' = 'NonFiction'
): Promise<TopicRefinement[]> => {
  const typeContext = bookType === 'Fiction'
    ? `Es handelt sich um einen ROMAN. Schlage Wege vor, um die Handlung, das Setting oder den thematischen Kern des Romans interessanter zu gestalten.`
    : `Es handelt sich um ein SACHBUCH. Schlage Wege vor, um den fachlichen Fokus, die Zielgruppe oder den praktischen Nutzen zu präzisieren.`;

  const prompt = `
    Analysiere das folgende Buchthema und schlage 3 verschiedene Wege vor, um es zu präzisieren oder in eine spannende Richtung zu lenken.
    Thema: "${topic}"
    ${typeContext}
    WICHTIG: Antworte in der Sprache: ${language}.
    
    Jeder Vorschlag sollte eine eigene "Nische" oder einen Fokus darstellen.
    
    ANTWORTE AUSSCHLIESSLICH IM JSON-FORMAT.
    Struktur:
    [
      { "id": "1", "label": "Präziser Titel", "description": "Kurze Erklärung, warum dieser Fokus wertvoll ist" },
      ...
    ]
  `;

  const response = await safeGenerateContent({
    model: preferredModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            label: { type: Type.STRING },
            description: { type: Type.STRING }
          },
          required: ["id", "label", "description"]
        }
      }
    }
  }, 'gemini-flash-latest', openRouterKey);

  try {
    const text = getText(response);
    return JSON.parse(text || "[]");
  } catch (e) {
    console.error("Refine Parsing Error", e);
    throw new Error("Fehler beim Verarbeiten der Präzisierung: Ungültiges Datenformat.");
  }
};

export const generateWorksheets = async (book: Book): Promise<string> => {
  const isFiction = book.parameters.bookType === 'Fiction';
  const prompt = isFiction ? `
    Erstelle detaillierte Charakter-Dossiers für das Buch "${book.title}".
    Beschreibe die Hauptfiguren, ihre Motivationen, Hintergründe und Beziehungen zueinander basierend auf:
    ${book.chapters.map(c => `- ${c.title}: ${c.description}`).join("\n")}
    Sprache: Deutsch.
  ` : `
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
  }, 'gemini-flash-latest', book.parameters.openRouterKey);

  const text = getText(response);
  return text || "";
};

export const generateCheatSheet = async (book: Book): Promise<string> => {
  const isFiction = book.parameters.bookType === 'Fiction';
  const prompt = isFiction ? `
    Erstelle "World-Building Notes" für das Buch "${book.title}".
    Fasse die Welt, das Setting, die Regeln dieser Welt und wichtige atmosphärische Details zusammen.
    Sprache: Deutsch.
  ` : `
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
  }, 'gemini-flash-latest', book.parameters.openRouterKey);

  const text = getText(response);
  return text || "";
};

export const generateActionPlan = async (book: Book): Promise<string> => {
  const isFiction = book.parameters.bookType === 'Fiction';
  const prompt = isFiction ? `
    Erstelle eine Plot-Timeline für das Buch "${book.title}".
    Stelle die wichtigsten Ereignisse, Wendepunkte und Entwicklungen der Handlung chronologisch dar.
    Sprache: Deutsch.
  ` : `
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
  }, 'gemini-flash-latest', book.parameters.openRouterKey);

  const text = getText(response);
  return text || "";
};

export const generateInspiration = async (
  category1: string, 
  category2: string, 
  wordFocus: string, 
  tone: string, 
  preferredModel: ModelType = 'gemini-3.1-pro-preview', 
  openRouterKey?: string,
  language: string = 'German',
  bookType: 'NonFiction' | 'Fiction' = 'NonFiction'
): Promise<string> => {
  let categoryContext = `für die Kategorie "${category1}"`;
  if (category2 && category2 !== "Keine zweite Kategorie") {
    categoryContext = `aus einer Kombination der Kategorien "${category1}" und "${category2}"`;
  }

  let focusContext = "";
  if (wordFocus.trim()) {
    focusContext = `Berücksichtige dabei unbedingt den Wortfokus: "${wordFocus}". Dieses Wort/Thema soll die Richtung der Inspiration maßgeblich beeinflussen.`;
  }

  const typeSpecificPrompt = bookType === 'Fiction'
    ? `Erstelle eine fesselnde Plot-Idee für einen ROMAN (grobe Storyline oder Ausgangspunkt der Handlung).`
    : `Erstelle eine informative Buchidee für ein SACHBUCH (Fokus auf Wissensvermittlung oder Problemlösung).`;

  const prompt = `
    ${typeSpecificPrompt}
    Generiere eine inspirierende Buchidee und eine kurze Beschreibung (max. 3 Sätze) ${categoryContext}.
    WICHTIG: Antworte in der Sprache: ${language}.
    Der Tonfall der Beschreibung soll "${tone}" sein.
    ${focusContext}
    
    WICHTIG FÜR DEN TITEL:
    - Der Titel soll wie ein echter Buchtitel auf dem Markt klingen (kreativ, nicht generisch).
    - Vermeide das Wort "Architekt" oder "Architektur", außer es passt fachlich exakt zum Thema.
    
    Gib nur den Text der Idee und Beschreibung zurück, ohne Einleitung oder Formatierung.
    Beispiel für Roman: "Echo der Stille: In einer Welt ohne Klänge entdeckt ein Mädchen eine uralte Melodie, die das Schicksal der Menschheit verändern könnte."
    Beispiel für Sachbuch: "Deep Work: Über die Geheimnisse der Konzentration in einer Welt der permanenten Ablenkung."
  `;

  const response = await safeGenerateContent({
    model: preferredModel,
    contents: prompt,
  }, 'gemini-flash-latest', openRouterKey);

  const text = getText(response);
  return text || "";
};

export const refineChapterContent = async (
  currentContent: string,
  feedback: string,
  params: BookParameters
): Promise<string> => {
  const prompt = `
    Überarbeite den folgenden Kapitelinhalt basierend auf dem Feedback des Nutzers.
    WICHTIG: Antworte in der Sprache: ${params.outputLanguage}.
    
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
  }, 'gemini-flash-latest', params.openRouterKey);

  return getText(response) || currentContent;
};
