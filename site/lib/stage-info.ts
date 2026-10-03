/**
 * What thepekoetrail.org/pekoe-stages says about a stage, for its card on the Trail page.
 */
export interface StageInfo {
  number: number;
  from: string;
  to: string;
  km: number;
  miles: number;
  /** Walking time, as the website words it */
  duration: string;
  difficulty: 'Easy' | 'Moderate' | 'Difficult' | 'Hard';
  /** Open shorter than 6am to 6pm, such as in a wildlife corridor */
  specialHours: boolean;
}

const STAGES: StageInfo[] = [
  { number: 1, from: 'Hanthana', to: 'Galaha', km: 12.84, miles: 7.98, duration: '4 hours', difficulty: 'Easy', specialHours: false },
  { number: 2, from: 'Galaha', to: 'Loolkandura', km: 14.7, miles: 9.13, duration: '5 hours', difficulty: 'Difficult', specialHours: false },
  { number: 3, from: 'Loolkandura', to: 'Tawalantanne', km: 18.11, miles: 11.25, duration: '6 hours', difficulty: 'Difficult', specialHours: false },
  { number: 4, from: 'Tawalantanne', to: 'Pundaluoya', km: 15.53, miles: 9.65, duration: '4 hours 30 minutes', difficulty: 'Difficult', specialHours: false },
  { number: 5, from: 'Pundaluoya', to: 'Watagoda', km: 14.31, miles: 8.89, duration: '4 hours 30 minutes', difficulty: 'Moderate', specialHours: true },
  { number: 6, from: 'Watagoda', to: 'Kotagala', km: 14.97, miles: 9.3, duration: '4 hours 30 minutes', difficulty: 'Easy', specialHours: true },
  { number: 7, from: 'Kotagala', to: 'Norwood', km: 16.48, miles: 10.24, duration: '5 hours', difficulty: 'Moderate', specialHours: true },
  { number: 8, from: 'Norwood', to: 'Bogawantalawa', km: 15.93, miles: 9.89, duration: '4 hours 30 minutes', difficulty: 'Moderate', specialHours: true },
  { number: 9, from: 'Bogawantalawa', to: 'Dayagama', km: 17.13, miles: 10.64, duration: '5 hours', difficulty: 'Hard', specialHours: false },
  { number: 10, from: 'Dayagama', to: 'Horton Plains', km: 15.88, miles: 9.86, duration: '5 hours', difficulty: 'Difficult', specialHours: true },
  { number: 11, from: 'Horton Plains', to: 'Udaweriya', km: 14.3, miles: 8.88, duration: '4 hours', difficulty: 'Moderate', specialHours: true },
  { number: 12, from: 'Udaweriya', to: 'Haputale', km: 19.68, miles: 12.22, duration: '6 hours', difficulty: 'Difficult', specialHours: false },
  { number: 13, from: 'Haputale', to: "St. Catherine's", km: 14.6, miles: 9.07, duration: '4 hours', difficulty: 'Hard', specialHours: false },
  { number: 14, from: "St. Catherine's", to: 'Makulella', km: 9.36, miles: 5.81, duration: '3 hours', difficulty: 'Moderate', specialHours: false },
  { number: 15, from: 'Makulella', to: 'Ella', km: 9.61, miles: 5.97, duration: '3 hours', difficulty: 'Moderate', specialHours: false },
  { number: 16, from: 'Ella', to: 'Demodara', km: 9.5, miles: 5.9, duration: '3 hours', difficulty: 'Easy', specialHours: false },
  { number: 17, from: 'Demodara', to: 'Hali Ela', km: 13.15, miles: 8.17, duration: '4 hours 30 minutes', difficulty: 'Moderate', specialHours: false },
  { number: 18, from: 'Hali Ela', to: 'Etampitiya', km: 14.68, miles: 9.12, duration: '6 hours', difficulty: 'Hard', specialHours: false },
  { number: 19, from: 'Etampitiya', to: 'Loonuwatte', km: 21, miles: 13.04, duration: '6 hours', difficulty: 'Difficult', specialHours: false },
  { number: 20, from: 'Loonuwatte', to: 'Udapussellawa', km: 13.63, miles: 8.46, duration: '4 hours 30 minutes', difficulty: 'Moderate', specialHours: false },
  { number: 21, from: 'Udapussellawa', to: 'Kandapola', km: 16.9, miles: 10.5, duration: '5 hours 30 minutes', difficulty: 'Difficult', specialHours: false },
  { number: 22, from: 'Kandapola', to: 'Pedro', km: 11.3, miles: 7.02, duration: '4 hours 30 minutes', difficulty: 'Moderate', specialHours: false },
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

/**
 * Shortens a walking time for a stage card.
 *
 * @param duration The website's wording, such as `4 hours 30 minutes`.
 * @returns The short form, such as `4h 30m`, or the wording unchanged when it doesn't match.
 */
export function shortDuration(duration: string): string {
  const match = /^(\d+) hours?(?: (\d+) minutes)?$/.exec(duration);
  return match ? `${match[1]}h${match[2] ? ` ${match[2]}m` : ''}` : duration;
}
