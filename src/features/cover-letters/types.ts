export type CoverLetterContent = {
  salutation: string;
  paragraphs: string[];
  signOff: string;
};

export type GeneratedCoverLetter = {
  id: string;
  jobId: string;
  version: number;
  content: CoverLetterContent;
  aiProvider: string;
  aiModel: string;
  requestId: string;
  createdAt: string;
};

export type CoverLetterActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const INITIAL_COVER_LETTER_ACTION_STATE: CoverLetterActionState = { status: "idle", message: "" };
