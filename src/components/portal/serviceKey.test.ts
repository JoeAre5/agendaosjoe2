import { describe, expect, it } from "vitest";
import { serviceKey } from "./serviceKey";

describe("serviceKey", () => {
  it("una cita de Acuity usa el id numerico del tipo de cita", () => {
    expect(serviceKey({ service_id: 4821, service_ref_id: null })).toBe("4821");
  });
  it("una cita nativa (sin service_id) usa el uuid del servicio local", () => {
    expect(serviceKey({ service_id: null, service_ref_id: "e1d242f2-9164-47da-bbbc-a341053b5069" })).toBe("e1d242f2-9164-47da-bbbc-a341053b5069");
  });
  it("si hay ambos, manda el de Acuity (comportamiento anterior intacto)", () => {
    expect(serviceKey({ service_id: 7, service_ref_id: "uuid" })).toBe("7");
  });
  it("sin ninguno devuelve cadena vacia, nunca 'null' ni 'undefined'", () => {
    expect(serviceKey({})).toBe("");
    expect(serviceKey({ service_id: null, service_ref_id: null })).toBe("");
  });
});
