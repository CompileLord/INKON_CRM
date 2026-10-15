export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurveVertex {
  index: number;
  value: number;
}

export class MonotoneCurve {
  static splitIntoRuns(values: (number | null)[]): CurveVertex[][] {
    const runs: CurveVertex[][] = [];
    let current: CurveVertex[] = [];
    values.forEach((value, index) => {
      if (value === null) {
        if (current.length > 0) runs.push(current);
        current = [];
        return;
      }
      current.push({ index, value });
    });
    if (current.length > 0) runs.push(current);
    return runs;
  }

  static pathThrough(points: CurvePoint[]): string {
    const count: number = points.length;
    if (count === 0) return "";
    if (count === 1) return `M${points[0].x},${points[0].y}`;
    const widths: number[] = [];
    const slopes: number[] = [];
    for (let index = 0; index < count - 1; index += 1) {
      widths.push(points[index + 1].x - points[index].x);
      slopes.push((points[index + 1].y - points[index].y) / widths[index]);
    }
    const tangents: number[] = new Array<number>(count).fill(0);
    if (count === 2) {
      tangents[0] = slopes[0];
      tangents[1] = slopes[0];
    } else {
      for (let index = 1; index < count - 1; index += 1) {
        const weighted: number = (slopes[index - 1] * widths[index] + slopes[index] * widths[index - 1]) / (widths[index - 1] + widths[index]);
        tangents[index] =
          (Math.sign(slopes[index - 1]) + Math.sign(slopes[index])) *
            Math.min(Math.abs(slopes[index - 1]), Math.abs(slopes[index]), 0.5 * Math.abs(weighted)) || 0;
      }
      tangents[0] = (3 * slopes[0] - tangents[1]) / 2;
      tangents[count - 1] = (3 * slopes[count - 2] - tangents[count - 2]) / 2;
    }
    let path: string = `M${points[0].x},${points[0].y}`;
    for (let index = 0; index < count - 1; index += 1) {
      const third: number = widths[index] / 3;
      const from: CurvePoint = points[index];
      const to: CurvePoint = points[index + 1];
      path += `C${from.x + third},${from.y + tangents[index] * third},${to.x - third},${to.y - tangents[index + 1] * third},${to.x},${to.y}`;
    }
    return path;
  }
}
