const SMS_CODE_SHAPE: RegExp = /^(?=(?:[0-9]*[A-Za-z]){1}[0-9]*$)[0-9A-Za-z]{6}$/;
const PHONE_IDENTIFIER_SHAPE: RegExp = /^\+?[0-9][0-9\s\-()]*$/;

export class SmsCodeNormalizer {
  static normalize(value: string): string {
    const compact: string = value.replace(/\s+/g, "");
    return SMS_CODE_SHAPE.test(compact) ? compact.toUpperCase() : value;
  }

  static normalizeForLogin(identifier: string, value: string): string {
    return PHONE_IDENTIFIER_SHAPE.test(identifier.trim()) ? SmsCodeNormalizer.normalize(value) : value;
  }
}
