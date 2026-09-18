export type EntryType = 'work' | 'break';

export interface Entry {
  id: string;
  type: EntryType;
  start: number;
  end: number | null;
  projectId?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NewEntry {
  type: EntryType;
  start: number;
  end: null;
  createdAt: number;
  updatedAt: number;
}

export interface TimeRange {
  start: number;
  end: number;
}
