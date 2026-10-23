export interface CourseChartWindowState {
  offset: number;
  limit: number;
  total: number;
}

export class CourseChartWindow {
  static hasOlder(window: CourseChartWindowState): boolean {
    return window.offset + window.limit < window.total;
  }

  static hasNewer(window: CourseChartWindowState): boolean {
    return window.offset > 0;
  }

  static older(window: CourseChartWindowState): number {
    return CourseChartWindow.hasOlder(window) ? window.offset + window.limit : window.offset;
  }

  static newer(window: CourseChartWindowState): number {
    return Math.max(0, window.offset - window.limit);
  }

  static pointValues(values: (number | null)[], pointCount: number): (number | null)[] {
    return values.slice(0, pointCount);
  }

  static trailingAverage(values: (number | null)[], pointCount: number): number | null {
    return values.length > pointCount ? values[values.length - 1] : null;
  }
}
