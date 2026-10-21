export class CanonicalPhone {
  static readonly pattern: RegExp = /^\+[1-9][0-9]{1,14}$/;
  static readonly studentPattern: RegExp = /^\+[1-9][0-9]{7,14}$/;

  static valid(value: string, student: boolean = false): boolean {
    return (student ? this.studentPattern : this.pattern).exec(value)?.[0] === value;
  }

  static prefill(value: string | null | undefined): string {
    if (value == null) return "";
    return /^[1-9][0-9]{1,14}$/.exec(value)?.[0] === value ? `+${value}` : value;
  }
}
