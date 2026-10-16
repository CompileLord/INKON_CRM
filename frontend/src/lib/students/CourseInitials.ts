export class CourseInitials {
  static of(title: string): string {
    const words: string[] = title.trim().split(/\s+/).filter((word) => word.length > 0);
    return words.slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase() ?? "").join("");
  }
}
