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
  Plus,
  Type as TypeIcon,
  Layers,
  Sparkles,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Key
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Book, Chapter, BookParameters, DEFAULT_PARAMETERS, ModelType } from "./types";
import { generateToC, generateChapterContent, suggestParameters, generateCoverImage, refineChapterContent, generateInspiration, regenerateChapterInToC, generateWorksheets, generateCheatSheet, generateActionPlan } from "./services/geminiService";
import { exportToMarkdown, exportToPDF, exportToEPUB } from "./services/exportService";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORIES = [
  "Eigenes Thema und Kategorie",
  "AI",
  "Business",
  "Christlicher Glaube und Theologie",
  "Filme und Serien",
  "Kochen & Backen",
  "Reisen & Abenteuer",
  "Persönlichkeitsentwicklung",
  "Wissenschaft & Technik",
  "Geschichte",
  "Krimi & Thriller",
  "Fantasy & Science Fiction",
  "Finanzen & Wirtschaft",
  "Gesundheit & Fitness",
  "Kunst & Design",
  "Kinderbücher",
  "Biografien",
  "Garten & Natur",
  "Philosophie",
  "Psychologie",
  "IT & Programmierung"
];

const TONES = [
  "Lustig & Amüsant",
  "Locker & Unterhaltsam",
  "Neutral & Informativ",
  "Sachlich & Professionell",
  "Wissenschaftlich & Ernsthaft"
];

const PRESET_OPENROUTER_KEY = "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";

export default function App() {
  const [step, setStep] = useState<"topic" | "toc" | "parameters" | "preview" | "generating" | "finished">("topic");
  const [topic, setTopic] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0]);
  const [toneValue, setToneValue] = useState(2); // Default: Neutral & Informativ
  const [preferredModel, setPreferredModel] = useState(DEFAULT_PARAMETERS.preferredModel);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(false);
  const [isInspirationLoading, setIsInspirationLoading] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inspiration Generation
  const handleGenerateInspiration = async () => {
    if (selectedCategory === CATEGORIES[0]) return;
    setIsInspirationLoading(true);
    setError(null);
    try {
      const result = await generateInspiration(selectedCategory, TONES[toneValue], preferredModel, openRouterKey);
      setTopic(result);
    } catch (err) {
      setError("Fehler beim Generieren der Inspiration.");
    } finally {
      setIsInspirationLoading(false);
    }
  };

  // Initial ToC Generation & Parameter Suggestion
  const handleStartToC = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const [tocResult, suggestedParams] = await Promise.all([
        generateToC(topic, preferredModel, openRouterKey),
        suggestParameters(topic, openRouterKey)
      ]);
      
      setBook({
        topic,
        title: tocResult.title,
        chapters: tocResult.chapters,
        parameters: { ...DEFAULT_PARAMETERS, ...suggestedParams, preferredModel, openRouterKey }
      });
      setStep("toc");
    } catch (err) {
      setError("Fehler beim Erstellen des Inhaltsverzeichnisses. Bitte versuche es erneut.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Cover Generation
  const handleGenerateCover = async () => {
    if (!book) return;
    setLoading(true);
    try {
      const url = await generateCoverImage(book.title, book.topic);
      setBook({ ...book, coverImageUrl: url });
    } catch (err) {
      setError("Fehler bei der Cover-Generierung.");
    } finally {
      setLoading(false);
    }
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
      const tocResult = await generateToC(book.topic, preferredModel, openRouterKey);
      setBook({
        ...book,
        title: tocResult.title,
        chapters: tocResult.chapters
      });
    } catch (err) {
      setError("Fehler beim Regenerieren des Inhaltsverzeichnisses.");
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
        openRouterKey
      );
      const updatedChapters = [...book.chapters];
      updatedChapters[chapterIndex] = newChapter;
      setBook({ ...book, chapters: updatedChapters });
    } catch (err) {
      setError("Fehler beim Regenerieren des Kapitels.");
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
      setError("Fehler bei der Kapitel-Generierung.");
      console.error(err);
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
      setError("Fehler bei der Überarbeitung.");
    } finally {
      setIsRefining(false);
    }
  };

  // Full Book Generation
  const handleGenerateFullBook = async () => {
    if (!book) return;
    setStep("generating");
    setLoading(true);
    
    const updatedChapters = [...book.chapters];
    
    try {
      let currentBook = { ...book };

      // Ensure cover is generated if not already
      if (!currentBook.coverImageUrl) {
        const url = await generateCoverImage(currentBook.title, currentBook.topic);
        currentBook.coverImageUrl = url;
        setBook(currentBook);
      }

      for (let i = 0; i < updatedChapters.length; i++) {
        const chapter = updatedChapters[i];
        const content = await generateChapterContent(currentBook.title, chapter, currentBook.parameters, currentBook.chapters);
        updatedChapters[i] = { ...chapter, content };
        currentBook = { ...currentBook, chapters: [...updatedChapters] };
        setBook(currentBook);
      }

      // Generate additional materials
      if (currentBook.parameters.generateWorksheets) {
        const worksheets = await generateWorksheets(currentBook);
        currentBook = { ...currentBook, worksheets };
        setBook(currentBook);
      }
      if (currentBook.parameters.generateCheatSheet) {
        const cheatSheet = await generateCheatSheet(currentBook);
        currentBook = { ...currentBook, cheatSheet };
        setBook(currentBook);
      }
      if (currentBook.parameters.generateActionPlan) {
        const actionPlan = await generateActionPlan(currentBook);
        currentBook = { ...currentBook, actionPlan };
        setBook(currentBook);
      }

      setStep("finished");
    } catch (err) {
      setError("Fehler bei der vollständigen Bucherstellung.");
      console.error(err);
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
        <AnimatePresence mode="wait">
          {/* Step 1: Topic Input */}
          {step === "topic" && (
            <motion.div
              key="topic"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2 text-center">
                <h2 className="text-4xl font-serif font-light leading-tight">Dein nächstes Meisterwerk beginnt hier</h2>
                <p className="text-stone-500">Wähle eine Kategorie oder beschreibe dein eigenes Thema.</p>
              </div>

              <div className="space-y-6">
                {/* Preset Key Helper */}
                <div className="bg-orange-50/50 p-4 border border-orange-100 rounded-2xl flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] uppercase tracking-widest font-bold text-orange-400 mb-1">Verfügbarer OpenRouter Key</label>
                    <input 
                      readOnly
                      value={PRESET_OPENROUTER_KEY}
                      className="w-full bg-transparent border-none p-0 text-xs text-orange-800 font-mono outline-none"
                    />
                  </div>
                  <button 
                    onClick={() => setOpenRouterKey(PRESET_OPENROUTER_KEY)}
                    className="px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
                  >
                    <Download size={14} /> Übernehmen
                  </button>
                </div>

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
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <label className="block text-xs uppercase tracking-widest font-bold text-stone-400">Kategorie</label>
                  <select 
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500/20 text-lg font-medium"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Tone Slider & Inspiration Button (only if not "Eigenes Thema") */}
                {selectedCategory !== CATEGORIES[0] && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-6"
                  >
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs uppercase tracking-widest font-bold text-stone-400">Tonalität</label>
                        <span className="text-sm font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">{TONES[toneValue]}</span>
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
                        <span>Lustig</span>
                        <span>Wissenschaftlich</span>
                      </div>
                    </div>

                    <button
                      onClick={handleGenerateInspiration}
                      disabled={isInspirationLoading}
                      className="w-full py-3 border-2 border-dashed border-stone-200 rounded-xl text-stone-500 font-bold flex items-center justify-center gap-2 hover:border-orange-500 hover:text-orange-500 transition-all"
                    >
                      {isInspirationLoading ? <Loader2 className="animate-spin" /> : <Lightbulb size={18} />}
                      Erstelle zufälliges Thema und Beschreibung
                    </button>
                  </motion.div>
                )}

                <div className="relative">
                  <textarea
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={selectedCategory === CATEGORIES[0] ? "Beschreibe dein Thema hier..." : "Hier erscheint dein generiertes Thema oder gib dein eigenes ein..."}
                    className="w-full min-h-[320px] p-6 bg-white border border-stone-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-base sm:text-lg resize-none leading-relaxed"
                  />
                  <div className="absolute bottom-4 right-4 text-xs text-stone-400">
                    {topic.length} Zeichen
                  </div>
                </div>

                {/* iOS/Safari Cookie Note */}
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="text-blue-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-blue-800 leading-tight">
                    <strong>Hinweis für iOS/Safari:</strong> Falls die App nicht lädt, öffne sie bitte in einem <strong>neuen Tab</strong> (Icon oben rechts im AI Studio) oder nutze "Zum Home-Bildschirm hinzufügen", um Cookie-Beschränkungen zu umgehen.
                  </p>
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
                  <span className="text-xs uppercase tracking-widest font-bold text-stone-400">Inhaltsverzeichnis</span>
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
                {/* Cover Preview */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Sparkles size={14} /> Buchcover
                  </h3>
                  {book.coverImageUrl ? (
                    <div className="relative group aspect-[3/4] max-w-[200px] mx-auto overflow-hidden rounded-xl shadow-lg border border-stone-100">
                      <img src={book.coverImageUrl} alt="Cover" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <button 
                        onClick={handleGenerateCover}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold gap-2"
                      >
                        <Sparkles size={18} /> Neu generieren
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={handleGenerateCover}
                      className="w-full py-8 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400 hover:border-orange-500 hover:text-orange-500 transition-all flex flex-col items-center gap-2"
                    >
                      <Plus size={24} />
                      <span className="font-bold">Cover generieren</span>
                    </button>
                  )}
                </div>

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

                {/* Model Selection */}
                <div className="bg-white p-6 border border-stone-200 rounded-2xl shadow-sm space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-stone-400 flex items-center gap-2">
                    <Settings size={14} /> KI-Modell
                  </h3>
                  
                  {/* Preset Key Helper in Parameters */}
                  <div className="bg-orange-50/50 p-3 border border-orange-100 rounded-xl flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[9px] uppercase tracking-widest font-bold text-orange-400 mb-0.5">Verfügbarer Key</label>
                      <input 
                        readOnly
                        value={PRESET_OPENROUTER_KEY}
                        className="w-full bg-transparent border-none p-0 text-[10px] text-orange-800 font-mono outline-none"
                      />
                    </div>
                    <button 
                      onClick={() => updateParams({ openRouterKey: PRESET_OPENROUTER_KEY })}
                      className="px-2 py-1.5 bg-orange-500 text-white text-[10px] font-bold rounded-md hover:bg-orange-600 transition-colors"
                    >
                      Kopieren
                    </button>
                  </div>

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
                    {[
                      { id: 'useExamples', label: 'Viele Beispiele', icon: Layers },
                      { id: 'reflectionQuestions', label: 'Reflexionsfragen', icon: AlertCircle },
                      { id: 'dialogueStyle', label: 'Dialog-Form', icon: TypeIcon },
                      { id: 'scientific', label: 'Wissenschaftlich', icon: FileText },
                      { id: 'easyToRead', label: 'Leicht lesbar', icon: CheckCircle2 },
                      { id: 'entertaining', label: 'Unterhaltsam', icon: Sparkles },
                    ].map((item) => (
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
                    {[
                      { id: 'generateWorksheets', label: 'Arbeitsblätter & Checklisten', icon: FileText },
                      { id: 'generateCheatSheet', label: 'Spickzettel (Cheat Sheet)', icon: Layers },
                      { id: 'generateActionPlan', label: '30-Tage-Aktionsplan', icon: CheckCircle2 },
                    ].map((item) => (
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
                    onClick={() => exportToMarkdown(book.title, fullBookMarkdown, book.coverImageUrl)}
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl font-bold flex items-center justify-between hover:bg-stone-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="text-stone-400" />
                      <span>Markdown (.md)</span>
                    </div>
                    <Download size={18} className="text-stone-300" />
                  </button>
                  <button
                    onClick={() => exportToPDF(book.title, fullBookMarkdown, book.coverImageUrl)}
                    className="w-full p-4 bg-stone-50 border border-stone-200 rounded-xl font-bold flex items-center justify-between hover:bg-stone-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="text-red-400" />
                      <span>PDF Dokument</span>
                    </div>
                    <Download size={18} className="text-stone-300" />
                  </button>
                  <button
                    onClick={() => exportToEPUB(book.title, book.chapters.map(c => ({ title: c.title, content: c.content || "" })), book.coverImageUrl)}
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
                      <button
                        onClick={() => exportToMarkdown(`${book.title} - Arbeitsblaetter`, book.worksheets || "")}
                        className="w-full p-4 bg-orange-50/50 border border-orange-100 rounded-xl font-bold flex items-center justify-between hover:bg-orange-100/50 transition-all"
                      >
                        <div className="flex items-center gap-3 text-orange-800">
                          <FileText size={20} />
                          <span>Arbeitsblätter & Checklisten</span>
                        </div>
                        <Download size={18} className="text-orange-300" />
                      </button>
                    )}
                    {book.cheatSheet && (
                      <button
                        onClick={() => exportToMarkdown(`${book.title} - Spickzettel`, book.cheatSheet || "")}
                        className="w-full p-4 bg-blue-50/50 border border-blue-100 rounded-xl font-bold flex items-center justify-between hover:bg-blue-100/50 transition-all"
                      >
                        <div className="flex items-center gap-3 text-blue-800">
                          <Layers size={20} />
                          <span>Spickzettel (Cheat Sheet)</span>
                        </div>
                        <Download size={18} className="text-blue-300" />
                      </button>
                    )}
                    {book.actionPlan && (
                      <button
                        onClick={() => exportToMarkdown(`${book.title} - Aktionsplan`, book.actionPlan || "")}
                        className="w-full p-4 bg-green-50/50 border border-green-100 rounded-xl font-bold flex items-center justify-between hover:bg-green-100/50 transition-all"
                      >
                        <div className="flex items-center gap-3 text-green-800">
                          <CheckCircle2 size={20} />
                          <span>30-Tage-Aktionsplan</span>
                        </div>
                        <Download size={18} className="text-green-300" />
                      </button>
                    )}
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
