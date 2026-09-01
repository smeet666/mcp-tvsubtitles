/**
 * What a read gives back, whatever it read.
 *
 * `cached` lets an answer say it cost the site nothing. `skipped` is present
 * only when rows were dropped, so a caller that ignores it still gets correct
 * data and a caller that reads it can say what was left out.
 */
export interface Read<T> {
  data: T;
  cached: boolean;
  skipped?: number;
}
