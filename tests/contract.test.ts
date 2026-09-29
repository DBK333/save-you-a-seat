import Ajv from "ajv";
import type { AnySchema } from "ajv";
import addFormats from "ajv-formats";
import SwaggerParser from "@apidevtools/swagger-parser";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DemoService } from "../src/services/demo";
import { facilities, demoUsers, initialGuides } from "../src/data/fixtures";

describe("versioned API contract", () => {
  it("is a valid self-contained OpenAPI 3 contract", async () => {
    const doc = JSON.parse(
      readFileSync(resolve("contracts/openapi.json"), "utf8"),
    );
    const api = await SwaggerParser.validate(doc);
    expect(api.info.version).toBe("1.1.0");
  });
  it("requires authentication for all writes and staff routes", () => {
    const doc = JSON.parse(
      readFileSync(resolve("contracts/openapi.json"), "utf8"),
    );
    for (const [path, methods] of Object.entries(doc.paths))
      for (const [method, operation] of Object.entries(
        methods as Record<string, { security: unknown[] }>,
      )) {
        if (method !== "get" || path.startsWith("/staff/"))
          expect(operation.security, `${method} ${path}`).toEqual([
            { CognitoAccessToken: [] },
          ]);
      }
  });
  it("publishes guide counts without account IDs and supplies signed S3 POST fields", () => {
    const doc = JSON.parse(
      readFileSync(resolve("contracts/openapi.json"), "utf8"),
    );
    const examples = JSON.parse(
      readFileSync(
        resolve("contracts/examples/requests-responses.json"),
        "utf8",
      ),
    );
    const schema = doc.components.schemas.PublicGuide;
    expect(schema.properties).not.toHaveProperty("authorId");
    expect(schema.properties).not.toHaveProperty("confirmations");
    expect(examples.publicGuide.confirmationCount).toBe(3);
    expect(examples.publicGuide).not.toHaveProperty("authorId");
    expect(examples.publicGuide).not.toHaveProperty("confirmations");
    expect(doc.components.schemas.UploadTicket.required).toEqual(
      expect.arrayContaining(["method", "fields"]),
    );
  });
  it("sample fixtures have both kinds, real coordinate ranges, unique ids, and valid guide links", () => {
    expect(new Set(facilities.map((f) => f.type))).toEqual(
      new Set(["toilet", "meeting_room"]),
    );
    expect(new Set(facilities.map((f) => f.id)).size).toBe(facilities.length);
    for (const f of facilities) {
      expect(f.sample).toBe(true);
      expect(f.countryCode).toBe("AU");
      expect(f.area).toBe("cremorne");
      expect(f.location.lat).toBeGreaterThan(-37.84);
      expect(f.location.lat).toBeLessThan(-37.82);
      expect(f.location.lng).toBeGreaterThan(144.98);
      expect(f.location.lng).toBeLessThan(145.01);
    }
    for (const g of initialGuides) {
      expect(facilities.some((f) => f.id === g.facilityId)).toBe(true);
      expect(demoUsers.some((u) => u.id === g.authorId)).toBe(true);
      expect(g.steps.length).toBeGreaterThan(0);
    }
  });
});

const readContract = () =>
  JSON.parse(readFileSync(resolve("contracts/openapi.json"), "utf8"));
const readExamples = () =>
  JSON.parse(
    readFileSync(resolve("contracts/examples/requests-responses.json"), "utf8"),
  );

/** Shape checks only: this is not an HTTP adapter or deployed API conformance test. */
async function assertPayload(
  schemaName: string,
  payload: unknown,
  expected = true,
) {
  const api = (await SwaggerParser.dereference(readContract())) as unknown as {
    components: { schemas: Record<string, AnySchema> };
  };
  const schema = api.components.schemas[schemaName];
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  let valid = false;
  let compiled = false;
  let diagnostics: unknown;
  try {
    const validate = ajv.compile(schema);
    compiled = true;
    valid = validate(payload) as boolean;
    diagnostics = validate.errors;
  } catch (error) {
    diagnostics = error instanceof Error ? error.message : String(error);
  }
  expect(valid, `${schemaName}: ${JSON.stringify(diagnostics)}`).toBe(expected);
  expect(compiled, `${schemaName} must compile before payload validation`).toBe(
    true,
  );
}

describe("contract payload compatibility", () => {
  it("allows optional guide pins only within the supported Melbourne focus area", async () => {
    const input = {
      facilityId: facilities[0].id,
      title: "Entrance",
      steps: [],
    };
    await assertPayload("GuideInput", input);
    await assertPayload("GuideInput", {
      ...input,
      entranceLocation: { lat: -37.7983, lng: 144.961 },
    });
    await assertPayload(
      "GuideInput",
      { ...input, entranceLocation: { lat: -33.8688, lng: 151.2093 } },
      false,
    );
    await assertPayload(
      "PublicGuide",
      {
        ...readExamples().publicGuide,
        entranceLocation: { lat: 51.5072, lng: -0.1276 },
      },
      false,
    );
  });
  it("requires the supported Australian catalog identity on facility payloads", async () => {
    await assertPayload("Facility", facilities[0]);
    await assertPayload(
      "Facility",
      { ...facilities[0], countryCode: "NZ" },
      false,
    );
    await assertPayload(
      "Facility",
      { ...facilities[0], area: "parkville" },
      false,
    );
    await assertPayload(
      "Facility",
      { ...facilities[0], location: { lat: -37.7983, lng: 144.961 } },
      false,
    );
    await assertPayload(
      "Facility",
      { ...facilities[0], entranceLocation: { lat: -33.86, lng: 151.21 } },
      false,
    );
    const { countryCode: _countryCode, ...missingCountry } = facilities[0];
    await assertPayload("Facility", missingCountry, false);
  });
  it("accepts a facility with no published guide and with a redacted guide", async () => {
    await assertPayload("FacilityDetails", {
      facility: facilities[0],
      guide: null,
    });
    await assertPayload("FacilityDetails", {
      facility: facilities[0],
      guide: readExamples().publicGuide,
    });
    await assertPayload(
      "FacilityDetails",
      { facility: facilities[0], guide: {} },
      false,
    );
  });

  it("validates every shared request/response example against its schema", async () => {
    const examples = readExamples();
    const schemas: Record<string, string> = {
      facility: "Facility",
      bookingRequest: "BookingInput",
      bookingResponse: "Booking",
      conflict: "Error",
      publicGuide: "PublicGuide",
    };
    expect(Object.keys(schemas).sort()).toEqual(Object.keys(examples).sort());
    for (const [key, schema] of Object.entries(schemas))
      await assertPayload(schema, examples[key]);
  });

  it("rejects account IDs or insufficient confirmations in a public guide", async () => {
    const guide = readExamples().publicGuide;
    await assertPayload(
      "PublicGuide",
      { ...guide, authorId: "user-alex" },
      false,
    );
    await assertPayload(
      "PublicGuide",
      { ...guide, confirmations: ["user-alex", "user-jamie", "user-sam"] },
      false,
    );
    await assertPayload(
      "PublicGuide",
      { ...guide, confirmationCount: 2 },
      false,
    );
  });

  it("matches draft and booking objects produced by the local demo", async () => {
    const service = new DemoService({
      storage: null,
      now: () => new Date("2026-10-01T00:00:00Z"),
    });
    service.login("user-alex");
    const input = { facilityId: facilities[0].id, title: "", steps: [] };
    await assertPayload("GuideInput", input);
    await assertPayload("GuideVersion", service.saveDraft(input));
    await assertPayload("Booking", service.book(readExamples().bookingRequest));
  });

  it("validates a public projection of a community-published local guide", async () => {
    const service = new DemoService({ storage: null });
    const pending = service
      .getSnapshot()
      .guides.find((guide) => guide.status === "pending")!;
    service.login("user-alex");
    service.confirmGuide(pending.id);
    service.login("user-sam");
    service.confirmGuide(pending.id);
    const published = service
      .getSnapshot()
      .guides.find((guide) => guide.id === pending.id)!;
    expect(published.status).toBe("published");
    // Deliberate DTO projection; the local state contains identities and is never
    // asserted to be a public HTTP response.
    const projection = {
      id: published.id,
      guideId: published.guideId,
      facilityId: published.facilityId,
      title: published.title,
      steps: published.steps,
      confirmationCount: published.confirmations.length,
      publishedAt: published.publishedAt,
    };
    await assertPayload("PublicGuide", projection);
    await assertPayload("PublicGuide", published, false);
  });

  it("rejects malformed timestamps and incomplete booking payloads", async () => {
    const booking = readExamples().bookingRequest;
    await assertPayload(
      "BookingInput",
      { ...booking, start: "not-a-timestamp" },
      false,
    );
    await assertPayload(
      "BookingInput",
      { ...booking, start: "2026-02-30T10:00:00Z" },
      false,
    );
    await assertPayload("BookingInput", { ...booking, duration: 45 }, false);
    const { requestId: _requestId, ...incomplete } = booking;
    await assertPayload("BookingInput", incomplete, false);
  });

  it("matches the report and moderation text bounds enforced by the demo", async () => {
    await assertPayload("ReportInput", { reason: "x".repeat(120) });
    await assertPayload("ReportInput", { reason: "x".repeat(121) }, false);
    await assertPayload("DecisionInput", {
      action: "remove",
      reason: "x".repeat(1000),
    });
    await assertPayload(
      "DecisionInput",
      { action: "remove", reason: "x".repeat(1001) },
      false,
    );
  });

  it("requires the complete S3 POST ticket and rejects a fields-free ticket", async () => {
    const ticket = {
      id: "upload-example",
      uploadUrl: "https://images.example.invalid",
      expiresAt: "2026-10-01T00:05:00Z",
      method: "POST",
      fields: {
        key: "temporary/user/upload",
        policy: "example-policy",
        "x-amz-signature": "example-signature",
      },
    };
    await assertPayload("UploadTicket", ticket);
    const { fields: _fields, ...incomplete } = ticket;
    await assertPayload("UploadTicket", incomplete, false);
  });
});
