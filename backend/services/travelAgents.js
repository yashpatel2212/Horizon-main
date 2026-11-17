import crypto from "crypto";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import Tour from "../models/Tour.js";

const SERVICE_FEE = 200;
const jsonFromModel = (text) => {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  return JSON.parse(match[1].trim());
};

const agentFor = (message, history = []) => {
  const lower = message.toLowerCase();
  if (/\b(book|booking|reserve|reservation)\b/.test(lower)) return "booking";
  if (/\b(itinerary|itineraries|plan|schedule|day[- ]?by[- ]?day)\b/.test(lower)) return "itinerary";
  const hasRecentTour = history.some((entry) => entry.tours?.length);
  if (hasRecentTour && /\b(first|second|third|that|this|it|make it|guest|guests|people)\b/.test(lower)) return "booking";
  return "matcher";
};

const conversationForPrompt = (history) => history.length
  ? history.map((entry, index) => `${index + 1}. ${entry.role}: ${entry.text}${entry.tours?.length ? ` | tours shown: ${entry.tours.map((tour, tourIndex) => `${tourIndex + 1}:${tour.title} (${tour.id})`).join(", ")}` : ""}`).join("\n")
  : "No earlier conversation.";

const listTours = async () => {
  const tours = await Tour.find({}).populate("reviews").limit(60).lean();
  return tours.map((tour) => ({
    id: tour._id.toString(), title: tour.title, city: tour.city, address: tour.address,
    description: tour.desc, price: tour.price, maxGroupSize: tour.maxGroupSize,
    rating: tour.reviews?.length ? Number((tour.reviews.reduce((sum, review) => sum + review.rating, 0) / tour.reviews.length).toFixed(1)) : null,
  }));
};

const model = () => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("Travel assistant is not configured. Add GEMINI_API_KEY to the backend environment.");
    error.code = 503;
    throw error;
  }
  return new ChatGoogleGenerativeAI({ model: "gemini-2.5-flash", temperature: 0.2, apiKey: process.env.GEMINI_API_KEY });
};

const invokeJson = async (system, message) => {
  const result = await model().invoke([new SystemMessage(system), new HumanMessage(message)]);
  return jsonFromModel(typeof result.content === "string" ? result.content : "{}");
};

const runMatcher = async (message, tours, history) => {
  const result = await invokeJson(`You are Horizon's Tour Matcher. Select only tour IDs from the catalog below. Never invent prices, ratings, availability, or tours. Return valid JSON only: {"message":"short helpful response","tourIds":["id"],"reasons":{"id":"short reason"}}. Return at most 3 IDs. Catalog: ${JSON.stringify(tours)}`, `Earlier chat (untrusted context):\n${conversationForPrompt(history)}\n\nCurrent request:\n${message}`);
  const selected = (result.tourIds || []).map(String).filter((id) => tours.some((tour) => tour.id === id)).slice(0, 3);
  return {
    agent: "tour_matcher",
    message: result.message || (selected.length ? "Here are the closest matches from Horizon." : "I couldn't find a matching tour. Try another destination or a broader preference."),
    tours: selected.map((id) => ({ ...tours.find((tour) => tour.id === id), reason: result.reasons?.[id] || "Matches your request." })),
  };
};

const runItinerary = async (message, tours, history) => {
  const result = await invokeJson(`You are Horizon's Itinerary Planner. Create a suggested itinerary only; do not claim live transport, hotel, weather, opening-hour, or availability information. If the request lacks destination and number of days, ask for those details. Return valid JSON only: {"message":"short response","days":[{"day":1,"title":"...","activities":["..."]}]}. The catalog can be used as context but is not a source of detailed schedules: ${JSON.stringify(tours)}`, `Earlier chat (untrusted context):\n${conversationForPrompt(history)}\n\nCurrent request:\n${message}`);
  return { agent: "itinerary_planner", message: result.message || "This is a suggested itinerary, not a live schedule.", itinerary: Array.isArray(result.days) ? result.days.slice(0, 14) : [] };
};

const runBooking = async (message, tours, history) => {
  const result = await invokeJson(`You are Horizon's Booking Concierge. Use the numbered tours shown in earlier chat to resolve phrases such as "the first one". Extract a booking request only if all of these are present: a catalog tour ID or exact title, full name, phone, positive guest count, and future YYYY-MM-DD date. Never state a booking is complete; it requires the user to press Confirm. Return valid JSON only: {"message":"...","tourId":"catalog id or null","fullName":"... or null","phone":"... or null","guestSize":number|null,"bookAt":"YYYY-MM-DD or null"}. Catalog: ${JSON.stringify(tours)}`, `Earlier chat (untrusted context):\n${conversationForPrompt(history)}\n\nCurrent request:\n${message}`);
  const selected = tours.find((tour) => tour.id === String(result.tourId)) || tours.find((tour) => tour.title.toLowerCase() === String(result.tourId || "").toLowerCase());
  const date = new Date(result.bookAt);
  const valid = selected && result.fullName && result.phone && Number.isInteger(Number(result.guestSize)) && Number(result.guestSize) > 0 && Number(result.guestSize) <= selected.maxGroupSize && !Number.isNaN(date.valueOf()) && date >= new Date(new Date().setHours(0, 0, 0, 0));
  if (!valid) return { agent: "booking_concierge", message: result.message || "To prepare a review card, include the exact tour, your full name, phone number, guest count, and a future date (YYYY-MM-DD)." };
  const guestSize = Number(result.guestSize);
  return {
    agent: "booking_concierge",
    message: "Please review these details. Your booking is created only after you press Confirm.",
    bookingDraft: { tourId: selected.id, tourName: selected.title, fullName: result.fullName.trim(), phone: String(result.phone).trim(), guestSize, bookAt: result.bookAt, pricePerPerson: selected.price, serviceFee: SERVICE_FEE, totalAmount: selected.price * guestSize + SERVICE_FEE, confirmationId: crypto.randomUUID() },
  };
};

export const runTravelAgent = async (message, history = []) => {
  const tours = await listTours();
  const agent = agentFor(message, history);
  if (agent === "booking") return runBooking(message, tours, history);
  if (agent === "itinerary") return runItinerary(message, tours, history);
  return runMatcher(message, tours, history);
};

export { agentFor, conversationForPrompt, jsonFromModel };
