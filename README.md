# Horizon — AI-Powered Tour Management Assistant

Horizon is a tour discovery and booking application enhanced with a multi-agent conversational travel assistant. It uses **LangChain** and **Google Gemini** to recommend real tour packages, create suggested itineraries, and prepare safe booking confirmations.

The AI is grounded in the MongoDB catalog: it may recommend and explain existing Horizon packages, but it cannot invent a tour, change a price, or save a booking without explicit user confirmation.

## Features

### Multi-agent travel assistant

- Floating chat widget available across the React application.
- Three specialized AI roles:
  - **Tour Matcher** recommends relevant catalog packages.
  - **Itinerary Planner** produces a suggested day-by-day trip plan.
  - **Booking Concierge** collects details and creates a booking review card.
- Supports follow-up language such as “book the first one” by carrying the latest eight chat messages in browser memory.
- Chat history is cleared on browser refresh and is never stored as a MongoDB conversation record.

### Grounded tour recommendations

- Queries MongoDB for the current catalog before every AI request.
- Gives Gemini real tour names, IDs, descriptions, prices, capacity, location, and ratings as context.
- Requires Gemini to select only supplied catalog IDs.
- Validates returned IDs against MongoDB before showing tour cards to the user.
- Keeps price and capacity facts server-controlled rather than trusting LLM output.

### Safe conversational booking

- Gemini produces a **booking draft**, not a booking record.
- The user reviews tour, date, guest count, contact details, and total before pressing **Confirm booking**.
- The server re-fetches the selected tour, validates the date and group size, and recalculates the total from live data.
- User identity is derived from the authenticated JWT, never from chat text or client-supplied `userId`.
- An idempotent `confirmationId` prevents duplicate bookings from repeated confirmation clicks.

### Tour-management basics

- User registration and login with JWT authentication.
- Tour listing, search, featured tours, reviews, ratings, and booking records.
- Repeatable MongoDB seed script with eight starter Indian packages.

## AI Architecture

```text
React travel chat
       |
       | POST /api/v1/ai/chat + recent session context
       v
Express AI controller
       |
       | validates current message and history
       v
Deterministic intent router
       |
       +-- Tour Matcher
       +-- Itinerary Planner
       +-- Booking Concierge
       |
       v
MongoDB catalog retrieval + LangChain / Gemini
       |
       v
Validated response: tour cards, itinerary, or booking draft
```

### Intent router

`agentFor()` selects an agent using clear keywords:

| Request type | Examples | Agent |
|---|---|---|
| Booking | `book`, `reserve`, `booking` | Booking Concierge |
| Planning | `itinerary`, `plan`, `schedule` | Itinerary Planner |
| Discovery | all other queries | Tour Matcher |

It also treats references such as “the first one”, “that tour”, or “make it for four guests” as booking follow-ups when recent chat context contains recommended tours.

This is a deliberate design choice. A deterministic router is faster, cheaper, and easier to test than asking an LLM to classify every request. If the workflow grows beyond these three roles, it can be replaced by an LLM classifier or LangGraph state machine.

### Retrieval grounding

`listTours()` queries the `Tour` collection before invoking Gemini. The compact catalog context includes:

- MongoDB ID and title
- city and address
- description
- price and maximum group size
- calculated average rating where reviews exist

The agent prompt prohibits invented packages, prices, ratings, or availability. The backend filters the model’s selected IDs against the real catalog, which is critical because LLM text alone is not a trusted database query.

### LangChain and Gemini

The backend uses `@langchain/google-genai` and `@langchain/core`:

```js
const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.5-flash",
  temperature: 0.2,
  apiKey: process.env.GEMINI_API_KEY,
});

const result = await model.invoke([
  new SystemMessage(agentInstructions),
  new HumanMessage(currentRequest),
]);
```

**Why LangChain?** It supplies a consistent model interface, structured messages, and separation between agent prompts and Express APIs. That makes provider swaps and future tool-calling workflows easier.

**Why Gemini Flash?** It is well suited to short, high-volume interactions such as recommendations, intent-aware follow-ups, and itinerary formatting. A low `temperature: 0.2` favors predictable catalog-faithful answers over creative variation.

### Structured responses

Each role is instructed to return JSON rather than free-form text.

| Agent | Response shape |
|---|---|
| Tour Matcher | message, selected tour IDs, reasons |
| Itinerary Planner | message, ordered days, activity lists |
| Booking Concierge | message, tour ID, name, phone, guests, date |

The backend parses and validates model output before React renders it. This enables reliable tour cards, itinerary sections, and booking review cards.

### Browser-session memory

The frontend sends the latest eight messages with each request. Assistant entries include only response text and displayed tour IDs/titles. The API limits and sanitizes this input before adding it to the prompt.

This enables multi-turn conversation without creating a persistent `Conversation` collection, storing sensitive transcripts, or increasing privacy obligations.

## Vector Database: Current Status and Trade-offs

**Horizon does not use a vector database today.** MongoDB is the source of truth for a relatively small, structured catalog, and the complete catalog is provided as grounded prompt context.

### Why MongoDB is enough now

| Current need | Why the current design fits |
|---|---|
| Small package catalog | Sending tens of packages to Gemini is simple and inexpensive. |
| Exact price/capacity validation | MongoDB queries are deterministic and transactional. |
| Bookings | Bookings are structured records, not semantic documents. |
| No large knowledge base | The app has no thousands of PDFs, supplier policies, or travel guides to search. |

### What a vector database provides

A vector database stores embeddings—numeric representations of meaning—and retrieves content by semantic similarity. It becomes useful for requests like “a quiet mountain escape for a couple who likes local culture” when relevant information is spread over many long documents or a large catalog.

| Technology | Advantages | Drawbacks |
|---|---|---|
| MongoDB Atlas Vector Search | Keeps metadata and vectors in the same database; minimal new infrastructure. | Requires embedding generation and Atlas vector configuration. |
| Pinecone | Managed, specialized vector search with easy scaling. | Adds vendor cost and synchronization work. |
| Weaviate | Strong hybrid search and metadata filters. | More infrastructure and operational complexity. |
| Chroma | Fast local prototyping. | Less appropriate as a primary production catalog store. |
| pgvector | Excellent when PostgreSQL is already central. | Horizon uses MongoDB, so it introduces another data platform. |

### When to add RAG/vector search

Add vector retrieval when Horizon has:

- Hundreds or thousands of packages.
- Long itineraries, FAQs, hotel details, cancellation policies, travel guides, or PDFs.
- Semantic discovery needs that normal filters cannot solve.
- A need to cite source text behind an AI answer.

Even then, vector search should improve discovery only. Booking price, capacity, identity, and confirmation must always come from MongoDB and server-side validation.

## Technology Decisions and Alternatives

This section explains the tools actually used in Horizon, why they fit the current version, and when an alternative would be a better choice.

### LangChain

**Used for:** creating Gemini chat-model instances, separating system instructions from user messages, and keeping the AI integration isolated in `backend/services/travelAgents.js`.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **LangChain** | The project has three prompt-driven agent roles and benefits from a provider-neutral interface. | Clear message abstraction, easy provider swaps, reusable prompt/service layer, supports future tools and output parsers. | Adds dependency size and abstraction compared with calling Gemini directly. It does not automatically solve agent state, validation, or security. | Use the **Google GenAI SDK directly** for a very small single-prompt application where fewer dependencies matter more than portability. |
| **LangGraph** | Not used yet. | Better for explicit multi-step graphs, state persistence, retries, approvals, and human-in-the-loop workflows. | More concepts and configuration than this simple intent router needs. | Use it when booking involves multiple states such as quote, payment, cancellation, supplier confirmation, and recovery from failed tool calls. |
| **Direct Gemini SDK** | Not used as the main abstraction. | Lowest overhead and direct access to provider-specific features. | Couples application code closely to Google APIs and makes provider migration harder. | Use it if Gemini-only features are central and LangChain abstractions become restrictive. |

**Important:** LangChain is not a vector database and does not make an application autonomous by itself. In Horizon, the application still owns routing, MongoDB access, authorization, validation, and booking writes.

### Google Gemini Flash

**Used for:** generating catalog-grounded recommendations, suggested itineraries, and structured booking drafts.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **Gemini Flash** | Travel chat needs low-latency answers and moderate-cost generation for short messages. | Fast responses, capable structured text generation, suitable for high-frequency chat interactions. | Model output can still be wrong or malformed; it cannot be trusted for transactional facts. Provider quotas and pricing apply. | Use a larger reasoning model for complex planning, long policy analysis, or more difficult multi-step tasks. |
| **Gemini Pro / larger model** | Not used for default chat. | Potentially stronger reasoning and richer long-form output. | Higher latency and cost; unnecessary for simple tour matching. | Use for premium itinerary generation or admin workflows that analyze long documents. |
| **OpenAI / Anthropic models** | Not used in the current build. | Different quality, tool-use, pricing, and ecosystem trade-offs. | Requires another API account, integration, and evaluation of output behavior. | Use after comparing model quality, cost, regional availability, and required features on representative Horizon prompts. |

Horizon keeps Gemini at a low temperature to reduce unnecessary variation. It does not rely on a model answer for price, capacity, identity, or booking creation.

### MongoDB and Mongoose

**Used for:** tours, users, reviews, bookings, and the live catalog lookup that grounds AI responses.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **MongoDB** | Tour documents naturally contain nested reviews and flexible package data. The original application already used MongoDB. | Flexible schema, straightforward JavaScript integration, simple document retrieval, suitable for the current MERN stack. | Cross-document reporting and complex transactions can become harder than in relational databases. Data validation must be designed carefully. | Use PostgreSQL/MySQL if the product develops complex payment, inventory, supplier, reporting, or accounting relationships. |
| **Mongoose** | Defines models and validates data between Express and MongoDB. | Familiar schema/model layer, references, defaults, validation, and query APIs. | Adds its own abstraction and can hide expensive queries if used carelessly. | Use the native MongoDB driver for a smaller data layer or when advanced driver features are needed directly. |
| **PostgreSQL with an ORM** | Not used currently. | Strong relational integrity, transactions, analytics, and mature SQL tooling. | Requires a database migration and a different data-modeling approach. | Use when reservations, rooms, seats, invoices, and suppliers need strict relational constraints. |

### React Client-Side Application

**Used for:** the tour UI and floating chat widget.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **React (Create React App project)** | Fits the existing single-page MERN architecture and enables interactive chat state. | Component reuse, responsive UI state, fast development, simple integration with REST APIs. | Create React App is older tooling, and client rendering is less ideal for SEO-heavy pages. | Move to **Vite** for a lighter development/build experience or **Next.js** for server rendering, SEO, and full-stack routing. |
| **Next.js** | Not used in this repository. | Server-side rendering, SEO improvements, API routes, image optimization. | Introduces a new framework structure and deployment model. | Use if organic search traffic and content pages become primary business goals. |

### Express and REST APIs

**Used for:** authentication, tours, bookings, reviews, and AI endpoints.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **Express** | Small, familiar HTTP layer that fits the existing Node backend. | Minimal, flexible, large ecosystem, easy integration with Mongoose and LangChain. | Architecture conventions are largely optional; large teams need to impose their own structure. | Use **NestJS** for a larger team that needs modules, dependency injection, formal validation, and stronger conventions. |
| **GraphQL** | Not used. | Lets clients request exactly the fields they need across connected resources. | Adds schema/resolver complexity and is unnecessary for the current REST-shaped workflow. | Use when many clients need flexible, deeply nested data access. |

### JWT Authentication and HTTP-only Cookies

**Used for:** authenticating users before booking confirmation.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **JWT in HTTP-only cookie** | The booking API needs a server-verifiable user identity without exposing the token to frontend JavaScript. | Stateless verification, fits REST APIs, helps reduce token theft through XSS compared with local-storage tokens. | Revocation, refresh, cookie domain, CORS, and SameSite behavior require careful production configuration. | Use server-side sessions with Redis/database storage when immediate revocation and centralized session management are priorities. |
| **Local-storage token** | Not used for authorization. | Simple to implement. | More exposed to XSS, so it is a weaker default for booking actions. | Avoid for sensitive production operations unless strong XSS controls are in place. |

### Browser-Only Conversation Memory

**Used for:** sending the latest eight sanitized messages with each AI request so follow-ups work.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **React state (current design)** | The user requested natural follow-ups without persistent chat storage. | No new database schema, no retention burden, simple implementation, context disappears on refresh. | Context is lost after refresh and is limited by browser state; it cannot support cross-device conversation history. | Use a database/Redis conversation store when users need to resume chats or when agents require durable workflow state. |
| **Redis** | Not used. | Fast temporary server-side session state with automatic expiry. | Adds infrastructure and still needs privacy/retention rules. | Use for short-lived, multi-step agent workflows shared across browser tabs or backend services. |
| **MongoDB conversations** | Not used. | Durable user history and auditability. | Stores personal conversation data and requires consent, access control, deletion, and retention policies. | Use only when saved chat history is a user-facing product feature. |

### Prompted JSON Instead of Unrestricted Tool Calling

**Used for:** having Gemini return recommendation, itinerary, and booking-draft data that the backend validates.

| Choice | Why it was used | Advantages | Disadvantages | Best alternative when... |
|---|---|---|---|---|
| **Prompted JSON + server validation** | The workflow has a small set of fixed response shapes and strict booking safety needs. | Simple control flow, easy UI rendering, no model authority over database writes, clear human confirmation point. | JSON parsing can fail if a model returns invalid output; prompts require maintenance. | Use schema-enforced structured output for stronger parsing guarantees. |
| **LLM tool/function calling** | Not used for database writes. | Lets a model choose from well-defined tools in more dynamic workflows. | Requires careful permission boundaries, argument validation, retries, observability, and approval gates. | Use for read-only search tools first; only allow writes behind explicit server-side confirmation. |

## Why These Choices Work Together

The current stack deliberately divides responsibility:

```text
Gemini + LangChain     -> language understanding and response generation
MongoDB                -> canonical tours, users, and bookings
Express                -> validation, authorization, and business rules
React                  -> chat interaction and temporary session context
JWT                    -> trusted identity for protected actions
```

This separation prevents the LLM from becoming the source of truth. The model improves the experience; the backend remains responsible for every business-critical decision.

## Safety and Trust Boundaries

- **Catalog-only results:** Gemini-selected IDs are verified against MongoDB.
- **No unsupported claims:** prompts prohibit invented availability, transport, hotel, weather, and opening-hour facts.
- **Server-side totals:** the booking total comes from live price, guest count, and the fixed service fee.
- **Authenticated action:** the confirmation endpoint requires a valid JWT.
- **Human confirmation:** no LLM response can create a booking by itself.
- **Duplicate protection:** a confirmation ID makes confirmation idempotent.
- **No stored chat history:** session context remains in React state only.

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/ai/chat` | Routes a message and recent session context to an AI role. |
| `POST` | `/api/v1/ai/booking/confirm` | Authenticated endpoint for validated AI-assisted bookings. |
| `GET` | `/api/v1/tours` | Returns paginated catalog tours. |
| `GET` | `/api/v1/tours/search/getTourBySearch` | Filters by city, distance, and group size. |
| `POST` | `/api/v1/booking` | Creates a standard authenticated booking. |

Example request:

```json
{
  "message": "Book the first one for Rahul Sharma, phone 9876543210, 2 guests, on 2026-12-20",
  "history": [
    {
      "role": "assistant",
      "text": "Here are suitable Goa tours.",
      "tours": [{ "id": "tour-id", "title": "Goa Coast and Culture Getaway" }]
    }
  ]
}
```

## Project Structure

```text
backend/
  controllers/aiController.js       # chat and booking confirmation APIs
  services/travelAgents.js          # routing, prompts, LangChain/Gemini calls
  routes/ai.js                      # AI routes
  data/tours.js                     # starter catalog
  scripts/seedTours.js              # repeatable MongoDB seed command
  test/travelAgents.test.js         # routing and validation tests

frontend/
  src/components/TravelAssistant/   # floating chat widget and styles
  src/utils/config.js               # local/deployed API URL
```

## Local Setup

### Prerequisites

- Node.js 18+
- MongoDB or MongoDB Atlas
- Google AI Studio Gemini API key

### Configure backend

Copy `backend/.env.example` to `backend/.env`:

```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET_KEY=your_long_random_secret
GEMINI_API_KEY=your_google_ai_studio_api_key
PORT=8000
```

Never commit `.env` or expose `GEMINI_API_KEY` in frontend code.

### Install, seed, and run

```bash
cd backend
npm install
npm run seed:tours
npm start
```

In another terminal:

```bash
cd frontend
npm install
npm start
```

Open `http://localhost:3000`. The frontend defaults to `http://localhost:8000/api/v1`; for deployment set `REACT_APP_API_BASE_URL` to the deployed backend URL.

`npm run seed:tours` creates or updates the eight starter packages by title, avoiding duplicates when rerun.

## Test the Assistant

Use the lower-right chat button and try:

```text
Show me a tour in Goa for a group of 4
Plan a 3-day itinerary for Jaipur
Book the first one for Rahul Sharma, phone 9876543210, 2 guests, on 2026-12-20
```

Sign in before confirming a booking. The server revalidates the latest price and group capacity before saving it.

Run backend tests:

```bash
cd backend
npm test
```

## Limitations and Next Steps

- Keyword intent routing may misclassify ambiguous requests; use an LLM classifier or LangGraph when state and branching grow complex.
- Browser-only memory is lost on refresh. Persistent memory needs explicit consent, retention, access-control, and privacy design.
- There is no live inventory, payment gateway, cancellation workflow, external transport/hotel integration, or real-time travel data.
- Itineraries are suggestions, not real-time schedules.
- JSON prompt-and-parse is pragmatic but can fail on malformed model output. Schema-enforced structured output and retry logic would improve reliability.
- Production should add rate limiting, PII-redacted logs, monitoring, error tracking, strict CORS origins, and model-cost observability.
