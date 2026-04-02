export type TargetAudience = 'Beginners' | 'Experts' | 'Children' | 'Seniors';
export type NarrativePerspective = 'FirstPerson' | 'SecondPerson' | 'ThirdPerson';

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
  targetAudience: 'Beginners',
  narrativePerspective: 'SecondPerson',
};
