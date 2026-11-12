import { describe, it, expect } from "vitest";
import {
  hasMinimumStaffClientInfo,
  validateStaffClientInput,
} from "./appointmentValidation";

/**
 * Regression suite — protects the admin/barber booking flow against the
 * "email required" bug that disabled the Agendar Cita CTA. See
 * NewAppointment.tsx + WalkIn.tsx.
 */
describe("staff appointment validation — CTA gate (hasMinimumStaffClientInfo)", () => {
  it("enables CTA with first name + phone only (no email)", () => {
    expect(hasMinimumStaffClientInfo({ firstName: "Juan", phone: "787-555-1234" })).toBe(true);
  });

  it("disables CTA when first name is empty", () => {
    expect(hasMinimumStaffClientInfo({ firstName: "   ", phone: "787-555-1234" })).toBe(false);
  });

  it("disables CTA when phone is empty", () => {
    expect(hasMinimumStaffClientInfo({ firstName: "Juan", phone: "" })).toBe(false);
  });

  it("disables CTA when phone is whitespace only", () => {
    expect(hasMinimumStaffClientInfo({ firstName: "Juan", phone: "   " })).toBe(false);
  });

  it("disables CTA when phone is not a valid 10-digit number", () => {
    expect(hasMinimumStaffClientInfo({ firstName: "Juan", phone: "787-555" })).toBe(false);
  });
});

describe("staff appointment validation — submit (validateStaffClientInput)", () => {
  it("accepts name + phone with no email", () => {
    expect(
      validateStaffClientInput({ firstName: "Juan", phone: "787-555-1234" }),
    ).toEqual({ ok: true });
  });

  it("accepts name + phone + last name with no email", () => {
    expect(
      validateStaffClientInput({
        firstName: "Juan",
        lastName: "Rivera",
        phone: "787-555-1234",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts name + phone + valid email", () => {
    expect(
      validateStaffClientInput({
        firstName: "Juan",
        phone: "787-555-1234",
        email: "juan@example.com",
      }),
    ).toEqual({ ok: true });
  });

  it("accepts empty-string email as if missing (optional)", () => {
    expect(
      validateStaffClientInput({
        firstName: "Juan",
        phone: "787-555-1234",
        email: "",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects when first name missing", () => {
    expect(
      validateStaffClientInput({ firstName: "", phone: "787-555-1234" }),
    ).toEqual({ ok: false, reason: "missing_first_name" });
  });

  it("rejects when phone missing", () => {
    expect(
      validateStaffClientInput({ firstName: "Juan", phone: "" }),
    ).toEqual({ ok: false, reason: "missing_phone" });
  });

  it("rejects when phone is whitespace only", () => {
    expect(
      validateStaffClientInput({ firstName: "Juan", phone: "   " }),
    ).toEqual({ ok: false, reason: "missing_phone" });
  });

  it("rejects when phone is incomplete", () => {
    expect(
      validateStaffClientInput({ firstName: "Juan", phone: "787-555" }),
    ).toEqual({ ok: false, reason: "invalid_phone" });
  });

  it("rejects when email is provided but malformed", () => {
    expect(
      validateStaffClientInput({
        firstName: "Juan",
        phone: "787-555-1234",
        email: "not-an-email",
      }),
    ).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("rejects email missing TLD", () => {
    expect(
      validateStaffClientInput({
        firstName: "Juan",
        phone: "787-555-1234",
        email: "juan@example",
      }),
    ).toEqual({ ok: false, reason: "invalid_email" });
  });
});
