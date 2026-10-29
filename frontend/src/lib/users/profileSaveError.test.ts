import { describe, expect, it } from "vitest";
import { AuthApiError } from "../auth/errors";
import { ProfileSaveErrorMapper } from "./profileSaveError";

describe("ProfileSaveErrorMapper duplicate phone", () => {
  it("maps the phone_taken code onto the phone field", () => {
    expect(ProfileSaveErrorMapper.map(new AuthApiError(409, { code: "phone_taken" }))).toEqual({ fieldKeys: { phone: "profile.phoneTaken" }, formKey: null });
  });

  it("does not treat the old English sentence as a duplicate phone", () => {
    expect(ProfileSaveErrorMapper.map(new AuthApiError(409, "User with this phone already exists")).fieldKeys).toEqual({});
  });
});
