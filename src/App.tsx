import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  BookOpen, 
  Settings, 
  FileText, 
  Download, 
  ChevronRight, 
  ChevronLeft, 
  Loader2, 
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Plus,
  Type as TypeIcon,
  Layers,
  Sparkles,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Key,
  Upload,
  Image as ImageIcon,
  Users,
  Zap,
  Heart,
  Globe
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Book, Chapter, BookParameters, DEFAULT_PARAMETERS, ModelType, MindMapNode } from "./types";
import { generateToC, generateChapterContent, generateSubChapters, generateSubChapterContent, suggestParameters, generateCoverImage, generateChapterImage, safeGenerateChapterImageWithRetry, refineChapterContent, generateInspiration, regenerateChapterInToC, generateWorksheets, generateCheatSheet, generateActionPlan, summarizeChapter, generateMindMap, refineTopicSuggestions, type TopicRefinement } from "./services/geminiService";
import { exportToMarkdown, exportToPDF, exportToEPUB, exportToCAsMarkdown } from "./services/exportService";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NON_FICTION_CATEGORIES = [
  "Eigenes Thema",
  "AI & Technologie",
  "Business & Finanzen",
  "Persönlichkeitsentwicklung",
  "Psychologie & Mental Health",
  "Wissenschaft & Geschichte",
  "Philosophie & Religion",
  "Gesundheit & Fitness",
  "Kochen & Backen",
  "Reisen & Abenteuer",
  "Garten & Natur",
  "Nachhaltigkeit & Klima",
  "Astronomie & Weltraum",
  "Biografien",
  "Minimalismus & Lifestyle"
];

const FICTION_CATEGORIES = [
  "Eigenes Thema",
  "Drama",
  "Krimi & Thriller",
  "Fantasy & Science Fiction",
  "Romantik & Liebesroman",
  "Historischer Roman",
  "Horror & Mystery",
  "Abenteuer & Action",
  "Kinderbücher",
  "Mythologie & Sagen",
  "True Crime & Forensik",
  "Filme und Serien"
];

const NON_FICTION_TONES = [
  "Lustig & Amüsant",
  "Locker & Unterhaltsam",
  "Neutral & Informativ",
  "Sachlich & Professionell",
  "Wissenschaftlich & Ernsthaft"
];

const FICTION_TONES = [
  "Humorvoll & Leicht",
  "Spannend & Düster",
  "Atmosphärisch & Emotional",
  "Dramatisch & Tiefgründig",
  "Episch & Detailreich"
];


export default function App() {
  const [step, setStep] = useState<"type" | "topic" | "toc" | "parameters" | "preview" | "generating" | "finished">("type");
  const [bookType, setBookType] = useState<'NonFiction' | 'Fiction'>('NonFiction');
  const [topic, setTopic] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(NON_FICTION_CATEGORIES[0]);
  const [selectedCategory2, setSelectedCategory2] = useState("Keine zweite Kategorie");
  const [wordFocus, setWordFocus] = useState("");
  const [toneValue, setToneValue] = useState(2); // Default: Neutral & Informativ
  const [chapterCountRange, setChapterCountRange] = useState(DEFAULT_PARAMETERS.chapterCountRange);
  const [preferredModel, setPreferredModel] = useState(DEFAULT_PARAMETERS.preferredModel);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailedError, setDetailedError] = useState<string | null>(null);
  const [mindMapNodes, setMindMapNodes] = useState<MindMapNode[]>([]);
  const [isMindMapLoading, setIsMindMapLoading] = useState(false);
  const [topicRefinements, setTopicRefinements] = useState<TopicRefinement[]>([]);
  const [isRefiningTopic, setIsRefiningTopic] = useState(false);

  const currentTones = bookType === 'Fiction' ? FICTION_TONES : NON_FICTION_TONES;

  const handleError = (msg: string, err: any) => {
    setError(msg);
    const detail = err instanceof Error ? err.message : JSON.stringify(err, null, 2);
    setDetailedError(detail);
    console.error(msg, err);
  };

  const handleGenerateMindMap = async () => {
    if (!wordFocus.trim() && selectedCategory === 'Eigenes Thema') return;
    setIsMindMapLoading(true);
    setError(null);
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout: Die Mind-Map-Erstellung dauert zu lange. Das Modell braucht eventuell mehr Zeit für die detaillierten Beschreibungen.")), 50000)
      );

      const nodes = await Promise.race([
        generateMindMap(
          wordFocus || selectedCategory,
          selectedCategory,
          selectedCategory2,
          preferredModel,
          openRouterKey,
          'German',
          bookType
        ),
        timeoutPromise
      ]);
      setMindMapNodes(nodes);
    } catch (err: any) {
      handleError("Fehler beim Generieren der Mind-Map.", err);
    } finally {
      setIsMindMapLoading(false);
    }
  };

  const handleRefineTopicSuggestions = async () => {
    if (!topic.trim()) return;
    setIsRefiningTopic(true);
    setError(null);
    try {
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Timeout: Die Themen-Präzisierung dauert zu lange.")), 40000)
      );

      const refinements = await Promise.race([
        refineTopicSuggestions(topic, preferredModel, openRouterKey, 'German', bookType),
        timeoutPromise
      ]);
      
      if (refinements && refinements.length > 0) {
        setTopicRefinements(refinements);
      } else {
        throw new Error("Keine Vorschläge erhalten.");
      }
    } catch (err: any) {
      handleError("Fehler beim Generieren der Themen-Vorschläge.", err);
    } finally {
      setIsRefiningTopic(false);
    }
  };

  // Initial ToC Generation & Parameter Suggestion
  const handleStartToC = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [tocResult, suggestedParams] = await Promise.all([
        generateToC(topic, preferredModel, openRouterKey, 'German', chapterCountRange, bookType),
        suggestParameters(topic, openRouterKey)
      ]);
      
      setBook({
        topic,
        title: tocResult.title,
        chapters: tocResult.chapters,
        parameters: { ...DEFAULT_PARAMETERS, ...suggestedParams, preferredModel, openRouterKey, chapterCountRange, bookType }
      });
      setStep("toc");
    } catch (err) {
      handleError("Fehler beim Erstellen des Inhaltsverzeichnisses. Bitte versuche es erneut.", err);
    } finally {
      setLoading(false);
    }
  };

  // Cover Generation
  const handleGenerateCover = async () => {
    if (!book) return;
    setLoading(true);
    try {
      const url = await generateCoverImage(book.title, book.topic, book.parameters.imageModel);
      setBook({ ...book, coverImageUrl: url });
    } catch (err) {
      handleError("Fehler bei der Cover-Generierung.", err);
    } finally {
      setLoading(false);
    }
  };

  // Cover Update
  const handleUploadCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !book) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setBook({ ...book, coverImageUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  // ToC Export/Import
  const handleExportToC = () => {
    if (!book) return;
    exportToCAsMarkdown(book.title, book.chapters);
  };

  const handleImportToC = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      // Simple MD Parser for ToC
      // Expects: # Title\n\n## Kapitel X: Title\nDescription
      const lines = content.split("\n");
      let title = "Importiertes Buch";
      const chapters: Chapter[] = [];
      let currentChapter: Partial<Chapter> | null = null;

      lines.forEach(line => {
        if (line.startsWith("# Inhaltsverzeichnis: ")) {
          title = line.replace("# Inhaltsverzeichnis: ", "").trim();
        } else if (line.startsWith("## Kapitel ")) {
          if (currentChapter && currentChapter.title) {
            chapters.push(currentChapter as Chapter);
          }
          const chapterTitle = line.split(": ").slice(1).join(": ").trim();
          currentChapter = {
            id: `chapter-${chapters.length}`,
            title: chapterTitle,
            description: ""
          };
        } else if (currentChapter && line.trim() && !line.startsWith("#")) {
          currentChapter.description = (currentChapter.description || "") + line.trim() + " ";
        }
      });

      if (currentChapter && currentChapter.title) {
        chapters.push(currentChapter as Chapter);
      }

      if (chapters.length > 0) {
        setBook({
          topic: title,
          title: title,
          chapters: chapters,
          parameters: DEFAULT_PARAMETERS
        });
        setStep("toc");
      } else {
        handleError("Ungültiges Format. Das Inhaltsverzeichnis konnte nicht importiert werden.", new Error("Keine Kapitel gefunden"));
      }
    };
    reader.readAsText(file);
  };

  // Parameter Update
  const updateParams = (newParams: Partial<BookParameters>) => {
    if (!book) return;
    const updatedBook = {
      ...book,
      parameters: { ...book.parameters, ...newParams }
    };
    setBook(updatedBook);
    if (newParams.preferredModel) setPreferredModel(newParams.preferredModel);
    if (newParams.openRouterKey !== undefined) setOpenRouterKey(newParams.openRouterKey);
  };

  // Regenerate ToC
  const handleRegenerateToC = async () => {
    if (!book) return;
    setLoading(true);
    setError(null);
    try {
      const tocResult = await generateToC(book.topic, preferredModel, openRouterKey, book.parameters.outputLanguage, book.parameters.chapterCountRange);
      setBook({
        ...book,
        title: tocResult.title,
        chapters: tocResult.chapters
      });
    } catch (err) {
      handleError("Fehler beim Regenerieren des Inhaltsverzeichnisses.", err);
    } finally {
      setLoading(false);
    }
  };

  // Regenerate Single Chapter in ToC
  const handleRegenerateChapter = async (chapterId: string) => {
    if (!book) return;
    const chapterIndex = book.chapters.findIndex(c => c.id === chapterId);
    if (chapterIndex === -1) return;

    setLoading(true);
    setError(null);
    try {
      const newChapter = await regenerateChapterInToC(
        book.title,
        book.topic,
        book.chapters[chapterIndex],
        book.chapters,
        preferredModel,
        openRouterKey,
        book.parameters.outputLanguage
      );
      const updatedChapters = [...book.chapters];
      updatedChapters[chapterIndex] = newChapter;
      setBook({ ...book, chapters: updatedChapters });
    } catch (err) {
      handleError("Fehler beim Regenerieren des Kapitels.", err);
    } finally {
      setLoading(false);
    }
  };

  // Sample Chapter Generation
  const handleGenerateSample = async (chapterId: string) => {
    if (!book) return;
    const chapter = book.chapters.find(c => c.id === chapterId);
    if (!chapter) return;

    setLoading(true);
    setError(null);
    setSelectedChapterId(chapterId);
    try {
      const content = await generateChapterContent(book.title, chapter, book.parameters, book.chapters);
      setPreviewContent(content);
      setStep("preview");
    } catch (err) {
      handleError("Fehler bei der Kapitel-Generierung.", err);
    } finally {
      setLoading(false);
    }
  };

  // Chapter Refinement
  const handleRefineChapter = async () => {
    if (!book || !previewContent || !feedback.trim()) return;
    setIsRefining(true);
    try {
      const refined = await refineChapterContent(previewContent, feedback, book.parameters);
      setPreviewContent(refined);
      setFeedback("");
    } catch (err) {
      handleError("Fehler bei der Überarbeitung.", err);
    } finally {
      setIsRefining(false);
    }
  };

  // Full Book Generation
  const handleGenerateFullBook = async () => {
    if (!book) return;
    setStep("generating");
    setLoading(true);
    
    const startTime = new Date().toISOString();
    let totalRequests = 0;
    let totalWords = 0;
    let previousContext = "";
    
    const updatedChapters = [...book.chapters];
    
    try {
      let currentBook = { ...book };

      // Ensure cover is generated if not already
      if (!currentBook.coverImageUrl) {
        const url = await generateCoverImage(currentBook.title, currentBook.topic, currentBook.parameters.imageModel);
        totalRequests++;
        currentBook.coverImageUrl = url;
        setBook(currentBook);
      }

      for (let i = 0; i < updatedChapters.length; i++) {
        const chapter = updatedChapters[i];
        let chapterContent = "";

        // If chapter is long (e.g. > 2000 words), break it into sub-chapters for better quality/length
        if (currentBook.parameters.wordsPerChapter > 2000) {
          try {
            const subChapters = await generateSubChapters(currentBook.title, chapter, currentBook.parameters);
            totalRequests++;
            
            const wordsPerSubChapter = Math.round(currentBook.parameters.wordsPerChapter / (subChapters.length || 1));
            let chapterAccumulatedContent = "";

            for (let j = 0; j < subChapters.length; j++) {
              const subChapter = subChapters[j];
              const subContent = await generateSubChapterContent(
                currentBook.title,
                chapter.title,
                subChapter,
                currentBook.parameters,
                wordsPerSubChapter,
                currentBook.chapters,
                previousContext
              );
              totalRequests++;
              chapterAccumulatedContent += `## ${subChapter.title}\n\n${subContent}\n\n`;
              
              // Partially update UI to show progress
              updatedChapters[i] = { ...chapter, content: chapterAccumulatedContent };
              currentBook = { ...currentBook, chapters: [...updatedChapters] };
              setBook(currentBook);
            }
            chapterContent = chapterAccumulatedContent;
          } catch (subErr) {
            console.warn("Sub-chapter generation failed, falling back to single request", subErr);
            chapterContent = await generateChapterContent(
              currentBook.title, 
              chapter, 
              currentBook.parameters, 
              currentBook.chapters,
              previousContext
            );
            totalRequests++;
          }
        } else {
          chapterContent = await generateChapterContent(
            currentBook.title, 
            chapter, 
            currentBook.parameters, 
            currentBook.chapters,
            previousContext
          );
          totalRequests++;
        }
        
        totalWords += chapterContent.split(/\s+/).length;
        updatedChapters[i] = { ...chapter, content: chapterContent };
        
        // Generate chapter image if requested
        if (currentBook.parameters.generateChapterImages) {
          try {
            const chapterImageUrl = await safeGenerateChapterImageWithRetry(
              currentBook.title,
              chapter.title,
              chapter.description,
              currentBook.parameters.chapterImageModel,
              currentBook.parameters.imageModel === currentBook.parameters.chapterImageModel ? "gemini-3-pro-image-preview" : currentBook.parameters.imageModel
            );
            totalRequests++;
            updatedChapters[i].imageUrl = chapterImageUrl;
          } catch (imgErr) {
            console.warn(`Chapter image generation failed for ${chapter.title} after retries`, imgErr);
          }
        }
        
        // Summarize for next chapter context
        if (i < updatedChapters.length - 1) {
          const summary = await summarizeChapter(chapter.title, chapterContent, 'gemini-3-flash-preview', currentBook.parameters.openRouterKey, currentBook.parameters.outputLanguage);
          totalRequests++;
          previousContext += `Kapitel ${i + 1} (${chapter.title}): ${summary}\n`;
        }

        currentBook = { ...currentBook, chapters: [...updatedChapters] };
        setBook(currentBook);
      }

      // Generate additional materials
      if (currentBook.parameters.generateWorksheets) {
        const worksheets = await generateWorksheets(currentBook);
        totalRequests++;
        totalWords += worksheets.split(/\s+/).length;
        currentBook = { ...currentBook, worksheets };
        setBook(currentBook);
      }
      if (currentBook.parameters.generateCheatSheet) {
        const cheatSheet = await generateCheatSheet(currentBook);
        totalRequests++;
        totalWords += cheatSheet.split(/\s+/).length;
        currentBook = { ...currentBook, cheatSheet };
        setBook(currentBook);
      }
      if (currentBook.parameters.generateActionPlan) {
        const actionPlan = await generateActionPlan(currentBook);
        totalRequests++;
        totalWords += actionPlan.split(/\s+/).length;
        currentBook = { ...currentBook, actionPlan };
        setBook(currentBook);
      }

      currentBook.generationMetadata = {
        totalRequests,
        startTime,
        endTime: new Date().toISOString(),
        totalWordsGenerated: totalWords,
        modelUsed: currentBook.parameters.preferredModel
      };
      setBook(currentBook);

      setStep("finished");
    } catch (err) {
      handleError("Fehler bei der vollständigen Bucherstellung.", err);
    } finally {
      setLoading(false);
    }
  };

  const fullBookMarkdown = book ? book.chapters.map(c => `## ${c.title}\n\n${c.content || ""}`).join("\n\n") : "";

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-200">
            <BookOpen size={18} />
          </div>
          <h1 className="font-serif italic text-xl font-semibold tracking-tight">AI Book Architect</h1>
        </div>
        {book && step !== "topic" && (
          <button 
            onClick={() => setStep("topic")}
            className="text-xs uppercase tracking-widest font-bold text-stone-400 hover:text-orange-500 transition-colors"
          >
            Neustart
          </button>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-red-50 border border-red-100 rounded-2xl p-6 space-y-4">
                <div className="flex items-start gap-3 text-red-800">
                  <AlertCircle className="shrink-0 mt-0.5" size={20} />
                  <div className="space-y-1">
                    <p className="font-bold">{error}</p>
                    <p className="text-sm opacity-80">Ein Problem ist aufgetreten. Bitte prüfe die Details unten oder versuche es erneut.</p>
                  </div>
                  <button 
                    onClick={() => { setError(null); setDetailedError(null); }}
                    className="ml-auto text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                {detailedError && (
                  <div className="bg-white/50 rounded-xl p-4 border border-red-100">
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-red-400 mb-2">Technische Details (für Support kopieren)</label>
                    <pre className="text-[10px] font-mono text-red-900 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                      {detailedError}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(detailedError);
                        // Optional: Show a "Copied" toast or feedback
                      }}
                      className="mt-3 flex items-center gap-2 text-[10px] font-bold text-red-600 hover:text-red-800 transition-colors"
                    >
                      <Copy size={12} /> Details kopieren
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* Step 0: Book Type Selection */}
          {step === "type" && (
            <motion.div
              key="type"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12 text-center py-10"
            >
              <div className="space-y-4">
                <h2 className="text-4xl font-serif italic text-stone-800">Welche Art von Buch schreiben wir heute?</h2>
                <p className="text-stone-500 max-w-lg mx-auto">Wähle den Grundtyp deines Buchprojekts, damit ich die passenden Werkzeuge und Kategorien für dich bereitstellen kann.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setBookType('NonFiction');
                    setSelectedCategory(NON_FICTION_CATEGORIES[0]);
                    setStep('topic');
                  }}
                  className="p-8 bg-white border border-stone-200 rounded-3xl shadow-sm hover:shadow-xl hover:border-orange-500 transition-all group text-left space-y-4"
                >
                  <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                    <FileText size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-stone-800">Sachbuch</h3>
                    <p className="text-stone-500">Wissen vermitteln, Probleme lösen oder Themen analysieren. Ideal für Ratgeber, Fachbücher und Biografien.</p>
                  </div>
                  <div className="pt-4 flex items-center gap-2 text-orange-500 font-bold uppercase tracking-widest text-xs">
                    Auswählen <ChevronRight size={14} />
                  </div>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setBookType('Fiction');
                    setSelectedCategory(FICTION_CATEGORIES[0]);
                    setStep('topic');
                  }}
                  className="p-8 bg-white border border-stone-200 rounded-3xl shadow-sm hover:shadow-xl hover:border-blue-500 transition-all group text-left space-y-4"
                >
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                    <Sparkles size={32} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-stone-800">Roman / Fiktion</h3>
                    <p className="text-stone-500">Geschichten erzählen, Welten erschaffen und Charaktere zum Leben erwecken. Ideal für Krimis, Fantasy und Romane.</p>
                  </div>
                  <div className="pt-4 flex items-center gap-2 text-blue-500 font-bold uppercase tracking-widest text-xs">
                    Auswählen <ChevronRight size={14} />
                  </div>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Step 1: Topic Input */}
          {step === "topic" && (
            <motion.div
              key="topic"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col items-center gap-4">
                <button 
                  onClick={() => setStep('type')}
                  className="flex items-center gap-2 text-stone-400 hover:text-stone-700 transition-colors text-xs uppercase tracking-widest font-bold group"
                >
                  <ChevronLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  Zurück zum Anfang
                </button>
                <div className="space-y-2 text-center">
                  <h2 className="text-4xl font-serif font-light leading-tight">Dein nächstes Meisterwerk beginnt hier</h2>
                  <p className="text-stone-500">Wähle eine Kategorie oder beschreibe dein eigenes Thema.</p>
                </div>
              </div>

              <div className="space-y-6">

                {/* Model Selection at the start */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                      <Settings size={14} /> KI-Modell & Quota-Schutz
                    </label>
                  </div>
                  <select 
                    value={preferredModel}
                    onChange={(e) => setPreferredModel(e.target.value as any)}
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 text-lg font-medium"
                  >
                    <optgroup label="Gemini Modelle">
                      <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Beste Qualität)</option>
                      <option value="gemini-3-flash-preview">Gemini 3 Flash (Schnell & Stabil)</option>
                      <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Sehr schnell)</option>
                      <option value="gemini-flash-latest">Gemini Flash Latest (Stabil)</option>
                      <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live (Echtzeit)</option>
                    </optgroup>
                    <optgroup label="OpenRouter (Gratis Modelle)">
                      <option value="openrouter/openai/gpt-oss-120b:free">GPT OSS 120B (Free)</option>
                      <option value="openrouter/deepseek/deepseek-r1:free">DeepSeek R1 (Free)</option>
                      <option value="openrouter/deepseek/deepseek-chat:free">DeepSeek V3 (Free)</option>
                      <option value="openrouter/meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (Free)</option>
                      <option value="openrouter/qwen/qwen-2.5-72b-instruct:free">Qwen 2.5 72B (Free)</option>
                      <option value="openrouter/minimax/minimax-m2.5:free">MiniMax M2.5 (Free)</option>
                      <option value="openrouter/z-ai/glm-4.5-air:free">GLM 4.5 Air (Free)</option>
                      <option value="openrouter/qwen/qwen3.6-plus:free">Qwen 3.6 Plus (Free)</option>
                    </optgroup>
                  </select>
                  
                  {preferredModel.startsWith('openrouter/') && (
                    <div className="space-y-2">
                      <label className="block text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                        <Key size={12} /> OpenRouter API Key
                      </label>
                      <input 
                        type="password"
                        value={openRouterKey}
                        onChange={(e) => setOpenRouterKey(e.target.value)}
                        placeholder="sk-or-v1-..."
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      />
                    </div>
                  )}
                  
                  <p className="text-[10px] text-stone-400 italic leading-tight">
                    Hinweis: Falls ein Modell sein Limit erreicht, wird automatisch auf das Ersatzmodell gewechselt.
                  </p>
                </div>

                {/* Category Selection */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs uppercase tracking-widest font-bold text-stone-400">Kategorie 1</label>
                      </div>
                      <select 
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 text-lg font-medium"
                      >
                        {(bookType === 'NonFiction' ? NON_FICTION_CATEGORIES : FICTION_CATEGORIES).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs uppercase tracking-widest font-bold text-stone-400">Kategorie 2 (Optional)</label>
                      <select 
                        value={selectedCategory2}
                        onChange={(e) => setSelectedCategory2(e.target.value)}
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 text-lg font-medium"
                      >
                        <option value="Keine zweite Kategorie">Keine zweite Kategorie</option>
                        {(bookType === 'NonFiction' ? NON_FICTION_CATEGORIES : FICTION_CATEGORIES).filter(c => c !== 'Eigenes Thema').map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs uppercase tracking-widest font-bold text-stone-400">Wortfokus (Optional)</label>
                    <input 
                      type="text"
                      value={wordFocus}
                      onChange={(e) => setWordFocus(e.target.value)}
                      placeholder="Z.B. 'Quantenphysik', 'Mittelalter', 'Liebe'..."
                      className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 text-lg font-medium"
                    />
                    <p className="text-[10px] text-stone-400 italic">
                      Dieses Wort beeinflusst die Themenfindung der KI maßgeblich.
                    </p>
                  </div>
                </div>

                {/* Tone Slider & Inspiration Button (only if not "Eigenes Thema") */}
                {selectedCategory !== 'Eigenes Thema' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs uppercase tracking-widest font-bold text-stone-400">
                          {bookType === 'Fiction' ? 'Genre-Stimmung' : 'Tonalität'}
                        </label>
                        <span className="text-sm font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">{currentTones[toneValue]}</span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="4"
                        step="1"
                        value={toneValue}
                        onChange={(e) => setToneValue(parseInt(e.target.value))}
                        className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
                      />
                      <div className="flex justify-between text-[10px] uppercase tracking-tighter font-bold text-stone-400">
                        <span>{bookType === 'Fiction' ? 'Locker' : 'Lustig'}</span>
                        <span>{bookType === 'Fiction' ? 'Episch' : 'Ernsthaft'}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                        <Sparkles size={14} className="text-orange-500" /> Themen-Vorschläge & Inspiration
                      </label>
                      <button
                        onClick={handleGenerateMindMap}
                        disabled={isMindMapLoading}
                        className="text-[10px] uppercase tracking-widest font-bold text-orange-500 hover:text-orange-600 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        {isMindMapLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        6 Vorschläge generieren
                      </button>
                    </div>

                    {mindMapNodes.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {mindMapNodes.map((node) => (
                          <motion.button
                            key={node.id}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => setTopic(`${node.label}: ${node.description}`)}
                            className="p-5 rounded-2xl border border-stone-100 text-left space-y-2 transition-all hover:shadow-lg flex flex-col justify-start min-h-[120px]"
                            style={{ backgroundColor: node.color || '#F5F5F4' }}
                          >
                            <p className="font-bold text-sm text-stone-900 leading-snug">{node.label}</p>
                            <p className="text-[11px] text-stone-700 leading-relaxed overflow-hidden line-clamp-5">{node.description}</p>
                          </motion.button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 italic text-center py-4">
                        Klicke auf "6 Vorschläge generieren", um detaillierte Themenideen zu erhalten.
                      </p>
                    )}
                  </motion.div>
                )}

                <div className="relative">
                  <textarea
                    value={topic}
                    onChange={(e) => {
                      setTopic(e.target.value);
                      if (topicRefinements.length > 0) setTopicRefinements([]);
                    }}
                    placeholder={selectedCategory === 'Eigenes Thema' ? "Beschreibe dein Thema hier..." : "Hier erscheint dein generiertes Thema oder gib dein eigenes ein..."}
                    className="w-full min-h-[320px] p-6 bg-white border border-stone-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-base sm:text-lg resize-none leading-relaxed"
                  />
                  <div className="absolute bottom-4 left-4 text-xs text-stone-400">
                    {topic.length} Zeichen
                  </div>
                </div>

                {/* Topic Refinement UI */}
                {topic.trim().length > 20 && (
                  <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                        <Sparkles size={14} className="text-blue-500" /> Themen-Präzisierung
                      </label>
                      <button
                        onClick={handleRefineTopicSuggestions}
                        disabled={isRefiningTopic}
                        className="text-[10px] uppercase tracking-widest font-bold text-blue-500 hover:text-blue-600 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        {isRefiningTopic ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        3 Richtungen vorschlagen
                      </button>
                    </div>

                    {topicRefinements.length > 0 && (
                      <div className="grid grid-cols-1 gap-3">
                        {topicRefinements.map((ref) => (
                          <motion.button
                            key={ref.id}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            onClick={() => {
                              setTopic(`${ref.label}: ${ref.description}`);
                              setTopicRefinements([]);
                            }}
                            className="p-4 rounded-xl border border-blue-50 bg-blue-50/30 text-left space-y-1 transition-all hover:bg-blue-50"
                          >
                            <p className="font-bold text-sm text-blue-900">{ref.label}</p>
                            <p className="text-[10px] text-blue-700 leading-tight">{ref.description}</p>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* iOS/Safari Cookie Note */}
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-blue-800 leading-tight">
                    <strong>Hinweis für iOS/Safari:</strong> Falls die App nicht lädt, öffne sie bitte in einem <strong>neuen Tab</strong> (Icon oben rechts im AI Studio) oder nutze "Zum Home-Bildschirm hinzufügen", um Cookie-Beschränkungen zu umgehen.
                  </p>
                </div>

                {/* Chapter Count Range Select */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <label className="block text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Layers size={14} className="text-orange-500" /> Anzahl der Kapitel
                  </label>
                  <div className="flex gap-2">
                    {['4-7', '8-10', '11-14'].map((range) => (
                      <button
                        key={range}
                        onClick={() => setChapterCountRange(range as any)}
                        className={cn(
                          "flex-1 py-3 px-4 rounded-xl border font-bold transition-all",
                          chapterCountRange === range 
                            ? "bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-200"
                            : "bg-white border-stone-200 text-stone-600 hover:border-orange-500"
                        )}
                      >
                        {range}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-stone-400 italic">Legt fest, wie detailliert das Inhaltsverzeichnis strukturiert sein soll.</p>
                </div>
              </div>

              <button
                onClick={handleStartToC}
                disabled={loading || !topic.trim()}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-stone-200"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                Buchprojekt starten
              </button>

              <div className="pt-4 border-t border-stone-100">
                <label className="w-full py-3 border border-stone-200 rounded-xl text-stone-500 hover:bg-stone-50 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm font-medium">
                  <Upload size={16} /> Inhaltsverzeichnis importieren (.md)
                  <input type="file" accept=".md" onChange={handleImportToC} className="hidden" />
                </label>
              </div>
            </motion.div>
          )}

          {/* Step 2: ToC Display */}
          {step === "toc" && book && (
            <motion.div
              key="toc"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => setStep("topic")} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                    <ChevronLeft size={20} />
                  </button>
                  <h2 className="text-3xl font-serif italic">{book.title}</h2>
                </div>
                <button 
                  onClick={handleRegenerateToC}
                  disabled={loading}
                  className="p-2 text-stone-400 hover:text-orange-500 transition-colors"
                  title="Gesamtes Inhaltsverzeichnis neu generieren"
                >
                  <RotateCcw size={20} className={cn(loading && "animate-spin")} />
                </button>
              </div>

              <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-xs uppercase tracking-widest font-bold text-stone-400">Inhaltsverzeichnis</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={handleExportToC}
                        className="p-1.5 text-stone-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-all"
                        title="Inhaltsverzeichnis exportieren"
                      >
                        <Download size={14} />
                      </button>
                      <label className="p-1.5 text-stone-400 hover:text-orange-500 hover:bg-orange-50 rounded-md transition-all cursor-pointer" title="Inhaltsverzeichnis importieren">
                        <Upload size={14} />
                        <input type="file" accept=".md" onChange={handleImportToC} className="hidden" />
                      </label>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-stone-400">{book.chapters.length} Kapitel</span>
                </div>
                <div className="divide-y divide-stone-100">
                  {book.chapters.map((chapter, idx) => (
                    <div key={chapter.id} className="p-6 hover:bg-stone-50/50 transition-colors group">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <span className="font-serif italic text-stone-300 text-xl">{String(idx + 1).padStart(2, '0')}</span>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg group-hover:text-orange-600 transition-colors">{chapter.title}</h3>
                            <p className="text-sm text-stone-500 mt-1 leading-relaxed">{chapter.description}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleRegenerateChapter(chapter.id)}
                          disabled={loading}
                          className="p-2 text-stone-300 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-all"
                          title="Dieses Kapitel neu generieren"
                        >
                          <RefreshCw size={16} className={cn(loading && "animate-spin")} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cover Preview & Selection (Moved to ToC Step for better visibility) */}
              <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Sparkles size={14} /> Buchcover
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  {/* Preview Area */}
                  <div className="space-y-4">
                    {book.coverImageUrl ? (
                      <div className="relative group aspect-[3/4] w-full max-w-[240px] mx-auto overflow-hidden rounded-xl shadow-lg border border-stone-100">
                        <img src={book.coverImageUrl} alt="Cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
                          <button 
                            onClick={handleGenerateCover}
                            className="px-4 py-2 bg-white text-stone-900 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-orange-500 hover:text-white transition-all"
                          >
                            <Sparkles size={14} /> Neu generieren
                          </button>
                          <label className="px-4 py-2 bg-white/20 backdrop-blur-sm text-white border border-white/30 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-white/40 transition-all cursor-pointer">
                            <Upload size={14} /> Eigenes Bild
                            <input type="file" accept="image/*" onChange={handleUploadCover} className="hidden" />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={handleGenerateCover}
                          className="w-full py-12 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400 hover:border-orange-500 hover:text-orange-500 transition-all flex flex-col items-center gap-2"
                        >
                          <Plus size={24} />
                          <span className="font-bold">Cover generieren</span>
                        </button>
                        <label className="w-full py-4 border border-stone-200 rounded-xl text-stone-500 hover:bg-stone-50 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm font-medium">
                          <Upload size={16} /> Eigenes Cover hochladen
                          <input type="file" accept="image/*" onChange={handleUploadCover} className="hidden" />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Controls Area */}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-stone-600 flex items-center gap-2">
                        <ImageIcon size={14} className="text-stone-400" /> Bild-KI Modell
                      </label>
                      <select 
                        value={book.parameters.imageModel}
                        onChange={(e) => updateParams({ imageModel: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (Standard)</option>
                        <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image (High Quality)</option>
                      </select>
                      <p className="text-[10px] text-stone-400 leading-tight">
                        Wähle die KI aus, die das Coverbild für dich entwerfen soll.
                      </p>
                    </div>

                    <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                      <p className="text-xs text-orange-800 leading-relaxed">
                        <strong>Tipp:</strong> Du kannst jederzeit ein eigenes Bild hochladen oder die KI ein neues generieren lassen.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep("parameters")}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 transition-all shadow-xl shadow-stone-200"
              >
                Stil & Parameter anpassen
                <ChevronRight size={18} />
              </button>
            </motion.div>
          )}

          {/* Step 3: Parameters */}
          {step === "parameters" && book && (
            <motion.div
              key="parameters"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <button onClick={() => setStep("toc")} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-3xl font-serif italic">Schreibstil & Umfang</h2>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {/* Target Audience & Perspective */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <TypeIcon size={14} /> Zielgruppe & Perspektive
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Zielgruppe</label>
                      <select 
                        value={book.parameters.targetAudience}
                        onChange={(e) => updateParams({ targetAudience: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="Beginner">Anfänger</option>
                        <option value="Intermediate">Fortgeschrittener</option>
                        <option value="Advanced">Fortgeschrittener (Profi-Level)</option>
                        <option value="Expert">Experte</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Perspektive</label>
                      <select 
                        value={book.parameters.narrativePerspective}
                        onChange={(e) => updateParams({ narrativePerspective: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="FirstPerson">Ich-Form</option>
                        <option value="SecondPerson">Du-Form</option>
                        <option value="ThirdPerson">Dritte Person</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Sprachstil</label>
                      <select 
                        value={book.parameters.languageStyle}
                        onChange={(e) => updateParams({ languageStyle: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="Casual">Locker / Umgangssprachlich</option>
                        <option value="Neutral">Neutral</option>
                        <option value="Academic">Akademisch / Hochgestochen</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Ausgabesprache</label>
                      <select 
                        value={book.parameters.outputLanguage}
                        onChange={(e) => updateParams({ outputLanguage: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="German">Deutsch</option>
                        <option value="English">Englisch</option>
                        <option value="Spanish">Spanisch</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Lokalisierung</label>
                      <select 
                        value={book.parameters.localization}
                        onChange={(e) => updateParams({ localization: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="DACH">DACH (DE/AT/CH)</option>
                        <option value="US">USA / US-Stil</option>
                        <option value="Global">Global / International</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Struktur-Typ</label>
                      <select 
                        value={book.parameters.structureType}
                        onChange={(e) => updateParams({ structureType: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="Chronological">Chronologisch</option>
                        <option value="ProblemSolution">Problem-Lösung</option>
                        <option value="Modular">Modular / Nachschlagewerk</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Autoren-Persona</label>
                      <select 
                        value={book.parameters.persona}
                        onChange={(e) => updateParams({ persona: e.target.value as any })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      >
                        <option value="Default">Standard (Neutral)</option>
                        <option value="Philosopher">Stoischer Philosoph</option>
                        <option value="TechBlogger">Moderner Tech-Blogger</option>
                        <option value="Journalist">Investigativer Journalist</option>
                        <option value="Storyteller">Fesselnder Geschichtenerzähler</option>
                        <option value="Professor">Akademischer Professor</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium text-stone-600">Interaktivität</label>
                        <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-full">Stufe {book.parameters.interactivity}</span>
                      </div>
                      <input 
                        type="range"
                        min="0"
                        max="4"
                        step="1"
                        value={book.parameters.interactivity}
                        onChange={(e) => updateParams({ interactivity: parseInt(e.target.value) })}
                        className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-orange-500 mt-2"
                      />
                    </div>
                  </div>
                </div>

                {/* Fiction Specific Settings */}
                {book.parameters.bookType === 'Fiction' && (
                  <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6">
                    <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                       <Sparkles size={14} className="text-blue-500" /> Roman-Einstellungen
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-stone-600 mb-2">Dramaturgisches Modell</label>
                          <select 
                            value={book.parameters.dramaticModel}
                            onChange={(e) => updateParams({ dramaticModel: e.target.value as any })}
                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="HerosJourney">Heldenreise (Hero's Journey)</option>
                            <option value="ThreeAct">3-Akt-Struktur</option>
                            <option value="InMediaRes">In Medias Res (Direkter Einstieg)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-stone-600 mb-2">Charakter-Fokus</label>
                          <select 
                            value={book.parameters.characterFocus}
                            onChange={(e) => updateParams({ characterFocus: e.target.value as any })}
                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="PlotDriven">Handlungsgetrieben (Plot-driven)</option>
                            <option value="CharacterDriven">Charaktergetrieben (Character-driven)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-stone-600 mb-2">Erzählzeit</label>
                          <select 
                            value={book.parameters.narrativeTense}
                            onChange={(e) => updateParams({ narrativeTense: e.target.value as any })}
                            className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
                          >
                            <option value="Past">Präteritum (Vergangenheit)</option>
                            <option value="Present">Präsens (Gegenwart)</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-stone-600">Spannungskurve</label>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                              {book.parameters.tensionLevel === 0 ? 'Beschaulich' : book.parameters.tensionLevel === 4 ? 'Nervenaufreibend' : `Stufe ${book.parameters.tensionLevel}`}
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="4"
                            step="1"
                            value={book.parameters.tensionLevel}
                            onChange={(e) => updateParams({ tensionLevel: parseInt(e.target.value) })}
                            className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-1"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-stone-600">Weltenbau-Intensität</label>
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                               {book.parameters.worldbuildingIntensity === 0 ? 'Minimal' : book.parameters.worldbuildingIntensity === 4 ? 'Sehr Detailreich' : `Stufe ${book.parameters.worldbuildingIntensity}`}
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="4"
                            step="1"
                            value={book.parameters.worldbuildingIntensity}
                            onChange={(e) => updateParams({ worldbuildingIntensity: parseInt(e.target.value) })}
                            className="w-full h-2 bg-stone-100 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-1"
                          />
                        </div>
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                           <p className="text-[10px] text-blue-800 leading-tight italic">
                             Diese Parameter beeinflussen die dramaturgische Tiefe, Charakterzeichnung und die atmosphärische Dichte deines Romans.
                           </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Model Selection */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Settings size={14} /> KI-Modell
                  </h3>
                  

                  <div>
                    <label className="block text-sm font-medium text-stone-600 mb-2">Bevorzugtes Modell</label>
                    <select 
                      value={book.parameters.preferredModel}
                      onChange={(e) => {
                        const model = e.target.value as any;
                        updateParams({ preferredModel: model });
                      }}
                      className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                    >
                      <optgroup label="Gemini Modelle">
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Beste Qualität)</option>
                        <option value="gemini-3-flash-preview">Gemini 3 Flash (Schnell & Stabil)</option>
                        <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Sehr schnell)</option>
                        <option value="gemini-flash-latest">Gemini Flash Latest (Stabil)</option>
                        <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live (Echtzeit)</option>
                      </optgroup>
                      <optgroup label="OpenRouter (Gratis Modelle)">
                        <option value="openrouter/google/gemini-2.0-flash-lite-preview-02-05:free">Gemini 2.0 Flash Lite (Free)</option>
                        <option value="openrouter/mistralai/mistral-7b-instruct:free">Mistral 7B Instruct (Free)</option>
                        <option value="openrouter/huggingfaceh4/zephyr-7b-beta:free">Zephyr 7B Beta (Free)</option>
                        <option value="openrouter/openchat/openchat-7b:free">OpenChat 7B (Free)</option>
                        <option value="openrouter/gryphe/mythomist-7b:free">MythoMist 7B (Free)</option>
                        <option value="openrouter/qwen/qwen3.6-plus:free">Qwen 3.6 Plus (Free)</option>
                        <option value="openrouter/nvidia/llama-nemotron-embed-vl-1b-v2:free">Llama Nemotron 1B (Free)</option>
                        <option value="openrouter/minimax/minimax-m2.5:free">MiniMax M2.5 (Free)</option>
                        <option value="openrouter/z-ai/glm-4.5-air:free">GLM 4.5 Air (Free)</option>
                        <option value="openrouter/openai/gpt-oss-120b:free">GPT OSS 120B (Free)</option>
                      </optgroup>
                    </select>
                    
                    {book.parameters.preferredModel.startsWith('openrouter/') && (
                      <div className="mt-4 space-y-2">
                        <label className="block text-sm font-medium text-stone-600 mb-2 flex items-center gap-2">
                          <Key size={14} /> OpenRouter API Key
                        </label>
                        <input 
                          type="password"
                          value={book.parameters.openRouterKey || ""}
                          onChange={(e) => updateParams({ openRouterKey: e.target.value })}
                          placeholder="sk-or-v1-..."
                          className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                        />
                      </div>
                    )}
                    <p className="text-[10px] text-stone-400 mt-2 italic">
                      Hinweis: Bei Quota-Überschreitung wird automatisch auf das nächstbeste Modell gewechselt.
                    </p>
                  </div>
                </div>

                {/* Style Checkboxes */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Sparkles size={14} /> Stil-Elemente
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(book.parameters.bookType === 'NonFiction' ? [
                      { id: 'useExamples', label: 'Viele Beispiele', icon: Layers },
                      { id: 'reflectionQuestions', label: 'Reflexionsfragen', icon: AlertCircle },
                      { id: 'dialogueStyle', label: 'Dialog-Form', icon: TypeIcon },
                      { id: 'scientific', label: 'Wissenschaftlich', icon: FileText },
                      { id: 'easyToRead', label: 'Leicht lesbar', icon: CheckCircle2 },
                      { id: 'entertaining', label: 'Unterhaltsam', icon: Sparkles },
                    ] : [
                      { id: 'atmosphericDescriptions', label: 'Atmosphärische Beschreibungen', icon: Sparkles },
                      { id: 'deepCharacterDevelopment', label: 'Charaktertiefe', icon: Users },
                      { id: 'suspensefulPlot', label: 'Hohe Spannung', icon: Zap },
                      { id: 'emotionalPoetic', label: 'Emotional & Poetisch', icon: Heart },
                      { id: 'directDialogue', label: 'Viel direkte Rede', icon: TypeIcon },
                      { id: 'multiplePerspectives', label: 'Perspektivenwechsel', icon: Layers },
                    ]).map((item) => (
                      <label key={item.id} className="flex items-center gap-3 p-3 border border-stone-100 rounded-xl cursor-pointer hover:bg-stone-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={(book.parameters as any)[item.id]}
                          onChange={(e) => updateParams({ [item.id]: e.target.checked })}
                          className="w-5 h-5 accent-orange-500"
                        />
                        <span className="text-sm font-medium">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Additional Materials Checkboxes */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Plus size={14} /> Zusatzmaterialien
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(book.parameters.bookType === 'NonFiction' ? [
                      { id: 'generateWorksheets', label: 'Arbeitsblätter & Checklisten', icon: FileText },
                      { id: 'generateCheatSheet', label: 'Spickzettel (Cheat Sheet)', icon: Layers },
                      { id: 'generateActionPlan', label: '30-Tage-Aktionsplan', icon: CheckCircle2 },
                      { id: 'generateChapterImages', label: 'KI-Kapitelbilder (Illustriert)', icon: ImageIcon },
                      { id: 'includeMetadataPage', label: 'Metadaten-Seite hinzufügen', icon: Settings },
                    ] : [
                      { id: 'generateCharacterDossiers', label: 'Charakter-Dossiers', icon: Users },
                      { id: 'generateWorldBuildingNotes', label: 'World-Building Notes', icon: Globe },
                      { id: 'generatePlotTimeline', label: 'Plot-Timeline', icon: Layers },
                      { id: 'generateChapterImages', label: 'KI-Kapitelbilder (Illustriert)', icon: ImageIcon },
                      { id: 'includeMetadataPage', label: 'Metadaten-Seite hinzufügen', icon: Settings },
                    ]).map((item) => (
                      <label key={item.id} className="flex items-center gap-3 p-3 border border-stone-100 rounded-xl cursor-pointer hover:bg-stone-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={(book.parameters as any)[item.id]}
                          onChange={(e) => updateParams({ [item.id]: e.target.checked })}
                          className="w-5 h-5 accent-orange-500"
                        />
                        <span className="text-sm font-medium">{item.label}</span>
                      </label>
                    ))}
                  </div>

                  {book.parameters.generateChapterImages && (
                    <div className="mt-4 p-4 bg-stone-50 border border-stone-100 rounded-xl space-y-3">
                      <label className="block text-sm font-medium text-stone-600 flex items-center gap-2">
                        <ImageIcon size={14} className="text-stone-400" /> Kapitel-Bildmodell (Default)
                      </label>
                      <select 
                        value={book.parameters.chapterImageModel}
                        onChange={(e) => updateParams({ chapterImageModel: e.target.value as any })}
                        className="w-full p-2 bg-white border border-stone-200 rounded-lg outline-none text-sm"
                      >
                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image (Standard)</option>
                        <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image (High Quality)</option>
                      </select>
                      <p className="text-[10px] text-stone-400 leading-tight italic">
                        Das Backup-Modell (automatisch) wird genutzt, falls das Primärmodell fehlschlägt (max 2 Versuche).
                      </p>
                    </div>
                  )}
                </div>

                {/* Length Inputs */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Settings size={14} /> Umfang & Länge
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Ziel-Wortzahl (Gesamt)</label>
                      <input
                        type="number"
                        value={book.parameters.targetTotalWords}
                        onChange={(e) => updateParams({ targetTotalWords: Number(e.target.value) })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-600 mb-2">Wörter pro Kapitel</label>
                      <input
                        type="number"
                        value={book.parameters.wordsPerChapter}
                        onChange={(e) => updateParams({ wordsPerChapter: Number(e.target.value) })}
                        className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl">
                  <p className="text-sm text-orange-800 font-medium">Tipp: Generiere ein Sample-Kapitel, um den Stil zu prüfen.</p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400">Sample-Kapitel wählen</h3>
                  <div className="flex flex-wrap gap-2">
                    {book.chapters.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => handleGenerateSample(ch.id)}
                        className="px-4 py-2 bg-white border border-stone-200 rounded-full text-sm font-medium hover:border-orange-500 hover:text-orange-600 transition-all"
                      >
                        {ch.title}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleGenerateFullBook}
                  className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 transition-all shadow-xl shadow-stone-200"
                >
                  Vollständiges Buch generieren
                  <Sparkles size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Preview */}
          {step === "preview" && book && previewContent && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <button onClick={() => setStep("parameters")} className="flex items-center gap-2 text-stone-500 hover:text-stone-900 font-bold">
                  <ChevronLeft size={20} /> Zurück
                </button>
                <span className="text-xs uppercase tracking-widest font-bold text-orange-500">Kapitel-Vorschau</span>
              </div>

              <div className="bg-white p-10 border border-stone-200 rounded-3xl shadow-xl prose prose-stone max-w-none min-h-[400px] overflow-y-auto">
                <div className="mb-12 border-b border-stone-100 pb-8">
                  <h3 className="text-stone-400 text-sm uppercase tracking-[0.2em] font-bold mb-2">
                    Kapitel {book.chapters.findIndex(c => c.id === selectedChapterId) + 1}
                  </h3>
                  <h2 className="text-4xl font-serif italic m-0">
                    {book.chapters.find(c => c.id === selectedChapterId)?.title}
                  </h2>
                </div>
                <div className="markdown-content leading-relaxed text-lg text-stone-800 space-y-6">
                  <ReactMarkdown>{previewContent}</ReactMarkdown>
                </div>
              </div>

              {/* Refinement UI */}
              <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400">Kapitel anpassen</h3>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Z.B. 'Schreibe humorvoller' oder 'Erkläre den zweiten Absatz technischer'..."
                    className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                  <button 
                    onClick={handleRefineChapter}
                    disabled={isRefining || !feedback.trim()}
                    className="px-6 py-3 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 disabled:opacity-50 transition-all"
                  >
                    {isRefining ? <Loader2 className="animate-spin" /> : "Überarbeiten"}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <p className="text-center text-sm text-stone-500 italic">Zufrieden mit dem Ergebnis? Du kannst die Parameter weiter anpassen oder das ganze Buch erstellen.</p>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setStep("parameters")}
                    className="py-4 bg-white border border-stone-200 rounded-xl font-bold text-stone-600 hover:bg-stone-50 transition-all"
                  >
                    Parameter ändern
                  </button>
                  <button
                    onClick={handleGenerateFullBook}
                    className="py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all shadow-lg"
                  >
                    Buch erstellen
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 5: Generating */}
          {step === "generating" && book && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12 text-center py-12"
            >
              <div className="relative inline-block">
                <div className="w-24 h-24 border-4 border-stone-100 border-t-orange-500 rounded-full animate-spin mx-auto" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <BookOpen className="text-orange-500" size={32} />
                </div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-3xl font-serif italic">Dein Buch wird geschrieben...</h2>
                <p className="text-stone-500">Dies kann je nach Umfang einige Minuten dauern.</p>
              </div>

              <div className="max-w-md mx-auto space-y-2">
                {book.chapters.map((ch, idx) => (
                  <div key={ch.id} className="flex items-center justify-between p-3 bg-white border border-stone-100 rounded-xl">
                    <span className="text-sm font-medium text-stone-600">{ch.title}</span>
                    {ch.content ? (
                      <CheckCircle2 size={18} className="text-green-500" />
                    ) : (
                      <div className="w-4 h-4 border-2 border-stone-200 border-t-orange-500 rounded-full animate-spin" />
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 6: Finished */}
          {step === "finished" && book && (
            <motion.div
              key="finished"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={40} />
                </div>
                <h2 className="text-4xl font-serif italic">Fertig!</h2>
                <p className="text-stone-500">Dein Buch "{book.title}" wurde erfolgreich generiert.</p>
              </div>

              <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6">
                <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400">Export-Optionen</h3>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => exportToMarkdown(book.title, fullBookMarkdown, book.coverImageUrl, book.chapters, book.parameters, book.generationMetadata)}
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl font-bold flex items-center justify-between hover:bg-stone-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="text-stone-400" />
                      <span>Markdown (.md)</span>
                    </div>
                    <Download size={18} className="text-stone-300" />
                  </button>
                  <button
                    onClick={() => exportToPDF(book.title, fullBookMarkdown, book.coverImageUrl, book.chapters, book.parameters, book.generationMetadata)}
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl font-bold flex items-center justify-between hover:bg-stone-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="text-red-400" />
                      <span>PDF Dokument</span>
                    </div>
                    <Download size={18} className="text-stone-300" />
                  </button>
                  <button
                    onClick={() => exportToEPUB(book.title, book.chapters.map(c => ({ title: c.title, content: c.content || "", imageUrl: c.imageUrl })), book.coverImageUrl, book.parameters, book.generationMetadata)}
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl font-bold flex items-center justify-between hover:bg-stone-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen className="text-blue-400" />
                      <span>EPUB E-Book</span>
                    </div>
                    <Download size={18} className="text-stone-300" />
                  </button>
                </div>
              </div>

              {(book.worksheets || book.cheatSheet || book.actionPlan) && (
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400">Zusatzmaterialien</h3>
                  <div className="grid grid-cols-1 gap-3">
                    {book.worksheets && (
                      <div className="bg-orange-50/50 border border-orange-100 rounded-xl overflow-hidden">
                        <div className="p-4 flex items-center justify-between border-b border-orange-100">
                          <div className="flex items-center gap-3 text-orange-800 font-bold">
                            <FileText size={20} />
                            <span>Arbeitsblätter & Checklisten</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-orange-100">
                          <button onClick={() => exportToMarkdown(`${book.title} - Arbeitsblaetter`, book.worksheets || "")} className="py-2 text-[10px] uppercase font-bold text-orange-600 hover:bg-orange-100 transition-colors">MD</button>
                          <button onClick={() => exportToPDF(`${book.title} - Arbeitsblaetter`, book.worksheets || "")} className="py-2 text-[10px] uppercase font-bold text-orange-600 hover:bg-orange-100 transition-colors">PDF</button>
                          <button onClick={() => exportToEPUB(`${book.title} - Arbeitsblaetter`, [{ title: "Arbeitsblätter", content: book.worksheets || "" }])} className="py-2 text-[10px] uppercase font-bold text-orange-600 hover:bg-orange-100 transition-colors">EPUB</button>
                        </div>
                      </div>
                    )}
                    {book.cheatSheet && (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl overflow-hidden">
                        <div className="p-4 flex items-center justify-between border-b border-blue-100">
                          <div className="flex items-center gap-3 text-blue-800 font-bold">
                            <Layers size={20} />
                            <span>Spickzettel (Cheat Sheet)</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-blue-100">
                          <button onClick={() => exportToMarkdown(`${book.title} - Spickzettel`, book.cheatSheet || "")} className="py-2 text-[10px] uppercase font-bold text-blue-600 hover:bg-blue-100 transition-colors">MD</button>
                          <button onClick={() => exportToPDF(`${book.title} - Spickzettel`, book.cheatSheet || "")} className="py-2 text-[10px] uppercase font-bold text-blue-600 hover:bg-blue-100 transition-colors">PDF</button>
                          <button onClick={() => exportToEPUB(`${book.title} - Spickzettel`, [{ title: "Spickzettel", content: book.cheatSheet || "" }])} className="py-2 text-[10px] uppercase font-bold text-blue-600 hover:bg-blue-100 transition-colors">EPUB</button>
                        </div>
                      </div>
                    )}
                    {book.actionPlan && (
                      <div className="bg-green-50/50 border border-green-100 rounded-xl overflow-hidden">
                        <div className="p-4 flex items-center justify-between border-b border-green-100">
                          <div className="flex items-center gap-3 text-green-800 font-bold">
                            <CheckCircle2 size={20} />
                            <span>30-Tage-Aktionsplan</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-green-100">
                          <button onClick={() => exportToMarkdown(`${book.title} - Aktionsplan`, book.actionPlan || "")} className="py-2 text-[10px] uppercase font-bold text-green-600 hover:bg-green-100 transition-colors">MD</button>
                          <button onClick={() => exportToPDF(`${book.title} - Aktionsplan`, book.actionPlan || "")} className="py-2 text-[10px] uppercase font-bold text-green-600 hover:bg-green-100 transition-colors">PDF</button>
                          <button onClick={() => exportToEPUB(`${book.title} - Aktionsplan`, [{ title: "Aktionsplan", content: book.actionPlan || "" }])} className="py-2 text-[10px] uppercase font-bold text-green-600 hover:bg-green-100 transition-colors">EPUB</button>
                        </div>
                      </div>
                    )}

                    {/* Combined Materials */}
                    <div className="mt-4 pt-4 border-t border-stone-100">
                      <div className="bg-stone-900 text-white rounded-xl overflow-hidden">
                        <div className="p-4 flex items-center justify-between border-b border-stone-800">
                          <div className="flex items-center gap-3 font-bold">
                            <Download size={20} className="text-orange-500" />
                            <span>Alle Materialien (Kombiniert)</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-stone-800">
                          <button 
                            onClick={() => {
                              const combined = [
                                book.worksheets ? `# Arbeitsblätter\n\n${book.worksheets}` : "",
                                book.cheatSheet ? `# Spickzettel\n\n${book.cheatSheet}` : "",
                                book.actionPlan ? `# Aktionsplan\n\n${book.actionPlan}` : ""
                              ].filter(Boolean).join("\n\n---\n\n");
                              exportToMarkdown(`${book.title} - Alle Materialien`, combined);
                            }} 
                            className="py-3 text-[10px] uppercase font-bold hover:bg-stone-800 transition-colors"
                          >
                            MD
                          </button>
                          <button 
                            onClick={() => {
                              const combined = [
                                book.worksheets ? `# Arbeitsblätter\n\n${book.worksheets}` : "",
                                book.cheatSheet ? `# Spickzettel\n\n${book.cheatSheet}` : "",
                                book.actionPlan ? `# Aktionsplan\n\n${book.actionPlan}` : ""
                              ].filter(Boolean).join("\n\n---\n\n");
                              exportToPDF(`${book.title} - Alle Materialien`, combined);
                            }} 
                            className="py-3 text-[10px] uppercase font-bold hover:bg-stone-800 transition-colors"
                          >
                            PDF
                          </button>
                          <button 
                            onClick={() => {
                              const chapters = [];
                              if (book.worksheets) chapters.push({ title: "Arbeitsblätter", content: book.worksheets });
                              if (book.cheatSheet) chapters.push({ title: "Spickzettel", content: book.cheatSheet });
                              if (book.actionPlan) chapters.push({ title: "Aktionsplan", content: book.actionPlan });
                              exportToEPUB(`${book.title} - Alle Materialien`, chapters);
                            }} 
                            className="py-3 text-[10px] uppercase font-bold hover:bg-stone-800 transition-colors"
                          >
                            EPUB
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {book.generationMetadata && (
                <div className="bg-stone-50 p-6 border border-stone-200 rounded-2xl space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Settings size={14} /> Generierungs-Metadaten
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <span className="text-stone-400 block">Requests gesamt:</span>
                      <span className="font-mono font-bold">{book.generationMetadata.totalRequests}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-stone-400 block">Wörter gesamt:</span>
                      <span className="font-mono font-bold">{book.generationMetadata.totalWordsGenerated.toLocaleString()}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-stone-400 block">Dauer:</span>
                      <span className="font-mono font-bold">
                        {Math.round((new Date(book.generationMetadata.endTime!).getTime() - new Date(book.generationMetadata.startTime).getTime()) / 1000)}s
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-stone-400 block">Modell:</span>
                      <span className="font-mono font-bold">{book.generationMetadata.modelUsed}</span>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setStep("topic")}
                className="w-full py-4 bg-stone-900 text-white rounded-xl font-bold hover:bg-stone-800 transition-all"
              >
                Neues Buch erstellen
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Loading Overlay */}
      {loading && step !== "generating" && (
        <div className="fixed inset-0 z-[100] bg-white/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-3xl shadow-2xl border border-stone-100 flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-orange-500" size={40} />
            <p className="font-bold text-stone-600">Verarbeite...</p>
          </div>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="fixed bottom-6 left-6 right-6 z-[110]">
          <div className="bg-red-500 text-white p-4 rounded-xl shadow-xl flex items-center justify-between animate-bounce">
            <div className="flex items-center gap-3">
              <AlertCircle size={20} />
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:bg-white/20 rounded">
              <Plus size={18} className="rotate-45" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
