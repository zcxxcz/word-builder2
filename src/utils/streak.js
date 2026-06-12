import { addDaysToStudyDate, getToday } from './srs.js';

/**
 * Calculate the consecutive-study-day streak from session study dates.
 * Strict rule: missing a day resets the streak to 0. When today has no
 * record yet, a streak that ran through yesterday still counts, with
 * studiedToday=false so the UI can prompt today's check-in.
 *
 * @param {Iterable<string>} studyDates - YYYY-MM-DD study-day strings (China study day)
 * @param {string} today - YYYY-MM-DD study day, defaults to the current China study day
 * @returns {{ streak: number, studiedToday: boolean }}
 */
export function calculateStreak(studyDates, today = getToday()) {
    const dates = new Set(studyDates || []);
    const studiedToday = dates.has(today);

    let streak = 0;
    let cursor = studiedToday ? today : addDaysToStudyDate(today, -1);
    while (dates.has(cursor)) {
        streak++;
        cursor = addDaysToStudyDate(cursor, -1);
    }

    return { streak, studiedToday };
}
