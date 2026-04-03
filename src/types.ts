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
  | 'openrouter/google/gemini-2.0-flash-lite-preview-02-05:free'
  | 'openrouter/mistralai/mistral-7b-instruct:free'
  | 'openrouter/huggingfaceh4/zephyr-7b-beta:free'
  | 'openrouter/openchat/openchat-7b:free'
  | 'openrouter/gryphe/mythomist-7b:free'
  | 'openrouter/qwen/qwen3.6-plus:free'
  | 'openrouter/nvidia/llama-nemotron-embed-vl-1b-v2:free'
  | 'openrouter/minimax/minimax-m2.5:free'
  | 'openrouter/z-ai/glm-4.5-air:free'
  | 'openrouter/openai/gpt-oss-120b:free';

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
  openRouterKey: '',
  languageStyle: 'Neutral',
  localization: 'Global',
  interactivity: 2,
  structureType: 'Chronological',
  generateWorksheets: false,
  generateCheatSheet: false,
  generateActionPlan: false,
};
