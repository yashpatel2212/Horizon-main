import test from "node:test";
import assert from "node:assert/strict";
import { agentFor, jsonFromModel } from "../services/travelAgents.js";
import { isFutureDate, isPositiveInteger, validateBookingInput } from "../controllers/aiController.js";

test("routes booking and itinerary messages to their dedicated agents", () => {
  assert.equal(agentFor("Book the Goa tour"), "booking");
  assert.equal(agentFor("Plan a three day itinerary"), "itinerary");
  assert.equal(agentFor("Show me tours in Jaipur"), "matcher");
  assert.equal(agentFor("Book the first one", [{ role: "assistant", tours: [{ id: "tour-1", title: "Goa Escape" }] }]), "booking");
});

test("parses plain and fenced JSON model responses", () => {
  assert.deepEqual(jsonFromModel('{"tourIds":["tour-1"]}'), { tourIds: ["tour-1"] });
  assert.deepEqual(jsonFromModel('```json\n{"days":[]}\n```'), { days: [] });
});

test("rejects malformed booking details", () => {
  assert.equal(isPositiveInteger(0), false);
  assert.equal(isFutureDate("not-a-date"), false);
  assert.match(validateBookingInput({}), /required/);
  assert.match(validateBookingInput({ tourId: "1", fullName: "A", phone: "9", guestSize: 0, bookAt: "2050-01-01", confirmationId: "x" }), /future booking date/);
});
