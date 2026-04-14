export type TargetAudience = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type NarrativePerspective = 'FirstPerson' | 'SecondPerson' | 'ThirdPerson';
export type LanguageStyle = 'Casual' | 'Neutral' | 'Academic';
export type Localization = 'DACH' | 'US' | 'Global';
export type StructureType = 'Chronological' | 'ProblemSolution' | 'Modular';

export type ModelType = 
  | 'gemini-3.1-pro-preview' 
  | 'gemini-3-flash-preview' 
  | 'gemini-3.1-flash-lite-preview' 
  | 'gemini-flash-latest'
  | 'gemini-3.1-flash-live-preview'
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
  | 'gemini-2.0-flash-exp-image';

export interface BookParameters {
  useExamples: boolean;
  reflectionQuestions: boolean;
  dialogueStyle: boolean;
  scientific: boolean;
  easyToRead: boolean;
  entertaining: boolean;
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
  // Additional materials
  generateWorksheets: boolean;
  generateCheatSheet: boolean;
  generateActionPlan: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  description: string;
  content?: string;
  isGenerating?: boolean;
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
  preferredModel: 'gemini-3.1-pro-preview',
  imageModel: 'gemini-2.5-flash-image',
  openRouterKey: '',
  languageStyle: 'Neutral',
  localization: 'Global',
  interactivity: 2,
  structureType: 'Chronological',
  generateWorksheets: false,
  generateCheatSheet: false,
  generateActionPlan: false,
};
