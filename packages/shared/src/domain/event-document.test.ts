import { describe, expect, it } from "vitest";

import {
  canChangeEventDocuments,
  EVENT_DOCUMENT_MAX_BYTES,
  EVENT_DOCUMENT_TYPES,
  eventDocumentRejection,
} from "./event-document";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("eventDocumentRejection", () => {
  // SPM-37 AC: an organiser can upload PDF, PNG and DOCX files.
  it.each([PDF, "image/png", DOCX])("accepts %s", (type) => {
    expect(eventDocumentRejection({ type, size: 1000 })).toBeUndefined();
  });

  // SPM-37 AC: unsupported files are rejected with a reason.
  it.each(["image/jpeg", "application/zip", "text/plain", ""])("rejects %j with a reason", (type) => {
    expect(eventDocumentRejection({ type, size: 1000 })).toBe("Only PDF, PNG or DOCX files are allowed.");
  });

  // SPM-37 AC: oversized files are rejected with a reason (10 MB is the limit).
  it("accepts a file of exactly 10 MB and rejects one byte more", () => {
    expect(eventDocumentRejection({ type: PDF, size: EVENT_DOCUMENT_MAX_BYTES })).toBeUndefined();
    expect(eventDocumentRejection({ type: PDF, size: EVENT_DOCUMENT_MAX_BYTES + 1 })).toBe("The file must be 10 MB or smaller.");
  });

  it("rejects an empty file", () => {
    expect(eventDocumentRejection({ type: PDF, size: 0 })).toBe("The file is empty.");
  });

  it("names the three allowed extensions", () => {
    expect(Object.values(EVENT_DOCUMENT_TYPES)).toEqual(["pdf", "png", "docx"]);
  });
});

describe("canChangeEventDocuments", () => {
  // SPM-37: documents can be added or removed until the event is finished or refused.
  it.each(["draft", "requested", "planning", "pending_safety_check", "confirmed"])("allows changes while %s", (status) => {
    expect(canChangeEventDocuments(status)).toBe(true);
  });

  it.each(["completed", "cancelled", "rejected"])("blocks changes once %s", (status) => {
    expect(canChangeEventDocuments(status)).toBe(false);
  });
});
