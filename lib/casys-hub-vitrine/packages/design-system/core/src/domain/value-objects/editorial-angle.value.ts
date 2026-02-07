export class EditorialAngle {
  private constructor(private readonly _value: string) {}

  static create(value: string): EditorialAngle {
    const v = (value ?? '').trim();
    if (!v) throw new Error('EditorialAngle: value is required');
    if (v.length > 480) throw new Error('EditorialAngle: max length is 480');
    // Basic guard against angle being pure markup
    if (/<\/?[a-z][\s\S]*>/i.test(v)) throw new Error('EditorialAngle: HTML is not allowed');
    return new EditorialAngle(v);
  }

  get value(): string {
    return this._value;
  }
}
