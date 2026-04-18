export type TargetAudience = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type NarrativePerspective = 'FirstPerson' | 'SecondPerson' | 'ThirdPerson';
export type LanguageStyle = 'Casual' | 'Neutral' | 'Academic';
export type Localization = 'DACH' | 'US' | 'Global';
export type StructureType = 'Chronological' | 'ProblemSolution' | 'Modular';
export type PersonaType = 'Default' | 'Philosopher' | 'TechBlogger' | 'Journalist' | 'Storyteller' | 'Professor';
export type DramaticModel = 'HerosJourney' | 'ThreeAct' | 'InMediaRes';
export type CharacterFocus = 'PlotDriven' | 'CharacterDriven';
export type NarrativeTense = 'Past' | 'Present';

export type ModelType = 
  | 'gemini-3.1-pro-preview' 
  | 'gemini-3-flash-preview' 
  | 'gemini-flash-latest'
  | 'gemini-3.1-flash-lite-preview' 
  | 'gemini-1.5-pro'
  | 'gemini-3.1-flash-live-preview'
  | 'openrouter/google/gemini-2.0-flash-lite-preview-02-05:free'
  | 'openrouter/qwen/qwen3.6-plus:free'
  | 'openrouter/z-ai/glm-4.5-air:free'
  | 'openrouter/openai/gpt-oss-120b:free'
  | 'openrouter/minimax/minimax-m2.5:free'
  | 'openrouter/qwen/qwen-2.5-72b-instruct:free'
  | 'openrouter/meta-llama/llama-3.3-70b-instruct:free'
  | 'openrouter/deepseek/deepseek-r1:free'
  | 'openrouter/deepseek/deepseek-chat:free';

export type ImageModelType = 
  | 'gemini-2.5-flash-image'
  | 'gemini-3-pro-image-preview';

export interface BookParameters {
  // Non-Fiction Style
  useExamples: boolean;
  reflectionQuestions: boolean;
  dialogueStyle: boolean;
  scientific: boolean;
  easyToRead: boolean;
  entertaining: boolean;
  // Fiction Style
  atmosphericDescriptions?: boolean;
  deepCharacterDevelopment?: boolean;
  suspensefulPlot?: boolean;
  emotionalPoetic?: boolean;
  directDialogue?: boolean;
  multiplePerspectives?: boolean;
  
  targetTotalPages: number;
  targetTotalWords: number;
  wordsPerChapter: number;
  targetAudience: TargetAudience;
  narrativePerspective: NarrativePerspective;
  preferredModel: ModelType;
  imageModel: ImageModelType;
  openRouterKey?: string;
  // New parameters
  languageStyle: LanguageStyle;
  localization: Localization;
  interactivity: number; // 0-4
  structureType: StructureType;
  persona: PersonaType;
  // Additional materials
  generateWorksheets: boolean;
  generateCheatSheet: boolean;
  generateActionPlan: boolean;
  // Fiction Specific Materials
  generateCharacterDossiers?: boolean;
  generateWorldBuildingNotes?: boolean;
  generatePlotTimeline?: boolean;
  
  generateChapterImages: boolean;
  includeMetadataPage: boolean;
  outputLanguage: 'German' | 'English' | 'Spanish';
  chapterCountRange: '4-7' | '8-10' | '11-14';
  chapterImageModel: ImageModelType;
  bookType: 'NonFiction' | 'Fiction';
  // Fiction specific
  dramaticModel: DramaticModel;
  tensionLevel: number; // 0-4
  characterFocus: CharacterFocus;
  narrativeTense: NarrativeTense;
  worldbuildingIntensity: number; // 0-4
}

export interface SubChapter {
  title: string;
  description: string;
}

export interface Chapter {
  id: string;
  title: string;
  description: string;
  content?: string;
  imageUrl?: string;
  isGenerating?: boolean;
  subChapters?: SubChapter[];
}

export interface GenerationMetadata {
  totalRequests: number;
  startTime: string;
  endTime?: string;
  totalWordsGenerated: number;
  modelUsed: ModelType;
}

export interface Book {
  topic: string;
  title: string;
  chapters: Chapter[];
  parameters: BookParameters;
  coverImageUrl?: string;
  // Generated materials
  worksheets?: string;
  cheatSheet?: string;
  actionPlan?: string;
  generationMetadata?: GenerationMetadata;
}

export interface MindMapNode {
  id: string;
  label: string;
  description: string;
  color?: string;
}

export const DEFAULT_PARAMETERS: BookParameters = {
  useExamples: true,
  reflectionQuestions: false,
  dialogueStyle: false,
  scientific: false,
  easyToRead: true,
  entertaining: true,
  targetTotalPages: 50,
  targetTotalWords: 15000,
  wordsPerChapter: 1500,
  targetAudience: 'Beginner',
  narrativePerspective: 'SecondPerson',
  preferredModel: 'gemini-3-flash-preview',
  imageModel: 'gemini-2.5-flash-image',
  openRouterKey: '',
  languageStyle: 'Neutral',
  localization: 'Global',
  interactivity: 2,
  structureType: 'Chronological',
  persona: 'Default',
  generateWorksheets: false,
  generateCheatSheet: false,
  generateActionPlan: false,
  atmosphericDescriptions: true,
  deepCharacterDevelopment: true,
  suspensefulPlot: true,
  generateCharacterDossiers: false,
  generateWorldBuildingNotes: false,
  generatePlotTimeline: false,
  generateChapterImages: false,
  includeMetadataPage: false,
  outputLanguage: 'German',
  chapterCountRange: '8-10',
  chapterImageModel: 'gemini-2.5-flash-image',
  bookType: 'NonFiction',
  // Fiction specific defaults
  dramaticModel: 'ThreeAct',
  tensionLevel: 2,
  characterFocus: 'PlotDriven',
  narrativeTense: 'Past',
  worldbuildingIntensity: 2,
};
