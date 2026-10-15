export class JournalScoringRules {
  static readonly MAXIMUM_HOMEWORK_PER_LESSON: number = 5;
  static readonly ATTENDANCE_POINT_PER_LESSON: number = 1;
  static readonly MAXIMUM_BONUS_SCORE: number = 20;

  static maximumPeriodScore(totalLessons: number, examMaximum: number): number {
    return (
      totalLessons * (JournalScoringRules.MAXIMUM_HOMEWORK_PER_LESSON + JournalScoringRules.ATTENDANCE_POINT_PER_LESSON) +
      examMaximum
    );
  }
}
