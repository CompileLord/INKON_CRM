import { AuthApiError, NetworkError } from "../auth/errors";
import { ApiErrorCodes } from "../auth/apiErrorCodes";

export type ProfileField = "firstName" | "lastName" | "phone";

export interface ProfileSaveFailure {
  fieldKeys: Partial<Record<ProfileField, string>>;
  formKey: string | null;
}

const BODY_FIELD_TO_PROFILE_FIELD: Readonly<Record<string, ProfileField>> = {
  first_name: "firstName",
  last_name: "lastName",
  phone: "phone",
};

export class ProfileSaveErrorMapper {
  static map(error: unknown): ProfileSaveFailure {
    if (error instanceof NetworkError) return { fieldKeys: {}, formKey: "saveBar.network" };
    if (!(error instanceof AuthApiError)) return { fieldKeys: {}, formKey: "saveBar.failed" };
    if (error.status === 409 && ApiErrorCodes.is(error, "phone_taken")) {
      return { fieldKeys: { phone: "profile.phoneTaken" }, formKey: null };
    }
    if (error.status === 422 && Array.isArray(error.detail)) {
      const fieldKeys: Partial<Record<ProfileField, string>> = {};
      for (const item of error.detail) {
        const field: ProfileField | undefined = BODY_FIELD_TO_PROFILE_FIELD[String(item.loc[item.loc.length - 1])];
        if (field) fieldKeys[field] = field === "phone" ? "profile.phoneInvalid" : "profile.nameRequired";
      }
      if (Object.keys(fieldKeys).length > 0) return { fieldKeys, formKey: null };
    }
    if (error.status === 400 && ProfileSaveErrorMapper.mentionsPhone(error)) {
      return { fieldKeys: { phone: "profile.phoneInvalid" }, formKey: null };
    }
    if (error.status === 429) return { fieldKeys: {}, formKey: "saveBar.rateLimited" };
    return { fieldKeys: {}, formKey: "saveBar.failed" };
  }

  private static mentionsPhone(error: AuthApiError): boolean {
    return typeof error.detail === "string" && error.detail.toLowerCase().includes("phone");
  }
}
