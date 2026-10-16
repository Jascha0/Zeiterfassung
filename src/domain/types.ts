import type { ProjectColor } from './palette';

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
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TimeRange {
  start: number;
  end: number;
}

/** A manually created entry. Always closed (0023). The timer keeps using NewEntry (end: null). */
export interface NewClosedEntry {
  type: EntryType;
  start: number;
  end: number;
  createdAt: number;
  updatedAt: number;
}

/** Partial update of one entry. Only defined fields are written; updatedAt always. */
export interface EntryChanges {
  type?: EntryType;
  start?: number;
  end?: number;
  updatedAt: number;
}

export interface Project {
  id: string;
  name: string;
  color: ProjectColor;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface NewProject {
  name: string;
  color: ProjectColor;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Partial project update. Only defined fields are written; updatedAt always. */
export interface ProjectChanges {
  name?: string;
  color?: ProjectColor;
  archived?: boolean;
  updatedAt: number;
}
