const STUDENT_CODE_SHAPE: RegExp = /^[0-9]{5}[A-Za-z]$/;

export function normalizeStudentCode(value: string): string {
  return STUDENT_CODE_SHAPE.test(value) ? value.toUpperCase() : value;
}
