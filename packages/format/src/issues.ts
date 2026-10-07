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
  | 'missingReplacement'
  | 'missingContext'
  | 'missingOutcome'
  | 'missingConfirmation'
  | 'markdownlint';

export type IssueLanguage = 'en' | 'fr' | 'es';

type Params = Record<string, string>;

/** What each markdownlint rule checked by `validate --strict` asks for. */
const MARKDOWNLINT_TEXT: Record<string, Record<IssueLanguage, string>> = {
  MD001: { en: 'heading levels should only increment by one level at a time', fr: 'les niveaux de titre ne doivent augmenter que d\'un cran à la fois', es: 'los niveles de encabezado solo deben aumentar de uno en uno' },
  MD004: { en: 'unordered list style should be consistent', fr: 'le style des listes à puces doit être cohérent', es: 'el estilo de las listas sin orden debe ser coherente' },
  MD009: { en: 'trailing spaces', fr: 'espaces en fin de ligne', es: 'espacios al final de la línea' },
  MD010: { en: 'hard tabs', fr: 'tabulations', es: 'tabulaciones' },
  MD012: { en: 'multiple consecutive blank lines', fr: 'plusieurs lignes vides consécutives', es: 'varias líneas en blanco consecutivas' },
  MD018: { en: 'no space after the hash of a heading', fr: 'pas d\'espace après le # d\'un titre', es: 'falta un espacio tras la # de un encabezado' },
  MD019: { en: 'multiple spaces after the hash of a heading', fr: 'plusieurs espaces après le # d\'un titre', es: 'varios espacios tras la # de un encabezado' },
  MD022: { en: 'headings should be surrounded by blank lines', fr: 'un titre doit être entouré de lignes vides', es: 'los encabezados deben estar rodeados de líneas en blanco' },
  MD023: { en: 'headings must start at the beginning of the line', fr: 'un titre doit commencer en début de ligne', es: 'los encabezados deben empezar al principio de la línea' },
  MD025: { en: 'multiple top-level headings in the same document', fr: 'plusieurs titres de premier niveau dans le document', es: 'varios encabezados de primer nivel en el documento' },
  MD031: { en: 'fenced code blocks should be surrounded by blank lines', fr: 'un bloc de code doit être entouré de lignes vides', es: 'los bloques de código deben estar rodeados de líneas en blanco' },
  MD032: { en: 'lists should be surrounded by blank lines', fr: 'une liste doit être entourée de lignes vides', es: 'las listas deben estar rodeadas de líneas en blanco' },
  MD034: { en: 'bare URL used', fr: 'URL nue (à écrire <url> ou [texte](url))', es: 'URL sin formato (usar <url> o [texto](url))' },
  MD040: { en: 'fenced code blocks should have a language specified', fr: 'un bloc de code doit préciser son langage', es: 'los bloques de código deben indicar su lenguaje' },
  MD041: { en: 'first line in a file should be a top-level heading', fr: 'la première ligne doit être un titre de premier niveau', es: 'la primera línea debe ser un encabezado de primer nivel' },
  MD047: { en: 'files should end with a single newline character', fr: 'le fichier doit se terminer par un seul saut de ligne', es: 'el archivo debe terminar con un único salto de línea' },
};

function markdownlintMessage(params: Params, language: IssueLanguage): string {
  const rule = params['rule'] ?? '';
  return `${rule} (markdownlint): ${MARKDOWNLINT_TEXT[rule]?.[language] ?? ''}`;
}

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
  missingContext: {
    en: () => 'No "## Context and Problem Statement": every MADR template has one.',
    fr: () => 'Pas de « ## Context and Problem Statement » : tous les modèles MADR en ont un.',
    es: () => 'Falta «## Context and Problem Statement»: todas las plantillas MADR lo incluyen.',
  },
  missingOutcome: {
    en: () => 'Decided ADR without a "## Decision Outcome" sentence.',
    fr: () => 'ADR décidée sans phrase « ## Decision Outcome ».',
    es: () => 'ADR decidido sin frase «## Decision Outcome».',
  },
  missingConfirmation: {
    en: () => 'Accepted ADR without "### Confirmation": how will its implementation be checked?',
    fr: () => 'ADR acceptée sans « ### Confirmation » : comment vérifiera-t-on sa mise en œuvre ?',
    es: () => 'ADR aceptado sin «### Confirmation»: ¿cómo se comprobará su implementación?',
  },
  markdownlint: {
    en: (p) => markdownlintMessage(p, 'en'),
    fr: (p) => markdownlintMessage(p, 'fr'),
    es: (p) => markdownlintMessage(p, 'es'),
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
