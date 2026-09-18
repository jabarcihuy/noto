import type { Clock } from '@/core';
import type { UrlMetadataPort } from '@/core/platform/url-metadata-port';
import type { AttachmentUseCases } from '@/features/attachments/application/attachment-use-cases';
import type { Note } from '@/features/notes/domain/note';

import {
  buildUrlContent,
  buildUrlEnrichment,
  defaultUrlTitle,
  normalizeUrlInput,
  type UrlMetadataDraft,
} from '../domain/url';
import { routeSharePayload } from '../domain/share-routing';

/** Narrow notes port the capture feature depends on (implemented at composition). */
export type CaptureNotePort = {
  createNote(input: {
    title?: string;
    content?: string;
    captureType?: 'text' | 'image' | 'voice' | 'url' | 'file' | 'mixed';
    notebookId?: string | null;
    sourceUrl?: string | null;
  }): Promise<Note>;
  getNote(id: string): Promise<Note | null>;
  updateNote(id: string, patch: { title?: string; content?: string }): Promise<Note | null>;
  /** Used to roll back a note whose shared attachment could not be stored. */
  deleteNote(id: string): Promise<boolean>;
};

export type UrlCaptureResult = {
  note: Note;
  /** Best-effort outcome; the note is saved regardless (PRD §9.4, §18). */
  metadata: 'applied' | 'unavailable' | 'not-a-url';
};

export type SharedCaptureResult =
  | { kind: 'note'; note: Note; metadata: UrlCaptureResult['metadata'] }
  | { kind: 'unsupported'; reason: 'empty' | 'unsupported-type' | 'unreadable' };

export type CaptureUseCases = ReturnType<typeof createCaptureUseCases>;

/**
 * URL and share capture application layer (docs/FEATURES.md §1.4–1.5). URL capture is
 * local-first: the note is created before any network work, metadata is applied
 * afterwards, and a metadata failure never affects the saved note.
 */
export function createCaptureUseCases(deps: {
  notes: CaptureNotePort;
  attachments: AttachmentUseCases;
  urlMetadata: UrlMetadataPort;
  now: Clock;
}) {
  const { notes, attachments, urlMetadata } = deps;

  /**
   * Creates the URL note locally, then tries metadata. A user-entered title is never
   * overwritten by metadata (Phase 10 Implementation Decision); metadata fills the title
   * only while it is still the default domain title.
   */
  async function saveUrl(input: { url: string; title?: string }): Promise<UrlCaptureResult> {
    const normalized = normalizeUrlInput(input.url);
    if (!normalized) {
      const note = await notes.createNote({
        title: input.title?.trim() ?? '',
        content: input.url.trim(),
        captureType: 'text',
      });
      return { note, metadata: 'not-a-url' };
    }

    const title = input.title?.trim() ? input.title.trim() : defaultUrlTitle(normalized);
    let note = await notes.createNote({
      title,
      content: buildUrlContent(normalized),
      captureType: 'url',
      sourceUrl: normalized,
    });

    const fetched = await urlMetadata.fetchMetadata(normalized);
    if (fetched.status !== 'ok') return { note, metadata: 'unavailable' };

    const metadata: UrlMetadataDraft = {
      title: fetched.metadata.title,
      description: fetched.metadata.description,
      domain: fetched.metadata.domain,
      previewImageUrl: fetched.metadata.imageUrl,
    };
    const patch = buildUrlEnrichment({
      metadata,
      currentTitle: note.title,
      currentContent: note.content,
      url: normalized,
    });

    // The preview image goes through the normal attachment pipeline, so export/import and
    // reconciliation treat it like any other attachment. Failures are non-fatal.
    if (patch.previewImageUrl) {
      try {
        await attachments.addImageFromUrl({ noteId: note.id, url: patch.previewImageUrl });
      } catch (error) {
        console.warn('[Noto] URL preview image unavailable', error);
      }
    }

    if (patch.title || patch.contentBlock) {
      const refreshed = await notes.getNote(note.id);
      const current = refreshed ?? note;
      const content = patch.contentBlock
        ? `${current.content}\n\n${patch.contentBlock}`
        : current.content;
      const updated = await notes.updateNote(note.id, {
        title: patch.title ?? current.title,
        content,
      });
      note = updated ?? current;
    }
    return { note, metadata: 'applied' };
  }

  /** Creates a text note from shared text; URL-bearing text reuses URL capture. */
  async function saveSharedText(input: {
    text: string;
    title?: string;
  }): Promise<SharedCaptureResult> {
    const text = input.text.trim();
    const route = routeSharePayload({ shareType: 'text', value: text });
    if (route.kind === 'url') {
      const result = await saveUrl({ url: route.url, title: input.title });
      return { kind: 'note', note: result.note, metadata: result.metadata };
    }
    if (route.kind === 'unsupported') return { kind: 'unsupported', reason: route.reason };
    const note = await notes.createNote({
      title: input.title?.trim() ?? '',
      content: text,
      captureType: 'text',
    });
    return { kind: 'note', note, metadata: 'not-a-url' };
  }

  /** Saves a shared image/audio through the existing attachment pipeline. */
  async function saveSharedFile(input: {
    noteId: string;
    route:
      | { kind: 'image'; uri: string; mimeType: string | null; originalName: string | null }
      | { kind: 'audio'; uri: string; mimeType: string | null; originalName: string | null };
  }): Promise<boolean> {
    if (input.route.kind === 'image') {
      await attachments.addImage({
        noteId: input.noteId,
        source: {
          uri: input.route.uri,
          mimeType: input.route.mimeType,
          fileName: input.route.originalName,
        },
      });
      return true;
    }
    await attachments.addAudio({
      noteId: input.noteId,
      sourceUri: input.route.uri,
      mimeType: input.route.mimeType,
      originalName: input.route.originalName,
    });
    return true;
  }

  return {
    saveUrl,

    /**
     * Creates a note for a shared payload and attaches it through the existing flows.
     * Unsupported payloads return a reason and never create an empty note.
     */
    async captureSharedPayload(payload: {
      shareType: string;
      value: string;
      mimeType?: string | null;
      contentUri?: string | null;
      originalName?: string | null;
    }): Promise<SharedCaptureResult> {
      const route = routeSharePayload(payload);
      if (route.kind === 'unsupported') return { kind: 'unsupported', reason: route.reason };
      if (route.kind === 'url') {
        const result = await saveUrl({ url: route.url });
        return { kind: 'note', note: result.note, metadata: result.metadata };
      }
      if (route.kind === 'text') {
        return saveSharedText({ text: route.content });
      }
      if (route.kind === 'file') {
        // Generic file attachments are not part of the MVP.
        return { kind: 'unsupported', reason: 'unsupported-type' };
      }

      const captureType = route.kind === 'image' ? 'image' : 'voice';
      const note = await notes.createNote({ captureType });
      try {
        if (route.kind === 'image' || route.kind === 'audio') {
          await saveSharedFile({ noteId: note.id, route });
        }
      } catch (error) {
        console.error('[Noto] shared attachment failed', error);
        // Never leave an empty note behind when the shared file cannot be stored.
        try {
          await notes.deleteNote(note.id);
        } catch (cleanupError) {
          console.error('[Noto] shared note rollback failed', cleanupError);
        }
        return { kind: 'unsupported', reason: 'unreadable' };
      }
      const refreshed = await notes.getNote(note.id);
      return { kind: 'note', note: refreshed ?? note, metadata: 'not-a-url' };
    },

    /** Exposed for tests: URL-only text detection used by share routing. */
    routeSharePayload,
  };
}
