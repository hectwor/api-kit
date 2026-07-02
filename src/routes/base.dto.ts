export class BaseDTO {
  id?: string;
  createdAt?: string;
  updatedAt?: string;

  constructor(data?: Partial<BaseDTO>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}
