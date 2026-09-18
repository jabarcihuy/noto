/** Notebook entity (docs/DATABASE.md §4.1, PRD §10.6). */

export type Notebook = {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
