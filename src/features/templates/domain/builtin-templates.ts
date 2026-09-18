/**
 * Built-in templates (docs/DATABASE.md §4.7, PRD §10.7). Stable IDs so seeding is
 * idempotent across restarts and migrations. Copy is Indonesian (default UI language).
 */
export type BuiltinTemplate = {
  id: string;
  name: string;
  description: string;
  content: string;
};

export const BUILT_IN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Fleeting Note',
    description: 'Catatan cepat tanpa struktur.',
    content: '## Catatan Cepat\n\n',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Permanent Note',
    description: 'Catatan yang sudah dirapikan dan permanen.',
    content: '## Catatan Permanen\n\n**Ide utama:**\n\n**Penjelasan:**\n',
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'Idea',
    description: 'Menangkap ide mentah.',
    content: '## Ide\n\n**Masalah:**\n\n**Gagasan:**\n',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    name: 'Meeting Note',
    description: 'Catatan rapat.',
    content:
      '## Catatan Rapat\n\n**Peserta:**\n\n**Agenda:**\n\n**Keputusan:**\n\n**Tindak lanjut:**\n',
  },
  {
    id: '00000000-0000-4000-8000-000000000005',
    name: 'Literature Note',
    description: 'Catatan dari sumber bacaan.',
    content: '## Catatan Literatur\n\n**Sumber:**\n\n**Ringkasan:**\n\n**Kutipan penting:**\n',
  },
];
