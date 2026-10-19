export class HttpError extends Error {
  constructor(status, code, message, fieldErrors) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
export const fail = (status, code, message, fieldErrors) => { throw new HttpError(status, code, message, fieldErrors); };
