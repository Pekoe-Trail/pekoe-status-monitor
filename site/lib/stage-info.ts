export interface StageInfo {
  number: number;
  from: string;
  to: string;
  specialHours: boolean;
}

const STAGES: StageInfo[] = [
  { number: 1, from: 'Hanthana', to: 'Galaha', specialHours: false },
  { number: 2, from: 'Galaha', to: 'Loolkandura', specialHours: false },
  { number: 3, from: 'Loolkandura', to: 'Tawalantanne', specialHours: false },
  { number: 4, from: 'Tawalantanne', to: 'Pundaluoya', specialHours: false },
  { number: 5, from: 'Pundaluoya', to: 'Watagoda', specialHours: true },
  { number: 6, from: 'Watagoda', to: 'Kotagala', specialHours: true },
  { number: 7, from: 'Kotagala', to: 'Norwood', specialHours: true },
  { number: 8, from: 'Norwood', to: 'Bogawantalawa', specialHours: true },
  { number: 9, from: 'Bogawantalawa', to: 'Dayagama', specialHours: false },
  { number: 10, from: 'Dayagama', to: 'Horton Plains', specialHours: true },
  { number: 11, from: 'Horton Plains', to: 'Udaweriya', specialHours: true },
  { number: 12, from: 'Udaweriya', to: 'Haputale', specialHours: false },
  { number: 13, from: 'Haputale', to: "St. Catherine's", specialHours: false },
  { number: 14, from: "St. Catherine's", to: 'Makulella', specialHours: false },
  { number: 15, from: 'Makulella', to: 'Ella', specialHours: false },
  { number: 16, from: 'Ella', to: 'Demodara', specialHours: false },
  { number: 17, from: 'Demodara', to: 'Hali Ela', specialHours: false },
  { number: 18, from: 'Hali Ela', to: 'Etampitiya', specialHours: false },
  { number: 19, from: 'Etampitiya', to: 'Loonuwatte', specialHours: false },
  { number: 20, from: 'Loonuwatte', to: 'Udapussellawa', specialHours: false },
  { number: 21, from: 'Udapussellawa', to: 'Kandapola', specialHours: false },
  { number: 22, from: 'Kandapola', to: 'Pedro', specialHours: false },
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

