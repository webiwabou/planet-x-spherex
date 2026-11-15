// The backend writes its series notes in Spanish; the interface shows them in English
const PROBLEMS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/IRSA no entregó (\d+) de los recortes/i, (m) => `IRSA did not deliver ${m[1]} of the selected cutouts, so this series may be incomplete.`],
  [/IRSA no respondió para (\w+)/i, (m) => `IRSA did not answer for ${m[1]}, so only the other release was searched.`],
  [/more observations than returned/i, () => "This field has more observations than the archive returned."],
];

const INFO: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/Se examinaron (\d+) de (\d+) candidatos/i, (m) => `${m[1]} of ${m[2]} observations checked for a matching band`],
  [/Se usó la versión de calibración (\S+?)(?: para|$)/i, (m) => `calibration ${m[1]} only, so the exposures compare`],
];

export function archiveNotes(warnings: readonly string[] = []): { problems: string[]; info: string[] } {
  const problems: string[] = [];
  const info: string[] = [];
  for (const text of warnings) {
    const problem = PROBLEMS.find(([re]) => re.test(text));
    const note = INFO.find(([re]) => re.test(text));
    if (problem) problems.push(problem[1](text.match(problem[0])!));
    else if (note) info.push(note[1](text.match(note[0])!));
    else problems.push(text);
  }
  return { problems, info };
}
