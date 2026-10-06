import type { IssueSeverity, ParseIssue } from './schema.ts';

/** Every problem the parser can report; `params` fill the messages below. */
export type IssueCode =
  | 'invalidYaml'
  | 'frontmatterNotMapping'
  | 'fileNameWithoutNumber'
  | 'missingTitle'
  | 'noOptions'
  | 'unknownStatus'
  | 'unmatchedChosenOption'
  | 'duplicateNumber'
  | 'missingReplacement';

export type IssueLanguage = 'en' | 'fr' | 'es';

type Params = Record<string, string>;

const MESSAGES: Record<IssueCode, Record<IssueLanguage, (params: Params) => string>> = {
  invalidYaml: {
    en: (p) => `Invalid YAML front matter: ${p['detail'] ?? ''}`,
    fr: (p) => `Front matter YAML invalide : ${p['detail'] ?? ''}`,
    es: (p) => `Front matter YAML no válido: ${p['detail'] ?? ''}`,
  },
  frontmatterNotMapping: {
    en: () => 'The front matter must be a list of "key: value" entries.',
    fr: () => 'Le front matter doit être une liste de clés « clé: valeur ».',
    es: () => 'El front matter debe ser una lista de entradas «clave: valor».',
  },
  fileNameWithoutNumber: {
    en: (p) => `File name without a number: "${p['file'] ?? ''}" (expected NNNN-title.md).`,
    fr: (p) => `Nom de fichier sans numéro : « ${p['file'] ?? ''} » (attendu : NNNN-titre.md).`,
    es: (p) => `Nombre de archivo sin número: «${p['file'] ?? ''}» (se espera NNNN-titulo.md).`,
  },
  missingTitle: {
    en: () => 'Missing "# …" title.',
    fr: () => 'Titre « # … » introuvable.',
    es: () => 'Falta el título «# …».',
  },
  noOptions: {
    en: () => 'No considered options ("## Considered Options"): the ADR cannot be accepted.',
    fr: () => 'Aucune option envisagée (« ## Considered Options ») : l\'ADR ne pourra pas être validée.',
    es: () => 'Ninguna opción considerada («## Considered Options»): el ADR no podrá aceptarse.',
  },
  unknownStatus: {
    en: (p) => `Unknown status "${p['status'] ?? ''}": read as "proposed".`,
    fr: (p) => `Statut inconnu « ${p['status'] ?? ''} » : lu comme « à décider ».`,
    es: (p) => `Estado desconocido «${p['status'] ?? ''}»: se lee como «por decidir».`,
  },
  unmatchedChosenOption: {
    en: (p) => `Chosen option not among the considered options: ${p['titles'] ?? ''}.`,
    fr: (p) => `Option retenue absente des options envisagées : ${p['titles'] ?? ''}.`,
    es: (p) => `Opción elegida ausente de las opciones consideradas: ${p['titles'] ?? ''}.`,
  },
  duplicateNumber: {
    en: (p) => `Number ${p['id'] ?? ''} already used by ${p['file'] ?? ''}.`,
    fr: (p) => `Numéro ${p['id'] ?? ''} déjà utilisé par ${p['file'] ?? ''}.`,
    es: (p) => `Número ${p['id'] ?? ''} ya usado por ${p['file'] ?? ''}.`,
  },
  missingReplacement: {
    en: (p) => `Superseded by ${p['id'] ?? ''}, which is not in the directory.`,
    fr: (p) => `Remplacée par ${p['id'] ?? ''}, introuvable dans le dossier.`,
    es: (p) => `Reemplazado por ${p['id'] ?? ''}, que no está en la carpeta.`,
  },
};

/** Builds an issue; `message` is the English text (logs), see `issueMessage` for other languages. */
export function makeIssue(line: number, severity: IssueSeverity, code: IssueCode, params: Params = {}): ParseIssue {
  return { line, severity, code, params, message: MESSAGES[code].en(params) };
}

/** Message of an issue in a given language (the UI uses its own language). */
export function issueMessage(issue: ParseIssue, language: IssueLanguage): string {
  return MESSAGES[issue.code][language](issue.params);
}
