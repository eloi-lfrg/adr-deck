import type { Status } from '@adr/format';

export const EXPORT_LANGUAGES = ['en', 'fr', 'es'] as const;
export type ExportLanguage = (typeof EXPORT_LANGUAGES)[number];

export function isExportLanguage(value: string): value is ExportLanguage {
  return (EXPORT_LANGUAGES as readonly string[]).includes(value);
}

/** Cell fills for statuses, matching the app palette (desaturated tints). */
export const STATUS_COLORS: Record<Status, string> = {
  'à décider': 'E2E6EC',
  validée: 'DCE8DA',
  refusée: 'F2D9D3',
  reportée: 'F6E7C6',
  remplacée: 'E7E5E4',
  obsolète: 'EDEBE9',
};

export interface Labels {
  /** Separator between a label and its value (« : » in French). */
  colon: string;
  empty: string;
  source: string;
  generated: string;
  summary: string;
  id: string;
  title: string;
  status: string;
  file: string;
  tags: string;
  deciders: string;
  context: string;
  drivers: string;
  options: string;
  pros: string;
  cons: string;
  decision: string;
  retained: string;
  date: string;
  nextReview: string;
  replacedBy: string;
  comment: string;
  description: string;
  statuses: Record<Status, string>;
}

export const LABELS: Record<ExportLanguage, Labels> = {
  en: {
    colon: ': ',
    empty: '—',
    source: 'Directory',
    generated: 'Generated on',
    summary: 'ADR summary',
    id: 'ID',
    title: 'Title',
    status: 'Status',
    file: 'File',
    tags: 'Tags',
    deciders: 'Decision makers',
    context: 'Context',
    drivers: 'Decision drivers',
    options: 'Considered options',
    pros: 'Pro',
    cons: 'Con',
    decision: 'Decision',
    retained: 'Chosen options',
    date: 'Date',
    nextReview: 'Next review',
    replacedBy: 'Superseded by',
    comment: 'Comment',
    description: 'Exported by adr-deck',
    statuses: { 'à décider': 'proposed', validée: 'accepted', refusée: 'rejected', reportée: 'deferred', remplacée: 'superseded', obsolète: 'deprecated' },
  },
  fr: {
    colon: ' : ',
    empty: '—',
    source: 'Dossier',
    generated: 'Généré le',
    summary: 'Récapitulatif des ADR',
    id: 'ID',
    title: 'Titre',
    status: 'Statut',
    file: 'Fichier',
    tags: 'Tags',
    deciders: 'Décideurs',
    context: 'Contexte',
    drivers: 'Critères de décision',
    options: 'Options envisagées',
    pros: 'Pour',
    cons: 'Contre',
    decision: 'Décision',
    retained: 'Options retenues',
    date: 'Date',
    nextReview: 'Prochaine revue',
    replacedBy: 'Remplacée par',
    comment: 'Commentaire',
    description: 'Exporté par adr-deck',
    statuses: { 'à décider': 'à décider', validée: 'validée', refusée: 'refusée', reportée: 'reportée', remplacée: 'remplacée', obsolète: 'obsolète' },
  },
  es: {
    colon: ': ',
    empty: '—',
    source: 'Carpeta',
    generated: 'Generado el',
    summary: 'Resumen de los ADR',
    id: 'ID',
    title: 'Título',
    status: 'Estado',
    file: 'Archivo',
    tags: 'Etiquetas',
    deciders: 'Responsables de la decisión',
    context: 'Contexto',
    drivers: 'Criterios de decisión',
    options: 'Opciones consideradas',
    pros: 'A favor',
    cons: 'En contra',
    decision: 'Decisión',
    retained: 'Opciones elegidas',
    date: 'Fecha',
    nextReview: 'Próxima revisión',
    replacedBy: 'Reemplazado por',
    comment: 'Comentario',
    description: 'Exportado por adr-deck',
    statuses: { 'à décider': 'por decidir', validée: 'aceptado', refusée: 'rechazado', reportée: 'aplazado', remplacée: 'reemplazado', obsolète: 'obsoleto' },
  },
};
