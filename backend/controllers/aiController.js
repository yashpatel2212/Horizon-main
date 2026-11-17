import Booking from "../models/Booking.js";
import Tour from "../models/Tour.js";
import User from "../models/User.js";
import { runTravelAgent } from "../services/travelAgents.js";

const SERVICE_FEE = 200;

export const isPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;
export const isFutureDate = (value) => {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.valueOf()) && date >= today;
};

export const validateBookingInput = ({ tourId, fullName, phone, guestSize, bookAt, confirmationId }) => {
  if (!tourId || !fullName?.trim() || !phone?.toString().trim() || !confirmationId) {
    return "Tour, name, phone, and confirmation details are required.";
  }
  if (!isPositiveInteger(guestSize) || !isFutureDate(bookAt)) {
    return "Use a future booking date and at least one guest.";
  }
  return null;
};

const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history.slice(-8).map((entry) => ({
    role: entry?.role === "assistant" ? "assistant" : "user",
    text: typeof entry?.text === "string" ? entry.text.slice(0, 800) : "",
    tours: Array.isArray(entry?.tours) ? entry.tours.slice(0, 3).map((tour) => ({
      id: typeof tour?.id === "string" ? tour.id.slice(0, 100) : "",
      title: typeof tour?.title === "string" ? tour.title.slice(0, 160) : "",
    })).filter((tour) => tour.id && tour.title) : [],
  })).filter((entry) => entry.text || entry.tours.length);
};

export const chatWithAssistant = async (req, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 2000) {
    return res.status(400).json({ success: false, message: "Enter a message between 1 and 2000 characters." });
  }

  try {
    const response = await runTravelAgent(message, sanitizeHistory(req.body.history));
    return res.status(200).json({ success: true, data: response });
  } catch (error) {
    console.error("AI chat failed", error);
    return res.status(error.code || 500).json({
      success: false,
      message: error.message || "The travel assistant is unavailable. Please try again.",
    });
  }
};

export const confirmAiBooking = async (req, res) => {
  const { tourId, fullName, phone, guestSize, bookAt, confirmationId } = req.body;
  const inputError = validateBookingInput({ tourId, fullName, phone, guestSize, bookAt, confirmationId });
  if (inputError) return res.status(400).json({ success: false, message: inputError });

  try {
    const existing = await Booking.findOne({ confirmationId });
    if (existing) {
      if (existing.userId !== req.user.id) return res.status(409).json({ success: false, message: "This confirmation belongs to another user." });
      return res.status(200).json({ success: true, message: "This booking was already confirmed.", data: existing, duplicate: true });
    }

    const tour = await Tour.findById(tourId);
    if (!tour) return res.status(404).json({ success: false, message: "This tour is no longer available." });
    if (Number(guestSize) > tour.maxGroupSize) {
      return res.status(400).json({ success: false, message: `This tour allows a maximum of ${tour.maxGroupSize} guests.` });
    }

    const pricePerPerson = Number(tour.price);
    const totalAmount = pricePerPerson * Number(guestSize) + SERVICE_FEE;
    const account = req.user.email ? null : await User.findById(req.user.id).select("email").lean();
    const userEmail = req.user.email || account?.email;
    if (!userEmail) return res.status(401).json({ success: false, message: "Unable to verify the booking account." });
    const booking = await Booking.create({
      userId: req.user.id,
      userEmail,
      tourId: tour._id,
      tourName: tour.title,
      fullName: fullName.trim(),
      phone: phone.toString().trim(),
      guestSize: Number(guestSize),
      bookAt: new Date(bookAt),
      pricePerPerson,
      serviceFee: SERVICE_FEE,
      totalAmount,
      status: "confirmed",
      confirmationId,
    });
    return res.status(201).json({ success: true, message: "Your tour is booked.", data: booking });
  } catch (error) {
    console.error("AI booking confirmation failed", error);
    return res.status(500).json({ success: false, message: "Could not confirm the booking. Please try again." });
  }
};
