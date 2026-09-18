/** Template entity (docs/DATABASE.md §4.7, PRD §10.7). Templates are copy-on-create. */

export type Template = {
  id: string;
  name: string;
  description: string | null;
  content: string;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NewTemplate = {
  id?: string;
  name: string;
  description?: string | null;
  content?: string;
  isBuiltin?: boolean;
  createdAt?: string;
  /** Import/restore only: preserve the exported timestamp instead of "now". */
  updatedAt?: string;
};
