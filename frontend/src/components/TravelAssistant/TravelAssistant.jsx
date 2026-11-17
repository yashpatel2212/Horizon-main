import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { BASE_URL } from "../../utils/config";
import "./travel-assistant.css";

const money = (value) => `\u20B9${Number(value).toLocaleString("en-IN")}`;

const conversationContext = (messages) => messages.slice(-8).map((item) => ({
  role: item.role === "assistant" ? "assistant" : "user",
  text: String(item.text || item.message || "").slice(0, 800),
  tours: item.tours?.slice(0, 3).map((tour) => ({ id: tour.id, title: tour.title })),
}));

const TravelAssistant = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const askAssistant = async (event) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || loading) return;
    setMessages((items) => [...items, { role: "user", text }]);
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/ai/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history: conversationContext(messages) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to contact the assistant.");
      setMessages((items) => [...items, { role: "assistant", ...result.data }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", error: error.message }]);
    } finally {
      setLoading(false);
    }
  };

  const confirmBooking = async (draft, index) => {
    if (!user) {
      navigate("/login");
      return;
    }
    setMessages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, confirming: true } : item));
    try {
      const response = await fetch(`${BASE_URL}/ai/booking/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not confirm the booking.");
      setMessages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, confirmed: true, confirming: false, confirmationMessage: result.message } : item));
    } catch (error) {
      setMessages((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, confirming: false, confirmationError: error.message } : item));
    }
  };

  return (
    <div className="travel-assistant">
      {open && <section className="assistant-panel" aria-label="Horizon travel assistant">
        <div className="assistant-header">
          <div><strong>Horizon Travel Assistant</strong><span>Remembers this chat until you refresh the page</span></div>
          <button onClick={() => setOpen(false)} aria-label="Close assistant">&times;</button>
        </div>
        <div className="assistant-messages">
          {!messages.length && <div className="assistant-bubble assistant-intro">Tell me where you want to travel, ask for a suggested itinerary, or give all booking details in one message.</div>}
          {messages.map((item, index) => <div key={index} className={`assistant-message ${item.role}`}>
            <div className="assistant-bubble">{item.error || item.text || item.message}</div>
            {item.tours?.map((tour) => <button className="assistant-tour-card" key={tour.id} onClick={() => navigate(`/tours/${tour.id}`)}>
              <strong>{tour.title}</strong><span>{tour.city} &middot; {money(tour.price)} per person</span>
              <small>{tour.rating ? `${tour.rating} \u2605 \u00b7 ` : ""}{tour.maxGroupSize} guests &middot; {tour.reason}</small>
            </button>)}
            {item.itinerary?.map((day) => <div className="assistant-itinerary" key={day.day}><strong>Day {day.day}: {day.title}</strong>{day.activities?.map((activity, activityIndex) => <span key={activityIndex}>{activity}</span>)}</div>)}
            {item.bookingDraft && <div className="assistant-booking-card">
              <strong>Review booking</strong>
              <span>{item.bookingDraft.tourName}</span><span>{item.bookingDraft.guestSize} guest(s) &middot; {item.bookingDraft.bookAt}</span>
              <span>{item.bookingDraft.fullName} &middot; {item.bookingDraft.phone}</span>
              <b>{money(item.bookingDraft.totalAmount)} total</b>
              {item.confirmed ? <small className="assistant-success">{item.confirmationMessage}</small> : <>
                {item.confirmationError && <small className="assistant-error">{item.confirmationError}</small>}
                <button disabled={item.confirming} onClick={() => confirmBooking(item.bookingDraft, index)}>{item.confirming ? "Confirming..." : user ? "Confirm booking" : "Sign in to confirm"}</button>
              </>}
            </div>}
          </div>)}
          {loading && <div className="assistant-bubble assistant-loading">Finding the best answer...</div>}
        </div>
        <form className="assistant-form" onSubmit={askAssistant}>
          <input value={message} maxLength="2000" onChange={(event) => setMessage(event.target.value)} placeholder="Ask about tours, itineraries, or bookings" aria-label="Message travel assistant" />
          <button disabled={loading} type="submit">Send</button>
        </form>
      </section>}
      <button className="assistant-launcher" onClick={() => setOpen((value) => !value)} aria-label="Open travel assistant"><i className="ri-chat-3-line"></i></button>
    </div>
  );
};

export default TravelAssistant;
