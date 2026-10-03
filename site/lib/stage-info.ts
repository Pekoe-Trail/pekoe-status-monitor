export interface StageInfo {
  number: number;
  from: string;
  to: string;
}

const STAGES: StageInfo[] = [
  { number: 1, from: 'Hanthana', to: 'Galaha' },
  { number: 2, from: 'Galaha', to: 'Loolkandura' },
  { number: 3, from: 'Loolkandura', to: 'Tawalantanne' },
  { number: 4, from: 'Tawalantanne', to: 'Pundaluoya' },
  { number: 5, from: 'Pundaluoya', to: 'Watagoda' },
  { number: 6, from: 'Watagoda', to: 'Kotagala' },
  { number: 7, from: 'Kotagala', to: 'Norwood' },
  { number: 8, from: 'Norwood', to: 'Bogawantalawa' },
  { number: 9, from: 'Bogawantalawa', to: 'Dayagama' },
  { number: 10, from: 'Dayagama', to: 'Horton Plains' },
  { number: 11, from: 'Horton Plains', to: 'Udaweriya' },
  { number: 12, from: 'Udaweriya', to: 'Haputale' },
  { number: 13, from: 'Haputale', to: "St. Catherine's" },
  { number: 14, from: "St. Catherine's", to: 'Makulella' },
  { number: 15, from: 'Makulella', to: 'Ella' },
  { number: 16, from: 'Ella', to: 'Demodara' },
  { number: 17, from: 'Demodara', to: 'Hali Ela' },
  { number: 18, from: 'Hali Ela', to: 'Etampitiya' },
  { number: 19, from: 'Etampitiya', to: 'Loonuwatte' },
  { number: 20, from: 'Loonuwatte', to: 'Udapussellawa' },
  { number: 21, from: 'Udapussellawa', to: 'Kandapola' },
  { number: 22, from: 'Kandapola', to: 'Pedro' },
];

/**
 * Looks up a stage's details.
 *
 * @param number The stage number.
 * @returns Its details, or undefined for a stage the website doesn't list.
 */
export const stageInfo = (number: number): StageInfo | undefined =>
  STAGES.find((stage) => stage.number === number);

/**
 * Builds the path of a stage's illustrated map.
 *
 * @param number The stage number.
 * @returns Its path, such as `/maps/stage-05.webp`.
 */
export const stageMap = (number: number) => `/maps/stage-${String(number).padStart(2, '0')}.webp`;

